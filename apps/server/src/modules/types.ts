import type { Express } from "express";
import type { ServerRuntime } from "../app/runtime.js";
import type { NexiToolProvider } from "../nexi/toolRegistry.js";

export interface ServerModule {
  id: string;
  register?: ((app: Express, runtime: ServerRuntime) => void) | undefined;
  nexiToolProviders?: ((runtime: ServerRuntime) => NexiToolProvider[]) | undefined;
}
