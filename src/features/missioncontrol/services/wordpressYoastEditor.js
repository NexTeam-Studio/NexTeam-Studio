import { chromium } from "playwright";

const DEFAULT_VIEWPORT = { width: 1440, height: 1600 };

function setDomValue({ selector, value }) {
  const node = document.querySelector(selector);
  if (!node) {
    throw new Error(`Missing selector: ${selector}`);
  }
  node.value = value;
  node.setAttribute("value", value);
  node.dispatchEvent(new Event("input", { bubbles: true }));
  node.dispatchEvent(new Event("change", { bubbles: true }));
  node.dispatchEvent(new Event("blur", { bubbles: true }));
}

async function waitForSelectorWithRetry(page, selector, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 30000);
  const attemptTimeoutMs = Number(options.attemptTimeoutMs || 6000);
  const startedAt = Date.now();
  let reloaded = false;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await page.waitForFunction((currentSelector) => Boolean(document.querySelector(currentSelector)), selector, {
        timeout: attemptTimeoutMs,
      });
      return;
    } catch (error) {
      if (!reloaded) {
        reloaded = true;
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(4000);
      } else {
        await page.waitForTimeout(1000);
      }
    }
  }

  throw new Error(`Missing selector: ${selector}`);
}

export async function writeYoastFieldsInEditor({
  loginUrl,
  editUrl,
  username,
  password,
  values,
  screenshotDir,
}) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: DEFAULT_VIEWPORT });
  page.setDefaultTimeout(25000);

  try {
    await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
    await page.fill("#user_login", username);
    await page.fill("#user_pass", password);
    await Promise.all([
      page.waitForLoadState("networkidle").catch(() => {}),
      page.click("#wp-submit"),
    ]);

    await page.goto(editUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    await waitForSelectorWithRetry(page, "#yoast_wpseo_focuskw");
    await waitForSelectorWithRetry(page, "#yoast_wpseo_title");
    await waitForSelectorWithRetry(page, "#yoast_wpseo_metadesc");

    await page.evaluate(() => document.querySelector("#wpseo_meta")?.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(1000);

    await page.evaluate(setDomValue, { selector: "#yoast_wpseo_focuskw", value: values.focusKeyphrase });
    await page.evaluate(setDomValue, { selector: "#yoast_wpseo_title", value: values.seoTitle });
    await page.evaluate(setDomValue, { selector: "#yoast_wpseo_metadesc", value: values.metaDescription });

    await page.evaluate(() => document.querySelector("#wpseo-meta-tab-social")?.click());
    await page.waitForTimeout(1500);
    await waitForSelectorWithRetry(page, "#yoast_wpseo_opengraph-title");
    await waitForSelectorWithRetry(page, "#yoast_wpseo_opengraph-description");

    await page.evaluate(setDomValue, { selector: "#yoast_wpseo_opengraph-title", value: values.socialTitle });
    await page.evaluate(setDomValue, { selector: "#yoast_wpseo_opengraph-description", value: values.socialDescription });
    if (values.socialImageUrl) {
      await waitForSelectorWithRetry(page, "#yoast_wpseo_opengraph-image");
      await page.evaluate(setDomValue, { selector: "#yoast_wpseo_opengraph-image", value: values.socialImageUrl });
      await page.evaluate((selector) => {
        if (document.querySelector(selector)) {
          const node = document.querySelector(selector);
          node.value = "";
          node.setAttribute("value", "");
          node.dispatchEvent(new Event("input", { bubbles: true }));
          node.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, "#yoast_wpseo_opengraph-image-id");
    }
    if (values.twitterTitle) {
      await waitForSelectorWithRetry(page, "#yoast_wpseo_twitter-title");
      await page.evaluate(setDomValue, { selector: "#yoast_wpseo_twitter-title", value: values.twitterTitle });
    }
    if (values.twitterDescription) {
      await waitForSelectorWithRetry(page, "#yoast_wpseo_twitter-description");
      await page.evaluate(setDomValue, { selector: "#yoast_wpseo_twitter-description", value: values.twitterDescription });
    }
    if (values.twitterImageUrl) {
      await waitForSelectorWithRetry(page, "#yoast_wpseo_twitter-image");
      await page.evaluate(setDomValue, { selector: "#yoast_wpseo_twitter-image", value: values.twitterImageUrl });
      await page.evaluate((selector) => {
        if (document.querySelector(selector)) {
          const node = document.querySelector(selector);
          node.value = "";
          node.setAttribute("value", "");
          node.dispatchEvent(new Event("input", { bubbles: true }));
          node.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, "#yoast_wpseo_twitter-image-id");
    }

    const proof = {};
    if (screenshotDir) {
      const beforePath = `${screenshotDir.replace(/\\/g, "/")}/yoast-fields-before-save.png`;
      await page.screenshot({ path: beforePath, fullPage: true });
      proof.beforeSave = beforePath;
    }

    await page.getByRole("button", { name: "Save draft" }).first().click({ force: true });
    await page.waitForTimeout(8000);

    await page.goto(editUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    await waitForSelectorWithRetry(page, "#yoast_wpseo_focuskw");
    await page.evaluate(() => document.querySelector("#wpseo-meta-tab-social")?.click());
    await page.waitForTimeout(1200);
    await waitForSelectorWithRetry(page, "#yoast_wpseo_opengraph-title");
    await waitForSelectorWithRetry(page, "#yoast_wpseo_twitter-title");

    const stored = await page.evaluate(() => ({
      focusKeyphrase: document.querySelector("#yoast_wpseo_focuskw")?.value || null,
      seoTitle: document.querySelector("#yoast_wpseo_title")?.value || null,
      metaDescription: document.querySelector("#yoast_wpseo_metadesc")?.value || null,
      socialTitle: document.querySelector("#yoast_wpseo_opengraph-title")?.value || null,
      socialDescription: document.querySelector("#yoast_wpseo_opengraph-description")?.value || null,
      socialImageUrl: document.querySelector("#yoast_wpseo_opengraph-image")?.value || null,
      twitterTitle: document.querySelector("#yoast_wpseo_twitter-title")?.value || null,
      twitterDescription: document.querySelector("#yoast_wpseo_twitter-description")?.value || null,
      twitterImageUrl: document.querySelector("#yoast_wpseo_twitter-image")?.value || null,
      editorVisible: {
        focusKeyphrase: !!document.querySelector("#yoast_wpseo_focuskw"),
        seoTitle: !!document.querySelector("#yoast_wpseo_title"),
        metaDescription: !!document.querySelector("#yoast_wpseo_metadesc"),
        socialTitle: !!document.querySelector("#yoast_wpseo_opengraph-title"),
        socialDescription: !!document.querySelector("#yoast_wpseo_opengraph-description"),
        socialImageUrl: !!document.querySelector("#yoast_wpseo_opengraph-image"),
        twitterTitle: !!document.querySelector("#yoast_wpseo_twitter-title"),
        twitterDescription: !!document.querySelector("#yoast_wpseo_twitter-description"),
        twitterImageUrl: !!document.querySelector("#yoast_wpseo_twitter-image"),
      },
    }));

    if (screenshotDir) {
      const afterPath = `${screenshotDir.replace(/\\/g, "/")}/yoast-fields-after-save.png`;
      await page.screenshot({ path: afterPath, fullPage: true });
      proof.afterSave = afterPath;
    }

    return {
      editUrl,
      stored,
      proof,
    };
  } finally {
    await browser.close();
  }
}
