import assert from "node:assert/strict";
import test from "node:test";
import { defaultCommunicationTemplates } from "@nexteam/providers";
import {
  COMMUNICATION_TEMPLATE_CATEGORIES,
  communicationTemplateMatchesDefault,
  normalizeCommunicationTemplates,
  renderTemplateText
} from "../../../../../../../../dist/modules/nexops/areas/settings/components/tenantConfig/server/communicationTemplates.js";

test("every consolidated communication category ships an email and SMS variant", () => {
  const templates = defaultCommunicationTemplates("candela");
  assert.deepEqual(new Set(templates.map((template) => template.category)), new Set(COMMUNICATION_TEMPLATE_CATEGORIES));
  for (const template of templates) {
    assert.equal(template.emailEnabled, true, `${template.category} email`);
    assert.equal(template.smsEnabled, true, `${template.category} SMS`);
    assert.ok(template.emailSubject?.trim(), `${template.category} email subject`);
    assert.ok(template.emailBody?.trim(), `${template.category} email body`);
    assert.ok(template.smsBody?.trim(), `${template.category} SMS body`);
  }
});

test("normalization fills the complete category set without overwriting a customized tenant template", () => {
  const [quoteDefault] = defaultCommunicationTemplates("candela").filter((template) => template.category === "quote_send");
  const customized = { ...quoteDefault, emailBody: "Personal note for {{CLIENT_NAME}}", updatedAt: "2026-08-30T00:00:00.000Z" };
  const normalized = normalizeCommunicationTemplates({ tenantId: "candela", communicationTemplates: [customized] });
  assert.equal(normalized.length, COMMUNICATION_TEMPLATE_CATEGORIES.length);
  assert.equal(normalized.find((template) => template.category === "quote_send")?.emailBody, customized.emailBody);
  assert.equal(communicationTemplateMatchesDefault(customized, quoteDefault), false);
});

test("merge fields render into a one-time preview without changing the saved default", () => {
  const [quoteDefault] = defaultCommunicationTemplates("candela").filter((template) => template.category === "quote_send");
  const oneTimeBody = "Hi {{CLIENT_NAME}}, view {{PORTAL_URL}}";
  assert.equal(renderTemplateText(oneTimeBody, { CLIENT_NAME: "Alex", PORTAL_URL: "https://portal.example.test/quotes/q1" }), "Hi Alex, view https://portal.example.test/quotes/q1");
  assert.match(quoteDefault.emailBody, /\{\{PORTAL_URL\}\}/);
});
