import { registerFieldDocsRoutes } from "./routes.js";
import type { ServerModule } from "../modules/types.js";

export const fieldDocsModule: ServerModule = {
  id: "fielddocs",
  register: (app, runtime) => {
    registerFieldDocsRoutes(app, {
      eventBus: runtime.eventBus,
      env: runtime.env
    });
  }
};
