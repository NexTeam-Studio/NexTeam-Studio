import { useMemo, useState } from "react";
import { executeBragiRequest } from "../services/bragiExecutionClient.js";
import { generateBragiArticlePackage } from "../services/bragiGenerationClient.js";
import { BRAGI_UI_CONFIG, getDefaultPublishDate } from "../services/bragiUiConfig.js";

const S = {
  page: {
    minHeight: "100%",
    background: "radial-gradient(circle at top, #15203A 0%, #08111F 45%, #050B14 100%)",
    color: "#E5EEF9",
    padding: "28px 18px 40px",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
  },
  shell: { maxWidth: 860, margin: "0 auto", display: "grid", gap: 18 },
  hero: {
    background: "linear-gradient(180deg, rgba(16,24,40,0.96), rgba(8,14,27,0.96))",
    border: "1px solid rgba(125,211,252,0.18)",
    boxShadow: "0 20px 60px rgba(2,8,23,0.45)",
    borderRadius: 28,
    padding: "28px 24px",
    display: "grid",
    gap: 14,
  },
  badge: {
    width: "fit-content",
    borderRadius: 999,
    padding: "7px 12px",
    background: "rgba(14,165,233,0.14)",
    color: "#7DD3FC",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: { margin: 0, fontSize: 38, lineHeight: 1.05, fontWeight: 800, color: "#F8FAFC" },
  subtitle: { margin: 0, maxWidth: 580, color: "#B6C6DC", fontSize: 17, lineHeight: 1.6 },
  stack: { display: "grid", gap: 16 },
  questionCard: {
    background: "rgba(10,17,32,0.96)",
    border: "1px solid rgba(148,163,184,0.16)",
    borderRadius: 24,
    padding: "22px 20px",
    display: "grid",
    gap: 14,
    boxShadow: "0 14px 40px rgba(2,8,23,0.24)",
  },
  questionNumber: { margin: 0, color: "#7DD3FC", fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" },
  questionLabel: { margin: 0, color: "#F8FAFC", fontSize: 24, fontWeight: 750, lineHeight: 1.25 },
  helper: { margin: 0, color: "#8FA4BF", fontSize: 14, lineHeight: 1.6 },
  input: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 18,
    border: "1px solid rgba(148,163,184,0.24)",
    background: "#10192B",
    color: "#F8FAFC",
    padding: "18px 18px",
    fontSize: 18,
    outline: "none",
  },
  buttonRow: { display: "flex", gap: 10, flexWrap: "wrap" },
  optionBtn: {
    borderRadius: 999,
    border: "1px solid rgba(148,163,184,0.26)",
    background: "#10192B",
    color: "#D9E5F5",
    padding: "13px 16px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
  optionBtnActive: {
    background: "linear-gradient(135deg, rgba(79,70,229,0.95), rgba(14,165,233,0.95))",
    color: "#FFFFFF",
    borderColor: "rgba(125,211,252,0.65)",
    boxShadow: "0 10px 24px rgba(79,70,229,0.28)",
  },
  keywordWrap: { display: "flex", gap: 10, flexWrap: "wrap" },
  keywordTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    background: "rgba(14,165,233,0.14)",
    color: "#C7EAFE",
    borderRadius: 999,
    padding: "9px 12px",
    fontSize: 14,
    fontWeight: 700,
  },
  removeTag: { background: "transparent", border: "none", color: "#7DD3FC", cursor: "pointer", fontSize: 16 },
  ctaCard: {
    background: "linear-gradient(180deg, rgba(14,20,36,0.98), rgba(8,13,25,0.98))",
    border: "1px solid rgba(125,211,252,0.18)",
    borderRadius: 28,
    padding: "22px 20px",
    display: "grid",
    gap: 14,
  },
  primaryBtn: {
    width: "100%",
    border: "none",
    borderRadius: 20,
    background: "linear-gradient(135deg, #4F46E5, #0EA5E9)",
    color: "#FFFFFF",
    padding: "18px 20px",
    fontSize: 20,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 18px 40px rgba(59,130,246,0.28)",
  },
  progressCard: {
    background: "rgba(10,17,32,0.96)",
    border: "1px solid rgba(125,211,252,0.18)",
    borderRadius: 24,
    padding: "22px 20px",
    display: "grid",
    gap: 12,
  },
  progressBar: { height: 12, borderRadius: 999, background: "#172133", overflow: "hidden" },
  progressFill: { height: "100%", width: "76%", background: "linear-gradient(90deg, #4F46E5, #0EA5E9)" },
  previewCard: {
    background: "linear-gradient(180deg, rgba(10,17,32,0.99), rgba(6,11,20,0.99))",
    border: "1px solid rgba(148,163,184,0.16)",
    borderRadius: 28,
    padding: "24px 22px",
    display: "grid",
    gap: 16,
  },
  previewTitle: { margin: 0, color: "#F8FAFC", fontSize: 26, fontWeight: 800 },
  previewMeta: { margin: 0, color: "#8FA4BF", fontSize: 14 },
  draftText: {
    background: "rgba(2,6,15,0.9)",
    border: "1px solid rgba(30,41,59,0.9)",
    borderRadius: 22,
    padding: "20px 18px",
    whiteSpace: "pre-wrap",
    color: "#E2E8F0",
    fontSize: 16,
    lineHeight: 1.8,
  },
  editor: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 340,
    borderRadius: 22,
    border: "1px solid rgba(148,163,184,0.18)",
    background: "rgba(2,6,15,0.9)",
    color: "#E2E8F0",
    padding: "20px 18px",
    fontSize: 16,
    lineHeight: 1.8,
    outline: "none",
    resize: "vertical",
  },
  actionRow: { display: "flex", gap: 12, flexWrap: "wrap" },
  secondaryBtn: {
    flex: 1,
    minWidth: 220,
    borderRadius: 18,
    border: "1px solid rgba(148,163,184,0.24)",
    background: "#10192B",
    color: "#E2E8F0",
    padding: "16px 18px",
    fontSize: 18,
    fontWeight: 750,
    cursor: "pointer",
  },
  success: {
    background: "rgba(14,116,144,0.12)",
    border: "1px solid rgba(125,211,252,0.24)",
    borderRadius: 22,
    padding: "18px 18px",
    color: "#D9F4FF",
    lineHeight: 1.7,
    fontSize: 15,
  },
  error: {
    background: "rgba(127,29,29,0.16)",
    border: "1px solid rgba(248,113,113,0.28)",
    borderRadius: 22,
    padding: "18px 18px",
    color: "#FECACA",
    lineHeight: 1.7,
    fontSize: 15,
  },
};

