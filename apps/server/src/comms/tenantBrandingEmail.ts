import type { EmailSendProvider, OutboundEmail, SendReceipt, TenantBranding } from "@nexteam/core";

export interface TenantEmailContactBlock {
  email?: string | undefined;
  phone?: string | undefined;
  address?: string | undefined;
  website?: string | undefined;
}

export interface TenantEmailBranding {
  branding: TenantBranding | null;
  contact: TenantEmailContactBlock | null;
}

export type TenantEmailBrandingResolver = (tenantId: string) => Promise<TenantEmailBranding>;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[character] ?? character);
}

function paragraphs(bodyText: string): string {
  return bodyText.split(/\n{2,}/).filter(Boolean).map((paragraph) => `<p style="margin:0 0 18px;white-space:pre-line;">${escapeHtml(paragraph)}</p>`).join("");
}

function contactLines(contact: TenantEmailContactBlock | null): string {
  if (!contact) return "";
  const values = [contact.email, contact.phone, contact.address, contact.website]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => escapeHtml(value));
  return values.length ? `<br />${values.join("<br />")}` : "";
}

function appendContactBlock(bodyHtml: string, branding: TenantBranding | null, contact: TenantEmailContactBlock | null): string {
  const name = branding?.displayName?.trim() || "NexOps";
  const lines = contactLines(contact);
  if (!lines || /data-nexteam-tenant-contact/.test(bodyHtml)) return bodyHtml;
  const block = `<div data-nexteam-tenant-contact="true" style="margin-top:24px;text-align:center;color:${branding?.colors.mutedText || "#5f6d75"};font-size:12px;">${escapeHtml(name)}${lines}</div>`;
  return bodyHtml.includes("</body>") ? bodyHtml.replace("</body>", `${block}</body>`) : `${bodyHtml}${block}`;
}

/**
 * The single transactional-email rendering seam.  Template workflows keep
 * their plain-text body for accessibility while every tenant email receives
 * the same resolver-backed logo, palette, and tenant contact block.
 */
export function renderTenantBrandedEmail(input: {
  bodyText: string;
  branding: TenantBranding | null;
  contact: TenantEmailContactBlock | null;
}): string {
  const name = input.branding?.displayName?.trim() || "NexOps";
  const primary = input.branding?.colors.primary || "#00796b";
  const accent = input.branding?.colors.accent || "#98ff00";
  const surface = input.branding?.colors.surface || "#ffffff";
  const background = input.branding?.colors.background || "#f4f7f5";
  const text = input.branding?.colors.text || "#14232d";
  const logo = input.branding?.logo?.url?.trim()
    ? `<img src="${escapeHtml(input.branding.logo.url)}" alt="${escapeHtml(input.branding.logo.alt || `${name} logo`)}" style="max-height:56px;max-width:220px;display:block;margin:0 auto;" />`
    : `<div style="font-size:28px;font-weight:800;color:${accent};text-align:center;">${escapeHtml(name)}</div>`;
  return `<!doctype html><html><body style="margin:0;padding:24px;background:${background};font-family:Arial,sans-serif;color:${text};"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="100%" style="max-width:640px;background:${surface};border-radius:16px;overflow:hidden;"><tr><td style="background:${primary};padding:28px 32px;">${logo}</td></tr><tr><td style="padding:32px;font-size:16px;line-height:1.55;">${paragraphs(input.bodyText)}</td></tr><tr><td style="padding:22px 32px;background:${background};color:${text};font-size:12px;text-align:center;">${escapeHtml(name)}${contactLines(input.contact)}</td></tr></table></td></tr></table></body></html>`;
}

function senderName(from: string | undefined, displayName: string): string | undefined {
  const email = from?.match(/<([^>]+)>/)?.[1] ?? from?.trim();
  return email ? `${displayName} <${email}>` : undefined;
}

export class TenantBrandingEmailSendAdapter implements EmailSendProvider {
  readonly mailbox: string;

  constructor(private readonly delegate: EmailSendProvider, private readonly resolveBranding: TenantEmailBrandingResolver, private readonly senderEmail?: string | undefined) {
    this.mailbox = delegate.mailbox;
  }

  async sendEmail(message: OutboundEmail): Promise<SendReceipt> {
    const tenant = await this.resolveBranding(message.tenantId);
    const displayName = tenant.branding?.displayName?.trim() || "NexOps";
    return this.delegate.sendEmail({
      ...message,
      bodyHtml: message.bodyHtml
        ? appendContactBlock(message.bodyHtml, tenant.branding, tenant.contact)
        : renderTenantBrandedEmail({ bodyText: message.bodyText, ...tenant }),
      ...(message.from ? {} : { from: senderName(this.senderEmail, displayName) })
    });
  }
}
