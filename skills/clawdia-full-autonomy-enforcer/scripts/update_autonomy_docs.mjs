import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");
const skillRoot = resolve(__dirname, "..");
const assetsDir = join(skillRoot, "assets");

const queueTemplatePath = join(assetsDir, "QUEUE.template.md");
const heartbeatTemplatePath = join(assetsDir, "HEARTBEAT.template.md");

const queueMarkers = {
  tableStart: "<!-- AUTONOMY_QUEUE_TABLE_START -->",
  tableEnd: "<!-- AUTONOMY_QUEUE_TABLE_END -->",
  eventStart: "<!-- AUTONOMY_QUEUE_EVENTS_START -->",
  eventEnd: "<!-- AUTONOMY_QUEUE_EVENTS_END -->",
};

const heartbeatMarkers = {
  snapshotStart: "<!-- AUTONOMY_HEARTBEAT_SNAPSHOT_START -->",
  snapshotEnd: "<!-- AUTONOMY_HEARTBEAT_SNAPSHOT_END -->",
  logStart: "<!-- AUTONOMY_HEARTBEAT_LOG_START -->",
  logEnd: "<!-- AUTONOMY_HEARTBEAT_LOG_END -->",
};

function normalizeText(value) {
  return String(value || "").trim();
}

function escapePipe(value) {
  return normalizeText(value).replace(/\|/g, "\\|");
}

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  const [command = "", ...rest] = argv;
  const args = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function ensureWorkspaceDir(workspace) {
  const absolute = resolve(workspace);
  mkdirSync(absolute, { recursive: true });
  return absolute;
}

function readTemplate(pathname) {
  return readFileSync(pathname, "utf8").replace(/\r\n/g, "\n");
}

function ensureFileFromTemplate(workspace, filename, templatePath) {
  const absolutePath = join(workspace, filename);
  if (!existsSync(absolutePath)) {
    writeFileSync(absolutePath, readTemplate(templatePath));
  }
  return absolutePath;
}

function readFile(pathname) {
  return readFileSync(pathname, "utf8").replace(/\r\n/g, "\n");
}

function writeFile(pathname, content) {
  writeFileSync(pathname, `${String(content).replace(/\s*$/, "")}\n`);
}

function replaceBetweenMarkers(content, startMarker, endMarker, replacementBody) {
  const pattern = new RegExp(
    `${escapeRegExp(startMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}`,
    "m"
  );
  return content.replace(
    pattern,
    `${startMarker}\n${replacementBody.replace(/\s*$/, "")}\n${endMarker}`
  );
}

function readBetweenMarkers(content, startMarker, endMarker) {
  const pattern = new RegExp(
    `${escapeRegExp(startMarker)}([\\s\\S]*?)${escapeRegExp(endMarker)}`,
    "m"
  );
  const match = content.match(pattern);
  return match ? match[1].trim() : "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureWorkspaceFiles(workspace) {
  const absoluteWorkspace = ensureWorkspaceDir(workspace);
  const queuePath = ensureFileFromTemplate(absoluteWorkspace, "QUEUE.md", queueTemplatePath);
  const heartbeatPath = ensureFileFromTemplate(
    absoluteWorkspace,
    "HEARTBEAT.md",
    heartbeatTemplatePath
  );
  return {
    workspace: absoluteWorkspace,
    queuePath,
    heartbeatPath,
  };
}

function parseQueueRows(tableBody) {
  return tableBody
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !line.startsWith("| Task ID") && !line.startsWith("| ---"))
    .map((line) => {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim().replace(/\\\|/g, "|"));
      return {
        taskId: cells[0] || "",
        lane: cells[1] || "",
        title: cells[2] || "",
        status: cells[3] || "",
        priority: cells[4] || "",
        owner: cells[5] || "",
        proof: cells[6] || "",
        lastUpdate: cells[7] || "",
        notes: cells[8] || "",
      };
    });
}

function renderQueueRows(rows) {
  const header = [
    "| Task ID | Lane | Title | Status | Priority | Owner | Proof | Last Update | Notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const body = rows.map(
    (row) =>
      `| ${escapePipe(row.taskId)} | ${escapePipe(row.lane)} | ${escapePipe(row.title)} | ${escapePipe(
        row.status
      )} | ${escapePipe(row.priority)} | ${escapePipe(row.owner)} | ${escapePipe(row.proof)} | ${escapePipe(
        row.lastUpdate
      )} | ${escapePipe(row.notes)} |`
  );
  return [...header, ...body].join("\n");
}

function upsertQueueTask(queuePath, args) {
  const content = readFile(queuePath);
  const tableBody = readBetweenMarkers(content, queueMarkers.tableStart, queueMarkers.tableEnd);
  const rows = parseQueueRows(tableBody);
  const taskId = normalizeText(args["task-id"]);
  const row = {
    taskId,
    lane: normalizeText(args.lane),
    title: normalizeText(args.title),
    status: normalizeText(args.status || "QUEUED").toUpperCase(),
    priority: normalizeText(args.priority || "P2").toUpperCase(),
    owner: normalizeText(args.owner || "Clawdia"),
    proof: normalizeText(args.proof || "proof required"),
    lastUpdate: nowIso(),
    notes: normalizeText(args.notes),
  };
  const existingIndex = rows.findIndex((entry) => entry.taskId === taskId);
  if (existingIndex >= 0) {
    rows[existingIndex] = row;
  } else {
    rows.push(row);
  }
  const nextTable = renderQueueRows(rows);
  const nextContent = replaceBetweenMarkers(content, queueMarkers.tableStart, queueMarkers.tableEnd, nextTable);
  writeFile(queuePath, nextContent);

  appendQueueEvent(queuePath, `${row.lastUpdate} | ${row.taskId} | ${row.status} | ${row.notes || row.title}`);

  return row;
}

