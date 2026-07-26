import type { Express } from "express";
import { commsModule } from "../comms/module.js";
import { contentModule } from "../content/module.js";
import { crmModule } from "../crm/module.js";
import { fieldDocsModule } from "../fielddocs/module.js";
import { platformModule } from "../platform/module.js";
import { schedulingModule } from "../scheduling/module.js";
import type { ServerRuntime } from "../app/runtime.js";
import type { NexiToolProvider } from "../nexi/toolRegistry.js";
import type { ServerModule } from "./types.js";

const serverModules: readonly ServerModule[] = [
  crmModule,
  fieldDocsModule,
  contentModule,
  schedulingModule,
  platformModule,
  commsModule
];

export function registerServerModules(app: Express, runtime: ServerRuntime): void {
  for (const serverModule of serverModules) {
    serverModule.register?.(app, runtime);
  }
}

export function collectNexiToolProviders(runtime: ServerRuntime): NexiToolProvider[] {
  return serverModules.flatMap((serverModule) => serverModule.nexiToolProviders?.(runtime) ?? []);
}
