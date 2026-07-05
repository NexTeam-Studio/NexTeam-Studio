import { randomUUID } from "node:crypto";
import { mediaSchema, type Media } from "@nexteam/core";
import { z } from "zod";

export const uploadMediaInputSchema = z.object({
  tenantId: z.string().min(1),
  jobId: z.string().min(1).optional(),
  propertyId: z.string().min(1).optional(),
  filename: z.string().min(1),
  mime: z.string().min(1),
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

function safeFilename(filename: string): string {
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
