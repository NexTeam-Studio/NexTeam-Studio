import { registerPlatformRoutes } from "./routes.js";
import type { ServerModule } from "../modules/types.js";

export const platformModule: ServerModule = {
  id: "platform",
  register: (app, runtime) => {
    registerPlatformRoutes(app, {
      repository: runtime.platformRepository,
      storage: runtime.platformStorage,
      env: runtime.env
    });
  }
};
