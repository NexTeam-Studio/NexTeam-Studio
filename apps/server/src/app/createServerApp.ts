import path from "node:path";
import express, { type Request } from "express";
import { getBuildInfo } from "../buildInfo.js";
import { registerCoreRoutes } from "../core/registerCoreRoutes.js";
import { collectNexiToolProviders, registerServerModules } from "../modules/manifest.js";
import { createNexiRouter } from "../nexi/nexiRoutes.js";
import { enforceToolEntitlements } from "../platform/entitlements.js";
import { loadTenantFromPlatform } from "../platform/routes.js";
import { createServerRuntime } from "./runtime.js";
import { requireNexiTenantAccess } from "../nexi/access.js";

export function createServerApp(env: NodeJS.ProcessEnv = process.env): {
  app: express.Express;
  runtime: ReturnType<typeof createServerRuntime>;
} {
  const app = express();
  const runtime = createServerRuntime(env);

  app.use(express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      const request = req as Request & { rawBody?: Buffer };
      if (request.originalUrl === "/api/stripe/webhook") {
        request.rawBody = Buffer.from(buf);
      }
    }
  }));
  app.use(express.urlencoded({ extended: false }));

  app.use("/api/nexi", createNexiRouter(runtime.env, {
    loadTenant: async (req) => {
      const access = await requireNexiTenantAccess(req, runtime.env);
      return loadTenantFromPlatform(runtime.platformRepository, access.tenantId, runtime.env);
    },
    filterTools: (tenant, tools) => enforceToolEntitlements(tenant, tools).tools,
    toolProviders: collectNexiToolProviders(runtime)
  }));

  registerCoreRoutes(app, runtime);
  registerServerModules(app, runtime);
  app.use(express.static(runtime.webDistDir));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(path.join(runtime.webDistDir, "index.html"), (error) => {
      if (!error) {
        return;
      }
      res.json({ ok: true, service: "nexteam-studio-server", version: getBuildInfo() });
    });
  });

  return { app, runtime };
}
