import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { calcEvapInchesPerDay, calculateEvaporation, gallonsPerInch } from "../dist/evaporation/calculator.js";
import { createEvaporationNexiTools } from "../dist/evaporation/nexiTools.js";
import { renderEvaporationReportPdf } from "../dist/evaporation/report.js";
import { FieldDocsEvaporationRepository, MemoryEvaporationRepository } from "../dist/evaporation/repository.js";
import { registerEvaporationRoutes } from "../dist/evaporation/routes.js";
import { MemoryMediaRepository } from "../dist/fielddocs/mediaRepository.js";
import { registerFieldDocsRoutes } from "../dist/fielddocs/routes.js";

const weatherProvider = {
  async getWeather() {
    return {
      current: {
        city: "Bryson City",
        airTempF: 84,
        relativeHumidityPct: 62,
        windMph: 5.5,
        fetchedAt: "2026-07-07T12:00:00.000Z",
        zip: "28713"
      },
      forecast: Array.from({ length: 8 }, (_, index) => ({
        at: new Date(Date.UTC(2026, 6, 7, index * 3)).toISOString(),
        airTempF: 80 + index,
        relativeHumidityPct: 60,
        windMph: 4 + index * 0.5
      }))
    };
  }
};

const tenant = {
  id: "aquatrace",
  name: "Aquatrace",
  timezone: "America/New_York",
  policy: { requireApprovalFor: [] },
  adapters: {},
  approval: {}
};

