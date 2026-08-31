import { createSchedulingNexiTools } from "./nexiTools.js";
import { registerSchedulingRoutes } from "./routes.js";
import type { ServerModule } from "../modules/types.js";

export const schedulingModule: ServerModule = {
  id: "scheduling",
  register: (app, runtime) => {
    registerSchedulingRoutes(app, {
      repository: runtime.schedulingRepository,
      approvalQueue: runtime.approvalQueue,
      crmRepository: runtime.nativeCrmRepository,
      env: runtime.env
    });
  },
  nexiToolProviders: (runtime) => [
    () => createSchedulingNexiTools({
      repository: runtime.schedulingRepository,
      approvalQueue: runtime.approvalQueue,
      env: runtime.env
    })
  ]
};
