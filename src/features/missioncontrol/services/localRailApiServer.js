import express from "express";
import { createServer } from "http";
import { createCompanyCamRail } from "./companyCamRailService.js";
import {
  answerCompanyCamReportQuestion,
  assertAquatraceCompanyCamTenantScope,
  formatCompanyCamReportAnswer,
} from "./companyCamQuestionService.js";
import { resolveCompanyCamProjectDetailQuestion } from "../../../server/companyCamProjectDetailLookupService.js";
import { createWordPressRail } from "./wordpressRailService.js";

export const LOCAL_RAIL_API_HOST = "127.0.0.1";
export const LOCAL_RAIL_API_DEFAULT_PORT = 3210;
export const LOCAL_RAIL_API_TOKEN_ENV = "RAIL_LOCAL_API_TOKEN";
export const LOCAL_RAIL_API_TOKEN_FALLBACK_ENV = "CLAWDIA_CODEX_BRIDGE_SHARED_SECRET";

function normalizeRailToken(value) {
  return String(value || "").trim();
}

function createHttpError(status, code, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  Object.assign(error, extra);
  return error;
}

function buildRailApiContext(options = {}) {
  const railToken =
    normalizeRailToken(options.token) ||
    normalizeRailToken(process.env[LOCAL_RAIL_API_TOKEN_ENV]) ||
    normalizeRailToken(process.env[LOCAL_RAIL_API_TOKEN_FALLBACK_ENV]);

  if (!railToken) {
    throw createHttpError(
      500,
      "LOCAL_RAIL_API_TOKEN_MISSING",
      `Set ${LOCAL_RAIL_API_TOKEN_ENV} before starting the local rail API server.`
    );
  }

  let wordpressRail = null;
  let wordpressRailError = null;
  try {
    wordpressRail = createWordPressRail(options.wordpressCredentials);
  } catch (error) {
    wordpressRailError = error;
  }

  return {
    host: LOCAL_RAIL_API_HOST,
    port: Number(options.port || process.env.RAIL_LOCAL_API_PORT || LOCAL_RAIL_API_DEFAULT_PORT),
    railToken,
    wordpressRail,
    wordpressRailError,
    companyCamRail: createCompanyCamRail(options.companyCamOptions),
  };
}

function readBearerToken(req) {
  const header = String(req.get("authorization") || "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return header.slice("bearer ".length).trim();
}

function parseIntegerParam(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw createHttpError(400, "INVALID_INTEGER", `${fieldName} must be a positive integer.`);
  }

  return parsed;
}

function parseCompanyCamTenantScope(value) {
  return assertAquatraceCompanyCamTenantScope(value);
}

function parseBase64Content(contentBase64) {
  const raw = String(contentBase64 || "").trim();
  if (!raw) {
    throw createHttpError(400, "MISSING_FILE_CONTENT", "contentBase64 is required.");
  }

  const normalized = raw.includes(",") && raw.startsWith("data:")
    ? raw.slice(raw.indexOf(",") + 1)
    : raw;

  let buffer = null;
  try {
    buffer = Buffer.from(normalized, "base64");
  } catch {
    throw createHttpError(400, "INVALID_FILE_CONTENT", "contentBase64 must be valid base64.");
  }

  if (!buffer?.length) {
    throw createHttpError(400, "INVALID_FILE_CONTENT", "contentBase64 decoded to an empty buffer.");
  }

  return buffer;
}

function requireWordPressRail(context) {
  if (context.wordpressRail) {
    return context.wordpressRail;
  }

  throw createHttpError(
    500,
    "WORDPRESS_RAIL_NOT_CONFIGURED",
    context.wordpressRailError?.message || "WordPress rail is not configured for this local rail server runtime."
  );
}

function sanitizeWordPressDraftResponse(result = {}) {
  return {
    postId: result.postId || null,
    url: result.postUrl || "",
    editUrl: result.editUrl || "",
    status: result.status || "",
    slug: result.slug || "",
    title: result.title || "",
    categories: Array.isArray(result.categories) ? result.categories : [],
    tags: Array.isArray(result.tags) ? result.tags : [],
    headingSummary: result.headingSummary || { h1: 0, h2: 0, h3: 0 },
  };
}

