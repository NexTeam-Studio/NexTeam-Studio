import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../NexOpsSettingsPage.tsx", import.meta.url), "utf8");
const workspace = await readFile(new URL("../../../../nexopsShell/NexOpsWorkspace.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../tenantConfig.css", import.meta.url), "utf8");

test("Settings mobile actions stay in the viewport and the global create control does not cover them", () => {
  assert.match(styles, /\.tenant-config-page \.nexops-page-heading > button,[\s\S]*width: 100%/);
  assert.match(styles, /body:has\(\.tenant-config-page\) \.nexops-mobile-create-fab[\s\S]*display: none/);
  assert.match(styles, /\.tenant-config-page \.nexops-module-card[\s\S]*padding: 15px/);
});

test("A settings detail route cannot visually leak inactive editors into its page", () => {
  assert.match(styles, /\.tenant-config-page \[hidden\] \{[\s\S]*display: none !important;/);
});

test("Settings isolate onboarding instead of rendering the guided wizard inline", () => {
  assert.doesNotMatch(page, /Secure Post-Subscription Onboarding/);
  assert.doesNotMatch(page, /Guided Configuration/);
  assert.doesNotMatch(page, /Complete \$\{ONBOARDING_STEPS/);
});

test("Document Design keeps the real PDF preview and gives loading/error states a deliberate treatment", () => {
  assert.match(page, /response\.headers\.get\("content-type"\)\?\.includes\("application\/pdf"\)/);
  assert.match(page, /title=\{kind \+ " PDF preview"\}/);
  assert.match(page, /className="nexops-pdf-preview-frame"/);
  assert.match(styles, /\.nexops-pdf-preview-status/);
});

test("Destructive settings actions do not share the primary lime treatment", () => {
  assert.match(page, /className="nexops-settings-action--danger"[\s\S]*Remove Step/);
  assert.match(styles, /\.nexops-settings-action--danger[\s\S]*background: #fff8f7/);
});

test("Settings landing is a Quotes-style hero plus all fifteen distinct routed navigation cards", () => {
  const labels = [
    "Company",
    "Document Design",
    "Templates",
    "Checklists & Reports",
    "Completion Requirements",
    "Automations",
    "Requests & Booking",
    "Products & Services",
    "Tax",
    "Custom Fields",
    "Team & Permissions",
    "Schedule",
    "NexPortal",
    "Payments",
    "Integrations"
  ];
  assert.match(page, /const SETTINGS_AREAS: Array/);
  const settingsAreasSource = page.slice(page.indexOf("const SETTINGS_AREAS"), page.indexOf("const SETTINGS_SECTIONS"));
  assert.equal((settingsAreasSource.match(/\{ id: "/g) ?? []).length, 15);
  assert.equal((page.match(/\{ id: ".*?", label: ".*?", icon: ".*?", areas: \[/g) ?? []).length, 6);
  for (const label of labels) assert.match(page, new RegExp(`label: "${label.replace(/[&]/g, "\\&")}"`));
  assert.match(page, /path: "\/nexops\/settings\/company"/);
  assert.match(page, /path: "\/nexops\/settings\/integrations"/);
  assert.match(page, /path: "\/nexops\/users"/);
  assert.match(page, /function openSettingsArea/);
  assert.match(page, /window\.history\.pushState\(\{\}, "", target\.path\)/);
  assert.match(page, /className="nexops-settings-navigation-sections"/);
  assert.match(page, /className=\{`nexops-settings-navigation-section\$\{expanded/);
  assert.match(page, /label: "Business Setup", icon: "⌂", areas: \["company", "tax", "custom-fields", "products-services"\]/);
  assert.match(page, /label: "Automation & Integrations", icon: "↻", areas: \["automations", "integrations"\]/);
  assert.match(page, /className=\{`nexops-settings-navigation-grid nexops-settings-navigation-grid--\$\{section\.areas\.length\}`\}/);
  assert.match(page, /className="nexops-settings-navigation-card"/);
  assert.match(page, /--nexops-settings-tile-color/);
  assert.match(page, /detail: "Roles & Access"/);
  assert.match(page, /detail: "Rates & Rules"/);
  assert.match(page, /<ModuleHeroCard[\s\S]*className="module-hero-card--quote"/);
  assert.match(page, /useState<SettingsSectionId \| null>\(null\)/);
  assert.match(page, /aria-expanded=\{expanded\}/);
  assert.match(page, /setExpandedSettingsSection\(\(current\) => current === section\.id \? null : section\.id\)/);
  assert.match(page, /expanded \? <div/);
  assert.match(styles, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(styles, /grid-column: span 2/);
  assert.match(styles, /nexops-settings-navigation-grid--1 > \.nexops-settings-navigation-card[\s\S]*grid-column: 3 \/ span 2/);
  assert.match(styles, /nexops-settings-navigation-section__trigger/);
  assert.match(styles, /linear-gradient\(118deg, #06151e 0%, #07313a 54%, #08723a 100%\)/);
  assert.match(styles, /justify-items: center/);
  assert.match(styles, /align-items: start/);
  assert.match(styles, /text-align: center/);
  assert.match(styles, /var\(--nexops-brand-gradient, var\(--nexteam-gradient\)\) border-box/);
  assert.match(styles, /grid-template-rows: 38px minmax\(2\.3em, auto\) minmax\(2\.7em, auto\)/);
  assert.match(styles, /\.nexops-settings-navigation-card small \{[\s\S]*font-size: 10px/);
});

test("sidebar Settings always resets the detail selection to the Settings landing", () => {
  assert.match(workspace, /const \[catalogFocusNonce, setCatalogFocusNonce\] = useState\(0\)/);
  assert.match(workspace, /const \[settingsRouteNonce, setSettingsRouteNonce\] = useState\(0\)/);
  assert.match(workspace, /window\.history\.pushState\(\{\}, "", targetPath\);[\s\S]*if \(module === "settings"\) \{[\s\S]*setSettingsRouteNonce/);
  assert.match(workspace, /settingsRouteNonce=\{settingsRouteNonce\}/);
  assert.match(page, /if \(!props\.catalogFocusNonce\) return;/);
  assert.match(page, /setActiveSettingsArea\(settingsAreaFromPath\(window\.location\.pathname\)\);[\s\S]*\[props\.settingsRouteNonce\]/);
});

test("Asset Types moved off the landing into Products & Services without losing its editor or save flow", () => {
  assert.match(page, /activeSettingsArea === "products-services" \? <article[\s\S]*Asset Types/);
  assert.match(page, /Save Asset Types/);
  assert.match(page, /Add Asset Type/);
  assert.match(page, /savePropertyAssetDefinitions/);
  assert.match(page, /if \(!selectedSettingsArea\)[\s\S]*nexops-settings-navigation-grid/);
});
