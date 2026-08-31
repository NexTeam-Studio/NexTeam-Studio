import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";

import { NexiStandaloneLayout } from "../src/features/nexi/areas/chat/components/NexiStandalonePrimitives.tsx";

test("standalone Nexi shell keeps the header and composer pinned while the thread really scrolls", async () => {
  const styles = readFileSync(new URL("../src/features/nexi/areas/chat/styles/chat.css", import.meta.url), "utf8");
  const markup = renderToStaticMarkup(
    React.createElement(NexiStandaloneLayout, {
      header: React.createElement("header", { className: "nexops-mobile-bar" }, "Shared header"),
      messages: Array.from({ length: 80 }, (_, index) => ({
        id: `message_${index}`,
        role: index % 2 === 0 ? "assistant" : "user",
        text: (`Scrollable message ${index}\n`).repeat(8).trim(),
        sources: []
      })),
      working: false,
      draft: "Need one more detail",
      uploading: false,
      speechSupported: true,
      listening: false,
      speaking: false,
      onDraftChange: () => {},
      onSubmit: () => {},
      onAttachFiles: () => {},
      onMicClick: () => {}
    })
  );
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;height:100%;overflow:hidden;}body{background:#edf7f0;}${styles}</style></head><body>${markup}</body></html>`, {
      waitUntil: "domcontentloaded"
    });
    const before = await page.evaluate(() => {
      const header = document.querySelector(".nexops-mobile-bar");
      const composer = document.querySelector(".nexi-standalone-composer");
      const thread = document.querySelector(".nexi-standalone-thread");
      const lastBubble = document.querySelector(".nexi-standalone-bubble:last-of-type");
      if (!(header instanceof HTMLElement) || !(composer instanceof HTMLElement) || !(thread instanceof HTMLElement) || !(lastBubble instanceof HTMLElement)) {
        throw new Error("Standalone Nexi shell did not render for scroll verification.");
      }
      return {
        headerTop: header.getBoundingClientRect().top,
        composerBottom: composer.getBoundingClientRect().bottom,
        threadScrollTop: thread.scrollTop,
        lastBubbleBottom: lastBubble.getBoundingClientRect().bottom
      };
    });
    await page.locator(".nexi-standalone-thread").evaluate((node) => {
      if (node instanceof HTMLElement) {
        node.style.scrollBehavior = "auto";
        node.scrollTo({ top: node.scrollHeight, behavior: "instant" });
        node.dispatchEvent(new Event("scroll"));
      }
    });
    await page.waitForTimeout(50);
    const after = await page.evaluate(() => {
      const header = document.querySelector(".nexops-mobile-bar");
      const composer = document.querySelector(".nexi-standalone-composer");
      const thread = document.querySelector(".nexi-standalone-thread");
      const lastBubble = document.querySelector(".nexi-standalone-bubble:last-of-type");
      if (!(header instanceof HTMLElement) || !(composer instanceof HTMLElement) || !(thread instanceof HTMLElement) || !(lastBubble instanceof HTMLElement)) {
        throw new Error("Standalone Nexi shell did not render after scroll.");
      }
      return {
        headerTop: header.getBoundingClientRect().top,
        composerTop: composer.getBoundingClientRect().top,
        composerBottom: composer.getBoundingClientRect().bottom,
        threadScrollTop: thread.scrollTop,
        lastBubbleBottom: lastBubble.getBoundingClientRect().bottom
      };
    });
    assert.ok(after.threadScrollTop > before.threadScrollTop, "the message rail should really scroll");
    assert.ok(Math.abs(after.headerTop - before.headerTop) < 1, "the shared header should stay pinned after thread scroll");
    assert.ok(Math.abs(after.composerBottom - before.composerBottom) < 1, "the composer should stay pinned at the bottom after thread scroll");
    assert.ok(after.lastBubbleBottom <= after.composerTop + 1, "the newest bubble should stay above the sticky composer");
  } finally {
    await browser.close();
  }
});