function sanitizeWordPressUploadResponse(result = {}) {
  return {
    mediaId: result.id || null,
    url: result.source_url || "",
    filename: result.filename || "",
    mimeType: result.mime_type || "",
    title: result.title?.raw || result.title?.rendered || "",
    altText: result.alt_text || "",
    caption: result.caption?.raw || "",
    description: result.description?.raw || "",
  };
}

function sendStructuredError(res, error) {
  const status = Number(error?.status || error?.upstreamStatus || 500);
  const payload = {
    ok: false,
    error: {
      code: error?.code || "LOCAL_RAIL_API_ERROR",
      message: error?.message || "Local rail API request failed.",
    },
  };

  if (error?.detail) {
    payload.error.detail = error.detail;
  }
  if (error?.upstreamStatus || error?.statusText) {
    payload.error.upstreamStatus = Number(error.upstreamStatus || error.status || 0) || undefined;
  }
  if (error?.upstreamBody || error?.responseText) {
    payload.error.upstreamBody = String(error.upstreamBody || error.responseText).slice(0, 4000);
  }
  if (error?.route) {
    payload.error.route = error.route;
  }

  return res.status(status).json(payload);
}

function wrapWordPressUploadError(error) {
  return createHttpError(
    Number(error?.status || 502) || 502,
    "WORDPRESS_MEDIA_UPLOAD_FAILED",
    "WordPress media upload failed.",
    {
      detail: error?.detail || error?.message || null,
      upstreamStatus: Number(error?.status || 0) || null,
      upstreamBody: error?.responseText || error?.detail || "",
      route: "/wp-json/wp/v2/media",
    }
  );
}

