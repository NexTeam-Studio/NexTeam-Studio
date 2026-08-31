import { NativeAdapter } from "@nexteam/providers";
import { createCrmReadTools } from "./nexiTools.js";
import { registerCrmRoutes } from "./routes.js";
import { registerTenantAutomationRuntime } from "./areas/settings/components/tenantConfig/server/automationRuntime.js";
import type { ServerModule } from "../types.js";

export const crmModule: ServerModule = {
  id: "crm",
  register: (app, runtime) => {
    registerTenantAutomationRuntime({
      eventBus: runtime.eventBus,
      repository: runtime.nativeCrmRepository,
      approvalQueue: runtime.approvalQueue
    });
    registerCrmRoutes(app, {
      approvalQueue: runtime.approvalQueue,
      eventBus: runtime.eventBus,
      env: runtime.env
    });
  },
  nexiToolProviders: (runtime) => [
    ({ tenant }) => createCrmReadTools(new NativeAdapter(runtime.nativeCrmRepository, tenant.id))
  ]
};
