import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";

import {
  formatNexiOperatorDisplayName,
  NEXI_FRIENDLY_FAILURE_MESSAGE,
  nexiActiveApprovalPrompt,
  nexiConversationOffer,
  nexiConversationOfferReplyAction,
  nexiAddressActionValue,
  nexiIsApprovalPrompt,
  nexiMapsHref,
  nexiPhoneActionValue,
  nexiShouldHideRenderedSource,
  NexiStandaloneLayout,
  sanitizeNexiRenderedText,
  shouldAutoScrollNexiThread
} from "../src/nexiStandalone.tsx";

test("standalone Nexi layout renders exactly one unified composer row", () => {
  const html = renderToStaticMarkup(
    React.createElement(NexiStandaloneLayout, {
      header: React.createElement("header", { className: "shared-header" }, "Shared header"),
      messages: [{
        id: "welcome",
        role: "assistant",
        text: "Nexi is ready.",
        sources: []
      }],
      working: false,
      draft: "",
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

  assert.equal((html.match(/nexi-standalone-composer/g) ?? []).length, 1);
  assert.match(html, /nexi-standalone-attach-mark/);
  assert.match(html, /nexi-standalone-attach-plus/);
  assert.match(html, /aria-label="Attach a file"/);
  assert.match(html, /aria-label="Message Nexi"/);
  assert.match(html, /aria-label="Start voice input"/);
  assert.match(html, /aria-label="Send message"/);
  assert.doesNotMatch(html, />Mic</);
  assert.doesNotMatch(html, />Send</);
});

test("standalone Nexi layout does not render unrelated NexOps widgets, a floating FAB, or a permanent greeting by default", () => {
  const html = renderToStaticMarkup(
    React.createElement(NexiStandaloneLayout, {
      header: React.createElement("header", { className: "shared-header" }, "Shared header"),
      messages: [],
      working: false,
      draft: "hello",
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

  assert.doesNotMatch(html, /Calendar Board|Approvals|Content Queue|Reviews|Client detail/i);
  assert.doesNotMatch(html, /nexops-mobile-create-fab|Ask about schedule|Nexi is ready/i);
});

test("standalone Nexi sanitizes multiple raw internal error strings", () => {
  assert.equal(sanitizeNexiRenderedText("tools: Tool names must be unique."), NEXI_FRIENDLY_FAILURE_MESSAGE);
  assert.equal(sanitizeNexiRenderedText("TypeError: cannot read properties of undefined"), NEXI_FRIENDLY_FAILURE_MESSAGE);
  assert.equal(sanitizeNexiRenderedText("Everything is healthy."), "Everything is healthy.");
});

test("standalone Nexi auto-scroll helper only sticks near the bottom", () => {
  assert.equal(shouldAutoScrollNexiThread({
    scrollTop: 940,
    clientHeight: 300,
    scrollHeight: 1260
  }), true);
  assert.equal(shouldAutoScrollNexiThread({
    scrollTop: 200,
    clientHeight: 300,
    scrollHeight: 1260
  }), false);
});

test("standalone Nexi helpers derive display names, hide approval pills, and build conversational phone/maps actions", () => {
  assert.equal(formatNexiOperatorDisplayName("Chris", "chris@aquatraceleak.com"), "Chris");
  assert.equal(formatNexiOperatorDisplayName("", "chris@aquatraceleak.com"), "Chris");
  assert.equal(nexiShouldHideRenderedSource({ ref: "appr_client_1", label: "ApprovalQueue client create appr_client_1" }), true);
  assert.equal(nexiShouldHideRenderedSource({ ref: "clients", label: "Native CRM clients" }), false);
  assert.equal(nexiIsApprovalPrompt("Do the Client Details look correct?"), true);
  assert.equal(nexiIsApprovalPrompt("The address on file for Logan Sears is 6020 Frest Dr, Seneca, SC, 29672."), false);
  assert.equal(nexiPhoneActionValue("The phone number on file for Logan Sears is 8645581725."), "8645581725");
  assert.equal(
    nexiAddressActionValue("Here is your request, Chris.\n\nAddress: 6020 Frest Dr\nCity: Seneca\nState: SC\nZIP: 29672"),
    "6020 Frest Dr, Seneca, SC, 29672"
  );
  assert.equal(
    nexiMapsHref("6020 Frest Dr, Seneca, SC 29672", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"),
    "https://maps.apple.com/?q=6020%20Frest%20Dr%2C%20Seneca%2C%20SC%2029672"
  );
  assert.equal(
    nexiMapsHref("6020 Frest Dr, Seneca, SC 29672", "Mozilla/5.0 (Linux; Android 15)"),
    "https://www.google.com/maps/search/?api=1&query=6020%20Frest%20Dr%2C%20Seneca%2C%20SC%2029672"
  );
  const callOffer = nexiConversationOffer(
    "The phone number on file for Logan Sears is 8645581725.\n\nWould you like me to call now?"
  );
  assert.deepEqual(callOffer, {
    kind: "call",
    href: "tel:8645581725",
    label: "8645581725"
  });
  assert.equal(nexiConversationOfferReplyAction("yes", callOffer), "confirm");
  assert.equal(nexiConversationOfferReplyAction("call now", callOffer), "confirm");
  assert.equal(nexiConversationOfferReplyAction("no thanks", callOffer), "decline");
  const mapsOffer = nexiConversationOffer(
    "The address on file for Logan Sears is 6020 Frest Dr, Seneca, SC, 29672.\n\nWould you like directions or should I open it in Maps?",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"
  );
  assert.deepEqual(mapsOffer, {
    kind: "maps",
    href: "https://maps.apple.com/?q=6020%20Frest%20Dr%2C%20Seneca%2C%20SC%2C%2029672",
    label: "6020 Frest Dr, Seneca, SC, 29672"
  });
  assert.equal(nexiConversationOfferReplyAction("directions", mapsOffer), "confirm");
  assert.equal(nexiConversationOfferReplyAction("yes", mapsOffer), "confirm");
  assert.equal(nexiConversationOfferReplyAction("not now", mapsOffer), "decline");
});

test("standalone Nexi binds approval replies to the latest visible approval prompt instead of a stale fallback", () => {
  const staleFallback = {
    approvalId: "appr_logan",
    awaitingChanges: false,
    revisableClientCreate: true,
    revisableQuoteCreate: false,
    revisableJobCreate: false,
    revisableJobAction: false,
    revisableJobVisitSeries: false,
    revisableVisitShift: false,
    revisableLedgerAction: false,
    revisableInvoiceCompose: false,
    revisableInvoiceSend: false,
    revisableCollectPayment: false,
    revisableReceiptReview: false,
    revisableContentDraft: false
  };
  const latestPrompt = {
    ...staleFallback,
    approvalId: "appr_kit"
  };
  const resolved = nexiActiveApprovalPrompt([
    {
      id: "assistant_1",
      role: "assistant",
      text: "Logan Sears\n6020 Forest Dr, Seneca, SC\n(864) 555-1725\n\nDo the Client Details look correct?",
      sources: [],
      pendingApproval: staleFallback
    },
    {
      id: "assistant_2",
      role: "assistant",
      text: "Kit Foster\n408 Kingsgate Court, Simpsonville, SC\n(864) 888-8888\n\nDo the Client Details look correct?",
      sources: [],
      pendingApproval: latestPrompt
    }
  ], staleFallback);
  assert.equal(resolved.messageId, "assistant_2");
  assert.equal(resolved.pendingApproval?.approvalId, "appr_kit");
});

test("standalone Nexi shell keeps the header and composer pinned while the thread really scrolls", async () => {
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
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
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
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
                    <span class="nexi-voice-toggle-mark" aria-hidden="true">✓</span>
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

test("standalone Nexi styling keeps the route-specific bubble, shell, and voice treatments aligned with the live shell", () => {
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const mainSource = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");

  assert.match(styles, /\.nexi-standalone-app\s*\{[\s\S]*height:\s*100dvh;/);
  assert.match(styles, /\.nexi-standalone-app\s*\{[\s\S]*position:\s*fixed;[\s\S]*inset:\s*0;/);
  assert.match(styles, /\.nexi-standalone-app\s*>\s*\.nexops-mobile-bar,\s*[\s\S]*position:\s*sticky;[\s\S]*top:\s*0;/);
  assert.match(styles, /\.nexi-standalone-shell\s*\{[\s\S]*overflow:\s*hidden;/);
  assert.match(styles, /\.nexi-standalone-thread\s*\{[\s\S]*padding:\s*8px 8px 128px;/);
  assert.match(styles, /\.nexi-standalone-thread\s*\{[\s\S]*scroll-padding-bottom:\s*128px;/);
  assert.match(styles, /\.nexi-standalone-bubble\s*\{[\s\S]*width:\s*fit-content;/);
  assert.match(styles, /\.nexi-standalone-bubble\s*\{[\s\S]*max-width:\s*min\(760px,\s*calc\(100% - 56px\)\);/);
  assert.match(styles, /\.nexi-standalone-bubble\s*\{[\s\S]*justify-self:\s*start;/);
  assert.match(styles, /\.nexi-standalone-bubble\.user\s*\{[\s\S]*justify-self:\s*end;[\s\S]*background:\s*#fff;/);
  assert.match(styles, /\.nexi-standalone-bubble p\s*\{[\s\S]*white-space:\s*pre-line;/);
  assert.match(styles, /\.source span\s*\{[\s\S]*overflow-wrap:\s*anywhere;/);
  assert.match(styles, /\.nexi-standalone-composer\s*\{[\s\S]*position:\s*sticky;[\s\S]*z-index:\s*2;/);
  assert.match(styles, /\.nexi-header-control\s*\{[\s\S]*#D4FF20[\s\S]*#25D238/);
  assert.match(styles, /\.nexi-standalone-send\s*\{[\s\S]*#D4FF20[\s\S]*#25D238/);
  assert.match(styles, /\.nexi-voice-toggle\s*\{[\s\S]*#D4FF20[\s\S]*#25D238/);
  assert.match(styles, /\.nexi-voice-toggle\s*\{[\s\S]*max-width:\s*82px;/);
  assert.match(styles, /\.nexi-voice-toggle-mark::before\s*\{[\s\S]*font-weight:\s*900;/);
  assert.match(styles, /\.nexi-voice-toggle\.on\s*\{[\s\S]*background:\s*linear-gradient\(135deg,\s*#D4FF20 0%,\s*#8EF236 50%,\s*#25D238 100%\)/);
  assert.match(styles, /\.nexi-voice-toggle\.on\s+\.nexi-voice-toggle-mark::before\s*\{[\s\S]*#1f5e24/);
  assert.match(styles, /\.nexi-mobile-header-controls\s*\{[\s\S]*justify-items:\s*center;/);
  assert.match(styles, /\.nexi-mobile-header-controls\s*\{[\s\S]*max-width:\s*104px;/);
  assert.match(styles, /\.nexi-mobile-header-icons\s*\{[\s\S]*justify-content:\s*center;/);
  assert.match(styles, /\.nexi-standalone-app\s+\.nexops-mobile-header-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*116px\)\s+minmax\(0,\s*1fr\)\s+minmax\(0,\s*104px\);/);
  assert.match(styles, /\.nexi-standalone-app\s+\.nexops-mobile-controls\s*\{[\s\S]*justify-content:\s*center;/);
  assert.match(styles, /\.nexi-standalone-app\s+\.nexops-mobile-tenant-mark\.tenant-logo,\s*[\s\S]*max-width:\s*120px;/);
  assert.match(styles, /\.nexi-confirmation-actions\s*\{/);
  assert.match(styles, /\.nexi-confirmation-button\.yes\s*\{[\s\S]*#D4FF20[\s\S]*#25D238/);
  assert.match(styles, /\.nexi-confirmation-button\.no\s*\{[\s\S]*background:\s*#fff;/);
  assert.match(mainSource, /nexiConversationOfferReplyAction\(text,\s*conversationOffer\)/);
  assert.match(mainSource, /window\.open\(conversationOffer\.href,\s*"_blank",\s*"noopener,noreferrer"\)/);
  assert.match(mainSource, /window\.location\.assign\(conversationOffer\.href\)/);
  assert.match(mainSource, /if \(nexiIsApprovalPrompt\(text\)\) \{\s*return \[\];\s*\}/);
  assert.match(mainSource, /const activeApprovalPrompt = nexiActiveApprovalPrompt\(messages,\s*pendingApproval\);/);
  assert.match(mainSource, /const showConfirmationButtons = message\.role === "assistant"[\s\S]*activeApprovalPrompt\.messageId === message\.id[\s\S]*Boolean\(activeApprovalPrompt\.pendingApproval\);/);
  assert.match(mainSource, /className="nexi-confirmation-button yes"/);
  assert.match(mainSource, /className="nexi-confirmation-button no"/);
  assert.match(mainSource, /onClick=\{\(\) => void sendTextMessage\("yes",\s*activeApprovalPrompt\.pendingApproval\)\}/);
  assert.match(mainSource, /onClick=\{\(\) => void sendTextMessage\("no",\s*activeApprovalPrompt\.pendingApproval\)\}/);
  assert.match(mainSource, /className="nexi-mobile-header-controls"/);
  assert.match(mainSource, /className="nexi-mobile-header-icons"/);
  assert.match(mainSource, /className=\{`nexi-voice-toggle \$\{voiceEnabled \? "on" : ""\}`\}/);
  assert.match(mainSource, /className="nexi-voice-toggle-mark"/);
  assert.match(mainSource, /aria-label=\{voiceEnabled \? "Turn Nexi Voice off" : "Turn Nexi Voice on"\}/);
  assert.doesNotMatch(mainSource, /<span>Voice<\/span>/);
  assert.match(mainSource, /voiceEnabled \? "✓" : "✕"/);
  assert.match(mainSource, /onClick=\{\(\) => void toggleVoice\(\)\}/);
  assert.match(mainSource, /await startVoiceSession\(\);\s*if \(speechSupported\)\s*\{\s*startDictation\(false\);/);
});
