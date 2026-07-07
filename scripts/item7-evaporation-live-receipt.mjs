import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  createOperatorProofSession,
  fetchJson,
  resolveBaseUrl
} from "./support/liveProofHelpers.mjs";

const baseUrl = (process.env.NEXTEAM_BASE_URL || resolveBaseUrl()).replace(/\/$/, "");
const expectedSha = process.env.EXPECTED_GIT_SHA || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const receiptPath = process.env.ITEM7_EVAPORATION_RECEIPT || "receipts/item7/evaporation-live-receipt.json";
const tenantId = process.env.ITEM7_TENANT_ID || "aquatrace";
const runId = `item7-evap-${Date.now()}-${randomUUID().slice(0, 8)}`;
const scenario = {
  clientName: "Item 7 live receipt",
  address: process.env.ITEM7_EVAP_ADDRESS || "100 Main Street, Bryson City, NC 28713",
  zip: process.env.ITEM7_EVAP_ZIP || "28713",
  surfaceAreaFt2: Number(process.env.ITEM7_EVAP_SURFACE_AREA_FT2 || "500"),
  waterTempF: Number(process.env.ITEM7_EVAP_WATER_TEMP_F || "82"),
  observedLoss: {
    inches: Number(process.env.ITEM7_EVAP_OBSERVED_LOSS_IN || "1.5"),
    observationDays: Number(process.env.ITEM7_EVAP_OBSERVATION_DAYS || "1")
  }
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function round(value, places = 4) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function gallonsPerInch(surfaceAreaFt2) {
  return surfaceAreaFt2 * (1 / 12) * 7.48052;
}

function calcEvapInchesPerDay(surfaceAreaFt2, waterTempF, airTempF, relativeHumidityPct, windMph) {
  const saturationPressureKpa = (tempC) => 0.61078 * Math.exp((17.2694 * tempC) / (tempC + 237.29));
  const waterTempC = (waterTempF - 32) * 5 / 9;
  const airTempC = (airTempF - 32) * 5 / 9;
  const waterPressurePsi = saturationPressureKpa(waterTempC) * 0.2953;
  const airPressurePsi = (relativeHumidityPct / 100) * saturationPressureKpa(airTempC) * 0.2953;
  const pressureDelta = Math.max(waterPressurePsi - airPressurePsi, 0);
  const poundsPerHour = surfaceAreaFt2 * pressureDelta * (0.089 + 0.0782 * windMph);
  return (poundsPerHour / 8.34) / (surfaceAreaFt2 * (1 / 12) * 7.48052) * 24;
}

function manualCalculation({ input, currentWeather, forecast }) {
  const gpi = round(gallonsPerInch(input.surfaceAreaFt2), 4);
  const observedLossInchesPerDay = round(input.observedLoss.inches / input.observedLoss.observationDays, 4);
  const evapInchesPerDay = round(calcEvapInchesPerDay(
    input.surfaceAreaFt2,
    input.waterTempF,
    currentWeather.airTempF,
    currentWeather.relativeHumidityPct,
    currentWeather.windMph
  ), 4);
  const leakInchesPerDay = round(Math.max(observedLossInchesPerDay - evapInchesPerDay, 0), 4);
  const forecastSlots = (forecast || []).slice(0, 8).map((slot) => {
    const perDay = calcEvapInchesPerDay(input.surfaceAreaFt2, input.waterTempF, slot.airTempF, slot.relativeHumidityPct, slot.windMph);
    const evapInchesForThreeHours = round(perDay / 8, 4);
    return {
      at: slot.at,
      evapInchesForThreeHours,
      evapGallonsForThreeHours: round(evapInchesForThreeHours * gpi, 1)
    };
  });
  const projected24HourEvapInches = forecastSlots.length
    ? round(forecastSlots.reduce((total, slot) => total + slot.evapInchesForThreeHours, 0) / forecastSlots.length * 8, 4)
    : null;
  return {
    gallonsPerInch: gpi,
    observedLossInchesPerDay,
    evapInchesPerDay,
    evapGallonsPerDay: round(evapInchesPerDay * gpi, 1),
    leakInchesPerDay,
    leakGallonsPerDay: round(leakInchesPerDay * gpi, 1),
    totalLossInchesPerDay: round(evapInchesPerDay + leakInchesPerDay, 4),
    totalLossGallonsPerDay: round((evapInchesPerDay + leakInchesPerDay) * gpi, 1),
    projected24HourEvapInches,
    projected24HourEvapGallons: projected24HourEvapInches === null ? null : round(projected24HourEvapInches * gpi, 1),
    forecast: forecastSlots
  };
}

function assertClose(actual, expected, tolerance, label) {
  assert(Math.abs(Number(actual) - Number(expected)) <= tolerance, `${label} mismatch: expected ${expected}, got ${actual}`);
}

async function authedNexiMessage({ idToken, conversationId, message }) {
  const response = await fetchJson(`${baseUrl}/api/nexi/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify({ tenantId, conversationId, message })
  });
  assert(response.ok && response.json?.ok, `Nexi message failed (${response.status}): ${response.json?.error || response.text}`);
  return response.json;
}

const receipt = {
  ok: false,
  runId,
  baseUrl,
  expectedSha,
  tenantId,
  scenario,
  createdAt: new Date().toISOString(),
  checks: {}
};

const proof = await createOperatorProofSession();
try {
  const version = await fetchJson(`${baseUrl}/api/version`);
  receipt.checks.version = { status: version.status, body: version.json };
  assert(version.ok, "version endpoint failed");
  assert(version.json?.sha === expectedSha, `version SHA mismatch: expected ${expectedSha}, got ${version.json?.sha}`);

  const health = await fetchJson(`${baseUrl}/api/health`);
  receipt.checks.health = { status: health.status, body: health.json };
  assert(health.ok && health.json?.ok, "health endpoint was not green");

  const routeRun = await fetchJson(`${baseUrl}/api/evaporation/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scenario)
  });
  receipt.checks.routeRun = {
    status: routeRun.status,
    ok: routeRun.ok,
    reportId: routeRun.json?.report?.id,
    pdfUrl: routeRun.json?.pdfUrl,
    attachment: routeRun.json?.attachment,
    calculation: routeRun.json?.report?.calculation,
    currentWeather: routeRun.json?.report?.currentWeather,
    forecastSlots: routeRun.json?.report?.calculation?.forecast?.length ?? 0
  };
  assert(routeRun.ok && routeRun.json?.ok, `evaporation route failed: ${routeRun.json?.error || routeRun.text}`);

  const report = routeRun.json.report;
  const manual = manualCalculation({
    input: scenario,
    currentWeather: report.currentWeather,
    forecast: report.forecast
  });
  const liveCalc = report.calculation;
  assertClose(liveCalc.gallonsPerInch, manual.gallonsPerInch, 0.0001, "gallonsPerInch");
  assertClose(liveCalc.observedLossInchesPerDay, manual.observedLossInchesPerDay, 0.0001, "observedLossInchesPerDay");
  assertClose(liveCalc.evapInchesPerDay, manual.evapInchesPerDay, 0.0001, "evapInchesPerDay");
  assertClose(liveCalc.evapGallonsPerDay, manual.evapGallonsPerDay, 0.1, "evapGallonsPerDay");
  assertClose(liveCalc.leakInchesPerDay, manual.leakInchesPerDay, 0.0001, "leakInchesPerDay");
  assertClose(liveCalc.leakGallonsPerDay, manual.leakGallonsPerDay, 0.1, "leakGallonsPerDay");
  if (manual.projected24HourEvapInches !== null) {
    assertClose(liveCalc.projected24HourEvapInches, manual.projected24HourEvapInches, 0.0001, "projected24HourEvapInches");
    assertClose(liveCalc.projected24HourEvapGallons, manual.projected24HourEvapGallons, 0.1, "projected24HourEvapGallons");
  }
  receipt.checks.manualComparison = {
    ok: true,
    manual,
    live: {
      gallonsPerInch: liveCalc.gallonsPerInch,
      observedLossInchesPerDay: liveCalc.observedLossInchesPerDay,
      evapInchesPerDay: liveCalc.evapInchesPerDay,
      evapGallonsPerDay: liveCalc.evapGallonsPerDay,
      leakInchesPerDay: liveCalc.leakInchesPerDay,
      leakGallonsPerDay: liveCalc.leakGallonsPerDay,
      projected24HourEvapInches: liveCalc.projected24HourEvapInches,
      projected24HourEvapGallons: liveCalc.projected24HourEvapGallons
    },
    formula: "Aquatrace v20 evaporation formula recomputed independently inside the receipt script from the live weather values."
  };

  const pdfResponse = await fetch(`${baseUrl}${routeRun.json.pdfUrl}`);
  const pdf = Buffer.from(await pdfResponse.arrayBuffer());
  receipt.checks.pdf = {
    status: pdfResponse.status,
    ok: pdfResponse.ok,
    contentType: pdfResponse.headers.get("content-type"),
    contentDisposition: pdfResponse.headers.get("content-disposition"),
    bytes: pdf.byteLength,
    magic: pdf.subarray(0, 5).toString("utf8")
  };
  assert(pdfResponse.ok, `evaporation PDF failed with status ${pdfResponse.status}`);
  assert(receipt.checks.pdf.magic === "%PDF-", "evaporation PDF did not have a PDF header");

  const chatPrompt = `Run the evap for ${scenario.address} with surface area ${scenario.surfaceAreaFt2} square feet, water temperature ${scenario.waterTempF} degrees, and observed daily loss ${scenario.observedLoss.inches} inches.`;
  const chat = await authedNexiMessage({
    idToken: proof.idToken,
    conversationId: `item7-evap-${randomUUID()}`,
    message: chatPrompt
  });
  const toolNames = Array.isArray(chat.toolRuns) ? chat.toolRuns.map((run) => run.name) : [];
  receipt.checks.nexiTranscript = {
    prompt: chatPrompt,
    answer: String(chat.answer || "").slice(0, 1000),
    tools: toolNames,
    sourceRefs: (chat.sources || []).map((source) => `${source.rail}:${source.ref}`),
    conversationId: chat.conversationId
  };
  assert(toolNames.includes("runEvaporation"), `Nexi did not run runEvaporation; tools were ${toolNames.join(", ")}`);
  assert((chat.sources || []).some((source) => source.rail === "native"), "Nexi evaporation answer did not include a native source");
  assert(/evap|evaporation|water loss|leak|pdf|report/i.test(String(chat.answer || "")), "Nexi answer did not describe the evaporation result");

  receipt.ok = true;
} catch (error) {
  receipt.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  await proof.dispose();
  receipt.completedAt = new Date().toISOString();
  receipt.operator = { mode: proof.mode, email: proof.identity.email || null, uidPresent: Boolean(proof.identity.uid) };
  receipt.redaction = "No API keys, tokens, passwords, email bodies, or private client records are recorded. The address is the explicit public test address used for the receipt.";
  mkdirSync(dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({
  ok: receipt.ok,
  receiptPath,
  sha: receipt.checks.version?.body?.sha,
  reportId: receipt.checks.routeRun?.reportId,
  evapInchesPerDay: receipt.checks.manualComparison?.live?.evapInchesPerDay,
  leakInchesPerDay: receipt.checks.manualComparison?.live?.leakInchesPerDay,
  pdfBytes: receipt.checks.pdf?.bytes,
  nexiTools: receipt.checks.nexiTranscript?.tools
}, null, 2));
