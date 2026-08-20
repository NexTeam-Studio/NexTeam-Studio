import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const styles = readFileSync(new URL("../styles/captureWorkspace.css", import.meta.url), "utf8");

test("long NexCam capture captions stay contained in the preview card", () => {
  assert.match(styles, /\.nexops-capture-preview-card h3 \{[\s\S]*-webkit-line-clamp: 3/);
  assert.match(styles, /\.nexops-capture-preview-card \.nexops-detail-header > :first-child \{[\s\S]*min-width: 0/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.nexops-capture-preview-card \.nexops-inline-actions \{[\s\S]*width: 100%/);
});
