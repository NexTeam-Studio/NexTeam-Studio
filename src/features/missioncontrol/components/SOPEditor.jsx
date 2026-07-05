/**
 * SOP Editor — create, edit, AI-draft scaffold, human-readable preview.
 * Schema-first: uses sopSchema to create/validate.
 */

import { useCallback, useState } from "react";
import { createSOP, createSOPStep, sopToPreviewText, SOP_CATEGORIES, SOP_STATES } from "../schemas/sopSchema";
import { useSOPLibrary } from "../hooks/useSOPLibrary";
import { DEFAULT_ANTHROPIC_TEXT_MODEL } from "../../../lib/anthropicModels.js";

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
    background: "linear-gradient(135deg,#0EA5E9,#0284C7)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 12,
    padding: "3px 9px",
    borderRadius: 6,
    letterSpacing: 1
  },
  title: { margin: 0, fontSize: 20, fontWeight: 700, color: "#F1F5F9" },
  form: {
    maxWidth: 720,
    display: "flex",
    flexDirection: "column",
    gap: 18
  },
  fieldset: {
    background: "#0B1120",
    border: "1px solid #1E293B",
    borderRadius: 10,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 14
  },
  label: { fontSize: 12, fontWeight: 700, color: "#7DD3FC", marginBottom: 4, display: "block" },
  input: {
    width: "100%",
    background: "#060D18",
    border: "1px solid #334155",
    borderRadius: 7,
    color: "#E2E8F0",
    padding: "10px 13px",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box"
  },
  textarea: {
    width: "100%",
    background: "#060D18",
    border: "1px solid #334155",
    borderRadius: 7,
    color: "#E2E8F0",
    padding: "10px 13px",
    fontSize: 13,
    outline: "none",
    resize: "vertical",
    minHeight: 80,
    boxSizing: "border-box"
  },
  select: {
    background: "#060D18",
    border: "1px solid #334155",
    borderRadius: 7,
    color: "#E2E8F0",
    padding: "10px 13px",
    fontSize: 13,
    outline: "none"
  },
  stepCard: {
    background: "#060D18",
    border: "1px solid #334155",
    borderRadius: 8,
    padding: 14,
    position: "relative"
  },
  stepNum: {
    fontSize: 11,
    fontWeight: 700,
    color: "#64748B",
    marginBottom: 6
  },
  removeBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    background: "transparent",
    border: "none",
    color: "#475569",
    cursor: "pointer",
    fontSize: 16
  },
  addStepBtn: {
    background: "#1E293B",
    border: "1px solid #334155",
    color: "#CBD5E1",
    borderRadius: 7,
    padding: "8px 16px",
    cursor: "pointer",
    fontSize: 13,
    alignSelf: "flex-start"
  },
  primaryBtn: {
    background: "linear-gradient(135deg,#0EA5E9,#0284C7)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "11px 22px",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 14
  },
  secondaryBtn: {
    background: "#1E293B",
    border: "1px solid #334155",
    color: "#CBD5E1",
    borderRadius: 8,
    padding: "11px 22px",
    cursor: "pointer",
    fontSize: 14
  },
  errorList: {
    background: "#2D0F0F",
    border: "1px solid #7F1D1D",
    borderRadius: 7,
    padding: "12px 16px",
    color: "#FCA5A5",
    fontSize: 13
  },
  pre: {
    background: "#0B1120",
    border: "1px solid #1E293B",
    borderRadius: 7,
    padding: 14,
    fontSize: 12,
    color: "#94A3B8",
    whiteSpace: "pre-wrap",
    overflowX: "auto"
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
  }
};

const AI_DRAFT_PROMPT_HINT =
  "Describe the playbook in plain language (e.g. 'How we handle emergency water calls from first contact to technician dispatch'). An AI draft will scaffold the steps.";

