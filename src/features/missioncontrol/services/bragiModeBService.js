import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import {
  buildBragiModeBLinkPlan,
  getBragiModeBClientConfig,
  getBragiModeBTopicProfile,
  normalizeBragiModeBLocation,
} from "./bragiModeBClientConfig.js";
import { generateBragiModeBArticle } from "./bragiModeBArticleGenerator.js";
import { sendBragiModeBReviewEmail, buildBragiModeBReviewEmail } from "./bragiModeBEmailService.js";
import { selectBestCompanyCamPhoto, chooseBestPhotoAssetUrl, downloadCompanyCamPhotoAsset } from "./bragiModeBPhotoSelector.js";
import { createBragiModeBRailClient } from "./bragiModeBRailClient.js";

const STATE_PATH = join(process.cwd(), "runtime", "bragi-mode-b", "state", "latest-run.json");

function getBrandName(config) {
  return String(config?.displayName || config?.brandName || config?.profile?.brandName || "the client").trim();
}

function ensureParentDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function saveRunState(payload) {
  ensureParentDir(STATE_PATH);
  writeFileSync(STATE_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function buildCategoryNames({ config, topicProfile, location }) {
  return [...new Set([...(topicProfile.categoryNames || [])])];
}

function buildTagNames({ topicProfile, location }) {
  return [...new Set([...(topicProfile.tagNames || [])])];
}

function toBase64(buffer) {
  return Buffer.from(buffer).toString("base64");
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractH2Headings(contentHtml) {
  return [...String(contentHtml || "").matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter(Boolean);
}

function buildMediaFilename({ articlePackage, mimeType, suffix = "" }) {
  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const base = String(articlePackage.imageMeta?.filename || articlePackage.slug || "bragi-photo");
  const cleaned = slugify(suffix ? `${base} ${suffix}` : base);
  return cleaned.endsWith(`.${ext}`) ? cleaned : `${cleaned}.${ext}`;
}

function buildLinkUsageSummary(articlePackage, linkPlan) {
  const html = String(articlePackage.contentHtml || "");
  return linkPlan.internalLinks.filter((link) => html.includes(link.url));
}

function inferPhotoSubject({ photo, sectionHeading = "", topic = "", vision = null }) {
  const source = `${vision?.visibleSummary || ""} ${photo?.description || ""} ${sectionHeading} ${topic}`.toLowerCase();
  if (/\bvgb|drain\b/.test(source)) return "drain-cover-documentation";
  if (/\bunderwater|dive|scuba\b/.test(source)) return "underwater-inspection";
  if (/\bskimmer\b/.test(source)) return "skimmer-leak-check";
  if (/\blight\b/.test(source)) return "pool-light-inspection";
  if (/\bequipment|pump|pad|plumbing|pressure\b/.test(source)) return "equipment-pad-testing";
  if (/\bbucket|evaporation\b/.test(source)) return "evaporation-check";
  if (/\bexcavat|dig|trench|repair\b/.test(source)) return "excavation-repair-scene";
  if (/\bcommercial\b/.test(source)) return "commercial-pool-diagnostics";
  if (/\bline\b/.test(source)) return "exposed-plumbing-line";
  return "pool-leak-diagnostics";
}

function buildImageSeoMeta({ photo, articlePackage, location, topic, sectionHeading = "", role, index = 0, vision = null, config = null }) {
  const brandName = getBrandName(config);
  const subject = inferPhotoSubject({ photo, sectionHeading, topic, vision });
  const roleLabel = role === "featured" ? "featured" : `inline-${index + 1}`;
  const filenameBase = slugify([
    location.city,
    location.state,
    articlePackage.focusKeyword || topic,
    sectionHeading || subject,
    roleLabel,
  ].join(" "));
  const visibleSummary = String(vision?.visibleSummary || photo?.description || "").trim();
  const contextLabel = sectionHeading || articlePackage.title || topic;
  const title = String(vision?.title || "").trim() || (role === "featured"
    ? `${location.display} ${contextLabel}`
    : `${location.display} ${contextLabel} photo`);
  const altText = String(vision?.altText || "").trim()
    || (visibleSummary
      ? `${visibleSummary} during ${brandName} leak diagnostics`
      : `${location.display} ${contextLabel} photo showing ${subject.replace(/-/g, " ")}`);
  const caption = String(vision?.caption || "").trim()
    || visibleSummary
    || `${contextLabel} during ${brandName} leak diagnostics.`;
  const description = String(vision?.description || "").trim()
    || `${caption} Selected for a ${brandName} article about ${topic}.`;

  return {
    filename: filenameBase || `${slugify(location.display)}-${roleLabel}`,
    title,
    altText,
    caption,
    description,
    subject,
    sectionHeading,
  };
}

function buildInlineFigureHtml({ media }) {
  const captionHtml = media.caption
    ? `\n  <figcaption>${escapeHtml(media.caption)}</figcaption>`
    : "";
  const titleAttribute = media.title ? ` title="${escapeHtml(media.title)}"` : "";

  return [
    `<figure class="wp-block-image size-large bragi-inline-image">`,
    `  <img src="${escapeHtml(media.url)}" alt="${escapeHtml(media.altText)}"${titleAttribute} loading="lazy" decoding="async" />${captionHtml}`,
    `</figure>`,
  ].join("\n");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function injectInlineImagesIntoArticle({ contentHtml, inlineMedia }) {
  const html = String(contentHtml || "");
  if (!html.trim() || !Array.isArray(inlineMedia) || !inlineMedia.length) {
    return html;
  }

  const sections = [...html.matchAll(/<h2\b[^>]*>[\s\S]*?(?=(<h2\b)|$)/gi)].map((match) => match[0]);
  if (!sections.length) {
    return html;
  }

  const intro = html.slice(0, html.indexOf(sections[0]));
  const byHeading = new Map(inlineMedia.map((item) => [item.sectionHeading, item]));
  const rebuiltSections = sections.map((section) => {
    const heading = stripHtml(section.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || "");
    const media = byHeading.get(heading);
    if (!media) {
      return section;
    }

    const figureHtml = buildInlineFigureHtml({ media });
    const firstParagraphMatch = section.match(/<\/p>/i);
    if (firstParagraphMatch?.index != null) {
      const insertAt = firstParagraphMatch.index + firstParagraphMatch[0].length;
      return `${section.slice(0, insertAt)}\n${figureHtml}\n${section.slice(insertAt)}`;
    }

    const headingCloseIndex = section.search(/<\/h2>/i);
    if (headingCloseIndex >= 0) {
      const insertAt = headingCloseIndex + 5;
      return `${section.slice(0, insertAt)}\n${figureHtml}\n${section.slice(insertAt)}`;
    }

    return `${section}\n${figureHtml}`;
  });

  return `${intro}${rebuiltSections.join("")}`.trim();
}

export async function runBragiModeB({ topic, location: locationInput, clientId = "aquatrace" }) {
  const config = getBragiModeBClientConfig(clientId);
  const location = normalizeBragiModeBLocation(locationInput, config);
  const topicProfile = getBragiModeBTopicProfile(topic, config);
  const linkPlan = buildBragiModeBLinkPlan({ topic, location, config });
  const rail = createBragiModeBRailClient();
  const run = {
    ok: false,
    topic,
    location: location.display,
    clientId,
    startedAt: new Date().toISOString(),
  };

  try {
    const generation = await generateBragiModeBArticle({
      topic,
      location,
      config,
      linkPlan,
      topicProfile,
      clientId,
    });
    const articlePackage = {
      ...generation.articlePackage,
      categoryNames: generation.articlePackage.categoryNames?.length
        ? generation.articlePackage.categoryNames
        : buildCategoryNames({ config, topicProfile, location }),
      tagNames: generation.articlePackage.tagNames?.length
        ? generation.articlePackage.tagNames
        : buildTagNames({ topicProfile, location }),
    };

    const categoryIds = await rail.resolveTermIdsByName("categories", articlePackage.categoryNames);
    const tagIds = await rail.resolveTermIdsByName("tags", articlePackage.tagNames);

    const photoListResult = await rail.listPhotos({ perPage: 100 });
    const photoSelection = await selectBestCompanyCamPhoto({
      photos: photoListResult.photos,
      topic,
      articlePackage,
      location,
      config,
      clientId,
    });
    if (!photoSelection.selected?.photo?.id) {
      throw new Error("No CompanyCam photo candidates were available.");
    }

    const featuredPhotoRecord = await rail.getPhoto(photoSelection.selected.photo.id);
    const featuredPhotoAssetUrl = chooseBestPhotoAssetUrl(featuredPhotoRecord.photo);
    const featuredDownloadedPhoto = await downloadCompanyCamPhotoAsset(featuredPhotoAssetUrl);
    const featuredMeta = {
      ...buildImageSeoMeta({
        photo: featuredPhotoRecord.photo,
        articlePackage,
        location,
        topic,
        sectionHeading: articlePackage.title,
        role: "featured",
        vision: photoSelection.selected?.vision || null,
        config,
      }),
      title: articlePackage.imageMeta?.title || articlePackage.title,
      altText: articlePackage.imageMeta?.altText || `${location.display} pool leak detection photo`,
      caption: articlePackage.imageMeta?.caption || photoSelection.selected?.vision?.caption || "",
      description: articlePackage.imageMeta?.description || photoSelection.selected?.vision?.description || "",
    };

    const featuredUploadResult = await rail.uploadMedia({
      filename: buildMediaFilename({ articlePackage, mimeType: featuredDownloadedPhoto.mimeType, suffix: featuredMeta.subject }),
      mimeType: featuredDownloadedPhoto.mimeType,
      contentBase64: toBase64(featuredDownloadedPhoto.buffer),
      title: featuredMeta.title,
      altText: featuredMeta.altText,
      caption: featuredMeta.caption,
      description: featuredMeta.description,
    });

    const inlineUploads = [];
    for (let index = 0; index < photoSelection.inlineSelections.length; index += 1) {
      const selection = photoSelection.inlineSelections[index];
      const photoRecord = await rail.getPhoto(selection.photo.id);
      const photoAssetUrl = chooseBestPhotoAssetUrl(photoRecord.photo);
      const downloadedPhoto = await downloadCompanyCamPhotoAsset(photoAssetUrl);
      const imageMeta = buildImageSeoMeta({
        photo: photoRecord.photo,
        articlePackage,
        location,
        topic,
        sectionHeading: selection.placementHeading,
        role: "inline",
        index,
        vision: selection.vision || null,
        config,
      });
      const uploadResult = await rail.uploadMedia({
        filename: buildMediaFilename({
          articlePackage,
          mimeType: downloadedPhoto.mimeType,
          suffix: `${imageMeta.subject}-${index + 1}`,
        }),
        mimeType: downloadedPhoto.mimeType,
        contentBase64: toBase64(downloadedPhoto.buffer),
        title: imageMeta.title,
        altText: imageMeta.altText,
        caption: imageMeta.caption,
        description: imageMeta.description,
      });
      inlineUploads.push({
        ...imageMeta,
        mediaId: uploadResult.mediaId,
        url: uploadResult.url,
        placementHeading: selection.placementHeading,
        placementIndex: selection.placementIndex,
        companyCamPhotoId: selection.photo.id,
        uploadResult,
      });
    }

    const articleHtmlWithInlineImages = injectInlineImagesIntoArticle({
      contentHtml: articlePackage.contentHtml,
      inlineMedia: inlineUploads,
    });

    const draftResult = await rail.createDraft({
      title: articlePackage.title,
      contentHtml: articleHtmlWithInlineImages,
      categories: categoryIds,
      tags: tagIds,
      slug: articlePackage.slug,
      excerpt: articlePackage.excerpt,
      commentStatus: "closed",
      pingStatus: "closed",
    });

    const featuredImageResult = await rail.setFeaturedImage({
      postId: draftResult.postId,
      mediaId: featuredUploadResult.mediaId,
    });

    const yoastResult = await rail.setYoast({
      postId: draftResult.postId,
      focusKeyword: articlePackage.focusKeyword,
      seoTitle: articlePackage.seoTitle,
      metaDescription: articlePackage.metaDescription,
      socialTitle: articlePackage.socialTitle,
      socialDescription: articlePackage.socialDescription,
      socialImageUrl: featuredUploadResult.url,
      twitterTitle: articlePackage.socialTitle,
      twitterDescription: articlePackage.socialDescription,
      twitterImageUrl: featuredUploadResult.url,
    });

    const enrichedPhotoSelection = {
      ...photoSelection,
      chosenPhoto: featuredPhotoRecord,
      assetUrl: featuredPhotoAssetUrl,
      uploadResult: featuredUploadResult,
      featuredImageResult,
      featuredMeta,
      inlineUploads,
    };

    const emailDraft = buildBragiModeBReviewEmail({
      topic,
      location,
      articlePackage: {
        ...articlePackage,
        contentHtml: articleHtmlWithInlineImages,
      },
      draftResult,
      config,
      photoSelection: enrichedPhotoSelection,
      linkPlan,
    });
    const emailResult = await sendBragiModeBReviewEmail(emailDraft);

    const result = {
      ok: true,
      topic,
      location: location.display,
      topicProfile: topicProfile.key,
      articlePackage: {
        ...articlePackage,
        contentHtml: articleHtmlWithInlineImages,
      },
      draft: {
        ...draftResult,
        categoriesResolved: categoryIds,
        tagsResolved: tagIds,
        published: false,
        scheduled: false,
      },
      photoSelection: {
        ...enrichedPhotoSelection,
      },
      yoastResult,
      email: {
        ...emailDraft,
        ...emailResult,
      },
      linksUsed: buildLinkUsageSummary(articlePackage, linkPlan),
      finishedAt: new Date().toISOString(),
    };

    saveRunState(result);
    return result;
  } catch (error) {
    run.error = {
      message: error?.message || String(error),
      validation: error?.validation || null,
      articlePackage: error?.articlePackage || null,
      data: error?.data || null,
    };
    run.finishedAt = new Date().toISOString();
    saveRunState(run);
    throw error;
  }
}

export const bragiModeBServiceInternals = {
  buildImageSeoMeta,
  buildInlineFigureHtml,
  buildMediaFilename,
  extractH2Headings,
  injectInlineImagesIntoArticle,
};
