/**
 * Blueprint Library — browse blueprints, preview details, Set Up Client Workspace.
 */

import { useState } from "react";
import { useBlueprintLibrary } from "../hooks/useBlueprintLibrary";
import { blueprintToPreviewText, BLUEPRINT_STATES } from "../schemas/blueprintSchema";

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
    background: "linear-gradient(135deg,#10B981,#059669)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 12,
    padding: "3px 9px",
    borderRadius: 6,
    letterSpacing: 1
  },
  title: { margin: 0, fontSize: 20, fontWeight: 700, color: "#F1F5F9" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(340px,1fr))",
    gap: 16
  },
  card: {
    background: "#0B1120",
    border: "1px solid #1E293B",
    borderRadius: 12,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  cardTitle: { fontSize: 16, fontWeight: 700, color: "#F1F5F9" },
  cardMeta: { fontSize: 12, color: "#64748B" },
  cardDesc: { fontSize: 13, color: "#94A3B8", lineHeight: 1.55 },
  sectionLabel: { fontSize: 12, fontWeight: 700, color: "#10B981", marginBottom: 4 },
  agentChip: {
    display: "inline-block",
    background: "#0F172A",
    border: "1px solid #1E293B",
    borderRadius: 6,
    padding: "3px 8px",
    fontSize: 11,
    color: "#7DD3FC",
    marginRight: 4,
    marginBottom: 4
  },
  taskRow: { fontSize: 12, color: "#94A3B8", marginBottom: 4, paddingLeft: 8, borderLeft: "2px solid #1E293B" },
  actionRow: { display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" },
  primaryBtn: {
    background: "linear-gradient(135deg,#10B981,#059669)",
    color: "#fff",
    border: "none",
    borderRadius: 7,
    padding: "8px 16px",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 13
  },
  secondaryBtn: {
    background: "#1E293B",
    border: "1px solid #334155",
    color: "#CBD5E1",
    borderRadius: 7,
    padding: "8px 16px",
    cursor: "pointer",
    fontSize: 13
  },
  stateChip: {
    display: "inline-block",
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 4
  },
  modal: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    zIndex: 100,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  modalPanel: {
    background: "#0B1120",
    border: "1px solid #1E293B",
    borderRadius: 14,
    padding: 28,
    maxWidth: 520,
    width: "100%"
  },
  input: {
    width: "100%",
    background: "#060D18",
    border: "1px solid #334155",
    borderRadius: 7,
    color: "#E2E8F0",
    padding: "10px 13px",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    marginTop: 4
  },
  label: { fontSize: 12, fontWeight: 700, color: "#10B981", marginBottom: 2, display: "block" },
  pre: {
    background: "#060D18",
    border: "1px solid #1E293B",
    borderRadius: 6,
    padding: 12,
    fontSize: 11,
    color: "#94A3B8",
    whiteSpace: "pre-wrap",
    overflowX: "auto",
    marginTop: 12
  },
  toast: {
    position: "fixed",
    top: 20,
    right: 20,
    background: "#0F172A",
    border: "1px solid #334155",
    borderRadius: 8,
    padding: "12px 18px",
    fontSize: 13,
    color: "#E2E8F0",
    zIndex: 200,
    boxShadow: "0 4px 24px rgba(0,0,0,0.5)"
  },
  emptyState: { color: "#475569", fontSize: 14, padding: "32px 0" }
};

const STATE_COLORS = {
  draft: { background: "#1E293B", color: "#94A3B8" },
  active: { background: "#0F2744", color: "#7DD3FC" },
  archived: { background: "#1E293B", color: "#475569" }
};

function InstantiateModal({ blueprint, onClose, onInstantiate }) {
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!clientId.trim() || !clientName.trim()) return;
    setLoading(true);
    const res = await onInstantiate(blueprint.id, { clientId: clientId.trim(), clientName: clientName.trim() });
    setResult(res);
    setLoading(false);
  }

  return (
    <div style={S.modal} onClick={onClose}>
      <div style={S.modalPanel} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 16px 0", color: "#F1F5F9", fontSize: 17 }}>
          Set Up Client Workspace
        </h3>
        <p style={{ fontSize: 13, color: "#64748B", marginBottom: 20 }}>
          Blueprint: <strong style={{ color: "#10B981" }}>{blueprint.name}</strong>
          <br />
          This will start onboarding tasks for this client.
        </p>

        {!result ? (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={S.label}>Client ID *</label>
              <input
                style={S.input}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="e.g. acme-plumbing"
                required
              />
            </div>
            <div>
              <label style={S.label}>Client Name *</label>
              <input
                style={S.input}
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Acme Plumbing Co."
                required
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" style={S.primaryBtn} disabled={loading}>
                {loading ? "Creating…" : "Create Onboarding Session"}
              </button>
              <button type="button" style={S.secondaryBtn} onClick={onClose}>Cancel</button>
            </div>
          </form>
        ) : (
          <div>
            {result.ok ? (
              <>
                <div style={{ color: "#86EFAC", fontSize: 14, marginBottom: 12 }}>
                  ✓ Onboarding session created for <strong>{clientName}</strong>.
                  {result._localOnly ? " (saved locally)" : ""}
                </div>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 16 }}>
                  Session ID: {result.session?.id}
                </div>
                <pre style={S.pre}>{
                  `Tasks (${result.session?.tasks?.length || 0}):\n` +
                  (result.session?.tasks || []).map((t, i) => `  ${i + 1}. ${t.title}`).join("\n")
                }</pre>
                <button type="button" style={{ ...S.secondaryBtn, marginTop: 16 }} onClick={onClose}>Close</button>
              </>
            ) : (
              <>
                <div style={{ color: "#FCA5A5", fontSize: 14, marginBottom: 12 }}>
                  Error: {result.errors?.join(", ")}
                </div>
                <button type="button" style={S.secondaryBtn} onClick={onClose}>Close</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BlueprintCard({ blueprint, onInstantiate }) {
  const [showPreview, setShowPreview] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const ss = STATE_COLORS[blueprint.state] || STATE_COLORS.draft;

  return (
    <>
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={S.cardTitle}>{blueprint.name}</div>
          <span style={{ ...S.stateChip, background: ss.background, color: ss.color }}>{blueprint.state}</span>
        </div>
        <div style={S.cardMeta}>
          {blueprint.trade} · v{blueprint.version}
          {blueprint._seeded ? " · seed" : ""}
          {" · "}{blueprint.estimatedOnboardDays}d onboard
        </div>
        <div style={S.cardDesc}>{blueprint.description?.slice(0, 140) || "(No description)"}
          {(blueprint.description?.length || 0) > 140 ? "…" : ""}
        </div>

        {blueprint.agentRoster?.length > 0 && (
          <div>
            <div style={S.sectionLabel}>Agent Roster</div>
            <div>
              {blueprint.agentRoster.map((agent) => (
                <span key={agent.agentId} style={S.agentChip}>{agent.agentName}</span>
              ))}
            </div>
          </div>
        )}

        {blueprint.onboardingTasks?.length > 0 && (
          <div>
            <div style={S.sectionLabel}>Onboarding Tasks ({blueprint.onboardingTasks.length})</div>
            {blueprint.onboardingTasks
              .sort((a, b) => a.order - b.order)
              .slice(0, 3)
              .map((task) => (
                <div key={task.taskId} style={S.taskRow}>{task.order}. {task.title}</div>
              ))}
            {blueprint.onboardingTasks.length > 3 && (
              <div style={{ ...S.taskRow, color: "#475569" }}>+{blueprint.onboardingTasks.length - 3} more…</div>
            )}
          </div>
        )}

        <div style={S.actionRow}>
          <button type="button" style={S.primaryBtn} onClick={() => setShowModal(true)}>
            Instantiate Client →
          </button>
          <button type="button" style={S.secondaryBtn} onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? "Hide" : "Preview"}
          </button>
        </div>

        {showPreview && (
          <pre style={S.pre}>{blueprintToPreviewText(blueprint)}</pre>
        )}
      </div>

      {showModal && (
        <InstantiateModal
          blueprint={blueprint}
          onClose={() => setShowModal(false)}
          onInstantiate={onInstantiate}
        />
      )}
    </>
  );
}

export function BlueprintLibrary() {
  const { blueprints, loading, error, handleInstantiate } = useBlueprintLibrary();
  const [toastMsg, setToastMsg] = useState(null);

  return (
    <div style={S.page}>
      {toastMsg && <div style={S.toast}>{toastMsg}</div>}

      <div style={S.header}>
        <span style={S.badge}>TEMPLATE</span>
        <h2 style={S.title}>Agent Setup Templates</h2>
      </div>

      {loading && <div style={S.emptyState}>Loading templates...</div>}
      {error && <div style={{ ...S.emptyState, color: "#FCA5A5" }}>Error: {error}</div>}

      {!loading && !error && blueprints.length === 0 && (
        <div style={S.emptyState}>No templates found.</div>
      )}

      {!loading && !error && blueprints.length > 0 && (
        <div style={S.grid}>
          {blueprints.map((bp) => (
            <BlueprintCard key={bp.id} blueprint={bp} onInstantiate={handleInstantiate} />
          ))}
        </div>
      )}
    </div>
  );
}
