import path from "node:path";
import type { Express, Request, Response } from "express";
import { RailError } from "@nexteam/core";
import { getAdminStorageBucket } from "../firebase.js";
import { sendHttpError } from "../core/httpError.js";
import type { MediaRepository } from "./mediaRepository.js";

function parseStorageRef(storageRef: string): { bucketName: string; objectPath: string } | null {
  const match = storageRef.match(/^gs:\/\/([^/]+)\/(.+)$/);
  return match?.[1] && match[2] ? { bucketName: match[1], objectPath: match[2] } : null;
}

function nativeMediaContentType(type: string): string {
  if (type === "video") return "video/mp4";
  if (type === "audio") return "audio/m4a";
  if (type === "pdf") return "application/pdf";
  return "image/jpeg";
}

export function registerNativeMediaRoutes(
  app: Express,
  input: { env: NodeJS.ProcessEnv; tenantId: string; repository: MediaRepository }
): void {
  app.get("/api/media/:id", async (req: Request, res: Response) => {
    try {
      const mediaId = req.params.id;
      if (!mediaId) {
        throw new RailError("Media id is required.", { provider: "native", op: "fetchBinary", status: 400 });
      }
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : input.tenantId;
      const media = await input.repository.getMedia(tenantId, mediaId);
      const storageRef = media ? parseStorageRef(media.storageRef) : null;
      if (!media || !storageRef) {
        throw new RailError("Native media file was not found.", { provider: "native", op: "fetchBinary", status: 404 });
      }
      const bucket = getAdminStorageBucket(input.env);
      if (!bucket) {
        throw new RailError("Firebase Storage is not configured for native media reads.", {
          provider: "firebase",
          op: "mediaFetch",
          status: 503
        });
      }
      if (bucket.name !== storageRef.bucketName) {
        throw new RailError("Native media is stored in a different Firebase bucket.", {
          provider: "firebase",
          op: "mediaFetch",
          status: 409
        });
      }
      const file = bucket.file(storageRef.objectPath);
      const [exists] = await file.exists();
      if (!exists) {
        throw new RailError("Native media file was not found in Storage.", {
          provider: "firebase",
          op: "mediaFetch",
          status: 404
        });
      }
      const [metadata] = await file.getMetadata();
      res.setHeader("content-type", String(metadata.contentType ?? nativeMediaContentType(media.type)));
      if (req.query.download === "1") {
        res.setHeader("content-disposition", `attachment; filename="${path.posix.basename(storageRef.objectPath).replace(/"/g, "")}"`);
      }
      file.createReadStream().pipe(res);
    } catch (error) {
      sendHttpError(res, error);
    }
  });
}
