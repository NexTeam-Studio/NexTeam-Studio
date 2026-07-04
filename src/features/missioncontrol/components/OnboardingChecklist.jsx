/**
 * OnboardingChecklist — live onboarding session list + task checklist.
 * Tied to blueprint + SOPs. Supports complete/skip/block/start task actions.
 */

import { useState } from "react";
import { useOnboardingFlow } from "../hooks/useOnboardingFlow";
import { ONBOARDING_TASK_STATES, ONBOARDING_SESSION_STATES, computeOnboardingProgress } from "../schemas/onboardingSchema";

const S = {
  page: {
    minHeight: "100vh",
    background: "#060D18",
    color: "#E2E8F0",
    fontFamily: "system-ui, -apple-system, sans-serif",
    padding: "24px"
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginBottom: 24,
    flexWrap: "wrap"
  },
  badge: {
    background: "linear-gradient(135deg,#8B5CF6,#6D28D9)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 12,
    padding: "3px 9px",
    borderRadius: 6,
    letterSpacing: 1
  },
  title: { margin: 0, fontSize: 20, fontWeight: 700, color: "#F1F5F9" },
  layout: { display: "grid", gap: 16, gridTemplateColumns: "280px 1fr" },
  panel: {
    background: "#0B1120",
    border: "1px solid #1E293B",
    borderRadius: 10,
    padding: 16,
    overflowY: "auto",
    maxHeight: "80vh"
  },
  sessionRow: {
    padding: "12px 14px",
    borderRadius: 8,
    cursor: "pointer",
    marginBottom: 6,
    border: "1px solid transparent"
  },
  sessionRowActive: { background: "#0F172A", borderColor: "#8B5CF6" },
  sessionTitle: { fontSize: 14, fontWeight: 700, color: "#F1F5F9", marginBottom: 2 },
  sessionMeta: { fontSize: 11, color: "#64748B" },
  progressBar: {
    height: 4,
    background: "#1E293B",
    borderRadius: 2,
    marginTop: 8,
    overflow: "hidden"
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg,#8B5CF6,#6D28D9)",
    borderRadius: 2,
    transition: "width 0.3s"
  },
  taskCard: {
    background: "#0B1120",
    border: "1px solid #1E293B",
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
    display: "flex",
    gap: 14,
    alignItems: "flex-start"
  },
  taskIcon: {
    flexShrink: 0,
    width: 28,
    height: 28,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 13
  },
  taskTitle: { fontSize: 14, fontWeight: 600, color: "#E2E8F0", marginBottom: 4 },
  taskDesc: { fontSize: 12, color: "#64748B", lineHeight: 1.5, marginBottom: 8 },
  taskSOP: { fontSize: 11, color: "#7DD3FC", marginBottom: 6 },
  taskBlocked: { fontSize: 12, color: "#FCA5A5", marginBottom: 6 },
  actionRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  btn: {
    background: "#1E293B",
    border: "1px solid #334155",
    color: "#CBD5E1",
    borderRadius: 6,
    padding: "5px 11px",
    cursor: "pointer",
    fontSize: 12
  },
  emptyState: { color: "#475569", fontSize: 14, padding: "24px 0" },
  loading: { color: "#475569", fontSize: 13, padding: "16px 0" }
};

const TASK_STATE_ICONS = {
  "not-started": { icon: "○", bg: "#1E293B", color: "#64748B" },
  "in-progress": { icon: "→", bg: "#0F2744", color: "#7DD3FC" },
  complete: { icon: "✓", bg: "#0F2B1C", color: "#86EFAC" },
  skipped: { icon: "–", bg: "#1E293B", color: "#475569" },
  blocked: { icon: "!", bg: "#2D0F0F", color: "#FCA5A5" }
};

function taskIconStyle(state) {
  return TASK_STATE_ICONS[state] || TASK_STATE_ICONS["not-started"];
}

function ProgressRing({ value }) {
  return (
    <div>
      <div style={S.progressBar}>
        <div style={{ ...S.progressFill, width: `${value}%` }} />
      </div>
      <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>{value}% complete</div>
    </div>
  );
}

