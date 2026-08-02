import test from "node:test";
import assert from "node:assert/strict";
import {
  CLIENT_CUSTOM_FIELD_RESERVED_LABELS,
  customFieldDraftRowsToRecord,
  customFieldRecordToDraftRows,
  IMPORTED_HISTORY_CLASSIFICATION,
  isImportedHistoryRecord
} from "../domain/clientProfile.ts";

test("imported history is recognized from source-neutral client metadata", () => {
  assert.equal(isImportedHistoryRecord({ customFields: { recordClassification: IMPORTED_HISTORY_CLASSIFICATION } }), true);
  assert.equal(isImportedHistoryRecord({ customFields: { recordClassification: "current" } }), false);
});

test("an imported-history marker returns in an ordinary client edit payload", () => {
  const editRows = customFieldRecordToDraftRows(
    { recordClassification: IMPORTED_HISTORY_CLASSIFICATION },
    CLIENT_CUSTOM_FIELD_RESERVED_LABELS
  );
  assert.deepEqual(customFieldDraftRowsToRecord(editRows, CLIENT_CUSTOM_FIELD_RESERVED_LABELS), {
    recordClassification: IMPORTED_HISTORY_CLASSIFICATION
  });
});
