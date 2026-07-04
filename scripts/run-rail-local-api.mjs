import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LOCAL_RAIL_API_DEFAULT_PORT,
  LOCAL_RAIL_API_HOST,
  LOCAL_RAIL_API_TOKEN_ENV,
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

loadLocalEnv();

const started = await startLocalRailApiServer({
  port: Number(process.env.RAIL_LOCAL_API_PORT || LOCAL_RAIL_API_DEFAULT_PORT),
});

console.log(`[local-rail-api] listening on http://${LOCAL_RAIL_API_HOST}:${started.address.port}`);
console.log(`[local-rail-api] token env: ${LOCAL_RAIL_API_TOKEN_ENV}`);
