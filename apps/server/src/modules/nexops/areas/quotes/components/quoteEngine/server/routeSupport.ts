import { randomUUID } from "node:crypto";
import { RailError, type Client, type CrmSettings, type EventBus, type Quote, type QuoteDeliveryRecord } from "@nexteam/core";
import type { NativeAdapter, NativeCrmRepository } from "@nexteam/providers";
import type { CommsRail } from "../../../../../../../comms/gmailRegistry.js";
import { quoteTemplateVariables, renderTemplateText, resolveTemplateMessage } from "../../../../settings/components/tenantConfig/server/communicationTemplates.js";
import { createPortalToken, hashPortalToken, portalUrlForQuote, quoteDeliveryMessage, syncExpiredQuote } from "../domain/quoteFoundation.js";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[character] ?? character);
}

function quoteEmailContent(bodyText: string, portalUrl: string): string {
  const paragraphs = bodyText.split(/\n{2,}/).filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 18px;white-space:pre-line;">${escapeHtml(paragraph)}</p>`)
    .join("");
  const escapedUrl = escapeHtml(portalUrl);
  return `<div data-nexteam-tenant-content="true">${paragraphs}<p style="margin:28px 0;text-align:center;"><a href="${escapedUrl}" style="display:inline-block;background:#08776f;color:#ffffff;text-decoration:none;border-radius:7px;padding:14px 22px;font-weight:700;">Review quote</a></p><p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#5f6d75;">If the button does not work, copy and paste this link into your browser:<br /><a href="${escapedUrl}" style="color:#08776f;word-break:break-all;">${escapedUrl}</a></p></div>`;
}

