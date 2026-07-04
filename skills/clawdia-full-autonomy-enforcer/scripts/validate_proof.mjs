import { readFileSync } from "node:fs";

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

function readInput(args) {
  if (args.text) {
    return String(args.text);
  }
  if (args["input-file"]) {
    return readFileSync(args["input-file"], "utf8");
  }
  return "";
}

const negativePatterns = [
  /working on it/i,
  /working\s+[-:]\s+current action/i,
  /\bprobably\b/i,
  /\blikely\b/i,
  /should work/i,
  /i have a clear picture/i,
  /\bi(?:'ll| will) create\b/i,
  /\bhanded off\b/i,
  /\breassigned\b/i,
  /waiting on (atlas|donatello)/i,
  /try restarting/i,
  /check the logs/i,
  /here'?s what you need to do/i,
  /open telegram/i,
  /send this command/i,
  /monitor the output/i,
  /generic update/i,
];

const fatalPatterns = [
  /^\(no output\)$/im,
  /\bno output\b/i,
  /returned no implementation proof/i,
  /no verified page artifact/i,
];

const positivePatterns = [
  /files changed/i,
  /tests run/i,
  /tests passed/i,
  /build result/i,
  /page url\/path/i,
  /task[_ -]?id/i,
  /proof summary/i,
  /exact command\/file\/access/i,
  /exact blocker/i,
  /real blocker/i,
  /status:\s*(complete|done|parked|blocked)/i,
  /status:\s*(local|staging|draft|live)/i,
  /runtime[_ -]?state/i,
  /https?:\/\//i,
  /[A-Z]:\\\\/i,
  /queue/i,
  /worker/i,
];

const evidencePatterns = [
  /npm run /i,
  /node --check/i,
  /build passed/i,
  /passed/i,
  /failed/i,
  /task complete/i,
  /proof received/i,
  /result returned/i,
  /next smallest fix step/i,
];

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = readInput(args);
  const text = normalizeText(input);

  if (!text) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          verdict: "reject",
          reasons: ["No proof text was provided."],
          positive_signals: [],
          negative_signals: [],
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const negativeSignals = negativePatterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.toString());
  const fatalSignals = fatalPatterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.toString());
  const positiveSignals = positivePatterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.toString());
  const evidenceSignals = evidencePatterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.toString());

  const reasons = [];

  if (fatalSignals.length > 0) {
    reasons.push("Proof contains empty or non-execution output instead of real implementation evidence.");
  }
  if (positiveSignals.length < 2) {
    reasons.push("Proof does not contain enough concrete structure markers.");
  }
  if (evidenceSignals.length < 1) {
    reasons.push("Proof does not contain direct execution or verification evidence.");
  }
  if (negativeSignals.length > 0 && positiveSignals.length < 4) {
    reasons.push("Proof contains generic or stall-prone language without enough hard evidence.");
  }

  const ok = reasons.length === 0;

  console.log(
    JSON.stringify(
      {
        ok,
        verdict: ok ? "accept" : "reject",
        reasons,
        positive_signals: positiveSignals,
        fatal_signals: fatalSignals,
        negative_signals: negativeSignals,
        evidence_signals: evidenceSignals,
      },
      null,
      2
    )
  );

  if (!ok) {
    process.exit(1);
  }
}

main();
