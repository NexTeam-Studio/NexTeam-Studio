import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const FIRESTORE_TEST_FILE = "src/features/tenancy/services/firestoreTenantRuntimeEmulator.test.mjs";

function resolveJavaHome() {
  const candidates = [
    process.env.JAVA_HOME,
    "C:\\Program Files\\Android\\Android Studio\\jbr",
    "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.11.10-hotspot",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const javaExe = join(candidate, "bin", process.platform === "win32" ? "java.exe" : "java");
    if (existsSync(javaExe)) {
      return candidate;
    }
  }

  throw new Error(
    "No Java runtime found for the Firestore emulator. Set JAVA_HOME or install a JDK/JRE."
  );
}

function buildExecCommand() {
  return `firebase emulators:exec --only firestore --project demo-nexteam-studio 'node --test ${FIRESTORE_TEST_FILE}'`;
}

async function main() {
  const javaHome = resolveJavaHome();
  const execCommand = buildExecCommand();
  const isWindows = process.platform === "win32";
  const shell = isWindows ? "powershell.exe" : "sh";
  const shellArgs = isWindows
    ? [
        "-NoProfile",
        "-Command",
        `$env:JAVA_HOME='${javaHome}'; ` +
          `$env:PATH="$env:JAVA_HOME\\bin;$env:PATH"; ` +
          `$env:RUN_FIRESTORE_EMULATOR_TESTS='1'; ` +
          execCommand,
      ]
    : [
        "-lc",
        `export JAVA_HOME='${javaHome}'; ` +
          `export PATH="$JAVA_HOME/bin:$PATH"; ` +
          `export RUN_FIRESTORE_EMULATOR_TESTS=1; ` +
          execCommand,
      ];

  const child = spawn(shell, shellArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`Firestore emulator tenant rules tests failed with exit code ${exitCode}.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
