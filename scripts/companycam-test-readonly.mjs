import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  hasCompanyCamToken,
  listCompanyCamProjects,
  summarizeCompanyCamProjects,
} from "../src/features/missioncontrol/services/companyCamReadOnlyService.js";
import { buildCompanyCamDropboxDryRun } from "../src/features/missioncontrol/services/bragiContinuityService.js";

loadLocalEnv();

if (!hasCompanyCamToken()) {
  console.log(JSON.stringify({
    ok: false,
    error: "COMPANYCAM_API_TOKEN is not configured.",
    readOnly: true,
  }, null, 2));
  process.exit(0);
}

try {
  const response = await listCompanyCamProjects({ perPage: 3 });
  const projects = summarizeCompanyCamProjects(response);
  console.log(JSON.stringify({
    ok: true,
    readOnly: true,
    projectCount: projects.length,
    projects,
    dropboxDryRunPreview: projects[0] ? buildCompanyCamDropboxDryRun({
      id: projects[0].id,
      name: projects[0].name,
      updated_at: projects[0].updatedAt,
    }) : null,
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({
    ok: false,
    error: error.message,
    readOnly: true,
  }, null, 2));
}

function loadLocalEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
