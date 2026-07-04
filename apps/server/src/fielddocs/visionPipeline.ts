import type { Media } from "@nexteam/core";

export interface VisionPipelineResult {
  enabled: boolean;
  media: Media;
  reason?: string;
}

export function visionPipelineEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FIELD_DOCS_VISION_ENABLED === "true";
}

export async function maybeRunVision(media: Media, env: NodeJS.ProcessEnv = process.env): Promise<VisionPipelineResult> {
  if (!visionPipelineEnabled(env)) {
    return { enabled: false, media, reason: "FIELD_DOCS_VISION_ENABLED is not true." };
  }
  return {
    enabled: true,
    media: {
      ...media,
      aiTags: media.aiTags.length > 0 ? media.aiTags : ["vision_stub_pending"],
      aiCaption: media.aiCaption ?? "Vision pipeline stub: live image analysis is not enabled in M4 read-side skeleton."
    }
  };
}
