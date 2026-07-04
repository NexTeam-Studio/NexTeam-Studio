import { useEffect, useState } from "react";
import { ensurePublicFirebaseSession } from "../services/firebaseTenantAuthService.js";

const styles = {
  shell: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0A0A14",
    color: "#E2E8F0",
    fontFamily: "system-ui, sans-serif",
    padding: 24,
  },
  card: {
    maxWidth: 560,
    background: "#111827",
    border: "1px solid rgba(148, 163, 184, 0.25)",
    borderRadius: 16,
    padding: 24,
  },
  title: {
    margin: "0 0 12px",
    fontSize: 24,
  },
  copy: {
    margin: 0,
    color: "#CBD5E1",
    lineHeight: 1.6,
  },
};

export function FirebaseTenantAccessBootstrap({ children }) {
  const [state, setState] = useState({
    ready: false,
    error: "",
  });

  useEffect(() => {
    let active = true;

    ensurePublicFirebaseSession()
      .then(() => {
        if (active) {
          setState({ ready: true, error: "" });
        }
      })
      .catch((error) => {
        console.error("[firebase-tenant-bootstrap] error:", error.message);
        if (active) {
          setState({
            ready: false,
            error: String(error?.message || "Firebase tenant bootstrap failed."),
          });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (state.ready) {
    return children;
  }

  return (
    <div style={styles.shell}>
      <div style={styles.card}>
        <h1 style={styles.title}>Securing Firestore session…</h1>
        <p style={styles.copy}>
          {state.error
            ? `Firebase access bootstrap failed: ${state.error}`
            : "Preparing a verified Firebase session so tenant-scoped Firestore access can load safely."}
        </p>
      </div>
    </div>
  );
}
