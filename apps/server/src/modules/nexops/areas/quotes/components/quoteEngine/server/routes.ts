import type { Request, Response } from "express";
import { RailError, type Quote } from "@nexteam/core";
import type { CrmRouteContext } from "../../../../../runtime/routeRuntime.js";
import { createInvoiceFromQuoteBodySchema, createQuoteRouteBodySchema, quoteArchiveBodySchema, quoteManualApprovalBodySchema, quoteSendBodySchema, updateQuoteRouteBodySchema } from "./routeSchemas.js";
import { portalSessionQuoteApprovalBodySchema, portalSessionQuoteChangeRequestBodySchema } from "../../../../../../nexportal/components/portalCore/server/routeSchemas.js";
import { approveQuoteAfterDepositPreflight } from "../domain/atomicDepositApproval.js";

export async function resolveQuotePropertyContext(
  repository: { listProperties(tenantId: string): Promise<Array<{ id: string; clientId: string }>> },
  tenantId: string,
  clientId: string,
  propertyId?: string,
  inheritedPropertyId?: string
): Promise<string | undefined> {
  if (!propertyId) return undefined;
  const property = (await repository.listProperties(tenantId)).find((candidate) => candidate.id === propertyId);
  if (property?.clientId === clientId) {
    return propertyId;
  }
  // A legacy request conversion can retain a property after its client was
  // merged or removed. Do not let that stale inherited reference block an
  // unrelated quote edit; drop only the inherited value. New invalid choices
  // still receive the normal ownership error below.
  if (propertyId === inheritedPropertyId) {
    return undefined;
  }
  throw new RailError("The selected service location does not belong to this client.", { provider: "native", op: "saveQuote", status: 400 });
}