function appendQueueEvent(queuePath, eventLine) {
  const content = readFile(queuePath);
  const eventBody = readBetweenMarkers(content, queueMarkers.eventStart, queueMarkers.eventEnd);
  const lines = eventBody ? eventBody.split("\n").map((line) => line.trim()).filter(Boolean) : [];
  lines.push(`- ${eventLine}`);
  const nextContent = replaceBetweenMarkers(content, queueMarkers.eventStart, queueMarkers.eventEnd, lines.join("\n"));
  writeFile(queuePath, nextContent);
}

function supersedeQueueTask(queuePath, args) {
  const content = readFile(queuePath);
  const tableBody = readBetweenMarkers(content, queueMarkers.tableStart, queueMarkers.tableEnd);
  const rows = parseQueueRows(tableBody);
  const taskId = normalizeText(args["task-id"]);
  const reason = normalizeText(args.reason || "Superseded by newer verified truth.");
  const nextRows = rows.map((row) =>
    row.taskId === taskId
      ? {
          ...row,
          status: "SUPERSEDED",
          lastUpdate: nowIso(),
          notes: reason,
        }
      : row
  );
  const nextTable = renderQueueRows(nextRows);
  const nextContent = replaceBetweenMarkers(content, queueMarkers.tableStart, queueMarkers.tableEnd, nextTable);
  writeFile(queuePath, nextContent);
  appendQueueEvent(queuePath, `${nowIso()} | ${taskId} | SUPERSEDED | ${reason}`);
}

function updateHeartbeat(heartbeatPath, args) {
  const content = readFile(heartbeatPath);
  const timestamp = nowIso();
  const snapshot = [
    `- timestamp: ${timestamp}`,
    `- loop_state: ${normalizeText(args["loop-state"] || "ACTIVE").toUpperCase()}`,
    `- current_task: ${normalizeText(args["current-task"] || "none")}`,
    `- next_task: ${normalizeText(args["next-task"] || "none")}`,
    `- proof_status: ${normalizeText(args["proof-status"] || "pending")}`,
    `- willie_consulted: ${normalizeText(args.willie || "no").toLowerCase()}`,
    `- owner_attention_required: ${normalizeText(args["owner-attention"] || "no").toLowerCase()}`,
    `- next_action: ${normalizeText(args["next-action"] || "continue queue")}`,
    `- notes: ${normalizeText(args.notes || "") || "none"}`,
  ].join("\n");
  const withSnapshot = replaceBetweenMarkers(
    content,
    heartbeatMarkers.snapshotStart,
    heartbeatMarkers.snapshotEnd,
    snapshot
  );

  const logBody = readBetweenMarkers(withSnapshot, heartbeatMarkers.logStart, heartbeatMarkers.logEnd);
  const logLines = logBody ? logBody.split("\n").map((line) => line.trim()).filter(Boolean) : [];
  logLines.push(
    `- ${timestamp} | ${normalizeText(args["loop-state"] || "ACTIVE").toUpperCase()} | ${normalizeText(
      args["current-task"] || "none"
    )} | next: ${normalizeText(args["next-action"] || "continue queue")} | willie: ${normalizeText(
      args.willie || "no"
    ).toLowerCase()}`
  );
  const nextContent = replaceBetweenMarkers(
    withSnapshot,
    heartbeatMarkers.logStart,
    heartbeatMarkers.logEnd,
    logLines.join("\n")
  );
  writeFile(heartbeatPath, nextContent);
}

function requireArg(args, key, message) {
  if (!normalizeText(args[key])) {
    throw new Error(message);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = normalizeText(args.command).toLowerCase();
  const workspace = normalizeText(args.workspace);

  if (!command) {
    throw new Error("Missing command. Use: init, task, heartbeat, or supersede.");
  }
  requireArg(args, "workspace", "Missing --workspace <path>.");

  const paths = ensureWorkspaceFiles(workspace);

  if (command === "init") {
    console.log(
      JSON.stringify(
        {
          ok: true,
          action: "init",
          workspace: paths.workspace,
          queuePath: paths.queuePath,
          heartbeatPath: paths.heartbeatPath,
        },
        null,
        2
      )
    );
    return;
  }

  if (command === "task") {
    requireArg(args, "task-id", "Missing --task-id.");
    requireArg(args, "title", "Missing --title.");
    requireArg(args, "lane", "Missing --lane.");
    const row = upsertQueueTask(paths.queuePath, args);
    console.log(JSON.stringify({ ok: true, action: "task", row }, null, 2));
    return;
  }

  if (command === "heartbeat") {
    updateHeartbeat(paths.heartbeatPath, args);
    console.log(
      JSON.stringify(
        {
          ok: true,
          action: "heartbeat",
          heartbeatPath: paths.heartbeatPath,
        },
        null,
        2
      )
    );
    return;
  }

  if (command === "supersede") {
    requireArg(args, "task-id", "Missing --task-id.");
    supersedeQueueTask(paths.queuePath, args);
    console.log(
      JSON.stringify(
        {
          ok: true,
          action: "supersede",
          taskId: normalizeText(args["task-id"]),
        },
        null,
        2
      )
    );
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

try {
  main();
} catch (error) {
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
  process.exit(1);
}
