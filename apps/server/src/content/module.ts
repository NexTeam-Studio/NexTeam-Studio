import { registerContentRoutes } from "./routes.js";
import type { ServerModule } from "../modules/types.js";

export const contentModule: ServerModule = {
  id: "content",
  register: (app, runtime) => {
    registerContentRoutes(app, {
      repository: runtime.contentRepository,
      approvalQueue: runtime.approvalQueue,
      eventBus: runtime.eventBus,
      env: runtime.env
    });
  }
};
