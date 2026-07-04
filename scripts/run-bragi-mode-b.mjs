import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { runBragiModeB } from "../src/features/missioncontrol/services/bragiModeBService.js";

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
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readFlag(argv, name, fallback = "") {
  const prefixed = `${name}=`;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === name) {
      return argv[index + 1] || fallback;
    }
    if (token.startsWith(prefixed)) {
      return token.slice(prefixed.length) || fallback;
    }
  }
  return fallback;
}

loadLocalEnv();

const argv = process.argv.slice(2);
const topic = readFlag(argv, "--topic");
const location = readFlag(argv, "--location");
const clientId = readFlag(argv, "--client", "aquatrace");

if (!topic || !location) {
  console.error("Usage: node scripts/run-bragi-mode-b.mjs --topic \"...\" --location \"Gainesville FL\" [--client aquatrace]");
  process.exit(1);
}

const result = await runBragiModeB({
  topic,
  location,
  clientId,
});

console.log(JSON.stringify(result, null, 2));
