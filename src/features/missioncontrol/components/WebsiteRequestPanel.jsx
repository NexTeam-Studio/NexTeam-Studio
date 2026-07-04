import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_BRAGI_ARTICLE_PACKAGE,
  buildBragiExecutionPayload,
  executeBragiRequest,
} from "../services/bragiExecutionClient.js";

const STORAGE_KEY = "aquatrace.websiteRequests";

const REQUEST_TYPES = {
  brokk: {
    title: "Request Website Change",
    helper: "Tell Brokk what page needs work, what should change, and what you want visitors to do next.",
    submit: "Save Website Request",
  },
  bragi: {
    title: "Request Article / SEO Help",
    helper: "Tell Bragi what page or topic this is for, what the goal is, and add any links or example copy.",
    submit: "Save Content Request",
  },
};

const STATUS_OPTIONS = ["Saved", "In Review", "Planned", "Executing", "Executed", "Done", "Error"];

const styles = {
  page: { minHeight: "100%", background: "#060D18", color: "#E2E8F0", padding: "24px", fontFamily: "system-ui, -apple-system, sans-serif" },
  shell: { maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 },
  backBtn: { alignSelf: "flex-start", background: "none", border: "none", color: "#8B949E", cursor: "pointer", fontSize: 13, padding: 0 },
  card: { background: "#0B1120", border: "1px solid #1E293B", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 18 },
  label: { fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#64748B", margin: 0 },
  title: { margin: 0, fontSize: 28, fontWeight: 700, color: "#F8FAFC" },
  sectionTitle: { margin: 0, fontSize: 18, fontWeight: 700, color: "#F8FAFC" },
  copy: { margin: 0, fontSize: 14, color: "#94A3B8", lineHeight: 1.6 },
  typeRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 },
  typeBtn: { background: "#111827", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 12, padding: "14px 16px", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 6 },
  typeBtnActive: { borderColor: "#4F46E5", boxShadow: "0 0 0 1px #4F46E5 inset" },
  typeTitle: { margin: 0, fontSize: 15, fontWeight: 700 },
  typeHelper: { margin: 0, fontSize: 12, color: "#94A3B8", lineHeight: 1.5 },
  grid: { display: "grid", gap: 14 },
  field: { display: "flex", flexDirection: "column", gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: 600, color: "#E2E8F0" },
  input: { background: "#111827", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 10, padding: "12px 14px", fontSize: 14, outline: "none" },
  textarea: { background: "#111827", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 10, padding: "12px 14px", fontSize: 14, minHeight: 110, resize: "vertical", outline: "none", fontFamily: "ui-monospace, SFMono-Regular, monospace" },
  footer: { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" },
  helper: { margin: 0, fontSize: 12, color: "#64748B", lineHeight: 1.5 },
  submitBtn: { background: "#4F46E5", color: "#fff", border: "none", borderRadius: 10, padding: "12px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  secondaryBtn: { background: "#1E293B", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  executeBtn: { background: "#0EA5E9", color: "#03131E", border: "none", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  success: { background: "#0F172A", border: "1px solid #1D4ED8", borderRadius: 12, padding: 16, color: "#BFDBFE", fontSize: 13, lineHeight: 1.6 },
  toolbar: { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" },
  statusRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  filterBtn: { background: "#111827", color: "#CBD5E1", border: "1px solid #334155", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  filterBtnActive: { borderColor: "#4F46E5", color: "#FFFFFF", boxShadow: "0 0 0 1px #4F46E5 inset" },
  historyCard: { background: "#0B1120", border: "1px solid #1E293B", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 14 },
  historyItem: { borderTop: "1px solid #1E293B", paddingTop: 12, display: "grid", gap: 8 },
  historyMeta: { margin: 0, fontSize: 12, color: "#94A3B8", lineHeight: 1.5 },
  empty: { margin: 0, fontSize: 13, color: "#64748B" },
  itemFooter: { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" },
  statusSelect: { background: "#111827", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 8, padding: "8px 10px", fontSize: 12 },
  statusPill: { display: "inline-flex", alignItems: "center", width: "fit-content", padding: "4px 8px", borderRadius: 999, background: "#1E3A8A", color: "#DBEAFE", fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" },
  actions: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  code: { background: "#020617", border: "1px solid #1E293B", borderRadius: 12, padding: 12, color: "#BFDBFE", fontSize: 12, overflowX: "auto", whiteSpace: "pre-wrap" },
};

function createEmptyForm() {
  return {
    change: "",
    page: "",
    goal: "",
    nextStep: "",
    notes: "",
    articlePackageText: JSON.stringify(DEFAULT_BRAGI_ARTICLE_PACKAGE, null, 2),
  };
}

function readHistory() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseArticlePackage(text) {
  if (!text?.trim()) return DEFAULT_BRAGI_ARTICLE_PACKAGE;
  return JSON.parse(text);
}

export function WebsiteRequestPanel({ initialType = "brokk", onBack }) {
  const [requestType, setRequestType] = useState(initialType);
  const [form, setForm] = useState(createEmptyForm());
  const [saved, setSaved] = useState(null);
  const [history, setHistory] = useState([]);
  const [statusFilter, setStatusFilter] = useState("All");
  const [error, setError] = useState("");
  const [runningId, setRunningId] = useState(null);

  useEffect(() => {
    setRequestType(initialType);
    setSaved(null);
    setError("");
  }, [initialType]);

  useEffect(() => {
    setHistory(readHistory());
  }, []);

  const current = REQUEST_TYPES[requestType];
  const filteredHistory = useMemo(() => {
    const typed = history.filter((item) => item.requestType === requestType);
    if (statusFilter === "All") return typed;
    return typed.filter((item) => item.status === statusFilter);
  }, [history, requestType, statusFilter]);

  function updateField(key, value) {
    setForm((currentForm) => ({ ...currentForm, [key]: value }));
  }

  function saveHistory(nextHistory) {
    setHistory(nextHistory);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextHistory));
  }

  function upsertHistoryItem(id, patch) {
    const nextHistory = history.map((item) => (item.id === id ? { ...item, ...patch } : item));
    saveHistory(nextHistory);
  }

  function handleSubmit(event) {
    event.preventDefault();
    setError("");
    try {
      const articlePackage = requestType === "bragi" ? parseArticlePackage(form.articlePackageText) : null;
      const entry = {
        id: crypto.randomUUID(),
        requestType,
        type: current.title,
        status: "Saved",
        savedAt: new Date().toISOString(),
        executionResult: null,
        lastExecutedAt: null,
        articlePackage,
        ...form,
      };
      const nextHistory = [entry, ...history].slice(0, 20);
      saveHistory(nextHistory);
      setSaved(entry);
      setForm(createEmptyForm());
      setStatusFilter("All");
    } catch (err) {
      setError(`Could not save request: ${err.message}`);
    }
  }

  function updateStatus(id, nextStatus) {
    upsertHistoryItem(id, { status: nextStatus });
  }

  function loadDemoPackage() {
    updateField("articlePackageText", JSON.stringify(DEFAULT_BRAGI_ARTICLE_PACKAGE, null, 2));
  }

  async function handleExecute(item) {
    setError("");
    setRunningId(item.id);
    upsertHistoryItem(item.id, { status: "Executing", executionError: null });
    try {
      const result = await executeBragiRequest(item);
      upsertHistoryItem(item.id, {
        status: "Executed",
        executionResult: result,
        lastExecutedAt: new Date().toISOString(),
      });
      setSaved({ ...item, executionResult: result, status: "Executed" });
      setHistory(readHistory());
    } catch (err) {
      upsertHistoryItem(item.id, {
        status: "Error",
        executionError: err.message,
        lastExecutedAt: new Date().toISOString(),
      });
      setError(`Execution failed: ${err.message}`);
      setHistory(readHistory());
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <button type="button" style={styles.backBtn} onClick={onBack}>Back to Workspace</button>

        <div style={styles.card}>
          <p style={styles.label}>Website</p>
          <h1 style={styles.title}>Website Requests</h1>
          <p style={styles.copy}>
            Pick the kind of help you need, then fill in the request below. Bragi requests can now carry a real article package and execute directly into WordPress.
          </p>

          <div style={styles.typeRow}>
            {Object.entries(REQUEST_TYPES).map(([key, value]) => (
              <button key={key} type="button" style={{ ...styles.typeBtn, ...(requestType === key ? styles.typeBtnActive : {}) }} onClick={() => setRequestType(key)}>
                <p style={styles.typeTitle}>{value.title}</p>
                <p style={styles.typeHelper}>{value.helper}</p>
              </button>
            ))}
          </div>

          <form style={styles.grid} onSubmit={handleSubmit}>
            <div style={styles.field}>
              <label style={styles.fieldLabel}>What do you want changed?</label>
              <textarea style={styles.textarea} value={form.change} onChange={(event) => updateField("change", event.target.value)} placeholder="Example: Publish the approved pool leak article package into the Aquatrace draft path." />
            </div>

            <div style={styles.field}>
              <label style={styles.fieldLabel}>Which page is this for?</label>
              <input style={styles.input} value={form.page} onChange={(event) => updateField("page", event.target.value)} placeholder="Example: Blog post draft" />
            </div>

            <div style={styles.field}>
              <label style={styles.fieldLabel}>What is the goal?</label>
              <input style={styles.input} value={form.goal} onChange={(event) => updateField("goal", event.target.value)} placeholder="Example: Publish-ready article draft with SEO fields populated" />
            </div>

            <div style={styles.field}>
              <label style={styles.fieldLabel}>What should happen next?</label>
              <input style={styles.input} value={form.nextStep} onChange={(event) => updateField("nextStep", event.target.value)} placeholder="Example: Execute to WordPress" />
            </div>

            <div style={styles.field}>
              <label style={styles.fieldLabel}>Any notes, links, or example copy?</label>
              <textarea style={styles.textarea} value={form.notes} onChange={(event) => updateField("notes", event.target.value)} placeholder="Paste links, notes, proof requirements, or rough copy here." />
            </div>

            {requestType === "bragi" ? (
              <div style={styles.field}>
                <label style={styles.fieldLabel}>Bragi article package (JSON payload)</label>
                <textarea style={{ ...styles.textarea, minHeight: 320 }} value={form.articlePackageText} onChange={(event) => updateField("articlePackageText", event.target.value)} />
                <div style={styles.actions}>
                  <button type="button" style={styles.secondaryBtn} onClick={loadDemoPackage}>Load default Aquatrace execution package</button>
                </div>
              </div>
            ) : null}

            <div style={styles.footer}>
              <p style={styles.helper}>{current.helper} Bragi requests can now be executed through the real WordPress path.</p>
              <button type="submit" style={styles.submitBtn}>{current.submit}</button>
            </div>
          </form>

          {error ? <div style={{ ...styles.success, borderColor: "#DC2626", color: "#FCA5A5" }}>{error}</div> : null}

          {saved ? (
            <div style={styles.success}>
              <strong>{saved.type} saved.</strong><br />
              Page: {saved.page || "Not specified"}<br />
              Goal: {saved.goal || "Not specified"}<br />
              Next step: {saved.nextStep || "Not specified"}<br />
              Status: {saved.status}
              {saved.executionResult?.draftUrl ? <><br />Draft URL: {saved.executionResult.draftUrl}</> : null}
            </div>
          ) : null}
        </div>

        <div style={styles.historyCard}>
          <div style={styles.toolbar}>
            <div>
              <p style={styles.label}>Recent Requests</p>
              <h2 style={styles.sectionTitle}>Review and Status</h2>
            </div>
            <div style={styles.statusRow}>
              {["All", ...STATUS_OPTIONS].map((status) => (
                <button key={status} type="button" style={{ ...styles.filterBtn, ...(statusFilter === status ? styles.filterBtnActive : {}) }} onClick={() => setStatusFilter(status)}>{status}</button>
              ))}
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <p style={styles.empty}>No saved requests yet for this view.</p>
          ) : (
            filteredHistory.map((item) => {
              const payload = item.requestType === "bragi" ? buildBragiExecutionPayload(item) : null;
              return (
                <div key={item.id} style={styles.historyItem}>
                  <span style={styles.statusPill}>{item.status}</span>
                  <p style={styles.typeTitle}>{item.page || "Untitled request"}</p>
                  <p style={styles.historyMeta}>Goal: {item.goal || "Not specified"}</p>
                  <p style={styles.historyMeta}>Next step: {item.nextStep || "Not specified"}</p>
                  <p style={styles.historyMeta}>Notes: {item.notes || "No extra notes"}</p>
                  {item.requestType === "bragi" ? (
                    <>
                      <div style={styles.actions}>
                        <button type="button" style={styles.executeBtn} onClick={() => handleExecute(item)} disabled={runningId === item.id}>
                          {runningId === item.id ? "Executing..." : "Execute to WordPress"}
                        </button>
                      </div>
                      <div style={styles.code}>{JSON.stringify(payload, null, 2)}</div>
                    </>
                  ) : null}
                  {item.executionResult ? (
                    <div style={styles.success}>
                      <strong>Execution complete.</strong><br />
                      Draft URL: {item.executionResult.draftUrl}<br />
                      Yoast persisted: {item.executionResult.yoast?.editorVisible && Object.values(item.executionResult.yoast.editorVisible).every(Boolean) ? "Yes" : "No"}<br />
                      Comments: {item.executionResult.wordpress?.commentStatus}<br />
                      Pingbacks: {item.executionResult.wordpress?.pingStatus}
                    </div>
                  ) : null}
                  {item.executionError ? <p style={{ ...styles.historyMeta, color: "#FCA5A5" }}>Execution error: {item.executionError}</p> : null}
                  <div style={styles.itemFooter}>
                    <p style={styles.historyMeta}>Saved {new Date(item.savedAt).toLocaleString()}{item.lastExecutedAt ? ` • Last executed ${new Date(item.lastExecutedAt).toLocaleString()}` : ""}</p>
                    <select value={item.status} style={styles.statusSelect} onChange={(event) => updateStatus(item.id, event.target.value)}>
                      {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
