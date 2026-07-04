import { Readable } from "node:stream";
import express, { type Request, type Response } from "express";
import {
  ApprovalQueueService,
  InMemoryApprovalQueueRepository,
  RailError,
  approvalItemSchema,
  logger
} from "@nexteam/core";
import { CompanyCamAdapter } from "@nexteam/providers";
import { getBuildInfo } from "./buildInfo.js";
import { buildHealth } from "./health.js";

const app = express();
const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());

app.use(express.json({ limit: "1mb" }));

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

app.get("/api/media/:id", async (req: Request, res: Response) => {
  try {
    const mediaId = req.params.id;
    if (!mediaId) {
      throw new RailError("Media id is required.", { provider: "companycam", op: "fetchBinary", status: 400 });
    }
    const companyCam = CompanyCamAdapter.fromEnv(process.env);
    const binary = await companyCam.fetchBinary(mediaId);
    res.setHeader("content-type", binary.mime);
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