function StepEditor({ step, index, onChange, onRemove }) {
  function update(key, value) {
    onChange(index, { ...step, [key]: value });
  }

  return (
    <div style={S.stepCard}>
      <button type="button" style={S.removeBtn} onClick={() => onRemove(index)}>✕</button>
      <div style={S.stepNum}>Step {step.stepNumber}</div>
      <label style={S.label}>Title *</label>
      <input
        style={S.input}
        value={step.title}
        onChange={(e) => update("title", e.target.value)}
        placeholder="Step title"
      />
      <label style={{ ...S.label, marginTop: 10 }}>Description</label>
      <textarea
        style={S.textarea}
        value={step.description}
        onChange={(e) => update("description", e.target.value)}
        placeholder="What happens in this step?"
        rows={2}
      />
      <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        <div>
          <label style={S.label}>Assigned Agent</label>
          <input
            style={{ ...S.input, width: 160 }}
            value={step.assignedAgent || ""}
            onChange={(e) => update("assignedAgent", e.target.value || null)}
            placeholder="e.g. Heimdall"
          />
        </div>
        <div>
          <label style={S.label}>Est. Minutes</label>
          <input
            style={{ ...S.input, width: 100 }}
            type="number"
            min="0"
            value={step.estimatedMinutes ?? ""}
            onChange={(e) => update("estimatedMinutes", e.target.value ? Number(e.target.value) : null)}
          />
        </div>
        <div>
          <label style={S.label}>Gating Condition</label>
          <input
            style={{ ...S.input, width: 220 }}
            value={step.gatingCondition || ""}
            onChange={(e) => update("gatingCondition", e.target.value || null)}
            placeholder="e.g. test-email-confirmed"
          />
        </div>
      </div>
    </div>
  );
}

