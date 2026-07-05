import { Readable } from "node:stream";
import express, { type Request, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ApprovalQueueService,
  FirestoreEventBus,
  InMemoryEventBus,
  InMemoryApprovalQueueRepository,
  RailError,
  approvalItemSchema,
  logger
} from "@nexteam/core";
import { CompanyCamAdapter } from "@nexteam/providers";
import { getBuildInfo } from "./buildInfo.js";
import { createNexiRouter } from "./nexi/nexiRoutes.js";
import { buildHealth } from "./health.js";
import { registerCrmRoutes } from "./crm/routes.js";
import { getAdminDb } from "./firebase.js";
import { registerFieldDocsRoutes } from "./fielddocs/routes.js";
import { CommsApprovalExecutor } from "./comms/approvalExecutor.js";
import { createCommsRailFromEnv } from "./comms/gmailRegistry.js";
import { createCommsNexiTools } from "./comms/nexiTools.js";

const app = express();
const commsRail = createCommsRailFromEnv(process.env);
const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CommsApprovalExecutor(commsRail));
const webDistDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
const adminDb = getAdminDb();
const eventBus = adminDb ? new FirestoreEventBus(adminDb) : new InMemoryEventBus();

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
app.use("/api/nexi", createNexiRouter(process.env, { extraTools: createCommsNexiTools(commsRail, approvalQueue) }));

function sendError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  const message = error instanceof Error ? error.message : "Unknown server error";
  logger.error({ status, message });
  res.status(status).json({ ok: false, error: message });
}

app.get("/api/version", (_req: Request, res: Response) => {
  res.json(getBuildInfo());
});

app.get("/api/health", async (_req: Request, res: Response) => {
  try {
    res.json(await buildHealth());
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/public/runtime-config", (_req: Request, res: Response) => {
  const firebase = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || "",
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.VITE_FIREBASE_APP_ID || ""
  };
  res.json({
    ok: true,
    firebase,
    firebaseConfigured: Object.values(firebase).every((value) => value.length > 0)
  });
});

app.get("/api/media/:id", async (req: Request, res: Response) => {
  try {
    const mediaId = req.params.id;
    if (!mediaId) {
      throw new RailError("Media id is required.", { provider: "companycam", op: "fetchBinary", status: 400 });
    }
    const companyCam = CompanyCamAdapter.fromEnv(process.env);
    const binary = await companyCam.fetchBinary(mediaId);
    res.setHeader("content-type", binary.mime);
    if (req.query.download === "1") {
      res.setHeader("content-disposition", `attachment; filename="companycam-${mediaId.replace(/[^a-z0-9_-]/gi, "_")}.jpg"`);
    }
    if (binary.stream instanceof Readable) {
      binary.stream.pipe(res);
      return;
    }
    Readable.from(binary.stream as AsyncIterable<Uint8Array>).pipe(res);
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/approval-queue", async (req: Request, res: Response) => {
  try {
    const item = await approvalQueue.create(req.body as Parameters<typeof approvalQueue.create>[0]);
    res.status(201).json(approvalItemSchema.parse(item));
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/approval-queue", async (req: Request, res: Response) => {
  try {
    const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : process.env.TENANT_ID || "aquatrace";
    res.json({ ok: true, items: await approvalQueue.listPending(tenantId) });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/approval-queue/:id/approve", async (req: Request, res: Response) => {
  try {
    const approvalId = req.params.id;
    if (!approvalId) {
      throw new RailError("Approval id is required.", { provider: "approval", op: "approve", status: 400 });
    }
    const item = await approvalQueue.approve(approvalId);
    res.json({ ok: true, item });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/approval-queue/:id/execute", async (req: Request, res: Response) => {
  try {
    const approvalId = req.params.id;
    if (!approvalId) {
      throw new RailError("Approval id is required.", { provider: "approval", op: "execute", status: 400 });
    }
    const result = await approvalQueue.executeApproved(approvalId);
    res.json({ ok: true, ...result });
  } catch (error) {
    sendError(res, error);
  }
});

registerCrmRoutes(app, { approvalQueue, eventBus });
registerFieldDocsRoutes(app, { eventBus });
app.use(express.static(webDistDir));

app.get("/", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "nexteam-studio-server", version: getBuildInfo() });
});

export { app };

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    logger.info({ tenantId: process.env.TENANT_ID || "platform", module: "server", op: "listen", latencyMs: 0, ok: true, port });
  });
}


