import { useMemo, useState } from "react";
import { sendNexiV1Question } from "../services/nexiJobDeskClient.js";

function createConversationId() {
  return `nexi-v1-${crypto.randomUUID()}`;
}

function getStoredConversationId() {
  const existing = window.localStorage.getItem("nexi-v1-conversation-id");
  if (existing) {
    return existing;
  }
  const created = createConversationId();
  window.localStorage.setItem("nexi-v1-conversation-id", created);
  return created;
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #07111f 0%, #0d1f2d 100%)",
    color: "#e2e8f0",
    padding: "24px 16px 48px",
    fontFamily: "system-ui, sans-serif",
  },
  shell: {
    maxWidth: 980,
    margin: "0 auto",
    display: "grid",
    gap: 20,
  },
  hero: {
    border: "1px solid rgba(125, 211, 252, 0.25)",
    borderRadius: 20,
    padding: 20,
    background: "rgba(2, 6, 23, 0.72)",
  },
  title: {
    margin: 0,
    fontSize: "clamp(1.8rem, 4vw, 2.6rem)",
  },
  note: {
    margin: "10px 0 0",
    color: "#cbd5e1",
    lineHeight: 1.5,
  },
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },
  chip: {
    borderRadius: 999,
    padding: "8px 12px",
    background: "rgba(15, 23, 42, 0.9)",
    border: "1px solid rgba(148, 163, 184, 0.24)",
    fontSize: 13,
  },
  panel: {
    borderRadius: 20,
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(2, 6, 23, 0.76)",
    padding: 18,
  },
  transcript: {
    display: "grid",
    gap: 12,
    maxHeight: "48vh",
    overflowY: "auto",
    paddingRight: 6,
  },
  bubble: {
    borderRadius: 18,
    padding: 14,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
  },
  userBubble: {
    background: "rgba(14, 116, 144, 0.24)",
    border: "1px solid rgba(34, 211, 238, 0.24)",
  },
  assistantBubble: {
    background: "rgba(15, 23, 42, 0.95)",
    border: "1px solid rgba(148, 163, 184, 0.22)",
  },
  composer: {
    display: "grid",
    gap: 12,
  },
  textarea: {
    minHeight: 110,
    resize: "vertical",
    borderRadius: 16,
    border: "1px solid rgba(148, 163, 184, 0.25)",
    background: "#020617",
    color: "#f8fafc",
    padding: 14,
    font: "inherit",
  },
  buttonRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  },
  button: {
    border: "none",
    borderRadius: 999,
    padding: "12px 18px",
    background: "#06b6d4",
    color: "#082f49",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid rgba(148, 163, 184, 0.24)",
    borderRadius: 999,
    padding: "12px 18px",
    background: "transparent",
    color: "#e2e8f0",
    fontWeight: 600,
    cursor: "pointer",
  },
  photoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginTop: 14,
  },
  photoCard: {
    borderRadius: 16,
    overflow: "hidden",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "#020617",
  },
  photo: {
    display: "block",
    width: "100%",
    height: 180,
    objectFit: "cover",
    background: "#111827",
  },
  photoMeta: {
    padding: 10,
    fontSize: 12,
    color: "#cbd5e1",
  },
  error: {
    color: "#fca5a5",
    margin: 0,
    whiteSpace: "pre-wrap",
  },
};

