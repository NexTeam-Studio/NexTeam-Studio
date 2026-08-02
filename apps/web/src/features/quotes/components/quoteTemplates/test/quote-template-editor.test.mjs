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
  assert.match(html, /1 Default Lines/);
  assert.match(html, /Edit Template/);
  assert.match(html, /Save Current Composer Lines into This Template/);
  assert.match(html, /Card on File/);
  assert.match(html, /Save Template/);
  assert.doesNotMatch(html, /Edit template|Save template|Card on file/);
});
