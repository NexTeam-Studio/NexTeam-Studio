import { mkdirSync } from "fs";
import { join } from "path";
import { buildBasicAuthHeader, createWordPressPost, updateWordPressPost } from "./wordpressApi.js";
import { writeYoastFieldsInEditor } from "./wordpressYoastEditor.js";

const DEFAULT_SITE_URL = "https://aquatraceleak.com";
const DEFAULT_LOGIN_URL = `${DEFAULT_SITE_URL}/wp-login.php`;
const DEFAULT_ADMIN_BASE = `${DEFAULT_SITE_URL}/wp-admin`;

function isWordpressEditPermissionError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("rest_cannot_edit") ||
    message.includes("not allowed to edit this post") ||
    message.includes("sorry, you are not allowed to edit this post")
  );
}

export async function executeBragiWordpressDraft({
  postId,
  title,
  content,
  slug,
  excerpt,
  author,
  categories,
  featuredMedia,
  commentStatus = "closed",
  pingStatus = "closed",
  yoast,
  credentials,
  screenshotDir,
}) {
  if (!credentials?.apiUsername || !credentials?.apiPassword) {
    throw new Error("WordPress API credentials are required.");
  }
  const hasEditorCredentials = Boolean(credentials?.editorUsername && credentials?.editorPassword);

  const siteUrl = credentials.siteUrl || DEFAULT_SITE_URL;
  const authHeader = buildBasicAuthHeader(credentials.apiUsername, credentials.apiPassword);

  const postUpdate = {};
  if (title) postUpdate.title = title;
  if (content) postUpdate.content = content;
  if (slug) postUpdate.slug = slug;
  if (excerpt) postUpdate.excerpt = excerpt;
  if (Number.isFinite(Number(author))) postUpdate.author = Number(author);
  if (Array.isArray(categories) && categories.length) {
    postUpdate.categories = categories.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  }
  if (Number.isFinite(Number(featuredMedia))) {
    postUpdate.featured_media = Number(featuredMedia);
  }
  postUpdate.status = "draft";
  postUpdate.comment_status = commentStatus;
  postUpdate.ping_status = pingStatus;

  let updatedPost = null;
  let fallback = {
    usedReplacementDraft: false,
    blockedEditPostId: Number.isFinite(Number(postId)) ? Number(postId) : null,
    reason: "",
  };

  if (postId) {
    try {
      updatedPost = await updateWordPressPost({
        siteUrl,
        authHeader,
        postId,
        fields: postUpdate,
      });
    } catch (error) {
      if (!isWordpressEditPermissionError(error)) {
        throw error;
      }

      updatedPost = await createWordPressPost({
        siteUrl,
        authHeader,
        fields: postUpdate,
      });
      fallback = {
        usedReplacementDraft: true,
        blockedEditPostId: Number(postId),
        reason: String(error?.message || "rest_cannot_edit"),
      };
    }
  } else {
    updatedPost = await createWordPressPost({
      siteUrl,
      authHeader,
      fields: postUpdate,
    });
  }

  const resolvedPostId = updatedPost?.id || postId;
  if (!resolvedPostId) {
    throw new Error("WordPress draft creation did not return a post ID.");
  }

  const proofDir = screenshotDir || join(process.cwd(), "tmp-proof");
  mkdirSync(proofDir, { recursive: true });

  let yoastResult = {
    editUrl: `${siteUrl}/wp-admin/post.php?post=${resolvedPostId}&action=edit`,
    stored: {
      focusKeyphrase: yoast?.focusKeyphrase || null,
      seoTitle: yoast?.seoTitle || null,
      metaDescription: yoast?.metaDescription || null,
      socialTitle: yoast?.socialTitle || null,
      socialDescription: yoast?.socialDescription || null,
      editorVisible: {
        focusKeyphrase: false,
        seoTitle: false,
        metaDescription: false,
        socialTitle: false,
        socialDescription: false,
      },
      skipped: true,
      reason: !yoast
        ? "Yoast payload not provided. Draft created through the WordPress REST API only."
        : !hasEditorCredentials
          ? "WordPress editor credentials were unavailable. Draft created through the WordPress REST API only."
          : "",
    },
    proof: {},
  };

  if (yoast && hasEditorCredentials) {
    try {
      yoastResult = await writeYoastFieldsInEditor({
        loginUrl: `${siteUrl}/wp-login.php`,
        editUrl: `${siteUrl}/wp-admin/post.php?post=${resolvedPostId}&action=edit`,
        username: credentials.editorUsername,
        password: credentials.editorPassword,
        values: {
          focusKeyphrase: yoast.focusKeyphrase,
          seoTitle: yoast.seoTitle,
          metaDescription: yoast.metaDescription,
          socialTitle: yoast.socialTitle,
          socialDescription: yoast.socialDescription,
        },
        screenshotDir: proofDir,
      });
    } catch (error) {
      yoastResult = {
        editUrl: `${siteUrl}/wp-admin/post.php?post=${resolvedPostId}&action=edit`,
        stored: {
          focusKeyphrase: yoast?.focusKeyphrase || null,
          seoTitle: yoast?.seoTitle || null,
          metaDescription: yoast?.metaDescription || null,
          socialTitle: yoast?.socialTitle || null,
          socialDescription: yoast?.socialDescription || null,
          editorVisible: {
            focusKeyphrase: false,
            seoTitle: false,
            metaDescription: false,
            socialTitle: false,
            socialDescription: false,
          },
          skipped: true,
          reason: `Yoast editor write failed after draft creation: ${String(error?.message || "unknown editor failure")}`,
        },
        proof: {
          errorSummary: String(error?.message || "unknown editor failure"),
        },
      };
    }
  }

  return {
    postId: resolvedPostId,
    draftUrl: updatedPost?.link || `${siteUrl}/?p=${resolvedPostId}`,
    editUrl: yoastResult.editUrl,
    wordpress: {
      title: updatedPost?.title?.rendered || title || null,
      slug: updatedPost?.slug || slug || null,
      status: updatedPost?.status || "draft",
      commentStatus: updatedPost?.comment_status || commentStatus,
      pingStatus: updatedPost?.ping_status || pingStatus,
    },
    yoast: yoastResult.stored,
    proof: yoastResult.proof,
    runtimeMode: yoast && hasEditorCredentials && !yoastResult?.stored?.skipped ? "rest_plus_editor" : "rest_only",
    fallback,
  };
}
