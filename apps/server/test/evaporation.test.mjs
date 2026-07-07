import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { calcEvapInchesPerDay, calculateEvaporation, gallonsPerInch } from "../dist/evaporation/calculator.js";
import { createEvaporationNexiTools } from "../dist/evaporation/nexiTools.js";
import { renderEvaporationReportPdf } from "../dist/evaporation/report.js";
import { MemoryEvaporationRepository } from "../dist/evaporation/repository.js";
import { registerEvaporationRoutes } from "../dist/evaporation/routes.js";

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
    env: { TENANT_ID: "aquatrace" }
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
  assert.equal(result.result.formula, "Aquatrace v20 evaporation calculator");
  assert.match(result.result.pdfUrl, /\/api\/evaporation\/reports\/evap_/);
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
