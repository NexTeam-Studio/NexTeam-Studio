import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../HeaderReviewPage.tsx", import.meta.url), "utf8");
const bootstrap = fs.readFileSync(new URL("../../app/AppBootstrap.tsx", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("../../../../../server/src/composeServerApp.ts", import.meta.url), "utf8");
const branding = fs.readFileSync(new URL("../../branding/ProductBranding.tsx", import.meta.url), "utf8");
const sharedHeader = fs.readFileSync(new URL("../../../features/nexopsShell/components/NexOpsHeader.tsx", import.meta.url), "utf8");

test("Header review route is a permanent, auth-independent preview surface", () => {
  assert.match(page, /NexSuite design system · layout part/);
  assert.match(page, /Tenant \/ Operational/);
  assert.match(page, /Internal \/ Admin/);
  assert.match(page, /Harbor & Hearth Services/);
  assert.match(page, /NexTeamApplicationShell/);
  assert.match(page, /NexSuite design navigation/);
  assert.match(page, /href="\/nexcommand\?area=templates"/);
  assert.doesNotMatch(page, /Back to Templates/);
  assert.match(bootstrap, /\/design-system\/layout-parts\/header/);
  assert.match(server, /nexcommand\|design-system/);
  assert.match(branding, /export function hasTenantLogo/);
  assert.doesNotMatch(branding, /NEXTEAM_WORDMARK_SRC|logo placeholder/);
  assert.match(sharedHeader, /tenantBrand=\{tenantLogoAvailable/);
});
