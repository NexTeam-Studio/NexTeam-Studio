import type { TenantBranding } from "@nexteam/core";
import type { ContentDraft, ContentShowcase, ContentSettings } from "./contentEngine.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function brandingLogoHref(branding: TenantBranding | null, tenantId: string): string | null {
  if (branding?.logo?.url) {
    return branding.logo.url;
  }
  if (branding?.logo?.mediaId) {
    return `/api/media/${encodeURIComponent(branding.logo.mediaId)}?tenantId=${encodeURIComponent(tenantId)}`;
  }
  return null;
}

function reviewStars(rating: number): string {
  return "&#9733;".repeat(rating) + "&#9734;".repeat(Math.max(0, 5 - rating));
}

function showcaseMedia(showcase: ContentShowcase, tenantId: string, watermarkLabel: string): string {
  if (!showcase.mediaRefs.length) {
    return `<div class="nexreach-image-empty">No approved media attached yet.</div>`;
  }
  return showcase.mediaRefs.map((mediaId) => `
    <figure class="nexreach-image-frame">
      <img alt="${escapeHtml(showcase.title)}" src="/api/media/${encodeURIComponent(mediaId)}?tenantId=${encodeURIComponent(tenantId)}" />
      <figcaption>${escapeHtml(watermarkLabel)}</figcaption>
    </figure>
  `).join("");
}