async function withServer(app, run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("Aquatrace v20 evaporation formula matches the legacy calculator", () => {
  assert.equal(Number(calcEvapInchesPerDay(500, 82, 76, 60, 5).toFixed(4)), 1.2384);
  assert.equal(Number(gallonsPerInch(500).toFixed(4)), 311.6883);
});

test("evaporation calculation preserves observed loss, leak loss, and forecast math", () => {
  const result = calculateEvaporation({
    surfaceAreaFt2: 500,
    waterTempF: 82,
    currentWeather: {
      city: "Test City",
      airTempF: 76,
      relativeHumidityPct: 60,
      windMph: 5,
      fetchedAt: "2026-07-07T12:00:00.000Z"
    },
    forecast: [
      { at: "2026-07-07T15:00:00.000Z", airTempF: 78, relativeHumidityPct: 55, windMph: 6 },
      { at: "2026-07-07T18:00:00.000Z", airTempF: 80, relativeHumidityPct: 50, windMph: 7 }
    ],
    observedLoss: { wholeInches: 1, fractionInches: 0.5, observationDays: 1 }
  });
  assert.equal(result.observedLossInchesPerDay, 1.5);
  assert.equal(result.severity, "moderate");
  assert.equal(result.forecast.length, 2);
  assert.ok(result.leakGallonsPerDay > 70);
  assert.ok(result.projected24HourEvapInches > 0);
});

test("evaporation routes create a report and render a PDF", async () => {
  const app = express();
  app.use(express.json());
  registerEvaporationRoutes(app, {
    repository: new MemoryEvaporationRepository(),
    weatherProvider,
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });
  await withServer(app, async (baseUrl) => {
    const createdResponse = await fetch(`${baseUrl}/api/evaporation/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientName: "Receipt Client",
        address: "Bryson City, NC 28713",
        surfaceAreaFt2: 500,
        waterTempF: 82,
        observedLoss: { inches: 1, observationDays: 1 }
      })
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.ok, true);
    assert.match(created.pdfUrl, /\/api\/evaporation\/reports\/evap_/);
    assert.equal(created.attachment.mime, "application/pdf");

    const pdfResponse = await fetch(`${baseUrl}${created.pdfUrl}`);
    assert.equal(pdfResponse.status, 200);
    const pdf = Buffer.from(await pdfResponse.arrayBuffer());
    assert.equal(pdf.subarray(0, 5).toString("utf8"), "%PDF-");
  });
});

test("evaporation preview retrieves weather and calculations without persisting a report", async () => {
  const app = express();
  const repository = new MemoryEvaporationRepository();
  app.use(express.json());
  registerEvaporationRoutes(app, {
    repository,
    weatherProvider,
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/evaporation/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: "Bryson City, NC 28713", surfaceAreaFt2: 500, waterTempF: 82 })
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.preview.currentWeather.city, "Bryson City");
    assert.ok(body.preview.result.evapGallonsPerDay > 0);
    assert.equal(await repository.getReport("aquatrace", "evap_preview_should_not_exist"), null);
  });
});

test("a Visit-linked evaporation report persists as one NexCam report and updates the matching checklist measurements", async () => {
  const app = express();
  const mediaRepository = new MemoryMediaRepository();
  const updatedChecklistInputs = [];
  app.use(express.json());
  registerEvaporationRoutes(app, {
    repository: new FieldDocsEvaporationRepository(new MemoryEvaporationRepository(), mediaRepository),
    weatherProvider,
    crmRepository: {
      async listJobs() {
        return [{ id: "job_1", tenantId: "aquatrace", clientId: "client_1", propertyId: "property_1" }];
      }
    },
    schedulingRepository: {
      async getVisit() {
        return { id: "visit_1", tenantId: "aquatrace", jobId: "job_1" };
      }
    },
    fieldDocsService: {
      async getChecklist() {
        return {
          id: "checklist_1",
          tenantId: "aquatrace",
          jobId: "job_1",
          propertyId: "property_1",
          visitId: "visit_1",
          fields: [
            { fieldId: "evap", label: "Daily evaporation index" },
            { fieldId: "loss", label: "Reported daily water loss" }
          ]
        };
      },
      async updateChecklist(input) {
        updatedChecklistInputs.push(input);
        return input;
      }
    },
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/evaporation/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobId: "job_1",
        visitId: "visit_1",
        checklistId: "checklist_1",
        address: "Bryson City, NC 28713",
        surfaceAreaFt2: 500,
        waterTempF: 82,
        observedLoss: { inches: 1, observationDays: 1 }
      })
    });
    assert.equal(response.status, 201);
    const created = await response.json();
    const stored = await mediaRepository.getReport("aquatrace", created.report.id);
    assert.equal(stored.kind, "evaporation");
    assert.equal(stored.jobId, "job_1");
    assert.equal(stored.visitId, "visit_1");
    assert.equal(stored.evaporationReportId, created.report.id);
    assert.deepEqual(updatedChecklistInputs[0].updates.map((update) => update.fieldId), ["evap", "loss"]);
  });
});

test("a Visit cannot be attached to an evaporation report for another job", async () => {
  const app = express();
  app.use(express.json());
  registerEvaporationRoutes(app, {
    repository: new MemoryEvaporationRepository(),
    weatherProvider,
    crmRepository: { async listJobs() { return [{ id: "job_1", tenantId: "aquatrace", clientId: "client_1" }]; } },
    schedulingRepository: { async getVisit() { return { id: "visit_other", tenantId: "aquatrace", jobId: "job_other" }; } },
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/evaporation/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: "job_1", visitId: "visit_other", address: "Bryson City, NC 28713", surfaceAreaFt2: 500, waterTempF: 82 })
    });
    assert.equal(response.status, 400);
  });
});

test("a measurement document must belong to the same tenant, job, property, and Visit", async () => {
  const app = express();
  app.use(express.json());
  registerEvaporationRoutes(app, {
    repository: new MemoryEvaporationRepository(), weatherProvider,
    crmRepository: { async listJobs() { return [{ id: "job_1", tenantId: "aquatrace", clientId: "client_1", propertyId: "property_1" }]; } },
    schedulingRepository: { async getVisit() { return { id: "visit_1", tenantId: "aquatrace", jobId: "job_1" }; } },
    mediaRepository: { async getNexDocsDocument() { return { id: "doc_other", tenantId: "aquatrace", clientId: "client_1", jobId: "job_other", propertyId: "property_1", visitId: "visit_1" }; } },
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/evaporation/preview`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: "job_1", propertyId: "property_1", visitId: "visit_1", measurementDocumentId: "doc_other", address: "Bryson City, NC 28713", surfaceAreaFt2: 500, waterTempF: 82 })
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /measurement document does not belong/i);
  });
});