export function createLocalRailApiApp(options = {}) {
  const context = buildRailApiContext(options);
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "25mb" }));

  app.use("/rail", (req, res, next) => {
    const providedToken = readBearerToken(req);
    if (!providedToken || providedToken !== context.railToken) {
      return sendStructuredError(
        res,
        createHttpError(401, "LOCAL_RAIL_UNAUTHORIZED", "Missing or invalid local rail token.")
      );
    }

    return next();
  });

  app.get("/rail/health", (_req, res) => {
    return res.json({
      ok: true,
      result: {
        service: "local-rail-api",
        host: context.host,
        port: context.port,
        localhostOnly: true,
        capabilities: {
          wordpress: Boolean(context.wordpressRail),
          companyCam: true,
        },
      },
    });
  });

  app.post("/rail/wp/draft", async (req, res) => {
    try {
      const result = await requireWordPressRail(context).createDraft(req.body || {});
      return res.json({ ok: true, result: sanitizeWordPressDraftResponse(result) });
    } catch (error) {
      return sendStructuredError(res, error);
    }
  });

  app.post("/rail/wp/yoast", async (req, res) => {
    try {
      const body = req.body || {};
      const postId = parseIntegerParam(body.postId, "postId");
      const result = await requireWordPressRail(context).setYoastFields(postId, {
        focusKeyword: body.focusKeyword,
        seoTitle: body.seoTitle,
        metaDescription: body.metaDescription,
        socialTitle: body.socialTitle,
        socialDescription: body.socialDescription,
        socialImageUrl: body.socialImageUrl,
        twitterTitle: body.twitterTitle,
        twitterDescription: body.twitterDescription,
        twitterImageUrl: body.twitterImageUrl,
      });
      return res.json({ ok: true, result });
    } catch (error) {
      return sendStructuredError(res, error);
    }
  });

  app.post("/rail/wp/upload-media", async (req, res) => {
    try {
      const body = req.body || {};
      const result = await requireWordPressRail(context).uploadMedia({
        filename: String(body.filename || "").trim(),
        mimeType: String(body.mimeType || "").trim(),
        buffer: parseBase64Content(body.contentBase64),
        title: body.title,
        altText: body.altText,
        caption: body.caption,
        description: body.description,
      });
      return res.json({ ok: true, result: sanitizeWordPressUploadResponse(result) });
    } catch (error) {
      const wrapped = error?.route === "/wp-json/wp/v2/media" || String(error?.message || "").includes("Media upload failed")
        ? wrapWordPressUploadError(error)
        : error;
      return sendStructuredError(res, wrapped);
    }
  });

  app.post("/rail/wp/featured-image", async (req, res) => {
    try {
      const body = req.body || {};
      const postId = parseIntegerParam(body.postId, "postId");
      const mediaId = parseIntegerParam(body.mediaId, "mediaId");
      const result = await requireWordPressRail(context).setFeaturedImage(postId, mediaId);
      return res.json({ ok: true, result });
    } catch (error) {
      return sendStructuredError(res, error);
    }
  });

  app.get("/rail/companycam/photos", async (req, res) => {
    try {
      const tenantId = parseCompanyCamTenantScope(req.query.tenantId);
      const perPage = req.query.perPage ? parseIntegerParam(req.query.perPage, "perPage") : undefined;
      const photos = await context.companyCamRail.listAllPhotos({
        perPage,
        query: req.query.query,
        modifiedSince: req.query.modifiedSince,
      });
      return res.json({
        ok: true,
        result: {
          tenantId,
          count: photos.length,
          photos,
        },
      });
    } catch (error) {
      return sendStructuredError(res, error);
    }
  });

  app.get("/rail/companycam/photo/:id", async (req, res) => {
    try {
      const tenantId = parseCompanyCamTenantScope(req.query.tenantId);
      const photo = await context.companyCamRail.getPhoto(req.params.id);
      return res.json({ ok: true, result: { tenantId, photo } });
    } catch (error) {
      return sendStructuredError(res, error);
    }
  });

  app.get("/rail/companycam/projects/search", async (req, res) => {
    try {
      const tenantId = parseCompanyCamTenantScope(req.query.tenantId);
      const perPage = req.query.perPage ? parseIntegerParam(req.query.perPage, "perPage") : undefined;
      const projects = await context.companyCamRail.searchProjects({
        perPage,
        query: req.query.query,
        modifiedSince: req.query.modifiedSince,
      });
      return res.json({
        ok: true,
        result: {
          tenantId,
          count: projects.length,
          projects,
        },
      });
    } catch (error) {
      return sendStructuredError(res, error);
    }
  });

  app.get("/rail/companycam/projects/:projectId/documents", async (req, res) => {
    try {
      const tenantId = parseCompanyCamTenantScope(req.query.tenantId);
      const documents = await context.companyCamRail.listProjectDocuments(req.params.projectId);
      return res.json({
        ok: true,
        result: {
          tenantId,
          count: documents.length,
          documents,
        },
      });
    } catch (error) {
      return sendStructuredError(res, error);
    }
  });

  app.get("/rail/companycam/projects/:projectId/photos", async (req, res) => {
    try {
      const tenantId = parseCompanyCamTenantScope(req.query.tenantId);
      const perPage = req.query.perPage ? parseIntegerParam(req.query.perPage, "perPage") : undefined;
      const photos = await context.companyCamRail.listProjectPhotos(req.params.projectId, { perPage });
      return res.json({
        ok: true,
        result: {
          tenantId,
          count: photos.length,
          photos,
        },
      });
    } catch (error) {
      return sendStructuredError(res, error);
    }
  });

  app.post("/rail/companycam/report-question", async (req, res) => {
    try {
      const body = req.body || {};
      const tenantId = parseCompanyCamTenantScope(body.tenantId);
      const result = await answerCompanyCamReportQuestion({
        companyCamRail: context.companyCamRail,
        tenantId,
        question: body.question,
        projectQuery: body.projectQuery,
        projectId: body.projectId,
      });
      return res.json({
        ok: true,
        result: {
          ...result,
          answerText: formatCompanyCamReportAnswer(result),
        },
      });
    } catch (error) {
      return sendStructuredError(res, error);
    }
  });

  app.post("/rail/companycam/project-detail-question", async (req, res) => {
    try {
      const body = req.body || {};
      const tenantId = parseCompanyCamTenantScope(body.tenantId);
      const result = await resolveCompanyCamProjectDetailQuestion({
        companyCamRail: context.companyCamRail,
        tenantId,
        question: body.question,
        projectQuery: body.projectQuery,
        projectId: body.projectId,
      });
      return res.json({
        ok: true,
        result,
      });
    } catch (error) {
      return sendStructuredError(res, error);
    }
  });

  app.use((_req, res) =>
    sendStructuredError(res, createHttpError(404, "LOCAL_RAIL_NOT_FOUND", "Route not found."))
  );

  return { app, context };
}

export async function startLocalRailApiServer(options = {}) {
  const { app, context } = createLocalRailApiApp(options);
  const server = createServer(app);

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(context.port, context.host, () => resolve());
  });

  return {
    app,
    server,
    context,
    address: server.address(),
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}
