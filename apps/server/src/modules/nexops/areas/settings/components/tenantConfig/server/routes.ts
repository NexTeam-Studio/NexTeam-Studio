import type { Request, Response } from "express";
import { RailError, tenantOnboardingSteps, type CrmSettingsDoc, type PlatformModule } from "@nexteam/core";
import { randomUUID } from "node:crypto";
import { requireAccessContext } from "../../../../../../../auth/accessContext.js";
import { modulesForPlan } from "../../../../../../../platform/plans.js";
import { hasPermissionLevel, permissionGridFor } from "../../../../../../../platform/tenantPermissionGrid.js";
import type { CrmRouteContext } from "../../../../../runtime/routeRuntime.js";
import { detachCatalogSnapshots, detachDraftCatalogSnapshots } from "./catalogReset.js";
import { communicationTemplateMatchesDefault, defaultCommunicationTemplate, normalizeCommunicationTemplates } from "./communicationTemplates.js";
import { renderQuotePdf } from "../../../../quotes/components/quoteEngine/server/quoteDocument.js";
import { renderInvoicePdf } from "../../../../invoices/components/invoiceStructure/server/invoiceDocument.js";
import { renderJobPdf } from "../../../../jobs/components/jobCore/server/jobDocument.js";

function onboardingLaunchReadiness(settings: CrmSettingsDoc, availableModules: ReadonlySet<PlatformModule>) {
  const onboarding = settings.operatingProfile.onboarding;
  const requiredTasksComplete = onboarding.checklist.tasks
    .filter((task) => task.required)
    .every((task) => task.status === "complete");
  const guidedStepsComplete = tenantOnboardingSteps.every((step, index) => onboarding.completedSteps[index] === step);
  const selectedModulesAllowed = onboarding.selectedModules.every((module) => availableModules.has(module));
  const reasons = [
    ...(requiredTasksComplete ? [] : ["Complete every required onboarding task."]),
    ...(onboarding.selectedModules.length ? [] : ["Select at least one subscribed module."]),
    ...(selectedModulesAllowed ? [] : ["Remove modules that are not included in this tenant's subscription."]),
    ...(guidedStepsComplete ? [] : ["Complete the guided configuration steps in order."]),
    ...(onboarding.launchReviewedAt ? [] : ["Record the launch review."])
  ];
  return { ready: reasons.length === 0, reasons, availableModules: [...availableModules].sort() };
}

