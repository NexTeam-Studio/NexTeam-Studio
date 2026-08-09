import type { Express } from "express";
import { createCrmRouteContext, type CrmRouteDeps } from "./runtime/routeRuntime.js";
import { registerRequestCoreRoutes } from "./areas/requests/components/requestCore/server/routes.js";
import { registerContactRoutes } from "./areas/clients/components/contact/server/routes.js";
import { registerOperationsHubRoutes } from "./areas/home/components/operationsHub/server/routes.js";
import { registerJobCoreRoutes } from "./areas/jobs/components/jobCore/server/routes.js";
import { registerVisitCoreRoutes } from "./areas/visits/components/visitCore/server/routes.js";
import { registerTenantConfigRoutes } from "./areas/settings/components/tenantConfig/server/routes.js";
import { registerQuoteTemplateRoutes } from "./areas/quotes/components/quoteTemplates/server/routes.js";
import { registerQuoteEngineRoutes } from "./areas/quotes/components/quoteEngine/server/routes.js";
import { registerInvoiceStructureRoutes } from "./areas/invoices/components/invoiceStructure/server/routes.js";
import { registerPaymentRailRoutes } from "./areas/invoices/components/paymentRails/server/routes.js";
import { registerPortalCoreRoutes } from "../nexportal/components/portalCore/server/routes.js";
import { registerAgreementRoutes } from "./shared/agreements/routes.js";

export type { CrmRouteDeps } from "./runtime/routeRuntime.js";

export function registerCrmRoutes(app: Express, deps: CrmRouteDeps): void {
  const context = createCrmRouteContext(app, deps);
  registerRequestCoreRoutes(context);
  registerContactRoutes(context);
  registerOperationsHubRoutes(context);
  registerJobCoreRoutes(context);
  registerVisitCoreRoutes(context);
  registerTenantConfigRoutes(context);
  registerQuoteTemplateRoutes(context);
  registerQuoteEngineRoutes(context);
  registerInvoiceStructureRoutes(context);
  registerPaymentRailRoutes(context);
  registerAgreementRoutes(context);
  registerPortalCoreRoutes(context);
}