export function renderPortfolioHtml(input: {
  tenantId: string;
  tenantName: string;
  branding: TenantBranding | null;
  settings: ContentSettings;
  showcases: ContentShowcase[];
  reviews: Array<{ id: string; authorName: string; rating: number; comment: string; reviewedAt: string }>;
}): string {
  const logoHref = brandingLogoHref(input.branding, input.tenantId);
  const accent = input.branding?.colors.accent ?? "#6dfc2f";
  const ink = input.branding?.colors.text ?? "#11201c";
  const surface = input.branding?.colors.surface ?? "#f8fff7";
  const background = input.branding?.colors.background ?? "#edf6ef";
  const muted = input.branding?.colors.mutedText ?? "#4f6660";
  const watermark = `${input.tenantName} | NexCam`;
  const lede = [input.settings.serviceAreaLine, input.settings.licenseLine]
    .filter((value) => value.trim().length > 0)
    .join(" ");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.tenantName)} portfolio preview</title>
    <style>
      :root {
        --accent: ${accent};
        --ink: ${ink};
        --surface: ${surface};
        --background: ${background};
        --muted: ${muted};
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Montserrat, "Segoe UI", sans-serif;
        background: linear-gradient(180deg, rgba(109,252,47,0.08), transparent 22%), var(--background);
        color: var(--ink);
      }
      main {
        width: min(1040px, calc(100% - 32px));
        margin: 0 auto;
        padding: 24px 0 72px;
      }
      header {
        display: grid;
        gap: 16px;
        padding: 18px 20px;
        border: 1px solid rgba(17,32,28,0.08);
        border-radius: 28px;
        background: rgba(255,255,255,0.82);
        backdrop-filter: blur(18px);
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .brand img {
        width: 56px;
        height: 56px;
        object-fit: contain;
        border-radius: 18px;
        background: rgba(255,255,255,0.92);
        padding: 8px;
      }
      .eyebrow {
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.24em;
        font-size: 0.72rem;
        color: #05b8d6;
      }
      h1, h2, h3, p { margin: 0; }
      h1 { font-size: clamp(2rem, 5vw, 3.3rem); line-height: 0.95; }
      .lede {
        color: var(--muted);
        max-width: 62ch;
        line-height: 1.55;
      }
      section {
        margin-top: 24px;
        display: grid;
        gap: 16px;
      }
      .grid {
        display: grid;
        gap: 16px;
      }
      .showcase-card, .review-card, .empty-card {
        border: 1px solid rgba(17,32,28,0.08);
        border-radius: 24px;
        background: rgba(255,255,255,0.88);
        padding: 18px;
        display: grid;
        gap: 14px;
      }
      .showcase-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        color: var(--muted);
        font-size: 0.94rem;
      }
      .media-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }
      .nexreach-image-frame {
        position: relative;
        overflow: hidden;
        border-radius: 22px;
        background: #d7e5dc;
        min-height: 180px;
      }
      .nexreach-image-frame img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .nexreach-image-frame figcaption {
        position: absolute;
        left: 12px;
        bottom: 12px;
        padding: 7px 10px;
        border-radius: 999px;
        background: rgba(17,32,28,0.76);
        color: white;
        font-size: 0.72rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .review-grid {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      .stars { color: #db8b00; font-weight: 700; }
      .empty-card { color: var(--muted); }
      @media (max-width: 720px) {
        main { width: min(100% - 20px, 1040px); padding-top: 16px; }
        header, .showcase-card, .review-card, .empty-card { border-radius: 20px; padding: 16px; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div class="brand">
          ${logoHref ? `<img alt="${escapeHtml(input.branding?.logo?.alt ?? `${input.tenantName} logo`)}" src="${escapeHtml(logoHref)}" />` : ""}
          <div>
            <p class="eyebrow">Nexportal preview</p>
            <h1>${escapeHtml(input.tenantName)}</h1>
          </div>
        </div>
        <p class="lede">${escapeHtml(lede)}</p>
      </header>
      <section>
        <div>
          <p class="eyebrow">Showcases</p>
          <h2>Owner-approved proof of work</h2>
        </div>
        <div class="grid">
          ${input.showcases.length ? input.showcases.map((showcase) => `
            <article class="showcase-card">
              <div>
                <p class="eyebrow">${escapeHtml(showcase.serviceType)}</p>
                <h3>${escapeHtml(showcase.title)}</h3>
              </div>
              <div class="showcase-meta">
                <span>${escapeHtml(showcase.locality)}</span>
                <span>${new Date(showcase.createdAt).toLocaleDateString()}</span>
              </div>
              <p>${escapeHtml(showcase.writeUp)}</p>
              <div class="media-grid">
                ${showcaseMedia(showcase, input.tenantId, watermark)}
              </div>
            </article>
          `).join("") : `<article class="empty-card">No showcase previews are ready yet.</article>`}
        </div>
      </section>
      <section>
        <div>
          <p class="eyebrow">Reviews</p>
          <h2>Selected customer notes</h2>
        </div>
        <div class="review-grid">
          ${input.reviews.length ? input.reviews.map((review) => `
            <article class="review-card">
              <div class="stars">${reviewStars(review.rating)}</div>
              <p>${escapeHtml(review.comment || "No public comment supplied.")}</p>
              <div class="showcase-meta">
                <span>${escapeHtml(review.authorName)}</span>
                <span>${new Date(review.reviewedAt).toLocaleDateString()}</span>
              </div>
            </article>
          `).join("") : `<article class="empty-card">No approved review highlights are selected yet.</article>`}
        </div>
      </section>
    </main>
  </body>
</html>`;
}

export function renderDraftBundleHtml(input: {
  tenantId: string;
  tenantName: string;
  branding: TenantBranding | null;
  draft: ContentDraft;
  manifestText: string;
  bundleImageBasePath?: string | undefined;
}): string {
  const logoHref = brandingLogoHref(input.branding, input.tenantId);
  const watermark = escapeHtml(input.draft.watermarkLabel ?? `${input.tenantName} | NexCam`);
  const imageBasePath = (input.bundleImageBasePath ?? `/api/nexreach/drafts/${encodeURIComponent(input.draft.id)}/media`).replace(/\/$/, "");
  const mediaMarkup = input.draft.mediaRefs.length
    ? input.draft.mediaRefs.map((mediaId) => `
      <figure class="bundle-image">
        <img alt="${escapeHtml(input.draft.title)}" src="${escapeHtml(imageBasePath)}/${encodeURIComponent(mediaId)}.svg?tenantId=${encodeURIComponent(input.tenantId)}" />
        <figcaption>${watermark}</figcaption>
      </figure>
    `).join("")
    : `<p class="empty">No media attached to this draft yet.</p>`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.draft.title)} bundle</title>
    <style>
      body {
        margin: 0;
        font-family: Montserrat, "Segoe UI", sans-serif;
        background: #edf6ef;
        color: #11201c;
      }
      main {
        width: min(1000px, calc(100% - 32px));
        margin: 0 auto;
        padding: 24px 0 64px;
        display: grid;
        gap: 18px;
      }
      .card {
        border-radius: 24px;
        background: rgba(255,255,255,0.9);
        border: 1px solid rgba(17,32,28,0.08);
        padding: 18px;
      }
      .brand {
        display: flex;
        gap: 12px;
        align-items: center;
      }
      .brand img {
        width: 52px;
        height: 52px;
        object-fit: contain;
        border-radius: 16px;
        background: white;
        padding: 8px;
      }
      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.22em;
        color: #05b8d6;
        font-size: 0.72rem;
        margin: 0 0 8px;
      }
      h1, h2, p, pre { margin: 0; }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        color: #4f6660;
      }
      .bundle-grid {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      .bundle-image {
        position: relative;
        overflow: hidden;
        margin: 0;
        min-height: 220px;
        border-radius: 20px;
        background: #d7e5dc;
      }
      .bundle-image img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .bundle-image figcaption {
        position: absolute;
        left: 12px;
        bottom: 12px;
        background: rgba(17,32,28,0.76);
        color: white;
        border-radius: 999px;
        padding: 7px 10px;
        font-size: 0.72rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      pre {
        white-space: pre-wrap;
        line-height: 1.55;
      }
      .empty { color: #4f6660; }
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <div class="brand">
          ${logoHref ? `<img alt="${escapeHtml(input.tenantName)} logo" src="${escapeHtml(logoHref)}" />` : ""}
          <div>
            <p class="eyebrow">Nexreach export bundle</p>
            <h1>${escapeHtml(input.draft.title)}</h1>
          </div>
        </div>
        <div class="meta">
          <span>${escapeHtml(input.draft.kind.replaceAll("_", " "))}</span>
          <span>${escapeHtml(input.draft.locality ?? "Local service area")}</span>
          <span>${escapeHtml(input.draft.serviceType ?? "Pool leak detection")}</span>
        </div>
      </section>
      <section class="card">
        <p class="eyebrow">Copy</p>
        <pre>${escapeHtml(input.manifestText)}</pre>
      </section>
      <section class="card">
        <p class="eyebrow">Watermarked media</p>
        <div class="bundle-grid">
          ${mediaMarkup}
        </div>
      </section>
    </main>
  </body>
</html>`;
}