export function registerTenantConfigRoutes(context: CrmRouteContext): void {
  const {
    app,
    crmSettingsPatchSchema,
    defaultTenantId,
    env,
    repositoryForTenant,
    requireQuoteAccess,
    sendRouteError
  } = context;

  async function launchReadinessFor(settings: CrmSettingsDoc) {
    const tenant = await context.deps.platformRepository?.getTenant(settings.tenantId);
    if (!tenant) {
      throw new RailError("Tenant subscription could not be verified for onboarding.", { provider: "platform", op: "onboardingLaunch", status: 503 });
    }
    return onboardingLaunchReadiness(settings, modulesForPlan(tenant.plan));
  }

  async function applyOnboardingCommand(settings: CrmSettingsDoc, command: NonNullable<ReturnType<typeof crmSettingsPatchSchema.parse>["onboardingCommand"]>, actorId: string) {
    const checklist = settings.operatingProfile.onboarding.checklist;
    const task = checklist.tasks.find((entry) => entry.id === command.taskId);
    if (!task) {
      throw new RailError("Onboarding task was not found.", { provider: "native", op: "updateCrmSettings", status: 404 });
    }
    if (command.action === "set-status" && command.status === "skipped" && task.required) {
      throw new RailError("Required onboarding tasks cannot be skipped.", { provider: "native", op: "updateCrmSettings", status: 400 });
    }
    if (command.action === "reassign" && command.ownerUserId === task.ownerUserId) {
      throw new RailError("Choose a different active tenant user for reassignment.", { provider: "native", op: "updateCrmSettings", status: 400 });
    }
    if (command.action === "reassign") {
      const user = await context.deps.platformRepository?.getTenantUser(settings.tenantId, command.ownerUserId);
      if (!user || !user.active || user.tenantId !== settings.tenantId) {
        throw new RailError("Onboarding tasks can only be assigned to active users in this tenant.", { provider: "native", op: "updateCrmSettings", status: 400 });
      }
    }
    const nextTask = command.action === "claim"
      ? { ...task, ownerUserId: actorId, status: task.status === "not_started" ? "in_progress" as const : task.status }
      : command.action === "reassign"
        ? { ...task, ownerUserId: command.ownerUserId }
        : { ...task, status: command.status, ...(command.status === "complete" ? { completedAt: new Date().toISOString() } : { completedAt: undefined }) };
    const action = command.action === "claim" ? "task.claimed" as const : command.action === "reassign" ? "task.reassigned" as const : "task.status_changed" as const;
    const detail = command.action === "claim"
      ? `Task claimed by ${actorId}.`
      : command.action === "reassign"
        ? `Task reassigned to ${command.ownerUserId}.`
        : `Task status changed to ${command.status}.`;
    return {
      ...checklist,
      tasks: checklist.tasks.map((entry) => entry.id === task.id ? nextTask : entry),
      auditHistory: [...checklist.auditHistory, { id: `onboarding_audit_${randomUUID()}`, action, actorId, taskId: task.id, detail, createdAt: new Date().toISOString() }].slice(-200)
    };
  }

  app.get("/api/crm/settings", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "getCrmSettings");
      const repository = repositoryForTenant();
      const settings = await repository.getCrmSettings(tenantId);
      const communicationTemplates = normalizeCommunicationTemplates(settings);
      const normalized = communicationTemplates.length === settings.communicationTemplates.length
        && communicationTemplates.every((template, index) => JSON.stringify(template) === JSON.stringify(settings.communicationTemplates[index]))
        ? settings
        : await repository.saveCrmSettings({ ...settings, communicationTemplates, updatedAt: new Date().toISOString() });
      res.json({
        ok: true,
        tenantId,
        actorRole: access.role,
        settings: normalized,
        templateDefaults: normalizeCommunicationTemplates({ tenantId, communicationTemplates: [] }),
        onboardingLaunch: await launchReadinessFor(normalized)
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/settings/document-design-preview", async (req: Request, res: Response) => {
    try {
      const input = req.body as { tenantId?: string; kind?: "quote" | "job" | "invoice"; documentDesign?: any };
      const tenantId = input.tenantId ?? defaultTenantId(env);
      await requireQuoteAccess(req, tenantId, "previewDocumentDesign");
      const line = { id: "preview_line", code: "LEAK", name: "Leak Detection Service", quantity: 2, unitPrice: 125, total: 250, taxable: false };
      const totals = { subtotal: 250, discount: 0, tax: 20, total: 270 };
      const design = input.documentDesign;
      const pdf = input.kind === "invoice"
        ? renderInvoicePdf({ id: "preview_invoice", tenantId, clientId: "preview_client", title: "Leak Detection Invoice", status: "awaiting_payment", lineItems: [line], totals, ledger: { depositApplied: 0, creditApplied: 0, paymentApplied: 0, refundedAmount: 0, balanceDue: 270, overdue: true }, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z" }, undefined, design)
        : input.kind === "job"
          ? renderJobPdf({ id: "preview_job", tenantId, clientId: "preview_client", title: "Leak Detection Job", status: "Upcoming", lineItems: [line], totals }, design)
          : renderQuotePdf({ id: "preview_quote", tenantId, clientId: "preview_client", title: "Leak Detection Estimate", status: "draft", lineItems: [line], totals, approvalRules: { requireSignature: true, requireDeposit: true, requireCardOnFile: false, depositKind: "percent", depositValue: 50 }, deposit: { required: true, kind: "percent", amount: 135 }, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z" }, undefined, design);
      res.setHeader("content-type", "application/pdf"); res.send(pdf);
    } catch (error) { sendRouteError(res, error); }
  });

  app.post("/api/crm/settings/templates/:category/reset", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.body?.tenantId === "string" && req.body.tenantId.trim()
        ? req.body.tenantId
        : defaultTenantId(env);
      const access = await requireAccessContext(req, env, { requestedTenantId: tenantId, op: "resetCommunicationTemplate" });
      if (!hasPermissionLevel(permissionGridFor(access.role, access.permissionOverrides), "COMMUNICATIONS", "WRITE")) {
        throw new RailError("Your Communications permission cannot reset templates.", { provider: "native", op: "resetCommunicationTemplate", status: 403 });
      }
      const fallback = defaultCommunicationTemplate(tenantId, req.params.category ?? "");
      if (!fallback) {
        throw new RailError("That template category does not have a registered default.", { provider: "native", op: "resetCommunicationTemplate", status: 404 });
      }
      const repository = repositoryForTenant();
      const settings = await repository.getCrmSettings(tenantId);
      const templates = normalizeCommunicationTemplates(settings);
      const current = templates.find((template) => template.category === fallback.category);
      const timestamp = new Date().toISOString();
      const reset = { ...fallback, createdAt: current?.createdAt ?? fallback.createdAt, updatedAt: timestamp };
      const saved = await repository.saveCrmSettings({
        ...settings,
        communicationTemplates: templates.map((template) => template.category === fallback.category ? reset : template),
        updatedAt: timestamp
      });
      res.json({ ok: true, settings: saved, template: reset, wasCustomized: current ? !communicationTemplateMatchesDefault(current, fallback) : false });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/settings/catalog/reset-aquatrace", async (req: Request, res: Response) => {
    try {
      const input = req.body as { tenantId?: unknown; confirmation?: unknown };
      if (input.tenantId !== "aquatrace" || input.confirmation !== "CLEAR_AQUATRACE_CATALOG") {
        throw new RailError("This reset is limited to the confirmed Aquatrace catalog and requires its explicit confirmation.", { provider: "native", op: "resetAquatraceCatalog", status: 400 });
      }
      const access = await requireAccessContext(req, env, { requestedTenantId: "aquatrace", op: "resetAquatraceCatalog" });
      if (!hasPermissionLevel(permissionGridFor(access.role, access.permissionOverrides), "PRODUCTS_AND_SERVICES", "MANAGE")) {
        throw new RailError("Your Products & Services permission cannot reset the catalog.", { provider: "native", op: "resetAquatraceCatalog", status: 403 });
      }
      const repository = repositoryForTenant();
      const settings = await repository.getCrmSettings("aquatrace");
      const migration = await detachDraftCatalogSnapshots(repository, "aquatrace", settings.catalogItems.map((item) => item.id));
      const saved = await repository.saveCrmSettings({ ...settings, catalogItems: [], updatedAt: new Date().toISOString() });
      res.json({ ok: true, tenantId: "aquatrace", migration, catalogItems: saved.catalogItems });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/settings/catalog/detach-snapshots", async (req: Request, res: Response) => {
    try {
      const input = req.body as { tenantId?: unknown; confirmation?: unknown };
      if (typeof input.tenantId !== "string" || input.confirmation !== "DETACH_CATALOG_LINE_SNAPSHOTS") {
        throw new RailError("Detaching existing catalog links requires an explicit confirmation.", { provider: "native", op: "detachCatalogSnapshots", status: 400 });
      }
      const access = await requireAccessContext(req, env, { requestedTenantId: input.tenantId, op: "detachCatalogSnapshots" });
      if (!hasPermissionLevel(permissionGridFor(access.role, access.permissionOverrides), "PRODUCTS_AND_SERVICES", "MANAGE")) {
        throw new RailError("Your Products & Services permission cannot migrate catalog snapshots.", { provider: "native", op: "detachCatalogSnapshots", status: 403 });
      }
      const migration = await detachCatalogSnapshots(repositoryForTenant(), input.tenantId);
      res.json({ ok: true, tenantId: input.tenantId, migration });
    } catch (error) { sendRouteError(res, error); }
  });

  app.patch("/api/crm/settings", async (req: Request, res: Response) => {
    try {
      const input = crmSettingsPatchSchema.parse(req.body);
      const access = input.catalogItems
        ? await requireAccessContext(req, env, { requestedTenantId: input.tenantId, op: "updateProductsAndServices" })
        : await requireQuoteAccess(req, input.tenantId, "updateCrmSettings");
      if (input.catalogItems && !hasPermissionLevel(permissionGridFor(access.role, access.permissionOverrides), "PRODUCTS_AND_SERVICES", "MANAGE")) {
        throw new RailError("Your Products & Services permission cannot manage the catalog.", { provider: "native", op: "updateProductsAndServices", status: 403 });
      }
      const repository = repositoryForTenant();
      const current = await repository.getCrmSettings(input.tenantId);
      const secureChecklist = input.onboardingCommand
        ? await applyOnboardingCommand(current, input.onboardingCommand, access.tenantUserId)
        : current.operatingProfile.onboarding.checklist;
      const onboarding = {
        ...current.operatingProfile.onboarding,
        ...(input.operatingProfile?.onboarding?.completedSteps !== undefined ? { completedSteps: input.operatingProfile.onboarding.completedSteps } : {}),
        ...(input.operatingProfile?.onboarding?.selectedModules !== undefined ? { selectedModules: input.operatingProfile.onboarding.selectedModules } : {}),
        ...(input.operatingProfile?.onboarding?.launchReviewedAt !== undefined ? { launchReviewedAt: input.operatingProfile.onboarding.launchReviewedAt } : {}),
        checklist: secureChecklist
      };
      const completedSteps = onboarding.completedSteps;
      if (!completedSteps.every((step, index) => step === tenantOnboardingSteps[index])) {
        throw new RailError("Onboarding steps must be completed in guided order.", { provider: "native", op: "updateCrmSettings", status: 400 });
      }
      const candidateSettings = { ...current, operatingProfile: { ...current.operatingProfile, onboarding } };
      const launchReadiness = await launchReadinessFor(candidateSettings);
      if (completedSteps.includes("module-selection") && onboarding.selectedModules.length === 0) {
        throw new RailError("Select at least one module before completing module selection.", { provider: "native", op: "updateCrmSettings", status: 400 });
      }
      if (!onboarding.selectedModules.every((module) => launchReadiness.availableModules.includes(module))) {
        throw new RailError("Selected modules must be included in the tenant subscription.", { provider: "platform", op: "onboardingModules", status: 400 });
      }
      if (onboarding.launchReviewedAt && !completedSteps.includes("launch-review")) {
        throw new RailError("Complete launch review before recording its review time.", { provider: "native", op: "updateCrmSettings", status: 400 });
      }
      const launchWasSubmitted = input.operatingProfile?.onboarding?.completedSteps?.includes("launch-review")
        || input.operatingProfile?.onboarding?.launchReviewedAt !== undefined;
      if (launchWasSubmitted && !launchReadiness.ready) {
        throw new RailError(`Launch criteria are incomplete: ${launchReadiness.reasons.join(" ")}`, { provider: "native", op: "onboardingLaunch", status: 400 });
      }
      if (input.catalogItems) {
        const ids = new Set<string>();
        const codes = new Set<string>();
        for (const item of input.catalogItems) {
          if (item.tenantId !== input.tenantId) {
            throw new RailError("Catalog items must belong to the tenant being updated.", { provider: "native", op: "updateCrmSettings", status: 400 });
          }
          const code = item.code.trim().toLowerCase();
          if (ids.has(item.id) || codes.has(code)) {
            throw new RailError("Catalog item ids and codes must be unique within a tenant.", { provider: "native", op: "updateCrmSettings", status: 400 });
          }
          ids.add(item.id);
          codes.add(code);
        }
      }
      if (input.propertyAssetDefinitions) {
        const kinds = new Set<string>();
        for (const definition of input.propertyAssetDefinitions) {
          const kind = definition.kind.trim().toLowerCase();
          if (kinds.has(kind)) {
            throw new RailError("Property asset types must have unique kinds within a tenant.", { provider: "native", op: "updateCrmSettings", status: 400 });
          }
          kinds.add(kind);
          const fieldKeys = new Set<string>();
          for (const field of definition.fields) {
            const key = field.key.trim().toLowerCase();
            if (fieldKeys.has(key)) {
              throw new RailError("Property asset fields must have unique keys within an asset type.", { provider: "native", op: "updateCrmSettings", status: 400 });
            }
            fieldKeys.add(key);
          }
        }
      }
      const saved = await repository.saveCrmSettings({
        ...current,
        operatingProfile: {
          ...current.operatingProfile,
          company: {
            ...current.operatingProfile.company,
            ...(input.operatingProfile?.company?.legalName !== undefined ? { legalName: input.operatingProfile.company.legalName } : {}),
            ...(input.operatingProfile?.company?.publicName !== undefined ? { publicName: input.operatingProfile.company.publicName } : {}),
            ...(input.operatingProfile?.company?.industry !== undefined ? { industry: input.operatingProfile.company.industry } : {}),
            ...(input.operatingProfile?.company?.timezone !== undefined ? { timezone: input.operatingProfile.company.timezone } : {})
          },
          ...(input.operatingProfile?.locations ? { locations: input.operatingProfile.locations } : {}),
          ...(input.operatingProfile?.businessHours ? { businessHours: input.operatingProfile.businessHours } : {}),
          tax: {
            ...current.operatingProfile.tax,
            ...(input.operatingProfile?.tax?.enabled !== undefined ? { enabled: input.operatingProfile.tax.enabled } : {}),
            ...(input.operatingProfile?.tax?.defaultRate !== undefined ? { defaultRate: input.operatingProfile.tax.defaultRate } : {}),
            ...(input.operatingProfile?.tax?.registrationId !== undefined ? { registrationId: input.operatingProfile.tax.registrationId } : {})
          },
          communicationIdentity: {
            ...current.operatingProfile.communicationIdentity,
            ...input.operatingProfile?.communicationIdentity
          },
          securityAudit: {
            ...current.operatingProfile.securityAudit,
            ...(input.operatingProfile?.securityAudit?.auditEventsEnabled !== undefined ? { auditEventsEnabled: input.operatingProfile.securityAudit.auditEventsEnabled } : {}),
            ...(input.operatingProfile?.securityAudit?.requireApprovalForExternalSend !== undefined ? { requireApprovalForExternalSend: input.operatingProfile.securityAudit.requireApprovalForExternalSend } : {})
          },
          onboarding: {
            ...onboarding
          }
        },
        documentNumbering: {
          request: {
            ...current.documentNumbering.request,
            prefix: input.documentNumbering?.request?.prefix ?? current.documentNumbering.request.prefix,
            separator: input.documentNumbering?.request?.separator ?? current.documentNumbering.request.separator,
            padWidth: input.documentNumbering?.request?.padWidth ?? current.documentNumbering.request.padWidth
          },
          quote: {
            ...current.documentNumbering.quote,
            prefix: input.documentNumbering?.quote?.prefix ?? current.documentNumbering.quote.prefix,
            separator: input.documentNumbering?.quote?.separator ?? current.documentNumbering.quote.separator,
            padWidth: input.documentNumbering?.quote?.padWidth ?? current.documentNumbering.quote.padWidth
          },
          job: {
            ...current.documentNumbering.job,
            prefix: input.documentNumbering?.job?.prefix ?? current.documentNumbering.job.prefix,
            separator: input.documentNumbering?.job?.separator ?? current.documentNumbering.job.separator,
            padWidth: input.documentNumbering?.job?.padWidth ?? current.documentNumbering.job.padWidth
          },
          invoice: {
            ...current.documentNumbering.invoice,
            prefix: input.documentNumbering?.invoice?.prefix ?? current.documentNumbering.invoice.prefix,
            separator: input.documentNumbering?.invoice?.separator ?? current.documentNumbering.invoice.separator,
            padWidth: input.documentNumbering?.invoice?.padWidth ?? current.documentNumbering.invoice.padWidth
          },
          receipt: {
            ...current.documentNumbering.receipt,
            prefix: input.documentNumbering?.receipt?.prefix ?? current.documentNumbering.receipt.prefix,
            separator: input.documentNumbering?.receipt?.separator ?? current.documentNumbering.receipt.separator,
            padWidth: input.documentNumbering?.receipt?.padWidth ?? current.documentNumbering.receipt.padWidth
          }
        },
        quoteDefaults: {
          ...current.quoteDefaults,
          ...(input.quoteDefaults?.expiryDays !== undefined ? { expiryDays: input.quoteDefaults.expiryDays } : {}),
          ...(input.quoteDefaults?.autoSaveCardOnDeposit !== undefined ? { autoSaveCardOnDeposit: input.quoteDefaults.autoSaveCardOnDeposit } : {}),
          approvalRules: {
            ...current.quoteDefaults.approvalRules,
            ...(input.quoteDefaults?.approvalRules?.requireSignature !== undefined ? { requireSignature: input.quoteDefaults.approvalRules.requireSignature } : {}),
            ...(input.quoteDefaults?.approvalRules?.requireDeposit !== undefined ? { requireDeposit: input.quoteDefaults.approvalRules.requireDeposit } : {}),
            ...(input.quoteDefaults?.approvalRules?.requireCardOnFile !== undefined ? { requireCardOnFile: input.quoteDefaults.approvalRules.requireCardOnFile } : {}),
            ...(input.quoteDefaults?.approvalRules?.depositKind !== undefined ? { depositKind: input.quoteDefaults.approvalRules.depositKind } : {}),
            ...(input.quoteDefaults?.approvalRules?.depositValue !== undefined ? { depositValue: input.quoteDefaults.approvalRules.depositValue } : {})
          },
          ...(input.quoteDefaults?.terms !== undefined ? { terms: input.quoteDefaults.terms } : {})
        },
        invoiceDefaults: {
          ...current.invoiceDefaults,
          ...(input.invoiceDefaults?.dueDays !== undefined ? { dueDays: input.invoiceDefaults.dueDays } : {}),
          ...(input.invoiceDefaults?.terms !== undefined ? { terms: input.invoiceDefaults.terms } : {}),
          ...(input.invoiceDefaults?.tippingEnabled !== undefined ? { tippingEnabled: input.invoiceDefaults.tippingEnabled } : {}),
          delivery: {
            ...current.invoiceDefaults.delivery,
            ...(input.invoiceDefaults?.delivery?.emailIncludePdf !== undefined ? { emailIncludePdf: input.invoiceDefaults.delivery.emailIncludePdf } : {}),
            ...(input.invoiceDefaults?.delivery?.emailIncludeSummary !== undefined ? { emailIncludeSummary: input.invoiceDefaults.delivery.emailIncludeSummary } : {}),
            ...(input.invoiceDefaults?.delivery?.emailIncludePayLink !== undefined ? { emailIncludePayLink: input.invoiceDefaults.delivery.emailIncludePayLink } : {}),
            ...(input.invoiceDefaults?.delivery?.smsIncludeSummary !== undefined ? { smsIncludeSummary: input.invoiceDefaults.delivery.smsIncludeSummary } : {}),
            ...(input.invoiceDefaults?.delivery?.smsIncludePayLink !== undefined ? { smsIncludePayLink: input.invoiceDefaults.delivery.smsIncludePayLink } : {}),
            ...(input.invoiceDefaults?.delivery?.smsIncludeHostedLink !== undefined ? { smsIncludeHostedLink: input.invoiceDefaults.delivery.smsIncludeHostedLink } : {})
          }
        },
        portalDefaults: {
          ...current.portalDefaults,
          ...(input.portalDefaults?.keepBusinessAddressPrivate !== undefined ? { keepBusinessAddressPrivate: input.portalDefaults.keepBusinessAddressPrivate } : {}),
          ...(input.portalDefaults?.hubSessionReverifyDays !== undefined ? { hubSessionReverifyDays: input.portalDefaults.hubSessionReverifyDays } : {})
        },
        reviewDefaults: {
          ...current.reviewDefaults,
          ...(input.reviewDefaults?.enabled !== undefined ? { enabled: input.reviewDefaults.enabled } : {}),
          ...(input.reviewDefaults?.steps ? { steps: input.reviewDefaults.steps } : {})
        },
        documentDesign: {
          quote: { ...current.documentDesign.quote, ...input.documentDesign?.quote } as typeof current.documentDesign.quote,
          job: { ...current.documentDesign.job, ...input.documentDesign?.job } as typeof current.documentDesign.job,
          invoice: { ...current.documentDesign.invoice, ...input.documentDesign?.invoice } as typeof current.documentDesign.invoice,
          style: { ...current.documentDesign.style, ...input.documentDesign?.style } as typeof current.documentDesign.style
        },
        completionRequirements: {
          ...current.completionRequirements,
          ...(input.completionRequirements?.checklistRequired !== undefined ? { checklistRequired: input.completionRequirements.checklistRequired } : {}),
          ...(input.completionRequirements?.photosRequired !== undefined ? { photosRequired: input.completionRequirements.photosRequired } : {}),
          ...(input.completionRequirements?.reportRequired !== undefined ? { reportRequired: input.completionRequirements.reportRequired } : {}),
          ...(input.completionRequirements?.signatureRequired !== undefined ? { signatureRequired: input.completionRequirements.signatureRequired } : {})
        },
        ...(input.propertyAssetDefinitions ? { propertyAssetDefinitions: input.propertyAssetDefinitions } : {}),
        ...(input.catalogItems ? { catalogItems: input.catalogItems } : {}),
        ...(input.communicationTemplates ? {
          communicationTemplates: normalizeCommunicationTemplates({ tenantId: input.tenantId, communicationTemplates: input.communicationTemplates })
        } : {}),
        updatedAt: new Date().toISOString()
      });
      res.json({ ok: true, tenantId: input.tenantId, actorRole: access.role, settings: saved, onboardingLaunch: await launchReadinessFor(saved) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
