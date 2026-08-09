import assert from "node:assert/strict";
import test from "node:test";
import { RailError } from "@nexteam/core";
import { publicErrorResponse } from "../src/core/publicError.ts";

test("public HTTP error responses preserve actionable statuses without exposing exception details", () => {
  const providerSecret = "provider-secret-that-must-not-reach-a-client";

  assert.deepEqual(
    publicErrorResponse(new Error(`Provider rejected authorization Bearer ${providerSecret}`)),
    { status: 500, message: "Something went wrong. Please try again." }
  );
  assert.deepEqual(
    publicErrorResponse(new RailError(`Credential ${providerSecret} was rejected`, {
      provider: "native",
      op: "publicErrorTest",
      status: 403
    })),
    { status: 403, message: "You do not have permission to perform that action." }
  );
});
