import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const viteBinPath = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const CALLBACK_PORT = 5173;
const BACKEND_PORT_START = 3001;

function createRunner(label, command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    shell: false,
    stdio: ["inherit", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${label}] ${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${label}] ${chunk}`);
  });

  child.on("exit", (code, signal) => {
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    process.stdout.write(`[${label}] exited with ${reason}\n`);
  });

  return child;
}

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, "127.0.0.1");
  });
}

async function findAvailablePort(startPort, attempts = 20) {
  for (let port = startPort; port < startPort + attempts; port += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`No open backend port was found starting at ${startPort}.`);
}

function killChild(child) {
  if (!child || child.killed) {
    return;
  }

  try {
    child.kill("SIGTERM");
  } catch {
    // Ignore teardown failures.
  }
}

let shuttingDown = false;
let server = null;
let vite = null;

function shutdown(reason) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  process.stdout.write(`\n[gbp-dev] shutting down (${reason})\n`);
  killChild(vite);
  killChild(server);
  setTimeout(() => process.exit(0), 250);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function main() {
  const callbackPortOpen = await isPortAvailable(CALLBACK_PORT);
  if (!callbackPortOpen) {
    throw new Error(
      `Port ${CALLBACK_PORT} is already in use. Close the process on ${CALLBACK_PORT} first, because Google must redirect back to http://127.0.0.1:${CALLBACK_PORT}/auth/google/callback.`
    );
  }

  const backendPort = await findAvailablePort(BACKEND_PORT_START);
  const backendUrl = `http://127.0.0.1:${backendPort}`;

  server = createRunner("gbp-server", process.execPath, ["server.js"], {
    PORT: String(backendPort),
  });
  vite = createRunner(
    "gbp-vite",
    process.execPath,
    [viteBinPath, "--port", String(CALLBACK_PORT), "--strictPort", "--host", "0.0.0.0"],
    {
      LOCAL_API_PROXY_TARGET: backendUrl,
    }
  );

  server.on("exit", () => shutdown("server stopped"));
  vite.on("exit", () => shutdown("vite stopped"));

  process.stdout.write(
    "[gbp-dev] local GBP rail mode:\n" +
      `  app host: http://127.0.0.1:${CALLBACK_PORT}\n` +
      `  backend host: ${backendUrl}\n` +
      `  oauth callback host: http://127.0.0.1:${CALLBACK_PORT}/auth/google/callback\n`
  );
}

main().catch((error) => {
  process.stderr.write(`[gbp-dev] ${error.message}\n`);
  process.exit(1);
});