function TaskCard({ task, onComplete, onSkip, onBlock, onStart }) {
  const [blockReason, setBlockReason] = useState("");
  const [showBlock, setShowBlock] = useState(false);
  const icon = taskIconStyle(task.state);
  const isDone = task.state === ONBOARDING_TASK_STATES.COMPLETE || task.state === ONBOARDING_TASK_STATES.SKIPPED;

  return (
    <div style={{ ...S.taskCard, opacity: isDone ? 0.7 : 1 }}>
      <div style={{ ...S.taskIcon, background: icon.bg, color: icon.color }}>{icon.icon}</div>
      <div style={{ flex: 1 }}>
        <div style={S.taskTitle}>{task.title}</div>
        {task.description && <div style={S.taskDesc}>{task.description}</div>}
        {task.sopTitle && <div style={S.taskSOP}>Playbook: {task.sopTitle}</div>}
        {task.state === ONBOARDING_TASK_STATES.BLOCKED && task.blockedReason && (
          <div style={S.taskBlocked}>⚠ Blocked: {task.blockedReason}</div>
        )}
        {task.estimatedMinutes != null && (
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 8 }}>
            Est. {task.estimatedMinutes} min
          </div>
        )}

        {!isDone && (
          <div style={S.actionRow}>
            {task.state === ONBOARDING_TASK_STATES.NOT_STARTED && (
              <button type="button" style={S.btn} onClick={() => onStart(task.taskId)}>Start</button>
            )}
            {(task.state === ONBOARDING_TASK_STATES.IN_PROGRESS || task.state === ONBOARDING_TASK_STATES.BLOCKED) && (
              <button
                type="button"
                style={{ ...S.btn, color: "#86EFAC", borderColor: "#14532D" }}
                onClick={() => onComplete(task.taskId)}
              >
                Mark Complete
              </button>
            )}
            {task.state !== ONBOARDING_TASK_STATES.SKIPPED && (
              <button type="button" style={S.btn} onClick={() => onSkip(task.taskId, "Skipped by operator")}>
                Skip
              </button>
            )}
            {!showBlock ? (
              <button type="button" style={{ ...S.btn, color: "#FCA5A5" }} onClick={() => setShowBlock(true)}>
                Block
              </button>
            ) : (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  style={{
                    background: "#060D18",
                    border: "1px solid #334155",
                    borderRadius: 6,
                    color: "#E2E8F0",
                    padding: "4px 8px",
                    fontSize: 12,
                    outline: "none",
                    width: 200
                  }}
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="Reason for blocking..."
                />
                <button
                  type="button"
                  style={{ ...S.btn, color: "#FCA5A5" }}
                  onClick={() => { onBlock(task.taskId, blockReason); setShowBlock(false); setBlockReason(""); }}
                >
                  Confirm Block
                </button>
                <button type="button" style={S.btn} onClick={() => setShowBlock(false)}>Cancel</button>
              </div>
            )}
          </div>
        )}

        {isDone && task.completedAt && (
          <div style={{ fontSize: 11, color: "#475569" }}>
            Completed {new Date(task.completedAt).toLocaleString()}
            {task.completedBy ? ` by ${task.completedBy}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionDetail({ session, onAction }) {
  const progress = computeOnboardingProgress(session);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9", marginBottom: 4 }}>
          {session.clientName || session.clientId}
        </div>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>
          Template: {session.blueprintName || session.blueprintId}
          {" · "}State: {session.state}
        </div>
        <ProgressRing value={progress} />
      </div>

      {(session.tasks || []).length === 0 ? (
        <div style={S.emptyState}>No tasks in this onboarding session.</div>
      ) : (
        (session.tasks || [])
          .sort((a, b) => a.order - b.order)
          .map((task) => (
            <TaskCard
              key={task.taskId}
              task={task}
              onComplete={(taskId) => onAction(taskId, "complete")}
              onSkip={(taskId, reason) => onAction(taskId, "skip", reason)}
              onBlock={(taskId, reason) => onAction(taskId, "block", reason)}
              onStart={(taskId) => onAction(taskId, "start")}
            />
          ))
      )}
    </div>
  );
}

export function OnboardingChecklist() {
  const {
    sessions,
    activeSession,
    loading,
    error,
    completeTask,
    skipTask,
    blockTask,
    startTask,
    setActiveSessionLocally,
    refreshSession
  } = useOnboardingFlow();

  const [selectedSession, setSelectedSession] = useState(null);

  async function handleAction(taskId, action, extra = "") {
    let result;
    switch (action) {
      case "complete": result = await completeTask(taskId); break;
      case "skip": result = await skipTask(taskId, extra); break;
      case "block": result = await blockTask(taskId, extra); break;
      case "start": result = await startTask(taskId); break;
      default: return;
    }
    if (!result.ok) console.warn("[OnboardingChecklist] action failed:", result.errors);
  }

  function selectSession(session) {
    setSelectedSession(session);
    setActiveSessionLocally(session);
  }

  const displaySession = activeSession || selectedSession;

  return (
    <div style={S.page}>
      <div style={S.header}>
        <span style={S.badge}>ONBOARDING</span>
        <h2 style={S.title}>Onboarding Checklist</h2>
      </div>

      {loading && <div style={S.loading}>Loading sessions...</div>}
      {error && <div style={{ ...S.loading, color: "#FCA5A5" }}>Error: {error}</div>}

      {!loading && (
        <div style={S.layout}>
          {/* Session list */}
          <div style={S.panel}>
            {sessions.length === 0 ? (
              <div style={S.emptyState}>
                No onboarding sessions found.<br /><br />
                Set up a client from the Agent Setup Templates to create one.
              </div>
            ) : (
              sessions.map((session) => {
                const progress = computeOnboardingProgress(session);
                const isActive = displaySession?.id === session.id;
                return (
                  <div
                    key={session.id}
                    style={{ ...S.sessionRow, ...(isActive ? S.sessionRowActive : {}) }}
                    onClick={() => selectSession(session)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && selectSession(session)}
                  >
                    <div style={S.sessionTitle}>{session.clientName || session.clientId}</div>
                    <div style={S.sessionMeta}>
                      {session.blueprintName || session.blueprintId}
                      {" · "}{session.state}
                    </div>
                    <ProgressRing value={progress} />
                  </div>
                );
              })
            )}
          </div>

          {/* Task detail */}
          <div style={S.panel}>
            {!displaySession ? (
              <div style={S.emptyState}>Select a session to view its onboarding checklist.</div>
            ) : (
              <SessionDetail session={displaySession} onAction={handleAction} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
