import { readFile } from "node:fs/promises";

export type LiveBuildActualState = "ACTIVE" | "IDLE";

export interface LiveBuildStatus {
  currentBuild: string | null;
  currentTask: string | null;
  actualState: LiveBuildActualState;
  runId: string | null;
  pid: number | null;
  lastHeartbeat: string | null;
  progress: string | null;
  completedTasks: string[];
  remainingTasks: string[];
  blocker: string | null;
  lastActivity: string | null;
}

const maxHeartbeatAgeMs = 2 * 60 * 1000;

function idleStatus(): LiveBuildStatus {
  return {
    currentBuild: null,
    currentTask: null,
    actualState: "IDLE",
    runId: null,
    pid: null,
    lastHeartbeat: null,
    progress: null,
    completedTasks: [],
    remainingTasks: [],
    blocker: null,
    lastActivity: null
  };
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function textList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}

/**
 * Read-only controller for a status document written by an active build runner.
 * A missing, malformed, or stale document must never be reported as a live run.
 */
export async function readLiveBuildStatus(env: NodeJS.ProcessEnv, now = Date.now()): Promise<LiveBuildStatus> {
  const path = env.NEXCOMMAND_LIVE_BUILD_STATUS_FILE?.trim();
  if (!path) return idleStatus();

  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!parsed || typeof parsed !== "object") return idleStatus();
    const source = parsed as Record<string, unknown>;
    const lastHeartbeat = optionalText(source.lastHeartbeat);
    const heartbeatTime = lastHeartbeat ? Date.parse(lastHeartbeat) : Number.NaN;
    if (!Number.isFinite(heartbeatTime) || heartbeatTime > now || now - heartbeatTime > maxHeartbeatAgeMs) return idleStatus();

    const runId = optionalText(source.runId);
    const pid = typeof source.pid === "number" && Number.isSafeInteger(source.pid) && source.pid > 0 ? source.pid : null;
    if (!runId || !pid) return idleStatus();

    return {
      currentBuild: optionalText(source.currentBuild),
      currentTask: optionalText(source.currentTask),
      actualState: "ACTIVE",
      runId,
      pid,
      lastHeartbeat,
      progress: optionalText(source.progress),
      completedTasks: textList(source.completedTasks),
      remainingTasks: textList(source.remainingTasks),
      blocker: optionalText(source.blocker),
      lastActivity: optionalText(source.lastActivity)
    };
  } catch {
    return idleStatus();
  }
}
