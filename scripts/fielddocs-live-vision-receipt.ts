import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CompanyCamAdapter } from "@nexteam/providers";
import { maybeRunVision } from "../apps/server/src/fielddocs/visionPipeline.js";

const receiptPath = process.argv[2] || "receipts/m4/live-vision-receipt.json";
const maxSpendUsd = Number(process.env.FIELD_DOCS_VISION_MAX_SPEND_USD || "5");
const maxImageBytes = Number(process.env.FIELD_DOCS_VISION_MAX_IMAGE_BYTES || String(4 * 1024 * 1024));
const tenantId = process.env.TENANT_ID || "aquatrace";

async function streamToBuffer(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Buffer | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const read = await reader.read();
    if (read.done) {
      break;
    }
    total += read.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(read.value);
  }
  return Buffer.concat(chunks);
}

const companyCam = CompanyCamAdapter.fromEnv(process.env, tenantId);
const projects = await companyCam.findProjects("");
let selected: {
  projectId: string;
  projectName: string;
  mediaId: string;
  mime: string;
  bytes: Buffer;
} | null = null;

for (const project of projects) {
  const media = await companyCam.getMedia(project);
  for (const item of media) {
    if (item.type !== "photo") {
      continue;
    }
    const binary = await companyCam.fetchBinary(item.id);
    const bytes = await streamToBuffer(binary.stream, maxImageBytes);
    if (!bytes) {
      continue;
    }
    selected = {
      projectId: project.id,
      projectName: project.name,
      mediaId: item.id,
      mime: binary.mime.startsWith("image/") ? binary.mime : "image/jpeg",
      bytes
    };
    break;
  }
  if (selected) {
    break;
  }
}

if (!selected) {
  throw new Error(`No CompanyCam photo under ${maxImageBytes} bytes was available for the live vision receipt.`);
}

const result = await maybeRunVision(
  {
    id: selected.mediaId,
    tenantId,
    jobId: selected.projectId,
    type: "photo",
    storageRef: `companycam:${selected.mediaId}`,
    aiTags: [],
    externalIds: { companycam: selected.mediaId }
  },
  { ...process.env, FIELD_DOCS_VISION_ENABLED: "true" },
  { mime: selected.mime, base64: selected.bytes.toString("base64") }
);

const estimatedCostUsd = result.estimatedCostUsd ?? 0;
if (estimatedCostUsd > maxSpendUsd) {
  throw new Error(`Vision receipt estimated cost ${estimatedCostUsd} exceeded approved cap ${maxSpendUsd}.`);
}

const receipt = {
  ok: result.enabled && Boolean(result.media.aiCaption),
  dryRun: false,
  destructiveWrites: false,
  outboundSent: false,
  tenantId,
  source: "companycam+anthropic",
  spendCapUsd: maxSpendUsd,
  estimatedCostUsd,
  sampledAt: new Date().toISOString(),
  companyCamPhoto: {
    projectId: selected.projectId,
    projectName: selected.projectName,
    mediaId: selected.mediaId,
    mime: selected.mime,
    byteLength: selected.bytes.byteLength,
    storageRef: `companycam:${selected.mediaId}`
  },
  vision: {
    enabled: result.enabled,
    reason: result.reason ?? "",
    aiCaption: result.media.aiCaption ?? "",
    aiTags: result.media.aiTags,
    usage: result.usage ?? null
  }
};

writeFileSync(resolve(receiptPath), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  ok: receipt.ok,
  receiptPath,
  estimatedCostUsd,
  aiCaptionPresent: Boolean(receipt.vision.aiCaption),
  aiTags: receipt.vision.aiTags
}, null, 2));
