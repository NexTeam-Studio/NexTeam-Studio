import { existsSync, readFileSync } from "node:fs";
import crypto from "node:crypto";
import { join } from "node:path";
import {
  LOCAL_RAIL_API_HOST,
  startLocalRailApiServer,
} from "../src/features/missioncontrol/services/localRailApiServer.js";
import { buildBasicAuthHeader, wordpressJsonHeaders } from "../src/features/missioncontrol/services/wordpressApi.js";

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

async function parseJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

loadLocalEnv();
process.env.RAIL_LOCAL_API_TOKEN = process.env.RAIL_LOCAL_API_TOKEN || "local-rail-api-test-token";

const requestedPort = Number(process.env.RAIL_LOCAL_API_PORT || 3200 + crypto.randomInt(20, 200));

const started = await startLocalRailApiServer({
  port: requestedPort,
});

const baseUrl = `http://${LOCAL_RAIL_API_HOST}:${started.address.port}`;
const tokenHeaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.RAIL_LOCAL_API_TOKEN}`,
};
const siteUrl = String(process.env.WORDPRESS_BASE_URL || "").replace(/\/$/, "");
const authHeader = buildBasicAuthHeader(process.env.WORDPRESS_USERNAME, process.env.WORDPRESS_APP_PASSWORD);

let draftId = null;
let mediaId = null;

try {
  const unauthorized = await fetch(`${baseUrl}/rail/companycam/photos?perPage=1`);
  const unauthorizedJson = await parseJson(unauthorized);

  const categories = await fetch(`${siteUrl}/wp-json/wp/v2/categories?per_page=1&hide_empty=false&context=edit&_=${Date.now()}`, {
    headers: wordpressJsonHeaders(authHeader),
  }).then(parseJson);
  const tags = await fetch(`${siteUrl}/wp-json/wp/v2/tags?per_page=1&hide_empty=false&context=edit&_=${Date.now()}`, {
    headers: wordpressJsonHeaders(authHeader),
  }).then(parseJson);

  const draftResponse = await fetch(`${baseUrl}/rail/wp/draft`, {
    method: "POST",
    headers: tokenHeaders,
    body: JSON.stringify({
      title: `Local Rail API Probe ${Date.now()}`,
      contentHtml: "<h1>Local Rail API Probe</h1><p>Testing the localhost seam.</p><h2>Proof</h2>",
      categories: Array.isArray(categories) && categories[0] ? [categories[0].id] : [],
      tags: Array.isArray(tags) && tags[0] ? [tags[0].id] : [],
      excerpt: "Temporary draft for local rail API verification.",
    }),
  });
  const draftJson = await parseJson(draftResponse);
  draftId = draftJson?.result?.postId || null;

  const uploadResponse = await fetch(`${baseUrl}/rail/wp/upload-media`, {
    method: "POST",
    headers: tokenHeaders,
    body: JSON.stringify({
      filename: `local-rail-api-${Date.now()}.png`,
      mimeType: "image/png",
      contentBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn7nK0AAAAASUVORK5CYII=",
      title: "Local Rail API Upload",
      altText: "Local rail API upload image",
      caption: "Temporary upload via the localhost rail API",
      description: "Used to verify the localhost-only rail seam.",
    }),
  });
  const uploadJson = await parseJson(uploadResponse);
  mediaId = uploadJson?.result?.mediaId || null;

  const featuredResponse = await fetch(`${baseUrl}/rail/wp/featured-image`, {
    method: "POST",
    headers: tokenHeaders,
    body: JSON.stringify({
      postId: draftId,
      mediaId,
    }),
  });
  const featuredJson = await parseJson(featuredResponse);

  const yoastResponse = await fetch(`${baseUrl}/rail/wp/yoast`, {
    method: "POST",
    headers: tokenHeaders,
    body: JSON.stringify({
      postId: draftId,
      focusKeyword: "local rail api keyword",
      seoTitle: "Local Rail API SEO Title",
      metaDescription: "Local rail API SEO description.",
    }),
  });
  const yoastJson = await parseJson(yoastResponse);

  const photosResponse = await fetch(`${baseUrl}/rail/companycam/photos?perPage=2`, {
    headers: {
      Authorization: `Bearer ${process.env.RAIL_LOCAL_API_TOKEN}`,
    },
  });
  const photosJson = await parseJson(photosResponse);
  const samplePhotoId = photosJson?.result?.photos?.[0]?.id || null;

  const photoResponse = await fetch(`${baseUrl}/rail/companycam/photo/${samplePhotoId}`, {
    headers: {
      Authorization: `Bearer ${process.env.RAIL_LOCAL_API_TOKEN}`,
    },
  });
  const photoJson = await parseJson(photoResponse);

  const projectsResponse = await fetch(
    `${baseUrl}/rail/companycam/projects/search?tenantId=aquatrace&query=${encodeURIComponent("Camp Mikell")}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.RAIL_LOCAL_API_TOKEN}`,
      },
    }
  );
  const projectsJson = await parseJson(projectsResponse);
  const campMikellProjectId = projectsJson?.result?.projects?.[0]?.id || null;

  const reportQuestionResponse = await fetch(`${baseUrl}/rail/companycam/report-question`, {
    method: "POST",
    headers: tokenHeaders,
    body: JSON.stringify({
      tenantId: "aquatrace",
      question: "What are the total pool gallons in the report for Camp Mikell in Toccoa GA?",
      projectId: campMikellProjectId,
    }),
  });
  const reportQuestionJson = await parseJson(reportQuestionResponse);

  console.log(
    JSON.stringify(
      {
        ok: true,
        binding: {
          requestedHost: LOCAL_RAIL_API_HOST,
          actualAddress: started.address.address,
          actualPort: started.address.port,
          localhostOnly: started.address.address === LOCAL_RAIL_API_HOST,
        },
        auth: {
          unauthorizedStatus: unauthorized.status,
          unauthorizedCode: unauthorizedJson?.error?.code || null,
        },
        routes: {
          draft: {
            status: draftResponse.status,
            result: draftJson.result,
          },
          uploadMedia: {
            status: uploadResponse.status,
            result: uploadJson.result,
          },
          featuredImage: {
            status: featuredResponse.status,
            result: featuredJson.result,
          },
          yoast: {
            status: yoastResponse.status,
            result: yoastJson.result,
          },
          companyCamPhotos: {
            status: photosResponse.status,
            count: photosJson?.result?.count || 0,
            samplePhoto: photosJson?.result?.photos?.[0] || null,
          },
          companyCamPhoto: {
            status: photoResponse.status,
            result: photoJson?.result?.photo || null,
          },
          companyCamProjects: {
            status: projectsResponse.status,
            count: projectsJson?.result?.count || 0,
            sampleProject: projectsJson?.result?.projects?.[0] || null,
          },
          companyCamReportQuestion: {
            status: reportQuestionResponse.status,
            result: reportQuestionJson?.result || null,
          },
        },
      },
      null,
      2
    )
  );
} finally {
  if (draftId) {
    await fetch(`${siteUrl}/wp-json/wp/v2/posts/${draftId}?force=true`, {
      method: "DELETE",
      headers: wordpressJsonHeaders(authHeader),
    }).catch(() => {});
  }

  if (mediaId) {
    await fetch(`${siteUrl}/wp-json/wp/v2/media/${mediaId}?force=true`, {
      method: "DELETE",
      headers: wordpressJsonHeaders(authHeader),
    }).catch(() => {});
  }

  await started.close();
}
