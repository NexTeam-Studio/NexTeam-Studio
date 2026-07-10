import { randomUUID } from "node:crypto";
import { mediaSchema, RailError, type Media } from "@nexteam/core";
import { z } from "zod";
import { getAdminStorageBucket } from "../firebase.js";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const uploadMediaInputSchema = z.object({
  tenantId: z.string().min(1),
  jobId: z.string().min(1).optional(),
  propertyId: z.string().min(1).optional(),
  filename: z.string().min(1),
  mime: z.string().min(1),
  fileBase64: z.string().min(1).optional(),
  tags: z.array(z.string()).default([]),
  capturedAt: z.string().optional(),
  gps: z.object({ lat: z.number(), lng: z.number() }).optional()
});

export type UploadMediaInput = z.infer<typeof uploadMediaInputSchema>;

function mediaTypeFromMime(mime: string): Media["type"] {
  if (mime.startsWith("video/")) {
    return "video";
  }
  if (mime === "application/pdf") {
    return "pdf";
  }
  return "photo";
}

export function safeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export function createNativeMediaFromUpload(input: UploadMediaInput): Media {
  const id = `media_${randomUUID()}`;
  const filename = safeFilename(input.filename);
  const type = mediaTypeFromMime(input.mime);
  const exif = input.gps || input.capturedAt ? { gps: input.gps, ts: input.capturedAt } : undefined;
  return mediaSchema.parse({
    id,
    tenantId: input.tenantId,
    jobId: input.jobId,
    propertyId: input.propertyId,
    type,
    storageRef: `native://tenants/${input.tenantId}/media/${id}/${filename}`,
    thumbRef: type === "photo" ? `native://tenants/${input.tenantId}/media/${id}/thumb_${filename}.jpg` : undefined,
    exif,
    aiTags: input.tags,
    aiCaption: input.tags.length ? `Uploaded ${type} tagged ${input.tags.join(", ")}.` : undefined
  }) as Media;
}

export async function storeUploadedMediaBytes(input: {
  media: Media;
  filename: string;
  mime: string;
  fileBase64?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}): Promise<Media> {
  if (!input.fileBase64) {
    return input.media;
  }
  const bucket = getAdminStorageBucket(input.env);
  if (!bucket) {
    throw new RailError("Firebase Storage is not configured for media uploads.", { provider: "firebase", op: "mediaUpload", status: 503 });
  }
  const bytes = Buffer.from(input.fileBase64, "base64");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new RailError("That file is too large for Job Desk upload right now.", { provider: "native", op: "mediaUpload", status: 413 });
  }
  const filename = safeFilename(input.filename);
  const objectPath = `tenants/${input.media.tenantId}/media/${input.media.id}/${filename}`;
  await bucket.file(objectPath).save(bytes, {
    resumable: false,
    metadata: {
      contentType: input.mime,
      metadata: {
        tenantId: input.media.tenantId,
        mediaId: input.media.id
      }
    }
  });
  const storageRef = `gs://${bucket.name}/${objectPath}`;
  return mediaSchema.parse({
    ...input.media,
    storageRef,
    thumbRef: input.media.type === "photo" ? storageRef : input.media.thumbRef
  }) as Media;
}
