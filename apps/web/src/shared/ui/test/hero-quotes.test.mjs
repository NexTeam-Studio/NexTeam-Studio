import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const template = await readFile(new URL("../NexOpsBusinessTemplates.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../NexOpsBusinessTemplates.css", import.meta.url), "utf8");

test("ModuleHeroCard renders the complete centered approved quote rotation", () => {
  const quoteEntries = template.match(/\{ text: ".*?", author: ".*?" \}/g) ?? [];

  assert.equal(quoteEntries.length, 149);
  assert.equal(quoteEntries[0], '{ text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" }');
  assert.equal(quoteEntries.at(-1), '{ text: "Well done is better than well said.", author: "Benjamin Franklin" }');
  assert.match(template, /function HeroQuote[\s\S]*className="module-hero-card__quote"/);
  assert.match(template, /<HeroQuote title=\{props\.title\} \/>/);
  assert.match(template, /<p className="module-hero-card__detail">\{props\.detail\}<\/p>/);
  assert.match(styles, /\.module-hero-card__quote \{[\s\S]*text-align: center/);
  assert.match(styles, /\.module-hero-card__copy \{ width: 100%; text-align: center; \}/);
  assert.match(styles, /\.module-hero-card__title \{ width: 100%; justify-content: center; \}/);
  assert.match(styles, /\.module-hero-card__detail \{ text-align: center; \}/);
  assert.match(styles, /\.nexops-hero-primary-button \{[\s\S]*background: linear-gradient\(135deg, #d4ff20, #25d238\)/);
  assert.doesNotMatch(styles, /nexops-quote-primary-button/);
});
