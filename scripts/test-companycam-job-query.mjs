import { existsSync, readFileSync } from "node:fs";
import crypto from "node:crypto";
import { join } from "node:path";
import {
  LOCAL_RAIL_API_HOST,
  startLocalRailApiServer,
} from "../src/features/missioncontrol/services/localRailApiServer.js";

function loadLocalEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key]) {
      continue;
    }

    process.env[key] = value;
  }
}

async function parseJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

loadLocalEnv();
process.env.RAIL_LOCAL_API_TOKEN = process.env.RAIL_LOCAL_API_TOKEN || "local-rail-api-test-token";

const requestedPort = Number(process.env.RAIL_LOCAL_API_PORT || 3200 + crypto.randomInt(20, 200));

const started = await startLocalRailApiServer({
  port: requestedPort,
});

try {
  const response = await fetch(`http://${LOCAL_RAIL_API_HOST}:${started.address.port}/rail/companycam/report-question`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RAIL_LOCAL_API_TOKEN}`,
    },
    body: JSON.stringify({
      tenantId: "aquatrace",
      question: "What are the total pool gallons in the report for Camp Mikell in Toccoa GA?",
    }),
  });

  const payload = await parseJson(response);
  console.log(
    JSON.stringify(
      {
        ok: response.ok,
        status: response.status,
        result: payload?.result || null,
      },
      null,
      2
    )
  );
} finally {
  await started.close();
}
