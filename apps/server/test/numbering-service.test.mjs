import test from "node:test";
import assert from "node:assert/strict";
import { crmSettingsSchema } from "@nexteam/core";
import { defaultCrmSettings, MemoryNativeCrmRepository } from "@nexteam/providers";
import { advanceDocumentNumber, formatDocumentNumber } from "@nexteam/shared";
import { previewDocumentNumber } from "../dist/shared/numbering/numberingService.js";

test("shared Numbering formats and advances without owning component prefixes", () => {
  const quoteRule = { prefix: "EST", separator: "/", padWidth: 5, nextValue: 42 };
  assert.equal(formatDocumentNumber(quoteRule), "EST/00042");
  assert.deepEqual(advanceDocumentNumber(quoteRule), {
    number: "EST/00042",
    nextRule: { prefix: "EST", separator: "/", padWidth: 5, nextValue: 43 }
  });
  assert.equal(quoteRule.nextValue, 42);
});

test("shared Numbering backfills the receipt format on legacy four-sequence settings", () => {
  const current = defaultCrmSettings("tenant_a");
  const { receipt: _receipt, ...legacyNumbering } = current.documentNumbering;
  const parsed = crmSettingsSchema.parse({ ...current, documentNumbering: legacyNumbering });
  assert.deepEqual(parsed.documentNumbering.receipt, { prefix: "RCT", separator: "-", padWidth: 4, nextValue: 1 });
});

test("memory Numbering reserves unique parallel sequences independently per tenant and kind", async () => {
  const repository = new MemoryNativeCrmRepository();
  const tenantA = defaultCrmSettings("tenant_a");
  await repository.saveCrmSettings({
    ...tenantA,
    documentNumbering: {
      ...tenantA.documentNumbering,
      receipt: { prefix: "PAY", separator: "-", padWidth: 3, nextValue: 7 }
    }
  });
  const [first, second, quote, otherTenant] = await Promise.all([
    repository.reserveDocumentNumber("tenant_a", "receipt"),
    repository.reserveDocumentNumber("tenant_a", "receipt"),
    repository.reserveDocumentNumber("tenant_a", "quote"),
    repository.reserveDocumentNumber("tenant_b", "receipt")
  ]);
  assert.deepEqual([first, second], ["PAY-007", "PAY-008"]);
  assert.equal(quote, "Q-0001");
  assert.equal(otherTenant, "RCT-0001");
});

test("Numbering preview rejects settings from another tenant", () => {
  const settings = defaultCrmSettings("tenant_a");
  assert.equal(previewDocumentNumber(settings, "tenant_a", "invoice"), "INV-0001");
  assert.throws(() => previewDocumentNumber(settings, "tenant_b", "invoice"), /do not belong/i);
});
