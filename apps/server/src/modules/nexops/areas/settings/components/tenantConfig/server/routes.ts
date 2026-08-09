import type { Request, Response } from "express";
import { RailError, tenantOnboardingSteps } from "@nexteam/core";
import type { CrmRouteContext } from "../../../../../runtime/routeRuntime.js";

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

  app.get("/api/crm/settings", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "getCrmSettings");
      const settings = await repositoryForTenant().getCrmSettings(tenantId);
      res.json({ ok: true, tenantId, actorRole: access.role, settings });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/crm/settings", async (req: Request, res: Response) => {
    try {
      const input = crmSettingsPatchSchema.parse(req.body);
      const access = await requireQuoteAccess(req, input.tenantId, "updateCrmSettings");
      const repository = repositoryForTenant();
      const current = await repository.getCrmSettings(input.tenantId);
      const onboarding = {
        ...current.operatingProfile.onboarding,
        ...(input.operatingProfile?.onboarding?.completedSteps !== undefined ? { completedSteps: input.operatingProfile.onboarding.completedSteps } : {}),
        ...(input.operatingProfile?.onboarding?.selectedModules !== undefined ? { selectedModules: input.operatingProfile.onboarding.selectedModules } : {}),
        ...(input.operatingProfile?.onboarding?.launchReviewedAt !== undefined ? { launchReviewedAt: input.operatingProfile.onboarding.launchReviewedAt } : {})
      };
      const completedSteps = onboarding.completedSteps;
      if (!completedSteps.every((step, index) => step === tenantOnboardingSteps[index])) {
        throw new RailError("Onboarding steps must be completed in guided order.", { provider: "native", op: "updateCrmSettings", status: 400 });
      }
      if (completedSteps.includes("module-selection") && onboarding.selectedModules.length === 0) {
        throw new RailError("Select at least one module before completing module selection.", { provider: "native", op: "updateCrmSettings", status: 400 });
      }
      if (onboarding.launchReviewedAt && !completedSteps.includes("launch-review")) {
        throw new RailError("Complete launch review before recording its review time.", { provider: "native", op: "updateCrmSettings", status: 400 });
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
        ...(input.catalogItems ? { catalogItems: input.catalogItems } : {}),
        ...(input.communicationTemplates ? { communicationTemplates: input.communicationTemplates } : {}),
        updatedAt: new Date().toISOString()
      });
      res.json({ ok: true, tenantId: input.tenantId, actorRole: access.role, settings: saved });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
