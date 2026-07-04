/**
 * SOP Library — browse, search, filter, view, state-manage, duplicate SOPs.
 */

import { useState } from "react";
import { useSOPLibrary } from "../hooks/useSOPLibrary";
import { SOP_STATES, SOP_CATEGORIES } from "../schemas/sopSchema";

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
    marginBottom: 20,
    flexWrap: "wrap"
  },
  badge: {
    background: "linear-gradient(135deg,#0EA5E9,#0284C7)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 12,
    padding: "3px 9px",
    borderRadius: 6,
    letterSpacing: 1
  },
  title: { margin: 0, fontSize: 20, fontWeight: 700, color: "#F1F5F9" },
  controls: {
    display: "flex",
    gap: 10,
    marginBottom: 20,
    flexWrap: "wrap",
    alignItems: "center"
  },
  input: {
    flex: "1 1 240px",
    maxWidth: 400,
    background: "#0B1120",
    border: "1px solid #334155",
    borderRadius: 8,
    color: "#E2E8F0",
    padding: "9px 13px",
    fontSize: 14,
    outline: "none"
  },
  select: {
    background: "#0B1120",
    border: "1px solid #334155",
    borderRadius: 8,
    color: "#E2E8F0",
    padding: "9px 13px",
    fontSize: 13,
    outline: "none",
    cursor: "pointer"
  },
  primaryBtn: {
    background: "linear-gradient(135deg,#0EA5E9,#0284C7)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "9px 18px",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 13
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px,1fr))",
    gap: 14
  },
  card: {
    background: "#0B1120",
    border: "1px solid #1E293B",
    borderRadius: 12,
    padding: 18,
    cursor: "pointer",
    transition: "border-color 0.15s"
  },
  cardTitle: { fontSize: 15, fontWeight: 700, color: "#F1F5F9", marginBottom: 6 },
  cardMeta: { fontSize: 12, color: "#64748B", marginBottom: 8 },
  cardDesc: { fontSize: 13, color: "#94A3B8", lineHeight: 1.5, marginBottom: 12 },
  tagRow: { display: "flex", flexWrap: "wrap", gap: 5 },
  tag: {
    background: "#1E293B",
    color: "#94A3B8",
    fontSize: 11,
    padding: "2px 7px",
    borderRadius: 4
  },
  stateChip: {
    display: "inline-block",
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 4,
    marginLeft: 6
  },
  actionRow: {
    display: "flex",
    gap: 6,
    marginTop: 12,
    flexWrap: "wrap"
  },
  actionBtn: {
    background: "#1E293B",
    border: "1px solid #334155",
    color: "#CBD5E1",
    borderRadius: 6,
    padding: "5px 12px",
    cursor: "pointer",
    fontSize: 12
  },
  detailOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    zIndex: 100,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  detailPanel: {
    background: "#0B1120",
    border: "1px solid #1E293B",
    borderRadius: 14,
    padding: 28,
    maxWidth: 680,
    width: "100%",
    maxHeight: "90vh",
    overflowY: "auto"
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "#64748B",
    cursor: "pointer",
    fontSize: 18,
    float: "right"
  },
  pre: {
    background: "#060D18",
    border: "1px solid #1E293B",
    borderRadius: 6,
    padding: 12,
    fontSize: 12,
    color: "#94A3B8",
    whiteSpace: "pre-wrap",
    marginTop: 12,
    overflowX: "auto"
  },
  emptyState: { color: "#475569", fontSize: 14, padding: "32px 0" }
};

const STATE_COLORS = {
  draft: { background: "#1E293B", color: "#94A3B8" },
  review: { background: "#1C2A14", color: "#86EFAC" },
  approved: { background: "#0F2744", color: "#7DD3FC" },
  archived: { background: "#1E293B", color: "#475569" }
};

function stateStyle(state) {
  return STATE_COLORS[state] || STATE_COLORS.draft;
}

function SOPCard({ sop, onSelect, onTransition, onDuplicate }) {
  const ss = stateStyle(sop.state);
  return (
    <div style={S.card} onClick={() => onSelect(sop)}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={S.cardTitle}>{sop.title}</div>
        <span style={{ ...S.stateChip, background: ss.background, color: ss.color }}>{sop.state}</span>
      </div>
      <div style={S.cardMeta}>
        {sop.category} · v{sop.version}
      </div>
      <div style={S.cardDesc}>{sop.description?.slice(0, 120) || "(No description)"}{(sop.description?.length || 0) > 120 ? "…" : ""}</div>
      {sop.tags?.length > 0 && (
        <div style={S.tagRow}>
          {sop.tags.map((tag) => <span key={tag} style={S.tag}>{tag}</span>)}
        </div>
      )}
      <div style={S.actionRow} onClick={(e) => e.stopPropagation()}>
        {sop.state === "draft" && (
          <button type="button" style={S.actionBtn} onClick={() => onTransition(sop.id, "submit")}>
            Submit for Review
          </button>
        )}
        {sop.state === "review" && (
          <>
            <button type="button" style={{ ...S.actionBtn, color: "#86EFAC" }} onClick={() => onTransition(sop.id, "approve")}>
              Approve
            </button>
            <button type="button" style={S.actionBtn} onClick={() => onTransition(sop.id, "revert")}>
              Revert to Draft
            </button>
          </>
        )}
        {sop.state === "approved" && (
          <button type="button" style={S.actionBtn} onClick={() => onTransition(sop.id, "archive")}>
            Archive
          </button>
        )}
        <button type="button" style={S.actionBtn} onClick={() => onDuplicate(sop.id)}>
          Duplicate
        </button>
      </div>
    </div>
  );
}

