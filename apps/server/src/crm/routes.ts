import type { Express } from "express";
import { createCrmRouteContext, type CrmRouteDeps } from "./routeRuntime.js";
import { registerRequestCoreRoutes } from "../modules/nexops/areas/requests/components/requestCore/server/routes.js";
import { registerContactRoutes } from "../modules/nexops/areas/clients/components/contact/server/routes.js";
import { registerOperationsHubRoutes } from "../modules/nexops/areas/home/components/operationsHub/server/routes.js";
import { registerJobCoreRoutes } from "../modules/nexops/areas/jobs/components/jobCore/server/routes.js";
import { registerVisitCoreRoutes } from "../modules/nexops/areas/visits/components/visitCore/server/routes.js";
import { registerTenantConfigRoutes } from "../modules/nexops/areas/settings/components/tenantConfig/server/routes.js";
import { registerQuoteTemplateRoutes } from "../modules/nexops/areas/quotes/components/quoteTemplates/server/routes.js";
import { registerQuoteEngineRoutes } from "../modules/nexops/areas/quotes/components/quoteEngine/server/routes.js";
import { registerInvoiceStructureRoutes } from "../modules/nexops/areas/invoices/components/invoiceStructure/server/routes.js";
import { registerPaymentRailRoutes } from "../modules/nexops/areas/invoices/components/paymentRails/server/routes.js";
import { registerPortalCoreRoutes } from "../modules/nexportal/components/portalCore/server/routes.js";

export type { CrmRouteDeps } from "./routeRuntime.js";

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
  registerPortalCoreRoutes(context);
}