export function registerQuoteEngineRoutes(context: CrmRouteContext): void {
  const {
    RailError,
    actorIdForAccess,
    app,
    archiveQuoteVersion,
    buildInvoiceDraftFromQuote,
    buildPortalSnapshotOrRedirect,
    createPortalToken,
    defaultTenantId,
    deps,
    ensureDocumentNumbers,
    env,
    eventBus,
    fieldDocsService,
    getQuoteAndClient,
    hashPortalToken,
    jobLifecycle,
    ledger,
    materializeQuoteRecord,
    materializeRequestClient,
    portalHub,
    portalPathWithTenant,
    portalQuoteApprovalInputSchema,
    portalQuoteChangeRequestInputSchema,
    portalUrlForQuote,
    providerForTenant,
    publicOrigin,
    quoteApprovalBlockedReason,
    quoteLocked,
    quoteRenewInputSchema,
    quoteTemplateVariables,
    randomUUID,
    renderPortalQuotesHtml,
    renderQuotePdf,
    renderQuotePortalHtml,
    repositoryForTenant,
    requireBillingAccess,
    requirePortalSession,
    requireQuoteAccess,
    reserveDocumentNumber,
    resolveTemplateMessage,
    sendQuoteDelivery,
    sendRouteError,
    syncExpiredQuote,
  } = context;

  async function convertApprovedQuoteToJob(quote: Quote, createdBy: string) {
    const jobId = quote.convertedJobId ?? `job_quote_${quote.id}`;
    const claim = await repositoryForTenant().claimQuoteJobConversion(quote.tenantId, quote.id, jobId);
    const convertedQuote = claim.quote;
    const ensured = await jobLifecycle().createJobIfAbsent({
      id: jobId,
      tenantId: convertedQuote.tenantId,
      clientId: convertedQuote.clientId,
      ...(convertedQuote.propertyId ? { propertyId: convertedQuote.propertyId } : {}),
      ...(convertedQuote.requestId ? { requestId: convertedQuote.requestId } : {}),
      quoteId: convertedQuote.id,
      title: convertedQuote.title,
      lineItems: convertedQuote.lineItems,
      ...(convertedQuote.paymentSchedule ? { paymentSchedule: convertedQuote.paymentSchedule } : {}),
      intake: convertedQuote.intake,
      createdBy
    });
    const bundleAttachment = await fieldDocsService().maybeAttachBundleForJob({ tenantId: convertedQuote.tenantId, job: ensured.job });
    await eventBus.emitOnce(`quote-converted-to-job-${convertedQuote.id}`, {
      tenantId: convertedQuote.tenantId,
      type: "quote.converted_to_job",
      payload: { quoteId: convertedQuote.id, jobId: ensured.job.id, clientId: ensured.job.clientId, automatic: true }
    });
    return {
      quote: convertedQuote,
      job: ensured.job,
      reused: !claim.claimed,
      ...(bundleAttachment ? {
        fieldDocsBundle: {
          bundleId: bundleAttachment.bundle.id,
          checklistId: bundleAttachment.checklist.id,
          reportId: bundleAttachment.report.id,
          reportTemplateId: bundleAttachment.reportTemplate.id
        }
      } : {})
    };
  }

  async function sendQuoteApprovalOfficeAlert(input: {
    quote: Quote;
    clientName: string;
    quotePortalUrl: string;
    tenantId: string;
  }) {
    if (!deps.commsRail?.sendAdapter || !deps.platformRepository) return;
    const officeRecipients = [...new Set(
      (await deps.platformRepository.listTenantUsers(input.tenantId))
        .filter((user) => user.active && (user.role === "OWNER" || user.role === "OFFICE_ADMIN"))
        .flatMap((user) => user.email ? [user.email.trim().toLowerCase()] : [])
    )];
    if (!officeRecipients.length) return;
    await deps.commsRail.sendAdapter.sendEmail({
      tenantId: input.quote.tenantId,
      mailbox: deps.commsRail.sendAdapter.mailbox,
      to: officeRecipients,
      subject: `Quote approved: ${input.quote.number ?? input.quote.id}`,
      bodyText: [
        `${input.clientName} approved quote ${input.quote.number ?? input.quote.id}.`,
        `Total: ${input.quote.totals.total.toFixed(2)}`,
        "",
        "The quote is ready for an office user to convert into a job.",
        input.quotePortalUrl
      ].join("\n")
    });
  }

  async function repairLegacyQuoteClient(tenantId: string, quote: Quote) {
    if (!quote.requestId) {
      return { quote, client: undefined };
    }
    const repository = repositoryForTenant();
    const request = await repository.getRequest(tenantId, quote.requestId);
    if (!request) {
      return { quote, client: undefined };
    }
    const materialized = await materializeRequestClient(repository, request);
    const repairedAt = new Date().toISOString();
    const repaired = await repository.updateQuote(quote.id, {
      tenantId,
      clientId: materialized.client.id,
      ...(materialized.property ? { propertyId: materialized.property.id } : {}),
      updatedAt: repairedAt
    });
    await repository.updateRequest(request.id, {
      tenantId,
      selectedClientId: materialized.client.id,
      ...(materialized.property ? { selectedPropertyId: materialized.property.id } : {}),
      updatedAt: repairedAt
    });
    return { quote: repaired, client: materialized.client };
  }

  app.get("/api/crm/quotes", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "listQuotes");
      const repository = repositoryForTenant();
      const numbered = await ensureDocumentNumbers(await repository.listQuotes(tenantId), {
        tenantId,
        kind: "quote",
        reserve: (targetTenantId, kind) => reserveDocumentNumber(repository, targetTenantId, kind),
        update: (id, patch) => repository.updateQuote(id, { ...patch, tenantId })
      });
      const quotes: Quote[] = [];
      for (const quote of numbered) {
        quotes.push(await syncExpiredQuote(repository, quote));
      }
      res.json({ ok: true, tenantId, actorRole: access.role, quotes });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/quotes/:id", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "getQuote", status: 400 });
      }
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "getQuote");
      const resolved = await getQuoteAndClient(tenantId, quoteId);
      const repaired = resolved.client ? resolved : await repairLegacyQuoteClient(tenantId, resolved.quote);
      const quote = repaired.quote;
      const client = repaired.client;
      const property = quote.propertyId
        ? (await repositoryForTenant().listProperties(tenantId)).find((candidate) => candidate.id === quote.propertyId && candidate.clientId === quote.clientId)
        : undefined;
      res.json({ ok: true, tenantId, actorRole: access.role, quote, client, property });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/quotes", async (req: Request, res: Response) => {
    try {
      const input = createQuoteRouteBodySchema.parse(req.body);
      if (!input.items.length) {
        throw new RailError("A quote needs at least one line item before it can be created.", { provider: "native", op: "createQuote", status: 400 });
      }
      const access = await requireQuoteAccess(req, input.tenantId, "createQuote");
      const repository = repositoryForTenant();
      const propertyId = await resolveQuotePropertyContext(repository, input.tenantId, input.clientId, input.propertyId);
      const linkedRequest = input.requestId
        ? await repository.getRequest(input.tenantId, input.requestId)
        : undefined;
      if (input.requestId) {
        if (!linkedRequest) {
          throw new RailError("The source request was not found.", { provider: "native", op: "createQuote", status: 404 });
        }
        if (!linkedRequest.reviewedAt) {
          throw new RailError("Mark the request reviewed before creating its quote.", { provider: "native", op: "createQuote", status: 409 });
        }
        if (linkedRequest.convertedQuoteId || linkedRequest.status === "converted_to_quote" || linkedRequest.status === "converted_to_job" || linkedRequest.convertedJobId) {
          throw new RailError("This request is already linked to a downstream record.", { provider: "native", op: "createQuote", status: 409 });
        }
        if (linkedRequest.selectedClientId && linkedRequest.selectedClientId !== input.clientId) {
          throw new RailError("The quote client must match the selected request client.", { provider: "native", op: "createQuote", status: 409 });
        }
      }
      const provider = providerForTenant(input.tenantId);
      const quote = await provider.createQuote(await materializeQuoteRecord(repository, {
        ...input,
        ...(propertyId ? { propertyId } : {})
      }));
      if (linkedRequest) {
        await repository.updateRequest(linkedRequest.id, {
          tenantId: input.tenantId,
          status: "converted_to_quote",
          convertedQuoteId: quote.id,
          selectedClientId: quote.clientId,
          ...(quote.propertyId ? { selectedPropertyId: quote.propertyId } : {}),
          updatedAt: new Date().toISOString()
        });
        await eventBus.emit({
          tenantId: input.tenantId,
          type: "request.converted_to_quote",
          payload: { requestId: linkedRequest.id, quoteId: quote.id, clientId: quote.clientId }
        });
      }
      await eventBus.emit({
        tenantId: quote.tenantId,
        type: "quote.created",
        payload: {
          quoteId: quote.id,
          clientId: quote.clientId,
          ...(quote.requestId ? { requestId: quote.requestId } : {})
        }
      });
      if (input.delivery.mode !== "draft") {
        const settings = await repository.getCrmSettings(input.tenantId);
        const delivered = await sendQuoteDelivery({
          quote,
          client: (await provider.getClients("")).find((candidate) => candidate.id === quote.clientId),
          settings,
          mode: input.delivery.mode,
          target: input.delivery.target,
          note: input.delivery.note,
          actorId: actorIdForAccess(access),
          publicOrigin: publicOrigin(req)
        });
        res.status(201).json({ ok: true, quote: delivered.quote, portalUrl: delivered.portalUrl, delivery: delivered.delivery });
        return;
      }
      res.status(201).json({ ok: true, quote });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/crm/quotes/:id", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "updateQuote", status: 400 });
      }
      const input = updateQuoteRouteBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "updateQuote");
      const repository = repositoryForTenant();
      const existing = await getQuoteAndClient(tenantId, quoteId);
      if (quoteLocked(existing.quote)) {
        throw new RailError("Approved or archived quotes cannot be edited.", { provider: "native", op: "updateQuote", status: 409 });
      }
      if (existing.quote.status === "expired" || quoteApprovalBlockedReason(existing.quote)) {
        throw new RailError("Expired or declined quotes must be renewed instead of edited directly.", { provider: "native", op: "updateQuote", status: 409 });
      }
      const nextClientId = input.clientId ?? existing.quote.clientId;
      const requestedPropertyId = input.propertyId !== undefined ? input.propertyId : existing.quote.propertyId;
      const nextPropertyId = await resolveQuotePropertyContext(repository, tenantId, nextClientId, requestedPropertyId, existing.quote.propertyId);
      const rebuilt = await materializeQuoteRecord(repository, {
        tenantId,
        clientId: nextClientId,
        ...(nextPropertyId ? { propertyId: nextPropertyId } : {}),
        ...(input.requestId !== undefined ? { requestId: input.requestId } : existing.quote.requestId ? { requestId: existing.quote.requestId } : {}),
        ...(input.jobId !== undefined ? { jobId: input.jobId } : existing.quote.jobId ? { jobId: existing.quote.jobId } : {}),
        ...(input.templateId !== undefined ? { templateId: input.templateId } : existing.quote.templateId ? { templateId: existing.quote.templateId } : {}),
        title: input.title ?? existing.quote.title,
        items: input.items ?? existing.quote.lineItems.map((item) => ({
          // Existing document lines are always snapshots, including legacy
          // records that still carry a catalog id before migration runs.
          kind: "custom" as const,
          code: item.code,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          clientSelectable: item.clientSelectable,
          defaultSelected: item.defaultSelected
        })),
        approvalRules: input.approvalRules ?? existing.quote.approvalRules,
        discount: input.discount ?? existing.quote.discount,
        taxRate: input.taxRate ?? existing.quote.totals.taxRate,
        expiresAt: input.expiresAt ?? existing.quote.expiresAt,
        expiryDays: input.expiryDays,
        terms: input.terms ?? existing.quote.terms,
        intake: existing.quote.intake,
        customFields: input.customFields ?? existing.quote.customFields
      }, {
        existingId: existing.quote.id,
        existingNumber: existing.quote.number,
        status: "draft",
        intake: existing.quote.intake,
        version: (existing.quote.version ?? 1) + 1
      });
      const saved = await repository.updateQuote(existing.quote.id, {
        ...rebuilt,
        // updateQuote merges the patch with the stored record. Explicitly
        // clear an earlier payment bridge when the revised policy no longer
        // requires either a deposit or card authorization.
        deposit: rebuilt.approvalRules.requireDeposit || rebuilt.approvalRules.requireCardOnFile ? rebuilt.deposit : undefined,
        approvalId: undefined,
        sentAt: undefined,
        approvedAt: undefined,
        approvedBy: undefined,
        approvedByRole: undefined,
        signature: undefined,
        portal: {},
        versions: archiveQuoteVersion(existing.quote, "edited_before_send"),
        delivery: existing.quote.delivery ?? [],
        changeRequests: existing.quote.changeRequests ?? [],
        pdfRef: `native://quotes/${tenantId}/${existing.quote.id}.pdf`,
        updatedAt: new Date().toISOString()
      });
      res.json({ ok: true, tenantId, actorRole: access.role, quote: saved });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/quotes/:id/send", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "sendQuote", status: 400 });
      }
      const input = quoteSendBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "sendQuote");
      const resolved = await getQuoteAndClient(tenantId, quoteId);
      const repaired = resolved.client ? resolved : await repairLegacyQuoteClient(tenantId, resolved.quote);
      const quote = repaired.quote;
      const client = repaired.client;
      const settings = await repositoryForTenant().getCrmSettings(tenantId);
      if (["approved", "approved_internal", "archived", "declined", "expired"].includes(quote.status)) {
        throw new RailError("That quote cannot be sent in its current state.", { provider: "native", op: "sendQuote", status: 409 });
      }
      const delivered = await sendQuoteDelivery({
        quote,
        client,
        settings,
        mode: input.mode,
        target: input.target,
        note: input.note,
        subject: input.subject,
        bodyText: input.bodyText,
        actorId: actorIdForAccess(access),
        publicOrigin: publicOrigin(req)
      });
      res.json({ ok: true, tenantId, actorRole: access.role, quote: delivered.quote, portalUrl: delivered.portalUrl, delivery: delivered.delivery });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/quotes/:id/manual-approve", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "manualApproveQuote", status: 400 });
      }
      const input = quoteManualApprovalBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "manualApproveQuote");
      const { provider, quote } = await getQuoteAndClient(tenantId, quoteId);
      const blocked = quoteApprovalBlockedReason(quote);
      if (blocked) {
        throw new RailError(blocked, { provider: "native", op: "manualApproveQuote", status: 409 });
      }
      const approvedAt = new Date().toISOString();
      const approved = await provider.updateQuote(quote.id, {
        status: "approved_internal",
        approvedAt,
        approvedBy: access.tenantUserId,
        approvedByRole: access.role === "OWNER" ? "OWNER" : "OFFICE_ADMIN",
        updatedAt: approvedAt
      });
      await eventBus.emit({
        tenantId: approved.tenantId,
        type: "quote.approved",
        payload: { quoteId: approved.id, clientId: approved.clientId, approvedAt, approvedBy: access.tenantUserId, approvedByRole: access.role }
      });
      const converted = await convertApprovedQuoteToJob(approved, access.tenantUserId);
      res.json({ ok: true, tenantId, actorRole: access.role, ...converted });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/quotes/:id/archive", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "archiveQuote", status: 400 });
      }
      const input = quoteArchiveBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "archiveQuote");
      const { provider, quote } = await getQuoteAndClient(tenantId, quoteId);
      if (quote.status !== "draft") {
        throw new RailError("Only draft quotes can be archived.", { provider: "native", op: "archiveQuote", status: 409 });
      }
      const archivedAt = new Date().toISOString();
      const archived = await provider.updateQuote(quote.id, {
        status: "archived",
        updatedAt: archivedAt
      });
      res.json({ ok: true, tenantId, actorRole: access.role, quote: archived });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/quotes/:id/renew", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "renewQuote", status: 400 });
      }
      const input = quoteRenewInputSchema.parse(req.body);
      const access = await requireQuoteAccess(req, input.tenantId, "renewQuote");
      const { provider, quote, client } = await getQuoteAndClient(input.tenantId, quoteId);
      const isExpired = quote.status === "expired"
        || (!!quote.expiresAt && new Date(quote.expiresAt).getTime() < Date.now());
      if (!isExpired) {
        throw new RailError("Only expired quotes can be renewed.", { provider: "native", op: "renewQuote", status: 409 });
      }
      const timestamp = new Date().toISOString();
      const portalToken = createPortalToken();
      const nextExpiresAt = input.expiresAt
        || (input.expiryDays ? new Date(Date.now() + input.expiryDays * 86400000).toISOString() : undefined)
        || quote.expiresAt
        || timestamp;
      const renewed = await provider.updateQuote(quote.id, {
        status: "sent",
        expiresAt: nextExpiresAt,
        updatedAt: timestamp,
        sentAt: timestamp,
        version: (quote.version ?? 1) + 1,
        versions: archiveQuoteVersion(quote, "renewed", timestamp),
        portal: {
          ...(quote.portal ?? {}),
          tokenHash: hashPortalToken(portalToken),
          tokenIssuedAt: timestamp
        }
      });
      await eventBus.emit({
        tenantId: renewed.tenantId,
        type: "quote.renewed",
        payload: { quoteId: renewed.id, clientId: renewed.clientId, renewedAt: timestamp, renewedBy: access.tenantUserId }
      });
      res.json({
        ok: true,
        tenantId: input.tenantId,
        actorRole: access.role,
        quote: renewed,
        client,
        portalUrl: portalUrlForQuote(renewed, portalToken)
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/quotes/:id/convert-to-job", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "convertQuoteToJob", status: 400 });
      }
      const tenantId = typeof req.body?.tenantId === "string" && req.body.tenantId.trim()
        ? req.body.tenantId
        : defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "convertQuoteToJob");
      const { quote } = await getQuoteAndClient(tenantId, quoteId);
      if (!["approved", "approved_internal"].includes(quote.status)) {
        throw new RailError("Only approved quotes can convert into jobs.", { provider: "native", op: "convertQuoteToJob", status: 409 });
      }
      const converted = await convertApprovedQuoteToJob(quote, access.tenantUserId);
      res.status(201).json({
        ok: true,
        tenantId,
        actorRole: access.role,
        ...converted
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/quotes/:id/invoice", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "createInvoiceFromQuote", status: 400 });
      }
      const input = createInvoiceFromQuoteBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "createInvoiceFromQuote");
      const repository = repositoryForTenant();
      const { provider, quote } = await getQuoteAndClient(tenantId, quoteId);
      if (!["approved", "approved_internal"].includes(quote.status)) {
        throw new RailError("Quote must be approved before an invoice is created.", { provider: "native", op: "createInvoiceFromQuote", status: 409 });
      }
      const existing = (await provider.getInvoices()).find((invoice) => invoice.quoteId === quote.id);
      if (existing) {
        res.json({ ok: true, tenantId, actorRole: access.role, invoice: existing, reused: true });
        return;
      }
      const settings = await repository.getCrmSettings(tenantId);
      const invoice = await provider.createInvoice(buildInvoiceDraftFromQuote({
        quote,
        settings,
        number: await reserveDocumentNumber(repository, tenantId, "invoice")
      }));
      const syncedInvoice = deps.ledgerService ? await ledger().syncInvoiceAfterCreate(invoice) : invoice;
      if (quote.jobId) {
        await jobLifecycle().markInvoiceCreated({
          tenantId,
          jobId: quote.jobId,
          invoiceId: syncedInvoice.id,
          actorId: access.tenantUserId
        });
      }
      res.status(201).json({ ok: true, tenantId, actorRole: access.role, invoice: syncedInvoice });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/quotes/:id/pdf", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      await requireQuoteAccess(req, tenantId, "renderQuotePdf");
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "renderQuotePdf", status: 400 });
      }
      const { quote, client } = await getQuoteAndClient(tenantId, quoteId);
      const settings = await repositoryForTenant().getCrmSettings(tenantId);
      res.setHeader("content-type", "application/pdf");
      res.send(renderQuotePdf(quote, client, settings.documentDesign));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/portal/quotes/:id/pdf", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const token = typeof req.query.token === "string" ? req.query.token : "";
      const quoteId = req.params.id;
      if (!quoteId || !token) {
        throw new RailError("Quote id and token are required.", { provider: "native", op: "renderPortalQuotePdf", status: 400 });
      }
      const { quote, client } = await getQuoteAndClient(tenantId, quoteId);
      const settings = await repositoryForTenant().getCrmSettings(tenantId);
      if (!quote.portal?.tokenHash || quote.portal.tokenHash !== hashPortalToken(token)) {
        throw new RailError("Quote portal token is invalid.", { provider: "native", op: "renderPortalQuotePdf", status: 403 });
      }
      const filename = `${quote.number ?? quote.id}.pdf`;
      res.setHeader("content-type", "application/pdf");
      res.setHeader("content-disposition", `attachment; filename="${filename}"`);
      res.send(renderQuotePdf(quote, client, settings.documentDesign));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/quotes", async (req: Request, res: Response) => {
    try {
      const built = await buildPortalSnapshotOrRedirect(req, res);
      if (!built) {
        return;
      }
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderPortalQuotesHtml(built.snapshot));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/quotes/:id", async (req: Request, res: Response) => {
    try {
      const built = await buildPortalSnapshotOrRedirect(req, res);
      if (!built) {
        return;
      }
      const quoteId = req.params.id;
      const quote = built.snapshot.quotes.find((record) => record.id === quoteId);
      if (!quote) {
        throw new RailError("That quote is not available in this portal session.", { provider: "native", op: "portalQuoteDetail", status: 404 });
      }
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderQuotePortalHtml(quote, "", built.snapshot.client, {
        approvalBlockedReason: quoteApprovalBlockedReason(quote),
        pdfPath: portalPathWithTenant(built.tenantId, `/nexportal/quotes/${encodeURIComponent(quote.id)}/pdf`),
        receiptReviews: built.snapshot.receiptReviews.filter((record) => record.quoteId === quote.id),
        approvalPath: portalPathWithTenant(built.tenantId, `/api/nexportal/quotes/${encodeURIComponent(quote.id)}/approve`),
        changeRequestPath: portalPathWithTenant(built.tenantId, `/api/nexportal/quotes/${encodeURIComponent(quote.id)}/change-request`),
        chrome: {
          badge: "NexPortal",
          title: quote.title,
          subtitle: "Review scope, approval proof, and receipt history without leaving the client hub.",
          backHref: portalPathWithTenant(built.tenantId, "/nexportal/quotes"),
          backLabel: "Back to quotes",
          navLinks: [
            { href: portalPathWithTenant(built.tenantId, "/nexportal"), label: "Overview" },
            { href: portalPathWithTenant(built.tenantId, "/nexportal/quotes"), label: "Quotes", active: true },
            { href: portalPathWithTenant(built.tenantId, "/nexportal/invoices"), label: "Invoices" },
            { href: portalPathWithTenant(built.tenantId, "/nexportal/appointments"), label: "Appointments" },
            { href: portalPathWithTenant(built.tenantId, "/nexportal/documents"), label: "Documents" }
          ],
          ...(typeof req.query.status === "string" && req.query.status.trim() ? { statusMessage: req.query.status } : {})
        }
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/quotes/:id/pdf", async (req: Request, res: Response) => {
    try {
      const built = await buildPortalSnapshotOrRedirect(req, res);
      if (!built) {
        return;
      }
      const quoteId = req.params.id;
      const quote = built.snapshot.quotes.find((record) => record.id === quoteId);
      if (!quote) {
        throw new RailError("That quote PDF is not available in this portal session.", { provider: "native", op: "portalQuotePdf", status: 404 });
      }
      res.setHeader("content-type", "application/pdf");
      res.setHeader("content-disposition", `inline; filename=\"quote-${quote.number ?? quote.id}.pdf\"`);
      res.send(renderQuotePdf(quote, built.snapshot.client));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/nexportal/quotes/:id/approve", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "portalSessionApproveQuote", status: 400 });
      }
      const portalAccess = await requirePortalSession(req);
      if (portalAccess.needsReverify) {
        throw new RailError("Portal access needs re-verification before this approval can continue.", { provider: "native", op: "portalSessionApproveQuote", status: 401 });
      }
      const input = portalSessionQuoteApprovalBodySchema.parse(req.body);
      const [provider, snapshot, settings] = await Promise.all([
        Promise.resolve(providerForTenant(portalAccess.tenantId)),
        portalHub().buildSnapshot({ tenantId: portalAccess.tenantId, session: portalAccess.session }),
        repositoryForTenant().getCrmSettings(portalAccess.tenantId)
      ]);
      const quote = snapshot.quotes.find((record) => record.id === quoteId);
      if (!quote) {
        throw new RailError("That quote is not available in this portal session.", { provider: "native", op: "portalSessionApproveQuote", status: 403 });
      }
      const blocked = quoteApprovalBlockedReason(quote);
      if (blocked) {
        throw new RailError(blocked, { provider: "native", op: "portalSessionApproveQuote", status: 409 });
      }
      if (quote.approvalRules.requireSignature && !((input.signatureMode === "typed" && input.typedName?.trim()) || input.drawnDataUrl?.trim())) {
        throw new RailError("This quote requires a signature before approval.", { provider: "native", op: "portalSessionApproveQuote", status: 400 });
      }
      if (quote.approvalRules.requireDeposit && !input.deposit?.cardholderName?.trim()) {
        throw new RailError("This quote requires deposit details before approval.", { provider: "native", op: "portalSessionApproveQuote", status: 400 });
      }
      if (quote.approvalRules.requireCardOnFile && (!input.deposit?.cardOnFileAuthorized || !input.deposit.cardLast4)) {
        throw new RailError("This quote requires card-on-file authorization before approval.", { provider: "native", op: "portalSessionApproveQuote", status: 400 });
      }
      const approvedAt = new Date().toISOString();
      const signatureMode = input.signatureMode ?? (input.drawnDataUrl ? "drawn" : "typed");
      const approvalCandidate: Quote = {
        ...quote,
        status: "approved",
        approvedAt,
        approvedBy: input.customerName.trim(),
        approvedByRole: "client",
        updatedAt: approvedAt,
        signature: {
          mode: signatureMode,
          signedAt: approvedAt,
          ...(input.typedName?.trim() ? { typedName: input.typedName.trim() } : {}),
          ...(input.drawnDataUrl?.trim() ? { drawnDataUrl: input.drawnDataUrl.trim() } : {}),
          ipAddress: req.ip || req.socket.remoteAddress || "unknown"
        },
        deposit: quote.deposit ? {
          ...quote.deposit,
          ...(input.deposit?.cardholderName?.trim() ? { cardholderName: input.deposit.cardholderName.trim() } : {}),
          ...(input.deposit?.cardBrand?.trim() ? { cardBrand: input.deposit.cardBrand.trim() } : {}),
          ...(input.deposit?.cardLast4 ? { cardLast4: input.deposit.cardLast4 } : {}),
          ...(input.deposit?.cardOnFileAuthorized !== undefined ? { cardOnFileAuthorized: input.deposit.cardOnFileAuthorized } : {}),
          ...(input.deposit?.cardOnFileAuthorized ? { autoSavedCardOnFile: true } : {}),
          ...(quote.deposit.required ? { capturedAt: approvedAt } : {})
        } : quote.deposit
      };
      const approved = await approveQuoteAfterDepositPreflight({
        originalQuote: quote,
        approvedQuote: approvalCandidate,
        ...(deps.ledgerService ? { syncDeposit: (candidate) => ledger().syncQuoteDepositBridge(candidate) } : {}),
        persistApproval: () => provider.updateQuote(quote.id, approvalCandidate)
      });
      await eventBus.emit({
        tenantId: approved.tenantId,
        type: "quote.signed",
        payload: { quoteId: approved.id, clientId: approved.clientId, signedAt: approvedAt, signerName: input.customerName.trim() }
      });
      await eventBus.emit({
        tenantId: approved.tenantId,
        type: "quote.approved",
        payload: { quoteId: approved.id, clientId: approved.clientId, approvedAt, approvedBy: input.customerName.trim(), approvedByRole: "client" }
      });
      const quotePortalUrl = `${publicOrigin(req)}${portalPathWithTenant(portalAccess.tenantId, `/nexportal/quotes/${encodeURIComponent(approved.id)}`)}`;
      const quoteVars = quoteTemplateVariables({ quote: approved, client: snapshot.client, portalUrl: quotePortalUrl });
      if (deps.commsRail?.sendAdapter && snapshot.client.emails[0]) {
        const approvalMessage = resolveTemplateMessage({
          settings,
          category: "quote_approval_confirmation",
          channel: "email",
          fallbackSubject: "Quote approved",
          fallbackBodyText: [
            `We recorded approval for quote ${approved.number ?? approved.id} on ${approvedAt}.`,
            "",
            quotePortalUrl
          ].join("\n"),
          variables: quoteVars
        });
        if (approvalMessage.enabled) {
          await deps.commsRail.sendAdapter.sendEmail({
            tenantId: approved.tenantId,
            mailbox: deps.commsRail.sendAdapter.mailbox,
            to: [snapshot.client.emails[0]],
            subject: approvalMessage.subject,
            bodyText: approvalMessage.bodyText
          });
        }
      }
      await sendQuoteApprovalOfficeAlert({
        quote: approved,
        clientName: snapshot.client.name,
        quotePortalUrl,
        tenantId: portalAccess.tenantId
      });
      if (approved.deposit?.capturedAt && deps.commsRail?.sendAdapter && deps.platformRepository) {
        const officeRecipients = [...new Set(
          (await deps.platformRepository.listTenantUsers(portalAccess.tenantId))
            .filter((user) => user.active && (user.role === "OWNER" || user.role === "OFFICE_ADMIN"))
            .flatMap((user) => user.email ? [user.email.trim().toLowerCase()] : [])
        )];
        if (officeRecipients.length) {
          const depositMessage = resolveTemplateMessage({
            settings,
            category: "deposit_paid_confirmation",
            channel: "email",
            fallbackSubject: `Deposit paid for ${approved.number ?? approved.id}`,
            fallbackBodyText: [
              `Deposit received for quote ${approved.number ?? approved.id}.`,
              `Amount: ${approved.deposit.amount.toFixed(2)}`,
              `Client: ${snapshot.client.name}`,
              quotePortalUrl
            ].join("\n"),
            variables: quoteVars
          });
          if (depositMessage.enabled) {
            await deps.commsRail.sendAdapter.sendEmail({
              tenantId: approved.tenantId,
              mailbox: deps.commsRail.sendAdapter.mailbox,
              to: officeRecipients,
              subject: depositMessage.subject,
              bodyText: depositMessage.bodyText
            });
          }
          await eventBus.emit({
            tenantId: approved.tenantId,
            type: "quote.deposit_paid",
            payload: {
              quoteId: approved.id,
              clientId: approved.clientId,
              capturedAt: approved.deposit.capturedAt,
              amount: approved.deposit.amount
            }
          });
        }
      }
      res.json({ ok: true, quote: approved });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/nexportal/quotes/:id/change-request", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "portalSessionQuoteChangeRequest", status: 400 });
      }
      const portalAccess = await requirePortalSession(req);
      if (portalAccess.needsReverify) {
        throw new RailError("Portal access needs re-verification before this change request can continue.", { provider: "native", op: "portalSessionQuoteChangeRequest", status: 401 });
      }
      const input = portalSessionQuoteChangeRequestBodySchema.parse(req.body);
      const provider = providerForTenant(portalAccess.tenantId);
      const snapshot = await portalHub().buildSnapshot({ tenantId: portalAccess.tenantId, session: portalAccess.session });
      const quote = snapshot.quotes.find((record) => record.id === quoteId);
      if (!quote) {
        throw new RailError("That quote is not available in this portal session.", { provider: "native", op: "portalSessionQuoteChangeRequest", status: 403 });
      }
      const blocked = quoteApprovalBlockedReason(quote);
      if (blocked) {
        throw new RailError(blocked, { provider: "native", op: "portalSessionQuoteChangeRequest", status: 409 });
      }
      if (!input.lineComments.length && !input.note?.trim()) {
        throw new RailError("Add a line comment or note before requesting changes.", { provider: "native", op: "portalSessionQuoteChangeRequest", status: 400 });
      }
      const requestedAt = new Date().toISOString();
      const updated = await provider.updateQuote(quote.id, {
        status: "change_requested",
        updatedAt: requestedAt,
        changeRequests: [
          ...(quote.changeRequests ?? []),
          {
            id: `quote_change_${randomUUID()}`,
            requestedAt,
            ...(input.customerName?.trim() ? { requestedBy: input.customerName.trim() } : {}),
            lineComments: input.lineComments,
            ...(input.note?.trim() ? { note: input.note.trim() } : {})
          }
        ]
      });
      await eventBus.emit({
        tenantId: updated.tenantId,
        type: "quote.change_requested",
        payload: { quoteId: updated.id, clientId: updated.clientId, requestedAt }
      });
      res.json({ ok: true, quote: updated });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/portal/quotes/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const token = typeof req.query.token === "string" ? req.query.token : "";
      const quoteId = req.params.id;
      if (!quoteId || !token) {
        throw new RailError("Quote id and token are required.", { provider: "native", op: "quotePortal", status: 400 });
      }
      const { quote, client } = await getQuoteAndClient(tenantId, quoteId);
      if (!quote.portal?.tokenHash || quote.portal.tokenHash !== hashPortalToken(token)) {
        throw new RailError("Quote portal token is invalid.", { provider: "native", op: "quotePortal", status: 403 });
      }
      await eventBus.emit({
        tenantId: quote.tenantId,
        type: "quote.viewed",
        payload: {
          quoteId: quote.id,
          clientId: quote.clientId,
          viewedAt: new Date().toISOString()
        }
      });
      const pdfPath = `/portal/quotes/${encodeURIComponent(quote.id)}/pdf?tenantId=${encodeURIComponent(tenantId)}&token=${encodeURIComponent(token)}`;
      const receiptReviews = deps.ledgerService
        ? (await ledger().listReceiptReviews(tenantId)).filter((record) => record.quoteId === quote.id)
        : [];
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderQuotePortalHtml(quote, token, client, {
        approvalBlockedReason: quoteApprovalBlockedReason(quote),
        pdfPath,
        receiptReviews
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/portal/quotes/:id/approve", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "approveQuote", status: 400 });
      }
      const input = portalQuoteApprovalInputSchema.parse(req.body);
      const { provider, quote, client } = await getQuoteAndClient(input.tenantId, quoteId);
      if (!quote.portal?.tokenHash || quote.portal.tokenHash !== hashPortalToken(input.token)) {
        throw new RailError("Quote portal token is invalid.", { provider: "native", op: "approveQuote", status: 403 });
      }
      const blocked = quoteApprovalBlockedReason(quote);
      if (blocked) {
        throw new RailError(blocked, { provider: "native", op: "approveQuote", status: 409 });
      }
      if (quote.approvalRules.requireSignature && !((input.signatureMode === "typed" && input.typedName?.trim()) || input.drawnDataUrl?.trim())) {
        throw new RailError("This quote requires a signature before approval.", { provider: "native", op: "approveQuote", status: 400 });
      }
      if (quote.approvalRules.requireDeposit && !input.deposit?.cardholderName?.trim()) {
        throw new RailError("This quote requires deposit details before approval.", { provider: "native", op: "approveQuote", status: 400 });
      }
      if (quote.approvalRules.requireCardOnFile && (!input.deposit?.cardOnFileAuthorized || !input.deposit.cardLast4)) {
        throw new RailError("This quote requires card-on-file authorization before approval.", { provider: "native", op: "approveQuote", status: 400 });
      }
      const approvedAt = new Date().toISOString();
      const signatureMode = input.signatureMode ?? (input.drawnDataUrl ? "drawn" : "typed");
      const approvalCandidate: Quote = {
        ...quote,
        status: "approved",
        approvedAt,
        approvedBy: input.customerName.trim(),
        approvedByRole: "client",
        updatedAt: approvedAt,
        signature: {
          mode: signatureMode,
          signedAt: approvedAt,
          ...(input.typedName?.trim() ? { typedName: input.typedName.trim() } : {}),
          ...(input.drawnDataUrl?.trim() ? { drawnDataUrl: input.drawnDataUrl.trim() } : {}),
          ipAddress: req.ip || req.socket.remoteAddress || "unknown"
        },
        deposit: quote.deposit ? {
          ...quote.deposit,
          ...(input.deposit?.cardholderName?.trim() ? { cardholderName: input.deposit.cardholderName.trim() } : {}),
          ...(input.deposit?.cardBrand?.trim() ? { cardBrand: input.deposit.cardBrand.trim() } : {}),
          ...(input.deposit?.cardLast4 ? { cardLast4: input.deposit.cardLast4 } : {}),
          ...(input.deposit?.cardOnFileAuthorized !== undefined ? { cardOnFileAuthorized: input.deposit.cardOnFileAuthorized } : {}),
          ...(input.deposit?.cardOnFileAuthorized ? { autoSavedCardOnFile: true } : {}),
          ...(quote.deposit.required ? { capturedAt: approvedAt } : {})
        } : quote.deposit
      };
      const approved = await approveQuoteAfterDepositPreflight({
        originalQuote: quote,
        approvedQuote: approvalCandidate,
        ...(deps.ledgerService ? { syncDeposit: (candidate) => ledger().syncQuoteDepositBridge(candidate) } : {}),
        persistApproval: () => provider.updateQuote(quote.id, approvalCandidate)
      });
      await eventBus.emit({
        tenantId: approved.tenantId,
        type: "quote.signed",
        payload: { quoteId: approved.id, clientId: approved.clientId, signedAt: approvedAt, signerName: input.customerName.trim() }
      });
      await eventBus.emit({
        tenantId: approved.tenantId,
        type: "quote.approved",
        payload: { quoteId: approved.id, clientId: approved.clientId, approvedAt, approvedBy: input.customerName.trim(), approvedByRole: "client" }
      });
      const settings = await repositoryForTenant().getCrmSettings(input.tenantId);
      const quotePortalUrl = portalUrlForQuote(approved, input.token);
      const quoteVars = quoteTemplateVariables({ quote: approved, client, portalUrl: quotePortalUrl });
      if (deps.commsRail?.sendAdapter && client?.emails[0]) {
        const approvalMessage = resolveTemplateMessage({
          settings,
          category: "quote_approval_confirmation",
          channel: "email",
          fallbackSubject: "Quote approved",
          fallbackBodyText: [
            `We recorded approval for quote ${approved.number ?? approved.id} on ${approvedAt}.`,
            "",
            quotePortalUrl
          ].join("\n"),
          variables: quoteVars
        });
        if (approvalMessage.enabled) {
          await deps.commsRail.sendAdapter.sendEmail({
            tenantId: approved.tenantId,
            mailbox: deps.commsRail.sendAdapter.mailbox,
            to: [client.emails[0]],
            subject: approvalMessage.subject,
            bodyText: approvalMessage.bodyText
          });
        }
      }
      await sendQuoteApprovalOfficeAlert({
        quote: approved,
        clientName: client?.name ?? approved.clientId,
        quotePortalUrl,
        tenantId: input.tenantId
      });
      if (approved.deposit?.capturedAt && deps.commsRail?.sendAdapter && deps.platformRepository) {
        const officeRecipients = [...new Set(
          (await deps.platformRepository.listTenantUsers(input.tenantId))
            .filter((user) => user.active && (user.role === "OWNER" || user.role === "OFFICE_ADMIN"))
            .flatMap((user) => user.email ? [user.email.trim().toLowerCase()] : [])
        )];
        if (officeRecipients.length) {
          const depositMessage = resolveTemplateMessage({
            settings,
            category: "deposit_paid_confirmation",
            channel: "email",
            fallbackSubject: `Deposit paid for ${approved.number ?? approved.id}`,
            fallbackBodyText: [
              `Deposit received for quote ${approved.number ?? approved.id}.`,
              `Amount: ${approved.deposit.amount.toFixed(2)}`,
              `Client: ${client?.name ?? approved.clientId}`,
              quotePortalUrl
            ].join("\n"),
            variables: quoteVars
          });
          if (depositMessage.enabled) {
            await deps.commsRail.sendAdapter.sendEmail({
              tenantId: approved.tenantId,
              mailbox: deps.commsRail.sendAdapter.mailbox,
              to: officeRecipients,
              subject: depositMessage.subject,
              bodyText: depositMessage.bodyText
            });
          }
          await eventBus.emit({
            tenantId: approved.tenantId,
            type: "quote.deposit_paid",
            payload: {
              quoteId: approved.id,
              clientId: approved.clientId,
              capturedAt: approved.deposit.capturedAt,
              amount: approved.deposit.amount
            }
          });
        }
      }
      res.json({ ok: true, quote: approved });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/portal/quotes/:id/change-request", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "changeQuote", status: 400 });
      }
      const input = portalQuoteChangeRequestInputSchema.parse(req.body);
      const { provider, quote } = await getQuoteAndClient(input.tenantId, quoteId);
      if (!quote.portal?.tokenHash || quote.portal.tokenHash !== hashPortalToken(input.token)) {
        throw new RailError("Quote portal token is invalid.", { provider: "native", op: "changeQuote", status: 403 });
      }
      const blocked = quoteApprovalBlockedReason(quote);
      if (blocked) {
        throw new RailError(blocked, { provider: "native", op: "changeQuote", status: 409 });
      }
      if (!input.lineComments.length && !input.note?.trim()) {
        throw new RailError("Add a line comment or note before requesting changes.", { provider: "native", op: "changeQuote", status: 400 });
      }
      const requestedAt = new Date().toISOString();
      const updated = await provider.updateQuote(quote.id, {
        status: "change_requested",
        updatedAt: requestedAt,
        changeRequests: [
          ...(quote.changeRequests ?? []),
          {
            id: `quote_change_${randomUUID()}`,
            requestedAt,
            ...(input.customerName?.trim() ? { requestedBy: input.customerName.trim() } : {}),
            lineComments: input.lineComments,
            ...(input.note?.trim() ? { note: input.note.trim() } : {})
          }
        ]
      });
      await eventBus.emit({
        tenantId: updated.tenantId,
        type: "quote.change_requested",
        payload: { quoteId: updated.id, clientId: updated.clientId, requestedAt }
      });
      res.json({ ok: true, quote: updated });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