test("standalone Nexi mobile header keeps the tenant mark clear of the voice-toggle rail at phone widths", async () => {
  const styles = [
    "../src/shared/styles/base.css",
    "../src/shared/styles/visualFoundation.css",
    "../src/shared/styles/responsiveComposition.css",
    "../src/features/nexopsShell/styles/shellCore.css",
    "../src/features/nexopsShell/styles/shellHeader.css",
    "../src/features/nexopsShell/styles/shellResponsiveLegacy.css",
    "../src/features/nexi/areas/chat/styles/chat.css"
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
  const headerMarkup = `
    <header class="nexops-mobile-bar nexops-mobile-nexi">
        <div class="nexops-mobile-header-grid">
          <div class="nexops-mobile-header-left">
            <button class="nexops-mobile-brand-button" type="button" aria-label="Return to NexOps home">
              <div class="nexops-mobile-brand-lockup">
                <div class="nexops-mobile-platform-mark" style="background:#d4ff20;border-radius:16px;"></div>
                <div class="nexops-mobile-product-logo" style="width:102px;height:28px;background:#d4ff20;border-radius:10px;"></div>
              </div>
            </button>
          </div>
        <div class="nexops-mobile-header-center">
          <div class="tenant-logo nexops-mobile-tenant-mark" style="width:120px;height:36px;background:#ffffff;border-radius:10px;"></div>
        </div>
        <div class="nexops-mobile-header-right">
          <div class="nexops-mobile-controls">
            <div class="nexi-mobile-header-controls">
              <div class="nexi-mobile-header-icons">
                <button class="nexops-mobile-icon-button nexi-header-control" type="button" aria-label="Open camera capture"></button>
                <button class="nexops-mobile-icon-button nexi-header-control" type="button" aria-label="Open navigation menu"></button>
              </div>
              <button class="nexi-voice-toggle on" type="button" role="switch" aria-checked="true">
                <span class="nexi-voice-toggle-label">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                    <rect x="7.2" y="3.6" width="5.6" height="9.4" rx="2.8" stroke="currentColor" stroke-width="1.9"></rect>
                    <path d="M5.2 10.6c0 3.4 2.6 6 4.8 6s4.8-2.6 4.8-6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"></path>
                    <path d="M10 16.6v3.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"></path>
                    <path d="M7.3 19.8h5.4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"></path>
                    <path d="M16.8 8.2c1 .7 1.6 1.7 1.6 2.8 0 1.2-.6 2.2-1.6 2.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
                    <path d="M19.3 6.3c1.5 1.1 2.4 2.8 2.4 4.7 0 1.9-.9 3.6-2.4 4.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
                  </svg>
                </span>
                <span class="nexi-voice-toggle-switch" aria-hidden="true">
                  <span class="nexi-voice-toggle-thumb">
                    <span class="nexi-voice-toggle-mark" aria-hidden="true">&#10003;</span>
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  `;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [360, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 180 } });
      await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;padding:0;background:#edf7f0;}${styles}</style></head><body><main class="nexi-standalone-app">${headerMarkup}</main></body></html>`, {
        waitUntil: "domcontentloaded"
      });
      const geometry = await page.evaluate(() => {
        const tenant = document.querySelector(".nexops-mobile-tenant-mark");
        const controls = document.querySelector(".nexi-mobile-header-controls");
        const toggle = document.querySelector(".nexi-voice-toggle");
        if (!(tenant instanceof HTMLElement) || !(controls instanceof HTMLElement) || !(toggle instanceof HTMLElement)) {
          throw new Error("Missing Nexi mobile header nodes for overlap check.");
        }
        const tenantRect = tenant.getBoundingClientRect();
        const controlsRect = controls.getBoundingClientRect();
        const toggleRect = toggle.getBoundingClientRect();
        return {
          tenant: tenantRect.toJSON(),
          controls: controlsRect.toJSON(),
          toggle: toggleRect.toJSON()
        };
      });
      assert.ok(
        geometry.tenant.right <= geometry.controls.left || geometry.tenant.bottom <= geometry.controls.top,
        `tenant mark should not overlap the controls rail at ${width}px: ${JSON.stringify(geometry)}`
      );
      assert.ok(
        geometry.tenant.right <= geometry.toggle.left || geometry.tenant.bottom <= geometry.toggle.top,
        `tenant mark should not overlap the voice toggle at ${width}px: ${JSON.stringify(geometry)}`
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
