import test from "node:test";
import assert from "node:assert/strict";

import {
  requestorOriginFromCoordinates,
  resolveRequestorOriginForNexiMessage,
  shouldUseRequestorOriginForNexiMessage
} from "../src/nexiRequestContext.ts";

test("Nexi personal-origin helper only activates for personal direction prompts", () => {
  assert.equal(shouldUseRequestorOriginForNexiMessage("How far is 6020 Frest Dr from here?"), true);
  assert.equal(shouldUseRequestorOriginForNexiMessage("Get directions to 6020 Frest Dr from my house."), true);
  assert.equal(shouldUseRequestorOriginForNexiMessage("How far is 6020 Frest Dr from the shop?"), false);
  assert.equal(shouldUseRequestorOriginForNexiMessage("Email me the report."), false);
});

test("Nexi personal-origin helper formats browser coordinates as a stable origin string", () => {
  assert.equal(
    requestorOriginFromCoordinates({ latitude: 34.1234567, longitude: -82.7654321 }),
    "34.123457,-82.765432"
  );
});

test("Nexi personal-origin helper resolves browser geolocation when available", async () => {
  const origin = await resolveRequestorOriginForNexiMessage(
    "How far is 6020 Frest Dr from here?",
    {
      getCurrentPosition(success) {
        success({
          coords: {
            latitude: 34.5000012,
            longitude: -82.7500009
          }
        });
      }
    },
    25
  );

  assert.equal(origin, "34.500001,-82.750001");
});

test("Nexi personal-origin helper falls back cleanly when geolocation is denied or the prompt is not personal", async () => {
  const denied = await resolveRequestorOriginForNexiMessage(
    "How far is 6020 Frest Dr from my house?",
    {
      getCurrentPosition(_success, failure) {
        failure?.(new Error("denied"));
      }
    },
    25
  );
  const nonPersonal = await resolveRequestorOriginForNexiMessage(
    "How far is 6020 Frest Dr from the shop?",
    {
      getCurrentPosition() {
        throw new Error("should not call geolocation for non-personal prompts");
      }
    },
    25
  );

  assert.equal(denied, undefined);
  assert.equal(nonPersonal, undefined);
});
