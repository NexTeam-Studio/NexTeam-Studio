import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.dirname(repoRoot);
const workspaceName = path.basename(workspaceRoot);
const canonicalRepoName = workspaceName.endsWith("-worktrees")
  ? workspaceName.slice(0, -"-worktrees".length)
  : "";
const canonicalEnvFile = canonicalRepoName
  ? path.join(path.dirname(workspaceRoot), canonicalRepoName, ".env")
  : "";
const envFileCandidates = [
  process.env.NEXTEAM_ENV_FILE,
  path.join(repoRoot, ".env"),
  canonicalEnvFile,
].filter(Boolean);
const envFile = envFileCandidates.find((candidate) => existsSync(candidate));
const viteBinPath = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
const tsxBinPath = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const serverEntryPath = path.join(repoRoot, "apps", "server", "src", "server.ts");
const API_PORT_START = Number(process.env.NEXTEAM_API_PORT || 3001);
const WEB_PORT_START = Number(process.env.NEXTEAM_WEB_PORT || 4275);

function printHelp() {
  process.stdout.write(
    "NexTeam local test runner\n\n" +
      "Starts the API and web app together with automatic code watching.\n" +
      "It does not open a browser. Stop it with Ctrl+C.\n\n" +
      "Configuration: use a gitignored .env file. Optionally set NEXTEAM_ENV_FILE\n" +
      "to its path, NEXTEAM_API_PORT, or NEXTEAM_WEB_PORT before starting.\n"
  );
}

function createRunner(label, command, args, env) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    shell: false,
    stdio: ["inherit", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  child.on("exit", (code, signal) => {
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    process.stdout.write(`[${label}] stopped (${reason})\n`);
  });
  return child;
}

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => tester.close(() => resolve(true)));
    tester.listen(port, "127.0.0.1");
  });
}

async function findAvailablePort(startPort, label) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No open ${label} port found starting at ${startPort}.`);
}

let shuttingDown = false;
let api = null;
let web = null;

function stopChild(child) {
  if (!child || child.killed) {
    return;
  }
  try {
    child.kill("SIGTERM");
  } catch {
    // The process may already have stopped.
  }
}

function shutdown(reason) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  process.stdout.write(`\n[nexteam-local] stopping (${reason})\n`);
  stopChild(web);
  stopChild(api);
  setTimeout(() => process.exit(0), 250);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }
  if (!envFile) {
    throw new Error(
      "No gitignored .env file was found. Create one in the canonical repository or set NEXTEAM_ENV_FILE to its path."
    );
  }
  if (!existsSync(tsxBinPath) || !existsSync(viteBinPath)) {
    throw new Error("Dependencies are missing. Run npm install before starting the local test environment.");
  }

  const [apiPort, webPort] = await Promise.all([
    findAvailablePort(API_PORT_START, "API"),
    findAvailablePort(WEB_PORT_START, "web"),
  ]);
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const appUrl = `http://127.0.0.1:${webPort}/nexops`;
  const envFileArgument = `--env-file=${envFile}`;

  api = createRunner(
    "api",
    process.execPath,
    [envFileArgument, tsxBinPath, "watch", serverEntryPath],
    { PORT: String(apiPort) }
  );
  web = createRunner(
    "web",
    process.execPath,
    [envFileArgument, viteBinPath, "--host", "0.0.0.0", "--port", String(webPort), "--strictPort"],
    { PORT: String(webPort), LOCAL_API_PROXY_TARGET: apiUrl }
  );

  api.on("exit", () => {
    if (!shuttingDown) shutdown("API stopped");
  });
  web.on("exit", () => {
    if (!shuttingDown) shutdown("web app stopped");
  });
  process.stdout.write(
    "\nNexTeam local test environment is starting.\n" +
      `Open when ready: ${appUrl}\n` +
      `API: ${apiUrl}\n` +
      "Code changes reload automatically. Press Ctrl+C to stop both services.\n\n"
  );
}

process.on("SIGINT", () => shutdown("Ctrl+C"));
process.on("SIGTERM", () => shutdown("termination signal"));

main().catch((error) => {
  process.stderr.write(`[nexteam-local] ${error.message}\n`);
  process.exitCode = 1;
});
