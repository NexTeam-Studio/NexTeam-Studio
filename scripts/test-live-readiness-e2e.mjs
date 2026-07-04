import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nexteamRoot = dirname(scriptDir);
const clawdiaRoot = "C:\\Users\\Peyto\\clawdia-bot";

function extractJsonPayload(stdout = "") {
  const text = String(stdout || "").trim();
  const candidateStart = Math.max(text.lastIndexOf("\n{"), text.indexOf("{"));
  if (candidateStart === -1) {
    return null;
  }
  const jsonText = text.slice(candidateStart === text.indexOf("{") ? candidateStart : candidateStart + 1).trim();
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function runCommand(label, command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env || {}) },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      resolve({
        label,
        command: [command, ...args].join(" "),
        cwd: options.cwd,
        code: Number(code || 0),
        stdout,
        stderr,
        json: extractJsonPayload(stdout) || extractJsonPayload(stderr),
      });
    });
  });
}

async function main() {
  const checks = [
    () =>
      runCommand("public-agent-architect", "node", ["scripts/test-live-agent-architect-public-flow.mjs"], {
        cwd: nexteamRoot,
      }),
    () =>
      runCommand("firebase-auth", "node", ["scripts/test-live-firebase-auth-routes.mjs"], {
        cwd: nexteamRoot,
      }),
    () =>
      runCommand("admin-gate", "node", ["scripts/test-live-admin-gate.mjs"], {
        cwd: nexteamRoot,
      }),
    () =>
      runCommand("firestore-isolation", "node", ["scripts/test-live-firestore-tenant-isolation.mjs"], {
        cwd: nexteamRoot,
      }),
    () =>
      runCommand("blueprint-lifecycle", "node", ["scripts/test-live-blueprint-lifecycle.mjs"], {
        cwd: nexteamRoot,
      }),
    () =>
      runCommand("registry-ui", "node", ["scripts/test-live-provisioned-registry-ui.mjs"], {
        cwd: nexteamRoot,
      }),
    () =>
      runCommand("mission-control", "node", ["scripts/test-live-mission-control-ops.mjs"], {
        cwd: nexteamRoot,
      }),
    () =>
      runCommand("nexi-companycam-roundtrip", "node", ["scripts/test-nexi-companycam-roundtrip.mjs"], {
        cwd: nexteamRoot,
      }),
    () =>
      runCommand("clawdia-atlas-roundtrip", "node", ["smoke-atlas-roundtrip.mjs"], {
        cwd: clawdiaRoot,
      }),
  ];

  const results = [];
  for (const check of checks) {
    // Run sequentially to avoid overlapping browser/auth sessions and third-party traffic.
    results.push(await check());
  }

  const summary = results.map((entry) => ({
    label: entry.label,
    ok: entry.code === 0 && entry.json?.ok !== false,
    code: entry.code,
    proof: entry.json || null,
  }));

  const output = {
    ok: summary.every((entry) => entry.ok),
    checks: summary,
  };

  console.log(JSON.stringify(output, null, 2));
  if (!output.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: String(error?.message || error),
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
