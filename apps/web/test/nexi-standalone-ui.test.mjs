import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

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

test("standalone Nexi styling keeps the route-specific bubble, shell, and voice treatments aligned with the live shell", () => {
  const styles = [
    readFileSync(new URL("../src/features/nexi/areas/chat/styles/chat.css", import.meta.url), "utf8"),
    readFileSync(new URL("../src/features/nexi/areas/voice/styles/voice.css", import.meta.url), "utf8")
  ].join("\n");
  const mainSource = readFileSync(new URL("../src/features/nexi/areas/chat/components/NexiStandaloneChat.tsx", import.meta.url), "utf8");
  const voiceSource = readFileSync(new URL("../src/features/nexi/areas/voice/hooks/useNexiVoice.ts", import.meta.url), "utf8");

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
  assert.match(mainSource, /voiceEnabled \? "\u2713" : "\u2715"/u);
  assert.match(mainSource, /onClick=\{\(\) => void toggleVoice\(\)\}/);
  assert.match(voiceSource, /await startVoiceSession\(\);\s*if \(speechSupported\) startDictation\(false\);/);
});
