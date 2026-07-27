import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { QuoteTemplateEditor } from "../QuoteTemplateEditor.tsx";

test("Quote Templates owns the real list and editor surface through a typed save contract", () => {
  const html = renderToStaticMarkup(React.createElement(QuoteTemplateEditor, {
    templates: [{ id: "template_service", name: "Service visit", defaultLineItems: [{ id: "line_1" }] }],
    draft: {
      id: "template_service",
      name: "Service visit",
      description: "Standard service visit",
      titlePrefix: "Service",
      expiryDays: "14",
      terms: "Due on approval",
      requireSignature: true,
      requireDeposit: true,
      requireCardOnFile: false,
      depositKind: "percent",
      depositValue: 25
    },
    captureComposerLines: true,
    busy: false,
    onSelect: () => {},
    onClear: () => {},
    onDraftChange: () => {},
    onCaptureComposerLinesChange: () => {},
    onSave: () => {}
  }));

  assert.match(html, /Service visit/);
  assert.match(html, /1 default lines/);
  assert.match(html, /Edit template/);
  assert.match(html, /Save current composer lines into this template/);
  assert.match(html, /Save template/);
});
