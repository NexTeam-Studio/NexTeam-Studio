import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FirestoreAgreementRepository } from "../dist/modules/nexops/shared/agreements/agreementRepository.js";
import { FirestoreJobCostingRepository } from "../dist/modules/nexops/shared/jobCosting/jobCostingRepository.js";
import { FirestoreTimePayRepository } from "../dist/modules/nexops/shared/timePay/timePayRepository.js";

function scopedFirestore() {
  const operations = [];
  return {
    operations,
    collection(name) {
      operations.push(["collection", name]);
      return {
        where(field, operator, value) {
          operations.push(["where", field, operator, value]);
          return this;
        },
        limit(value) {
          operations.push(["limit", value]);
          return this;
        },
        async get() {
          return { docs: [{ data: () => ({ occurredAt: "2026-09-03T00:00:00.000Z" }) }] };
        }
      };
    }
  };
}

test("related event repositories filter by their parent key before reading", async () => {
  const timePayDb = scopedFirestore();
  await new FirestoreTimePayRepository(timePayDb).listEvents("tenant_1", "fact_1");
  assert.ok(timePayDb.operations.some((operation) => operation[1] === "factId" && operation[3] === "fact_1"));
  assert.ok(timePayDb.operations.some((operation) => operation[0] === "limit" && operation[1] === 250));

  const agreementDb = scopedFirestore();
  await new FirestoreAgreementRepository(agreementDb).listEvents("tenant_1", "agreement_1");
  assert.ok(agreementDb.operations.some((operation) => operation[1] === "agreementId" && operation[3] === "agreement_1"));

  const costingDb = scopedFirestore();
  await new FirestoreJobCostingRepository(costingDb).listEvents("tenant_1", "job_1");
  assert.ok(costingDb.operations.some((operation) => operation[1] === "jobId" && operation[3] === "job_1"));
});

test("job cost fact reads are scoped to a job before parsing records", () => {
  const source = readFileSync(new URL("../src/modules/nexops/shared/jobCosting/jobCostingRepository.ts", import.meta.url), "utf8");
  assert.match(source, /collection\("jobCostFacts"\)\.where\("tenantId", "==", tenantId\)\.where\("jobId", "==", jobId\)/);
});