export function SOPEditor({ existingSOP = null, onSaved, onCancel }) {
  const { handleCreate, handleUpdate } = useSOPLibrary();
  const isEdit = !!existingSOP;

  const [draft, setDraft] = useState(() => {
    if (existingSOP) {
      return { ...existingSOP };
    }
    return createSOP({
      category: "intake",
      state: SOP_STATES.DRAFT
    });
  });

  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiDrafting, setAiDrafting] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  function showToast(msg) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  }

  function updateField(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function addStep() {
    setDraft((prev) => ({
      ...prev,
      steps: [
        ...(prev.steps || []),
        createSOPStep({ stepNumber: (prev.steps?.length || 0) + 1 })
      ]
    }));
  }

  function updateStep(index, updated) {
    setDraft((prev) => {
      const steps = [...(prev.steps || [])];
      steps[index] = updated;
      return { ...prev, steps };
    });
  }

  function removeStep(index) {
    setDraft((prev) => {
      const steps = (prev.steps || []).filter((_, i) => i !== index).map((s, i) => ({ ...s, stepNumber: i + 1 }));
      return { ...prev, steps };
    });
  }

  const handleAIDraft = useCallback(async () => {
    if (!aiPrompt.trim()) return;
    setAiDrafting(true);
    setAiError(null);

    try {
      const response = await fetch("/api/anthropic/v1/messages", {
        method: "POST",
        headers: { "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: DEFAULT_ANTHROPIC_TEXT_MODEL,
          max_tokens: 1024,
          system: `You are an SOP writing assistant for a field service business. 
Given a plain-language description, respond ONLY with valid JSON for an SOP object with these fields:
- title: string
- description: string  
- category: one of ${JSON.stringify(SOP_CATEGORIES)}
- steps: array of { stepNumber, title, description, assignedAgent (string or null), estimatedMinutes (number or null) }
- tags: string[]
No extra text. Just the JSON object.`,
          messages: [{ role: "user", content: `Create an SOP for: ${aiPrompt}` }]
        })
      });

      const data = await response.json();
      const text = data?.content?.[0]?.text;
      if (!text) throw new Error("Empty response from Claude.");

      const parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim());
      setDraft((prev) => ({
        ...prev,
        title: parsed.title || prev.title,
        description: parsed.description || prev.description,
        category: parsed.category || prev.category,
        steps: (parsed.steps || []).map((step, idx) => createSOPStep({ ...step, stepNumber: idx + 1 })),
        tags: parsed.tags || prev.tags,
        aiDraftPath: true
      }));
      showToast("AI draft applied. Review and edit before saving.");
    } catch (err) {
      setAiError(`AI draft failed: ${err.message}`);
    } finally {
      setAiDrafting(false);
    }
  }, [aiPrompt]);

  async function handleSave() {
    setSaving(true);
    setErrors([]);

    let result;
    if (isEdit) {
      result = await handleUpdate(draft.id, draft);
    } else {
      result = await handleCreate(draft);
    }

    setSaving(false);

    if (result.ok) {
      showToast(isEdit ? "SOP updated." : "SOP created.");
      if (typeof onSaved === "function") onSaved(result.id || draft.id);
    } else {
      setErrors(result.errors || ["Unknown error."]);
    }
  }

  const preview = sopToPreviewText(draft);

  return (
    <div style={S.page}>
      {toastMsg && <div style={S.toast}>{toastMsg}</div>}

      <div style={S.header}>
        <span style={S.badge}>PLAYBOOK</span>
        <h2 style={S.title}>{isEdit ? `Edit: ${draft.title || "Untitled"}` : "New Playbook"}</h2>
      </div>

      <div style={S.form}>
        {/* Basic Info */}
        <div style={S.fieldset}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#7DD3FC", marginBottom: 4 }}>Basic Info</div>

          <div>
            <label style={S.label}>Title *</label>
            <input
              style={S.input}
              value={draft.title}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="e.g. New Customer Intake"
            />
          </div>
          <div>
            <label style={S.label}>Description</label>
            <textarea
              style={S.textarea}
              value={draft.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="What does this playbook accomplish?"
              rows={3}
            />
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div>
              <label style={S.label}>Category</label>
              <select style={S.select} value={draft.category} onChange={(e) => updateField("category", e.target.value)}>
                {SOP_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={S.label}>Tags (comma-separated)</label>
            <input
              style={S.input}
              value={(draft.tags || []).join(", ")}
              onChange={(e) =>
                updateField("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))
              }
              placeholder="intake, customer, urgent"
            />
          </div>
        </div>

        {/* AI Draft Scaffold */}
        <div style={S.fieldset}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#7DD3FC", marginBottom: 4 }}>
            ⚡ AI-Assisted Draft
          </div>
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>{AI_DRAFT_PROMPT_HINT}</div>
          <textarea
            style={S.textarea}
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Describe what the SOP should cover..."
            rows={2}
          />
          {aiError && <div style={{ color: "#FCA5A5", fontSize: 12 }}>{aiError}</div>}
          <button
            type="button"
            style={{ ...S.addStepBtn, background: "#0F2744", color: "#7DD3FC", borderColor: "#0EA5E9" }}
            onClick={handleAIDraft}
            disabled={aiDrafting || !aiPrompt.trim()}
          >
            {aiDrafting ? "Drafting…" : "Generate AI Draft"}
          </button>
        </div>

        {/* Steps */}
        <div style={S.fieldset}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#7DD3FC", marginBottom: 4 }}>
            Steps ({draft.steps?.length || 0})
          </div>
          {(draft.steps || []).map((step, idx) => (
            <StepEditor
              key={idx}
              step={step}
              index={idx}
              onChange={updateStep}
              onRemove={removeStep}
            />
          ))}
          <button type="button" style={S.addStepBtn} onClick={addStep}>
            + Add Step
          </button>
        </div>

        {/* Preview */}
        <div style={S.fieldset}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#7DD3FC" }}>Human-Readable Preview</div>
            <button type="button" style={S.addStepBtn} onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? "Hide" : "Show"} Preview
            </button>
          </div>
          {showPreview && <pre style={S.pre}>{preview}</pre>}
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div style={S.errorList}>
            <strong>Validation errors:</strong>
            <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
              {errors.map((err, idx) => <li key={idx}>{err}</li>)}
            </ul>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button type="button" style={S.primaryBtn} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Update Playbook" : "Create Playbook"}
          </button>
          {typeof onCancel === "function" && (
            <button type="button" style={S.secondaryBtn} onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
