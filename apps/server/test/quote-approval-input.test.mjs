import assert from "node:assert/strict";
import test from "node:test";

import { portalQuoteApprovalInputSchema } from "../src/modules/nexops/areas/quotes/components/quoteEngine/domain/quoteFoundation.ts";

test("approval accepts null optional card controls from an already-open legacy portal", () => {
  const input = portalQuoteApprovalInputSchema.parse({
    tenantId: "aquatrace",
    token: "portal_token",
    customerName: "Laura Wicker",
    signatureMode: "drawn",
    drawnDataUrl: "data:image/png;base64,signature",
    deposit: {
      cardholderName: null,
      cardBrand: null,
      cardLast4: null,
      cardOnFileAuthorized: false
    }
  });

  assert.equal(input.deposit?.cardholderName, undefined);
  assert.equal(input.deposit?.cardBrand, undefined);
  assert.equal(input.deposit?.cardLast4, undefined);
  assert.equal(input.deposit?.cardOnFileAuthorized, false);
});