export function createQuoteRouteSupport(input: {
  providerForTenant: (tenantId: string) => NativeAdapter;
  repositoryForTenant: () => NativeCrmRepository;
  eventBus: EventBus;
  commsRail?: CommsRail | undefined;
}) {
  async function getQuoteAndClient(tenantId: string, quoteId: string): Promise<{ provider: NativeAdapter; quote: Quote; client?: Client }> {
    const provider = input.providerForTenant(tenantId);
    const repository = input.repositoryForTenant();
    const existing = await repository.getQuote(tenantId, quoteId);
    const quote = existing ? await syncExpiredQuote(repository, existing) : null;
    if (!quote) throw new RailError(`Native quote ${quoteId} was not found.`, { provider: "native", op: "getQuote", status: 404 });
    // Quote reads must not depend on the bounded client roster. A client past
    // the first roster page is still the quote's canonical customer and must
    // be available to portal rendering and outbound template variables.
    const client = quote.clientId && repository.getClient
      ? await repository.getClient(tenantId, quote.clientId)
      : (await provider.getClients("")).find((candidate) => candidate.id === quote.clientId);
    return client ? { provider, quote, client } : { provider, quote };
  }

  async function sendQuoteDelivery(request: {
    quote: Quote;
    client?: Client | undefined;
    settings?: CrmSettings | undefined;
    mode: "email" | "sms" | "mark_sent";
    target?: string | undefined;
    note?: string | undefined;
    subject?: string | undefined;
    bodyText?: string | undefined;
    actorId: string;
    publicOrigin?: string | undefined;
  }): Promise<{ quote: Quote; portalUrl: string; delivery: QuoteDeliveryRecord }> {
    const provider = input.providerForTenant(request.quote.tenantId);
    const portalToken = createPortalToken();
    const portalPath = portalUrlForQuote(request.quote, portalToken);
    const portalUrl = request.publicOrigin ? new URL(portalPath, request.publicOrigin).toString() : portalPath;
    const fallback = quoteDeliveryMessage(request.quote, request.mode === "mark_sent" ? "email" : request.mode, portalUrl);
    const variables = quoteTemplateVariables({ quote: request.quote, client: request.client, portalUrl });
    const rendered = resolveTemplateMessage({
      settings: request.settings,
      category: "quote_send",
      channel: request.mode === "sms" ? "sms" : "email",
      fallbackSubject: fallback.subject,
      fallbackBodyText: fallback.bodyText,
      variables
    });
    if (request.mode !== "mark_sent" && !rendered.enabled) throw new RailError(`The quote ${request.mode} channel is disabled in Settings.`, { provider: "native", op: "sendQuote", status: 409 });
    const subject = request.subject?.trim() ? renderTemplateText(request.subject, variables) : rendered.subject;
    const requestedBody = request.bodyText?.trim() ? renderTemplateText(request.bodyText, variables) : rendered.bodyText;
    // A send-time edit is a one-off override, but it must never strip the only
    // usable client path to the quote. This also repairs legacy drafts whose
    // pre-send editor resolved {{PORTAL_URL}} before a token existed.
    // A resend issues a fresh token. Remove any previous copy of this quote's
    // portal path before appending the current one, so a client sees exactly
    // one actionable approval link.
    const stalePortalPath = new RegExp(
      `(?:https?:\\/\\/[^\\s/]+)?/portal/quotes/${request.quote.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?tenantId=[^\\s&]+&token=[^\\s]+`,
      "g"
    );
    const bodyWithoutStalePortal = requestedBody.replace(stalePortalPath, "").trim();
    const bodyText = request.mode === "mark_sent"
      ? requestedBody
      : `${bodyWithoutStalePortal}${bodyWithoutStalePortal ? "\n\n" : ""}${portalUrl}`;
    const bodyHtml = request.mode === "mark_sent"
      ? undefined
      : quoteEmailContent(bodyWithoutStalePortal, portalUrl);
    const sentAt = new Date().toISOString();
    const delivery: QuoteDeliveryRecord = {
      id: `quote_delivery_${randomUUID()}`,
      mode: request.mode,
      sentAt,
      ...(request.target ? { target: request.target } : {}),
      sentBy: request.actorId,
      ...(subject ? { subject } : {}),
      ...(request.note ? { note: request.note } : {})
    };
    if (request.mode === "email") {
      const target = request.target?.trim() || request.client?.emails[0];
      if (!target) throw new RailError("An email destination is required to send this quote.", { provider: "native", op: "sendQuoteEmail", status: 400 });
      if (!input.commsRail?.sendAdapter) throw new RailError("Email delivery is not configured for this tenant.", { provider: "native", op: "sendQuoteEmail", status: 501 });
      const receipt = await input.commsRail.sendAdapter.sendEmail({ tenantId: request.quote.tenantId, mailbox: input.commsRail.sendAdapter.mailbox, to: [target], subject, bodyText, ...(bodyHtml ? { bodyHtml } : {}) });
      delivery.target = target;
      delivery.receiptId = receipt.id;
    } else if (request.mode === "sms") {
      const target = request.target?.trim() || request.client?.phones[0];
      if (!target) throw new RailError("A phone number is required to text this quote.", { provider: "native", op: "sendQuoteSms", status: 400 });
      if (!input.commsRail?.sendSms) throw new RailError("SMS delivery is not configured for this tenant.", { provider: "native", op: "sendQuoteSms", status: 501 });
      const receipt = await input.commsRail.sendSms({ tenantId: request.quote.tenantId, to: target, body: bodyText });
      delivery.target = target;
      delivery.receiptId = receipt.id;
    }
    const saved = await provider.updateQuote(request.quote.id, {
      status: "sent",
      sentAt,
      updatedAt: sentAt,
      portal: { ...(request.quote.portal ?? {}), tokenHash: hashPortalToken(portalToken), tokenIssuedAt: sentAt },
      delivery: [...(request.quote.delivery ?? []), delivery]
    });
    await input.eventBus.emit({
      tenantId: saved.tenantId,
      type: "quote.sent",
      payload: { quoteId: saved.id, mode: request.mode, sentAt, ...(delivery.target ? { target: delivery.target } : {}) }
    });
    return { quote: saved, portalUrl, delivery };
  }

  return { getQuoteAndClient, sendQuoteDelivery };
}