export default function NexiJobDeskPage() {
  const [conversationId, setConversationId] = useState(() => getStoredConversationId());
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);

  const examples = useMemo(
    () => [
      "What is the pool gallonage for Camp Mikell in Toccoa GA?",
      "Show me the Camp Mikell job.",
      "Show me photos from Camp Mikell.",
      "What jobs do I have today?",
    ],
    []
  );

  async function submitQuestion(nextQuestion) {
    const trimmed = String(nextQuestion || question).trim();
    if (!trimmed || isSending) {
      return;
    }

    setIsSending(true);
    setMessages((current) => [
      ...current,
      { role: "user", text: trimmed },
    ]);

    try {
      const payload = await sendNexiV1Question({
        question: trimmed,
        tenantId: "aquatrace",
        conversationId,
      });
      if (payload?.conversationId && payload.conversationId !== conversationId) {
        setConversationId(payload.conversationId);
        window.localStorage.setItem("nexi-v1-conversation-id", payload.conversationId);
      }
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: payload.answer,
          source: payload.source,
          route: payload.route,
          photos: Array.isArray(payload.photos) ? payload.photos : [],
        },
      ]);
      setQuestion("");
    } catch (requestError) {
      const payload = requestError?.payload || {};
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: String(payload?.answer || payload?.error || requestError?.message || "Nexi v1 could not complete that request.").trim(),
          source: payload?.source || "",
          route: payload?.route || null,
          photos: Array.isArray(payload?.photos) ? payload.photos : [],
          state: "blocked",
        },
      ]);
      setQuestion("");
    } finally {
      setIsSending(false);
    }
  }

  function resetConversation() {
    const nextConversationId = createConversationId();
    window.localStorage.setItem("nexi-v1-conversation-id", nextConversationId);
    setConversationId(nextConversationId);
    setMessages([]);
    setQuestion("");
  }

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <section style={styles.hero}>
          <h1 style={styles.title}>Nexi v1: Conversational Job Desk</h1>
          <p style={styles.note}>
            Read-only Aquatrace operational lookup. No consult layers, no routing menu, no write actions.
            Ask about a job, a report answer, or photos.
          </p>
          <div style={styles.chips}>
            <span style={styles.chip}>Chris-only v1</span>
            <span style={styles.chip}>Firebase auth required</span>
            <span style={styles.chip}>CompanyCam live</span>
            <span style={styles.chip}>Jobber not yet connected</span>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.buttonRow}>
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                style={styles.secondaryButton}
                onClick={() => submitQuestion(example)}
                disabled={isSending}
              >
                {example}
              </button>
            ))}
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.transcript}>
            {messages.length === 0 ? (
              <div style={{ ...styles.bubble, ...styles.assistantBubble }}>
                Ask a live Aquatrace job-data question. Unanswerable questions are logged automatically.
              </div>
            ) : null}

            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                style={{
                  ...styles.bubble,
                  ...(message.role === "user" ? styles.userBubble : styles.assistantBubble),
                }}
              >
                <strong style={{ display: "block", marginBottom: 8 }}>
                  {message.role === "user" ? "You" : "Nexi"}
                </strong>
                {message.text}
                {message.role === "assistant" && message.source ? (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#94a3b8" }}>
                    source: {message.source}
                    {message.route?.kind ? ` · route: ${message.route.kind}` : ""}
                  </div>
                ) : null}
                {Array.isArray(message.photos) && message.photos.length > 0 ? (
                  <div style={styles.photoGrid}>
                    {message.photos.map((photo) => (
                      <a
                        key={photo.id}
                        href={photo.photo_url}
                        target="_blank"
                        rel="noreferrer"
                        style={styles.photoCard}
                      >
                        <img src={photo.photo_url} alt={photo.description || `CompanyCam photo ${photo.id}`} style={styles.photo} />
                        <div style={styles.photoMeta}>
                          <div>{photo.id}</div>
                          <div>{photo.captured_at || "capture time unavailable"}</div>
                        </div>
                      </a>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.composer}>
            <textarea
              style={styles.textarea}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask Nexi about an Aquatrace job..."
            />
            <div style={styles.buttonRow}>
              <button type="button" style={styles.button} onClick={() => submitQuestion()} disabled={isSending}>
                {isSending ? "Working..." : "Ask Nexi"}
              </button>
              <button type="button" style={styles.secondaryButton} onClick={resetConversation} disabled={isSending}>
                Reset Conversation
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
