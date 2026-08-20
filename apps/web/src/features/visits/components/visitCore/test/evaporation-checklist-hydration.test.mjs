import assert from "node:assert/strict";
import test from "node:test";
import { hydrateEvaporationDraft } from "../NexOpsSchedulePage.tsx";

const emptyDraft = {
  surfaceAreaFt2: "",
  waterTempF: "",
  observedLossInches: "",
  zip: "29643",
  windMphOverride: ""
};

test("reopens stored evaporation measurements from the linked Visit checklist", () => {
  const draft = hydrateEvaporationDraft({
    id: "checklist-1",
    status: "draft",
    fields: [
      { label: "Pool surface area", numberValue: 500 },
      { label: "Water temperature", numberValue: 82 },
      { label: "Reported daily water loss", numberValue: 0.25 }
    ]
  }, emptyDraft);

  assert.deepEqual(draft, {
    surfaceAreaFt2: "500",
    waterTempF: "82",
    observedLossInches: "0.25",
    zip: "29643",
    windMphOverride: ""
  });
});

test("does not replace unsaved measurement input when the checklist has no matching values", () => {
  assert.deepEqual(hydrateEvaporationDraft({ id: "checklist-2", status: "draft", fields: [{ label: "Daily evaporation index", numberValue: 0.4 }] }, emptyDraft), emptyDraft);
});

test("uses the authoritative linked report when the checklist template does not store setup measurements", () => {
  assert.deepEqual(hydrateEvaporationDraft({ id: "checklist-3", status: "draft", fields: [{ label: "Reported daily water loss", numberValue: 0.25 }] }, emptyDraft, {
    surfaceAreaFt2: 500, waterTempF: 82, observedLossInches: 0.25, zip: "29643", windMphOverride: 3
  }), {
    surfaceAreaFt2: "500", waterTempF: "82", observedLossInches: "0.25", zip: "29643", windMphOverride: "3"
  });
});
