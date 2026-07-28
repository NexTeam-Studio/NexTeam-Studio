import { NativeAdapter } from "@nexteam/providers";
import { createCrmReadTools } from "./nexiTools.js";
import { registerCrmRoutes } from "./routes.js";
import type { ServerModule } from "../types.js";

export const crmModule: ServerModule = {
  id: "crm",
  register: (app, runtime) => {
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
