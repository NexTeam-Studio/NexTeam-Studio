import { createCommsNexiTools } from "./nexiTools.js";
import type { ServerModule } from "../modules/types.js";

export const commsModule: ServerModule = {
  id: "comms",
  nexiToolProviders: (runtime) => [
    () => createCommsNexiTools(runtime.commsRail, runtime.approvalQueue)
  ]
};
