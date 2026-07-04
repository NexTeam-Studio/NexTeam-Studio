import { spawn } from "node:child_process";

function normalizeText(value) {
  return String(value || "").trim();
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

const flags = parseArgs(process.argv.slice(2));
const repoPath = normalizeText(flags["repo-path"]);

if (!repoPath) {
  throw new Error("probe_execution_path.mjs requires --repo-path.");
}

const commandArgs = [
  "C:\\Users\\Peyto\\.openclaw\\workspace\\clawdia_brain_client.mjs",
  "probe-execution-path",
  "--repo-path",
  repoPath,
  "--read-file-path",
  normalizeText(flags["read-file-path"]) || "package.json",
  "--build-command",
  normalizeText(flags["build-command"]) || "npm run build",
  "--correlation-id",
  normalizeText(flags["correlation-id"]) || `skill-probe-${Date.now()}`,
];

const child = spawn("node", commandArgs, {
  stdio: "inherit",
  windowsHide: true,
});

child.on("close", (code) => {
  process.exit(code ?? 1);
});
