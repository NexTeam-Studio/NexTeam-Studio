import test from "node:test";
import assert from "node:assert/strict";

import {
  inlineJobClientDraftCanSave,
  inlineJobClientDraftMissingFields,
  mergeJobClientOptions
} from "../src/nexopsJobs.tsx";

test("inline job client draft requires name, telephone, and address before save", () => {
  assert.deepEqual(
    inlineJobClientDraftMissingFields({
      firstName: "",
      lastName: "",
      company: "",
      phone: "",
      email: "",
      street1: "",
      city: "",
      province: "",
      postalCode: "",
      country: "US"
    }),
    ["name", "telephone", "address"]
  );
});

test("inline job client draft can save without email once required client fields exist", () => {
  assert.equal(
    inlineJobClientDraftCanSave({
      firstName: "Nova",
      lastName: "Tester",
      company: "",
      phone: "8645550100",
      email: "",
      street1: "6020 Frest Dr",
      city: "Seneca",
      province: "SC",
      postalCode: "29672",
      country: "US"
    }),
    true
  );
});

test("inline-created clients merge into the job picker without duplicating existing records", () => {
  const existing = [
    { id: "client_1", name: "Aquatrace Existing", emails: [], phones: [] },
    { id: "client_2", name: "Legacy Client", emails: [], phones: [] }
  ];
  const created = { id: "client_3", name: "Fresh Inline Client", emails: ["fresh@example.com"], phones: ["8645550199"] };

  assert.deepEqual(
    mergeJobClientOptions(existing, created).map((client) => client.id),
    ["client_3", "client_1", "client_2"]
  );
  assert.deepEqual(
    mergeJobClientOptions(existing, existing[0]).map((client) => client.id),
    ["client_1", "client_2"]
  );
});