test("the NexDocs field-report URL renders the authoritative linked evaporation PDF", async () => {
  const app = express();
  const mediaRepository = new MemoryMediaRepository();
  const evaporationRepository = new FieldDocsEvaporationRepository(new MemoryEvaporationRepository(), mediaRepository);
  const report = await evaporationRepository.saveReport({
    id: "evap_linked_1",
    tenantId: "aquatrace",
    jobId: "job_1",
    propertyId: "property_1",
    visitId: "visit_1",
    address: "Bryson City, NC 28713",
    surfaceAreaFt2: 500,
    waterTempF: 82,
    createdAt: "2026-08-20T00:00:00.000Z",
    currentWeather: { city: "Bryson City", airTempF: 84, relativeHumidityPct: 62, windMph: 5.5, fetchedAt: "2026-08-20T00:00:00.000Z" },
    forecast: [],
    result: calculateEvaporation({
      surfaceAreaFt2: 500,
      waterTempF: 82,
      currentWeather: { city: "Bryson City", airTempF: 84, relativeHumidityPct: 62, windMph: 5.5, fetchedAt: "2026-08-20T00:00:00.000Z" }
    }),
    pdfRef: "native://tenants/aquatrace/evaporationReports/evap_linked_1.pdf",
    status: "posted"
  });
  app.use(express.json());
  registerFieldDocsRoutes(app, {
    repository: mediaRepository,
    evaporationRepository,
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/fielddocs/reports/${report.id}/pdf?tenantId=aquatrace`);
    assert.equal(response.status, 200);
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString("utf8"), "%PDF-");
  });
});

test("runEvaporation Nexi tool returns report, PDF URL, and native source", async () => {
  const repository = new MemoryEvaporationRepository();
  const tool = createEvaporationNexiTools({ repository, weatherProvider }).find((candidate) => candidate.name === "runEvaporation");
  assert.ok(tool);
  const result = await tool.handler(tenant, {
    clientName: "Nexi Receipt",
    address: "Bryson City, NC 28713",
    surfaceAreaFt2: 500,
    waterTempF: 82,
    observedLoss: { inches: 1, observationDays: 1 }
  });
  assert.equal(result.sources[0].rail, "native");
  assert.equal(result.result.formula, "configured evaporation calculator");
  assert.match(result.result.pdfUrl, /\/api\/evaporation\/reports\/evap_/);
});

test("runEvaporation Nexi tool rejects mismatched Visit and checklist provenance before persistence", async () => {
  const repository = new MemoryEvaporationRepository();
  const baseInput = {
    repository,
    weatherProvider,
    crmRepository: {
      async listJobs() {
        return [{ id: "job_1", tenantId: "aquatrace", clientId: "client_1", propertyId: "property_1" }];
      }
    },
    schedulingRepository: {
      async getVisit(_tenantId, visitId) {
        return visitId === "visit_other"
          ? { id: "visit_other", tenantId: "aquatrace", jobId: "job_other" }
          : { id: "visit_1", tenantId: "aquatrace", jobId: "job_1" };
      }
    },
    fieldDocsService: {
      async getChecklist(_tenantId, checklistId) {
        return checklistId === "checklist_other_tenant"
          ? { id: checklistId, tenantId: "other", jobId: "job_1", propertyId: "property_1", visitId: "visit_1", fields: [] }
          : null;
      },
      async updateChecklist() {
        throw new Error("a rejected evaporation report must not update a checklist");
      }
    }
  };
  const tool = createEvaporationNexiTools(baseInput).find((candidate) => candidate.name === "runEvaporation");
  assert.ok(tool);
  const common = { address: "Bryson City, NC 28713", surfaceAreaFt2: 500, waterTempF: 82, jobId: "job_1" };

  await assert.rejects(
    () => tool.handler(tenant, { ...common, visitId: "visit_other" }),
    /selected visit does not belong to this job/i
  );
  await assert.rejects(
    () => tool.handler(tenant, { ...common, visitId: "visit_1", checklistId: "checklist_other_tenant" }),
    /selected checklist does not belong to this job context/i
  );
  await assert.rejects(
    () => tool.handler(tenant, { ...common, tenantId: "other" }),
    /requested tenant does not match the authorized evaporation context/i
  );
  assert.equal(await repository.getReport("aquatrace", "evap_1"), null);
});

test("evaporation PDF renderer produces a PDF buffer", async () => {
  const repository = new MemoryEvaporationRepository();
  const tool = createEvaporationNexiTools({ repository, weatherProvider }).find((candidate) => candidate.name === "runEvaporation");
  assert.ok(tool);
  const result = await tool.handler(tenant, {
    address: "Bryson City, NC 28713",
    surfaceAreaFt2: 500,
    waterTempF: 82
  });
  const pdf = renderEvaporationReportPdf(result.result.report);
  assert.equal(pdf.subarray(0, 5).toString("utf8"), "%PDF-");
});
