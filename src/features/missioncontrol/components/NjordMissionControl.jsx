/**
 * NjordMissionControl - Mission Control UI Shell
 *
 * The primary chat interface for Aquatrace.
 * Renders the Njord chat interface and response panel.
 */

import { useCallback, useRef, useState } from "react";
import { useNjordSession } from "../hooks/useNjordSession.js";
import { NJORD_CONFIG, isCaseStudyMode } from "../config/njordConfig.js";

function generateSessionId() {
  return `njord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const SESSION_ID = generateSessionId();

const styles = {
  page: {
    minHeight: "100vh",
    background: "#060D18",
    color: "#E2E8F0",
    fontFamily: "system-ui, -apple-system, sans-serif",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    padding: "16px 24px",
    borderBottom: "1px solid #1E293B",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#0B1120",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  agentBadge: {
    background: "linear-gradient(135deg, #0EA5E9, #0284C7)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 13,
    padding: "4px 10px",
    borderRadius: 6,
    letterSpacing: 1,
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: "#F1F5F9",
  },
  subtitle: {
    margin: "2px 0 0 0",
    fontSize: 12,
    color: "#64748B",
  },
  body: {
    flex: 1,
    display: "flex",
    gap: 0,
    maxWidth: 1200,
    width: "100%",
    margin: "0 auto",
    padding: "24px",
    boxSizing: "border-box",
  },
  chatCol: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minWidth: 0,
  },
  messageList: {
    flex: 1,
    overflowY: "auto",
    maxHeight: "60vh",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 16,
    background: "#0B1120",
    border: "1px solid #1E293B",
    borderRadius: 12,
  },
  bubble: {
    padding: "10px 14px",
    borderRadius: 10,
    fontSize: 14,
    lineHeight: 1.55,
    maxWidth: "80%",
  },
  userBubble: {
    alignSelf: "flex-end",
    background: "#1E40AF",
    color: "#E0F2FE",
  },
  agentBubble: {
    alignSelf: "flex-start",
    background: "#1E293B",
    color: "#CBD5E1",
    border: "1px solid #334155",
  },
  systemBubble: {
    alignSelf: "center",
    background: "transparent",
    color: "#475569",
    fontSize: 12,
    fontStyle: "italic",
    border: "none",
    padding: "4px 0",
  },
  agentLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#0EA5E9",
    marginBottom: 4,
  },
  stubTag: {
    display: "inline-block",
    background: "#1C2A14",
    color: "#86EFAC",
    fontSize: 10,
    borderRadius: 4,
    padding: "1px 5px",
    marginLeft: 6,
    verticalAlign: "middle",
  },
  composer: {
    display: "flex",
    gap: 8,
  },
  input: {
    flex: 1,
    background: "#0B1120",
    border: "1px solid #334155",
    borderRadius: 10,
    color: "#E2E8F0",
    padding: "12px 14px",
    fontSize: 14,
    outline: "none",
    resize: "none",
  },
  sendBtn: {
    background: "linear-gradient(135deg, #0EA5E9, #0284C7)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "12px 20px",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 14,
  },
  sendBtnDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
  thinking: {
    alignSelf: "flex-start",
    color: "#475569",
    fontSize: 13,
    fontStyle: "italic",
    padding: "4px 0",
  },
  voiceBtn: {
    background: "#1E293B",
    border: "1px solid #334155",
    color: "#94A3B8",
    borderRadius: 10,
    padding: "12px 16px",
    cursor: "pointer",
    fontSize: 13,
  },
};

export function NjordMissionControl() {
  const { messages, thinking, sendMessage, speakResponse } = useNjordSession(SESSION_ID);
  const [input, setInput] = useState("");
  const listRef = useRef(null);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await sendMessage(text);
    // Scroll to bottom after render
    setTimeout(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    }, 50);
  }, [input, sendMessage]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleVoiceStub = useCallback(() => {
    // Voice hook stub - wire microphone input here
    alert("Voice input is coming soon. Please type your message for now.");
  }, []);

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.agentBadge}>NJORD</span>
          <div>
            <p style={styles.title}>Aquatrace Operations</p>
            <p style={styles.subtitle}>
              {NJORD_CONFIG.brandName} · Powered by Njord
            </p>
          </div>
        </div>
        
      </div>

      {/* Body */}
      <div style={styles.body}>
        <div style={styles.chatCol}>
          {/* Message list */}
          <div style={styles.messageList} ref={listRef}>
            {messages.length === 0 && (
              <div style={{ ...styles.systemBubble, ...styles.bubble }}>
                Njord is ready. Send a message to begin your session.
              </div>
            )}
            {messages.map((msg) => {
              if (msg.role === "system") {
                return (
                  <div key={msg.id} style={{ ...styles.bubble, ...styles.systemBubble }}>
                    {msg.content}
                  </div>
                );
              }
              if (msg.role === "user") {
                return (
                  <div key={msg.id} style={{ ...styles.bubble, ...styles.userBubble }}>
                    {msg.content}
                  </div>
                );
              }
              // agent
              return (
                <div key={msg.id} style={{ ...styles.bubble, ...styles.agentBubble }}>
                  <div style={styles.agentLabel}>
                    {msg.agentName || "Njord"}
                    
                  </div>
                  {msg.content}
                </div>
              );
            })}
            {thinking && (
              <div style={styles.thinking}>Njord is thinking.</div>
            )}
          </div>

          {/* Composer */}
          <div style={styles.composer}>
            <textarea
              style={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Njord."
              rows={2}
            />
            <button
              style={styles.voiceBtn}
              type="button"
              onClick={handleVoiceStub}
              title="Voice input (stub)"
            >
              🎙️
            </button>
            <button
              style={{
                ...styles.sendBtn,
                ...(thinking || !input.trim() ? styles.sendBtnDisabled : {}),
              }}
              type="button"
              onClick={handleSend}
              disabled={thinking || !input.trim()}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
