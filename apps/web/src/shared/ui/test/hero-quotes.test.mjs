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
  assert.doesNotMatch(template, /module-hero-card__detail/);
  assert.match(styles, /\.module-hero-card__quote \{[\s\S]*text-align: center/);
  assert.match(styles, /\.module-hero-card__copy \{ width: 100%; text-align: center; \}/);
  assert.match(styles, /\.module-hero-card__title \{ width: 100%; justify-content: center; \}/);
  assert.match(styles, /\.module-hero-card__icon \{[\s\S]*width: clamp\(2\.1rem, 4\.2vw, 3\.52rem\); height: clamp\(2\.1rem, 4\.2vw, 3\.52rem\)/);
  assert.match(styles, /\.module-hero-card__icon svg \{ width: 100%; height: 100%; \}/);
  assert.doesNotMatch(styles, /\.module-hero-card__detail/);
  assert.match(styles, /\.nexops-hero-primary-button \{[\s\S]*background: linear-gradient\(135deg, #d4ff20, #25d238\)/);
  assert.match(styles, /\.nexops-business-metrics > article \{[\s\S]*border-radius: 20px/);
  assert.match(styles, /@media \(max-width: 700px\) \{[\s\S]*\.nexops-business-metrics \{ grid-template-columns: 1fr; \}/);
  assert.doesNotMatch(styles, /nexops-quote-primary-button/);
});

test("NexOpsRosterSurface keeps the result card empty until a real query or filter is active", () => {
  assert.match(template, /const \[hasResultsQuery, setHasResultsQuery\] = useState\(false\)/);
  assert.match(template, /const resultsVisible = props\.showResults \?\? hasResultsQuery/);
  assert.match(template, /onInputCapture=\{synchronizeResultsVisibility\}/);
  assert.match(template, /input\[type=search\], input\[type=text\]/);
  assert.match(template, /select\.value !== "all"/);
  assert.match(template, /\[role="radio"\]\[aria-checked="true"\]/);
  assert.match(template, /\{!resultsVisible \? null : <section className="nexops-quote-filtered-roster"/);
});
