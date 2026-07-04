/**
 * MissionControlGate — Case-Study Access Control
 *
 * Wraps the Njord Mission Control in a case-study-specific acknowledgment gate.
 * Before accessing Mission Control, the operator must explicitly confirm they
 * understand this is a case-study sandbox environment (no real sends).
 *
 * This is separate from the AdminGate password layer — it's a one-time
 * in-session acknowledgment that the operator understands the sandbox rules.
 */

import { useState } from "react";
import { NJORD_CONFIG } from "../config/njordConfig.js";

const GATE_KEY = "njord_case_study_ack";

const styles = {
  overlay: {
    minHeight: "100vh",
    background: "#060D18",
    color: "#E2E8F0",
    fontFamily: "system-ui, sans-serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    maxWidth: 480,
    width: "100%",
    background: "#0B1120",
    border: "1px solid #1E293B",
    borderRadius: 14,
    padding: 28,
  },
  badge: {
    display: "inline-block",
    background: "linear-gradient(135deg, #0EA5E9, #0284C7)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 11,
    padding: "4px 10px",
    borderRadius: 6,
    letterSpacing: 1,
    marginBottom: 14,
  },
  title: {
    margin: "0 0 8px 0",
    fontSize: 22,
    fontWeight: 700,
  },
  subtitle: {
    margin: "0 0 18px 0",
    color: "#64748B",
    fontSize: 14,
    lineHeight: 1.5,
  },
  rules: {
    background: "#1C1000",
    border: "1px solid #854D0E",
    borderRadius: 8,
    padding: "12px 16px",
    marginBottom: 20,
  },
  ruleTitle: {
    color: "#FCD34D",
    fontWeight: 700,
    fontSize: 12,
    marginBottom: 8,
  },
  rule: {
    fontSize: 13,
    color: "#FDE68A",
    lineHeight: 1.6,
    margin: "4px 0",
  },
  btn: {
    width: "100%",
    background: "linear-gradient(135deg, #0EA5E9, #0284C7)",
    border: "none",
    borderRadius: 10,
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
    padding: "13px",
    cursor: "pointer",
    marginBottom: 8,
  },
  cancel: {
    textAlign: "center",
    fontSize: 12,
    color: "#475569",
    cursor: "pointer",
    marginTop: 6,
  },
};

export function MissionControlGate({ children }) {
  const [acked, setAcked] = useState(
    () => window.sessionStorage.getItem(GATE_KEY) === "true"
  );

  if (acked) return children;

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <span style={styles.badge}>NJORD · MISSION CONTROL</span>
        <h1 style={styles.title}>Aquatrace Case Study</h1>
        <p style={styles.subtitle}>
          This is <strong>NexTeam-Studio Case Study #1</strong> — a demonstration
          environment for the Njord host agent. Before continuing, please confirm
          you understand the operating rules.
        </p>
        <div style={styles.rules}>
          <div style={styles.ruleTitle}>⚠️ Case-Study Mode Rules</div>
          <div style={styles.rule}>• All campaign sends are sandbox/log-only. No real emails are delivered.</div>
          <div style={styles.rule}>• A test email must be sent and confirmed before any campaign can be approved.</div>
          <div style={styles.rule}>• Every send action requires two explicit operator confirmations.</div>
          <div style={styles.rule}>• These rules cannot be overridden via the UI in case-study mode.</div>
          <div style={styles.rule}>• This environment has no connection to any external Aquatrace systems.</div>
        </div>
        <button
          style={styles.btn}
          type="button"
          onClick={() => {
            window.sessionStorage.setItem(GATE_KEY, "true");
            setAcked(true);
          }}
        >
          I understand — Enter Mission Control
        </button>
        <div style={styles.cancel}>
          Tenant: {NJORD_CONFIG.tenantId} · Mode: case-study sandbox
        </div>
      </div>
    </div>
  );
}
