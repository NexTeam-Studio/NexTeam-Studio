import type { Source } from "../../../shared/contracts/nexi";

export function mediaUrl(source: Source): string {
  return `/api/media/${encodeURIComponent(source.ref)}`;
}

export function mediaDownloadUrl(source: Source): string {
  return `${mediaUrl(source)}?download=1`;
}

export function sourceIsPhoto(source: Source): boolean {
  return source.rail === "companycam" && source.label.toLowerCase().includes("photo");
}