function SOPDetail({ sop, onClose, onTransition }) {
  const [showPreview, setShowPreview] = useState(false);
  if (!sop) return null;
  return (
    <div style={S.detailOverlay} onClick={onClose}>
      <div style={S.detailPanel} onClick={(e) => e.stopPropagation()}>
        <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        <div style={{ ...S.badge, display: "inline-block", marginBottom: 14 }}>PLAYBOOK</div>
        <h2 style={{ ...S.title, marginBottom: 6 }}>{sop.title}</h2>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 16 }}>
          {sop.category} · State: {sop.state} · Version {sop.version}
         
        </div>
        <p style={{ fontSize: 14, color: "#94A3B8", lineHeight: 1.6, marginBottom: 16 }}>{sop.description}</p>

        {sop.steps?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#7DD3FC", marginBottom: 10 }}>Steps ({sop.steps.length})</div>
            {sop.steps.map((step) => (
              <div key={step.stepNumber} style={{ marginBottom: 12, paddingLeft: 12, borderLeft: "2px solid #1E293B" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#E2E8F0" }}>
                  {step.stepNumber}. {step.title}
                </div>
                {step.description && (
                  <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{step.description}</div>
                )}
                <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>
                  {step.assignedAgent && <span>Agent: {step.assignedAgent} · </span>}
                  {step.estimatedMinutes != null && <span>Est: {step.estimatedMinutes} min · </span>}
                  {step.gatingCondition && <span>Gate: {step.gatingCondition}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {sop.revisionHistory?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#7DD3FC", marginBottom: 8 }}>Revision History</div>
            {sop.revisionHistory.map((rev, idx) => (
              <div key={idx} style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>
                v{rev.version} · {rev.updatedBy} · {rev.note}
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          style={{ ...S.actionBtn, marginBottom: 16 }}
          onClick={() => setShowPreview((v) => !v)}
        >
          {showPreview ? "Hide" : "Show"} Human-Readable Preview
        </button>

        {showPreview && (
          <pre style={S.pre}>{sop.humanReadablePreview || "(No preview available)"}</pre>
        )}
      </div>
    </div>
  );
}

export function SOPLibrary({ onCreateNew }) {
  const {
    sops,
    loading,
    error,
    filterState,
    filterCategory,
    searchQuery,
    setFilterState,
    setFilterCategory,
    setSearchQuery,
    handleTransition,
    handleDuplicate
  } = useSOPLibrary();

  const [selectedSOP, setSelectedSOP] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  function showToast(msg) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  }

  async function handleTransitionWithFeedback(sopId, action) {
    const result = await handleTransition(sopId, action);
    if (result.ok) showToast(`Playbook ${action} successful.`);
    else showToast(`Error: ${result.errors?.join(", ")}`);
  }

  async function handleDuplicateWithFeedback(sopId) {
    const result = await handleDuplicate(sopId);
    if (result.ok) showToast("Playbook duplicated successfully.");
    else showToast(`Error: ${result.errors?.join(", ")}`);
  }

  return (
    <div style={S.page}>
      {toastMsg && (
        <div style={{
          position: "fixed", top: 20, right: 20, background: "#0F172A",
          border: "1px solid #334155", borderRadius: 8, padding: "12px 18px",
          fontSize: 13, color: "#E2E8F0", zIndex: 200, boxShadow: "0 4px 24px rgba(0,0,0,0.5)"
        }}>
          {toastMsg}
        </div>
      )}

      <div style={S.header}>
        <span style={S.badge}>PLAYBOOK</span>
        <h2 style={S.title}>Playbooks</h2>
        {typeof onCreateNew === "function" && (
          <button type="button" style={{ ...S.primaryBtn, marginLeft: "auto" }} onClick={onCreateNew}>
            + New Playbook
          </button>
        )}
      </div>

      <div style={S.controls}>
        <input
          style={S.input}
          placeholder="Search by title, tag, category..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          style={S.select}
          value={filterState || ""}
          onChange={(e) => setFilterState(e.target.value || null)}
        >
          <option value="">All States</option>
          {Object.values(SOP_STATES).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          style={S.select}
          value={filterCategory || ""}
          onChange={(e) => setFilterCategory(e.target.value || null)}
        >
          <option value="">All Categories</option>
          {SOP_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {loading && <div style={S.emptyState}>Loading playbooks...</div>}
      {error && <div style={{ ...S.emptyState, color: "#FCA5A5" }}>Error: {error}</div>}

      {!loading && !error && sops.length === 0 && (
        <div style={S.emptyState}>No playbooks found. Create your first playbook to get started.</div>
      )}

      {!loading && !error && sops.length > 0 && (
        <div style={S.grid}>
          {sops.map((sop) => (
            <SOPCard
              key={sop.id}
              sop={sop}
              onSelect={setSelectedSOP}
              onTransition={handleTransitionWithFeedback}
              onDuplicate={handleDuplicateWithFeedback}
            />
          ))}
        </div>
      )}

      {selectedSOP && (
        <SOPDetail
          sop={selectedSOP}
          onClose={() => setSelectedSOP(null)}
          onTransition={handleTransitionWithFeedback}
        />
      )}
    </div>
  );
}
