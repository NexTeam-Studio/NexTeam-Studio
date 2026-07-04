import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const AUTH_ADMIN_TEST_FILE = "src/server/firebaseAuthAdminEmulator.test.mjs";

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

  throw new Error("No Java runtime found for Firebase emulators. Set JAVA_HOME or install a JDK/JRE.");
}

function buildExecCommand() {
  return `firebase emulators:exec --only 'auth,firestore' --project demo-nexteam-studio 'node --test ${AUTH_ADMIN_TEST_FILE}'`;
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
          `$env:RUN_FIREBASE_AUTH_ADMIN_EMULATOR_TESTS='1'; ` +
          `$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'; ` +
          `$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'; ` +
          execCommand,
      ]
    : [
        "-lc",
        `export JAVA_HOME='${javaHome}'; ` +
          `export PATH="$JAVA_HOME/bin:$PATH"; ` +
          `export RUN_FIREBASE_AUTH_ADMIN_EMULATOR_TESTS=1; ` +
          `export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099; ` +
          `export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080; ` +
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
    throw new Error(`Firebase auth/admin emulator tests failed with exit code ${exitCode}.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
