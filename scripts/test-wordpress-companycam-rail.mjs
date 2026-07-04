import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createCompanyCamRail } from "../src/features/missioncontrol/services/companyCamRailService.js";
import { buildBasicAuthHeader, fetchJson, wordpressJsonHeaders } from "../src/features/missioncontrol/services/wordpressApi.js";
import { createWordPressRail } from "../src/features/missioncontrol/services/wordpressRailService.js";

function loadLocalEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key]) {
      continue;
    }

    process.env[key] = value;
  }
}

async function deleteWordPressPost({ siteUrl, authHeader, postId }) {
  const response = await fetch(`${siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts/${postId}?force=true`, {
    method: "DELETE",
    headers: wordpressJsonHeaders(authHeader),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`WordPress delete failed ${response.status}: ${text}`);
  }

  return data;
}

loadLocalEnv();

const credentials = {
  siteUrl: process.env.WORDPRESS_BASE_URL,
  username: process.env.WORDPRESS_USERNAME,
  appPassword: process.env.WORDPRESS_APP_PASSWORD,
};
const siteUrl = String(credentials.siteUrl || "").replace(/\/$/, "");
const authHeader = buildBasicAuthHeader(credentials.username, credentials.appPassword);
const wordpressRail = createWordPressRail(credentials);
const companyCamRail = createCompanyCamRail();

const me = await fetchJson(`${siteUrl}/wp-json/wp/v2/users/me?context=edit`, {
  headers: wordpressJsonHeaders(authHeader),
});
const categories = await fetchJson(`${siteUrl}/wp-json/wp/v2/categories?per_page=1&hide_empty=false&context=edit&_=${Date.now()}`, {
  headers: wordpressJsonHeaders(authHeader),
});
const tags = await fetchJson(`${siteUrl}/wp-json/wp/v2/tags?per_page=1&hide_empty=false&context=edit&_=${Date.now()}`, {
  headers: wordpressJsonHeaders(authHeader),
});
const mediaItems = await fetchJson(`${siteUrl}/wp-json/wp/v2/media?author=${me.id}&per_page=1&context=edit&_=${Date.now()}`, {
  headers: wordpressJsonHeaders(authHeader),
});

const categoryIds = Array.isArray(categories) && categories[0] ? [categories[0].id] : [];
const tagIds = Array.isArray(tags) && tags[0] ? [tags[0].id] : [];
const mediaId = Array.isArray(mediaItems) && mediaItems[0] ? mediaItems[0].id : null;

const createdDraft = await wordpressRail.createDraft({
  title: `NexTeam Rail Probe ${Date.now()}`,
  contentHtml: [
    "<h1>Rail Probe H1</h1>",
    "<p>Draft created by the reusable WordPress rail test.</p>",
    "<h2>Rail Probe H2</h2>",
    "<p>Yoast and featured image verification follow.</p>",
    "<h3>Rail Probe H3</h3>",
  ].join(""),
  categories: categoryIds,
  tags: tagIds,
  excerpt: "Reusable WordPress rail probe draft.",
});

const yoastResult = await wordpressRail.setYoastFields(createdDraft.postId, {
  focusKeyword: "rail probe keyword",
  seoTitle: "Rail Probe SEO Title | NexTeam",
  metaDescription: "Rail probe SEO meta description.",
});

const uploadedMedia = await wordpressRail.uploadMedia({
  filename: `rail-proof-${Date.now()}.png`,
  mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn7nK0AAAAASUVORK5CYII=", "base64"),
  title: "Rail Proof Upload",
  altText: "Rail proof upload image",
  caption: "Temporary rail verification image",
  description: "Uploaded during the reusable WordPress rail proof script.",
});

const featuredImageResult = await wordpressRail.setFeaturedImage(createdDraft.postId, uploadedMedia.id);

const companyCamPhotos = await companyCamRail.listAllPhotos({ perPage: 3 });
const samplePhoto = companyCamPhotos[0] ? await companyCamRail.getPhoto(companyCamPhotos[0].id) : null;

const deletedDraft = await deleteWordPressPost({
  siteUrl,
  authHeader,
  postId: createdDraft.postId,
});

const deletedMedia = uploadedMedia?.id
  ? await fetch(`${siteUrl}/wp-json/wp/v2/media/${uploadedMedia.id}?force=true`, {
      method: "DELETE",
      headers: wordpressJsonHeaders(authHeader),
    }).then((response) => response.text().then((text) => ({ response, text })))
  : null;
const deletedMediaData = deletedMedia?.text ? JSON.parse(deletedMedia.text) : null;

console.log(
  JSON.stringify(
    {
      ok: true,
      wordpress: {
        createdDraft,
        yoastResult,
        uploadedMedia: {
          id: uploadedMedia.id,
          sourceUrl: uploadedMedia.source_url,
          altText: uploadedMedia.alt_text,
          title: uploadedMedia.title?.raw || uploadedMedia.title?.rendered || "",
        },
        featuredImageResult,
        deletedDraft: {
          postId: createdDraft.postId,
          deleted: deletedDraft?.deleted ?? false,
          previousStatus: deletedDraft?.previous?.status || "",
        },
        deletedMedia: {
          mediaId: uploadedMedia.id,
          status: deletedMedia?.response?.status ?? null,
          deleted: deletedMediaData?.deleted ?? false,
          previousType: deletedMediaData?.previous?.type || "",
        },
      },
      companyCam: {
        sampleCount: companyCamPhotos.length,
        samplePhotos: companyCamPhotos,
        samplePhoto,
      },
    },
    null,
    2
  )
);