function createInitialForm() {
  return {
    articleTopic: "",
    targetAudience: BRAGI_UI_CONFIG.audiences[0],
    tone: BRAGI_UI_CONFIG.tones[0],
    keywords: [],
    keywordInput: "",
    publishDate: getDefaultPublishDate(BRAGI_UI_CONFIG.defaultPublishOffsetDays),
    callToAction: BRAGI_UI_CONFIG.defaultCallToAction,
  };
}

export function BragiArticleDashboard() {
  const [form, setForm] = useState(createInitialForm());
  const [isGenerating, setIsGenerating] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [articlePackage, setArticlePackage] = useState(null);
  const [draftText, setDraftText] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  const canGenerate = useMemo(() => form.articleTopic.trim().length > 0 && form.callToAction.trim().length > 0, [form]);

  function addKeyword() {
    const value = form.keywordInput.trim();
    if (!value || form.keywords.includes(value)) return;
    setForm((current) => ({ ...current, keywords: [...current.keywords, value], keywordInput: "" }));
  }

  function removeKeyword(keyword) {
    setForm((current) => ({ ...current, keywords: current.keywords.filter((item) => item !== keyword) }));
  }

  function handleKeywordKeyDown(event) {
    if (event.key === "," || event.key === "Enter") {
      event.preventDefault();
      addKeyword();
    }
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setError("");
    setResult(null);
    try {
      const generated = await generateBragiArticlePackage(form);
      setArticlePackage(generated);
      setDraftText(generated.articleText);
      setEditing(false);
    } catch (err) {
      setError(err.message || "Could not generate the article draft.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleApprove() {
    if (!articlePackage) return;
    setIsScheduling(true);
    setError("");
    try {
      const nextPackage = {
        ...articlePackage,
        contentHtml: String(draftText || "")
          .split(/\n\s*\n/)
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => `<p>${part.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</p>`)
          .join("\n"),
        articleText: draftText,
      };
      setArticlePackage(nextPackage);
      const executionResult = await executeBragiRequest({
        id: `bragi-ui-${Date.now()}`,
        requestType: "bragi",
        page: "WordPress article draft",
        goal: "Generate and schedule a live article draft",
        nextStep: "Approve and schedule",
        notes: `Publish date requested: ${form.publishDate}`,
        change: form.articleTopic,
        articlePackage: nextPackage,
      });
      setResult(executionResult);
    } catch (err) {
      setError(err.message || "Could not schedule the article draft.");
    } finally {
      setIsScheduling(false);
    }
  }

  return (
    <div style={S.page}>
      <div style={S.shell}>
        <section style={S.hero}>
          <div style={S.badge}>Bragi by NexTeam</div>
          <h1 style={S.title}>Create a great article in one quick pass.</h1>
          <p style={S.subtitle}>Answer the questions below. Bragi handles the writing behind the scenes and brings back a clean draft for you to review.</p>
        </section>

        <div style={S.stack}>
          <section style={S.questionCard}>
            <p style={S.questionNumber}>Step 1</p>
            <p style={S.questionLabel}>{BRAGI_UI_CONFIG.labels.articleTopic}</p>
            <p style={S.helper}>Start with the main question or topic you want the article to answer.</p>
            <input style={S.input} value={form.articleTopic} placeholder={BRAGI_UI_CONFIG.placeholders.articleTopic} onChange={(event) => setForm({ ...form, articleTopic: event.target.value })} />
          </section>

          <section style={S.questionCard}>
            <p style={S.questionNumber}>Step 2</p>
            <p style={S.questionLabel}>{BRAGI_UI_CONFIG.labels.audience}</p>
            <p style={S.helper}>Pick the main reader so the article feels like it was written for them.</p>
            <div style={S.buttonRow}>
              {BRAGI_UI_CONFIG.audiences.map((option) => (
                <button key={option} type="button" style={{ ...S.optionBtn, ...(form.targetAudience === option ? S.optionBtnActive : {}) }} onClick={() => setForm({ ...form, targetAudience: option })}>{option}</button>
              ))}
            </div>
          </section>

          <section style={S.questionCard}>
            <p style={S.questionNumber}>Step 3</p>
            <p style={S.questionLabel}>{BRAGI_UI_CONFIG.labels.tone}</p>
            <p style={S.helper}>Choose the feeling you want the article to have.</p>
            <div style={S.buttonRow}>
              {BRAGI_UI_CONFIG.tones.map((option) => (
                <button key={option} type="button" style={{ ...S.optionBtn, ...(form.tone === option ? S.optionBtnActive : {}) }} onClick={() => setForm({ ...form, tone: option })}>{option}</button>
              ))}
            </div>
          </section>

          <section style={S.questionCard}>
            <p style={S.questionNumber}>Step 4</p>
            <p style={S.questionLabel}>{BRAGI_UI_CONFIG.labels.keywords}</p>
            <p style={S.helper}>Add search phrases you want included. Type one and tap enter.</p>
            <input style={S.input} value={form.keywordInput} placeholder={BRAGI_UI_CONFIG.placeholders.keywords} onChange={(event) => setForm({ ...form, keywordInput: event.target.value })} onKeyDown={handleKeywordKeyDown} onBlur={addKeyword} />
            <div style={S.keywordWrap}>
              {form.keywords.map((keyword) => (
                <span key={keyword} style={S.keywordTag}>{keyword}<button type="button" style={S.removeTag} onClick={() => removeKeyword(keyword)}>×</button></span>
              ))}
            </div>
          </section>

          <section style={S.questionCard}>
            <p style={S.questionNumber}>Step 5</p>
            <p style={S.questionLabel}>{BRAGI_UI_CONFIG.labels.publishDate}</p>
            <p style={S.helper}>Pick when this article should go live.</p>
            <input style={S.input} type="date" value={form.publishDate} onChange={(event) => setForm({ ...form, publishDate: event.target.value })} />
          </section>

          <section style={S.questionCard}>
            <p style={S.questionNumber}>Step 6</p>
            <p style={S.questionLabel}>{BRAGI_UI_CONFIG.labels.callToAction}</p>
            <p style={S.helper}>Tell readers the one thing you want them to do next.</p>
            <input style={S.input} value={form.callToAction} placeholder={BRAGI_UI_CONFIG.placeholders.callToAction} onChange={(event) => setForm({ ...form, callToAction: event.target.value })} />
          </section>
        </div>

        <section style={S.ctaCard}>
          <button type="button" style={S.primaryBtn} disabled={!canGenerate || isGenerating} onClick={handleGenerate}>{isGenerating ? "Generating your article draft..." : BRAGI_UI_CONFIG.labels.primaryAction}</button>
        </section>

        {isGenerating ? (
          <section style={S.progressCard}>
            <strong>Working on your draft...</strong>
            <p style={S.helper}>Bragi is writing, organizing, and shaping everything for you now.</p>
            <div style={S.progressBar}><div style={S.progressFill} /></div>
          </section>
        ) : null}

        {error ? <section style={S.error}>{error}</section> : null}

        {articlePackage ? (
          <section style={S.previewCard}>
            <div>
              <p style={S.questionNumber}>Draft preview</p>
              <h2 style={S.previewTitle}>{articlePackage.title}</h2>
              <p style={S.previewMeta}>Planned publish date: {form.publishDate}</p>
            </div>
            {editing ? (
              <textarea style={S.editor} value={draftText} onChange={(event) => setDraftText(event.target.value)} />
            ) : (
              <div style={S.draftText}>{draftText}</div>
            )}
            <div style={S.actionRow}>
              <button type="button" style={S.primaryBtn} onClick={handleApprove} disabled={isScheduling}>{isScheduling ? "Scheduling your draft..." : BRAGI_UI_CONFIG.labels.approveAction}</button>
              <button type="button" style={S.secondaryBtn} onClick={() => setEditing((current) => !current)}>{editing ? "Done Editing" : BRAGI_UI_CONFIG.labels.editAction}</button>
            </div>
          </section>
        ) : null}

        {result ? (
          <section style={S.success}>
            <strong>Your article draft is ready.</strong>
            <br />
            Live draft URL: {result.draftUrl}
          </section>
        ) : null}
      </div>
    </div>
  );
}
