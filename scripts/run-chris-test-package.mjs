import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiPort = 4301;
const webPort = 4300;
const apiUrl = `http://127.0.0.1:${apiPort}`;
const appUrl = `http://127.0.0.1:${webPort}/nexops/sign-in`;
const blockedEnvironmentKeys = [
  "FIREBASE_SERVICE_ACCOUNT",
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "ANTHROPIC_API_KEY",
  "ELEVENLABS_API_KEY",
  "RESEND_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "COMPANYCAM_API_TOKEN",
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
  "GMAIL_REFRESH_TOKEN",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "TELEGRAM_BOT_TOKEN"
];

function isolatedEnvironment() {
  const env = { ...process.env };
  for (const key of blockedEnvironmentKeys) delete env[key];
  return {
    ...env,
    NODE_ENV: "development",
    RUNTIME_MODE: "isolated",
    ALLOW_IN_MEMORY_PERSISTENCE: "true",
    TENANT_ID: "local-chris-test",
    NEXI_FIREBASE_AUTH_REQUIRED: "false",
    PUBLIC_BASE_URL: `http://127.0.0.1:${webPort}`,
    VITE_TENANT_ID: "local-chris-test",
    PORT: String(apiPort),
    LOCAL_API_PROXY_TARGET: apiUrl
  };
}

function checkPort(port, label) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(new Error(`${label} port ${port} is already in use. Stop the process using it, then retry.`)));
    probe.once("listening", () => probe.close(resolve));
    probe.listen(port, "127.0.0.1");
  });
}

function start(label, command, args, env) {
  const child = spawn(command, args, { cwd: repoRoot, env, shell: false, stdio: "inherit" });
  child.once("exit", (code, signal) => {
    if (!stopping) stop(`${label} stopped (${signal ?? `code ${code ?? "unknown"}`})`);
  });
  return child;
}

let stopping = false;
let api;
let web;

function stop(reason) {
  if (stopping) return;
  stopping = true;
  process.stdout.write(`\n[Chris test package] stopping: ${reason}\n`);
  for (const child of [web, api]) {
    if (child && !child.killed) child.kill("SIGTERM");
  }
}

async function main() {
  await Promise.all([checkPort(apiPort, "API"), checkPort(webPort, "Web")]);
  const env = isolatedEnvironment();
  const tsx = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const vite = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
  api = start("API", process.execPath, [tsx, "watch", "apps/server/src/server.ts"], env);
  web = start("web", process.execPath, [vite, "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], env);
  process.stdout.write(
    "\nREADY FOR CHRIS END-USER TESTING (local, isolated, non-production)\n" +
    `Open: ${appUrl}\n` +
    `API health: ${apiUrl}/api/health\n` +
    "Use the local test identities in docs/handoffs/PHASE-R-CHRIS-TEST-PACKAGE.md.\n" +
    "Press Ctrl+C to stop. Restarting clears all test data.\n\n"
  );
}

process.on("SIGINT", () => stop("Ctrl+C"));
process.on("SIGTERM", () => stop("termination signal"));
main().catch((error) => {
  process.stderr.write(`[Chris test package] ${error.message}\n`);
  process.exitCode = 1;
});
