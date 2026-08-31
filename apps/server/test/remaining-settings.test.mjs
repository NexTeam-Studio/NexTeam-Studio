import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { crmSettingsSchema, defaultWorkspaceSettings } from "@nexteam/core";
import { MemoryNativeCrmRepository, defaultCrmSettings } from "@nexteam/providers";

test("remaining tenant settings default to safe NexCam, portal, payments, and integration states", () => {
  const settings = crmSettingsSchema.parse(defaultCrmSettings("tenant_settings"));
  assert.equal(settings.workspaceSettings.fieldDocs.markupSaveMode, "new_copy");
  assert.equal(settings.workspaceSettings.portal.defaultDocumentVisibility, "job");
  assert.equal(settings.workspaceSettings.portal.tipPromptEnabled, false);
  assert.equal(settings.workspaceSettings.payments.bankAccountsConfigured, false);
  assert.equal(settings.workspaceSettings.integrations.enabled, false);
  assert.deepEqual(settings.workspaceSettings, defaultWorkspaceSettings);
});

test("workspace settings remain tenant-scoped and persist portal privacy, tips, and default tax", async () => {
  const left = defaultCrmSettings("tenant_left");
  const right = defaultCrmSettings("tenant_right");
  const repository = new MemoryNativeCrmRepository({ crmSettings: [left, right] });
  const workspaceSettings = {
    ...left.workspaceSettings,
    company: { ...left.workspaceSettings.company, addressPrivate: true },
    portal: { ...left.workspaceSettings.portal, tipPromptEnabled: true },
    taxSettings: { ...left.workspaceSettings.taxSettings, rates: [{ id: "tax_left", name: "Local tax", rate: 7, isDefault: true, active: true }] }
  };
  await repository.saveCrmSettings({ ...left, workspaceSettings });
  const saved = await repository.getCrmSettings("tenant_left");
  assert.equal(saved.workspaceSettings.company.addressPrivate, true);
  assert.equal(saved.workspaceSettings.portal.tipPromptEnabled, true);
  assert.equal(saved.workspaceSettings.taxSettings.rates[0]?.rate, 7);
  assert.deepEqual((await repository.getCrmSettings("tenant_right")).workspaceSettings, right.workspaceSettings);
});

test("remaining settings surface exposes all ten configured areas and uses the shared persistence action", async () => {
  const source = await readFile(new URL("../../web/src/features/settings/components/tenantConfig/RemainingSettingsSections.tsx", import.meta.url), "utf8");
  for (const heading of ["Company Details", "NexCam Defaults", "Event Sequences", "Intake and Booking", "Rates and Groups", "Reusable Record Fields", "Calendar Defaults", "Client-Hub Defaults", "Payment Preferences", "Integration Slots"]) {
    assert.match(source, new RegExp(heading));
  }
  assert.match(source, /Photo markup always creates a new copy/);
  assert.match(source, /Transfer across lifecycle/);
  assert.match(source, /No integrations are connected/);
});
