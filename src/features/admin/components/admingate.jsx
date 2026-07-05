import { onIdTokenChanged } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { auth } from "../../../firebase.js";
import { getRuntimeConfigValue } from "../../../runtimeConfig.js";
import { PLATFORM_OPERATOR_ROLES } from "../../tenancy/services/tenantAccessPolicy.js";
import {
  loadFirebaseActorProfile,
  signInFirebaseOperator,
  signOutFirebaseSession,
} from "../../auth/services/firebaseTenantAuthService.js";

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0D1117",
    color: "#E6EDF3",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: 460,
    background: "#161B22",
    border: "1px solid #21262D",
    borderRadius: 14,
    padding: 24,
    boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
  },
  brand: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 3,
    textTransform: "uppercase",
    color: "#4F46E5",
    margin: "0 0 12px 0",
  },
  title: {
    margin: "0 0 10px 0",
    fontSize: 24,
  },
  copy: {
    margin: "0 0 16px 0",
    color: "#8B949E",
    lineHeight: 1.5,
    fontSize: 14,
  },
  input: {
    width: "100%",
    borderRadius: 10,
    border: "1px solid #30363D",
    background: "#0D1117",
    color: "#E6EDF3",
    padding: "12px 14px",
    marginBottom: 12,
    boxSizing: "border-box",
  },
  button: {
    width: "100%",
    border: "none",
    borderRadius: 10,
    padding: "12px 14px",
    background: "linear-gradient(135deg, #4F46E5, #7C3AED)",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    width: "100%",
    borderRadius: 10,
    padding: "12px 14px",
    background: "#0D1117",
    color: "#E6EDF3",
    border: "1px solid #30363D",
    fontWeight: 700,
    cursor: "pointer",
    transition: "background 140ms ease, border-color 140ms ease, box-shadow 140ms ease, transform 80ms ease, opacity 140ms ease",
  },
  error: {
    color: "#F87171",
    fontSize: 13,
    marginBottom: 12,
  },
  status: {
    color: "#A5B4FC",
    fontSize: 13,
    marginBottom: 12,
  },
  note: {
    marginTop: 12,
    color: "#6E7681",
    fontSize: 12,
    lineHeight: 1.5,
  },
  sessionShell: {
    minHeight: "100vh",
    background: "#0D1117",
  },
  operatorBar: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "12px 20px",
    background: "rgba(10, 10, 20, 0.95)",
    borderBottom: "1px solid rgba(99, 102, 241, 0.18)",
    backdropFilter: "blur(10px)",
    color: "#E5E7EB",
    fontFamily: "system-ui, sans-serif",
  },
  operatorMeta: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  operatorEyebrow: {
    color: "#A5B4FC",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 2,
    margin: 0,
  },
  operatorText: {
    fontSize: 13,
    margin: 0,
    color: "#CBD5E1",
  },
  signOutButton: {
    border: "1px solid rgba(148, 163, 184, 0.4)",
    borderRadius: 10,
    background: "transparent",
    color: "#E6EDF3",
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
};

export function AdminGate({ children }) {
  const firebaseOperatorGateEnabled = getRuntimeConfigValue("VITE_FIREBASE_ADMIN_AUTH_ENABLED", "true") !== "false";
  const [operatorEmail, setOperatorEmail] = useState("");
  const [operatorPassword, setOperatorPassword] = useState("");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [firebaseOperatorAuthed, setFirebaseOperatorAuthed] = useState(false);
  const [checkingFirebaseAuth, setCheckingFirebaseAuth] = useState(firebaseOperatorGateEnabled);
  const [actorProfile, setActorProfile] = useState(null);
  const [resettingFirebaseSession, setResettingFirebaseSession] = useState(false);
  const [resetButtonActive, setResetButtonActive] = useState(false);
  const isAuthed = useMemo(
    () => firebaseOperatorAuthed || !firebaseOperatorGateEnabled,
    [firebaseOperatorAuthed, firebaseOperatorGateEnabled]
  );
  const resetButtonStyle = useMemo(() => ({
    ...styles.secondaryButton,
    marginTop: 12,
    background: resetButtonActive || resettingFirebaseSession ? "rgba(79, 70, 229, 0.16)" : "#0D1117",
    borderColor: resetButtonActive || resettingFirebaseSession ? "rgba(129, 140, 248, 0.9)" : "#30363D",
    boxShadow: resetButtonActive || resettingFirebaseSession ? "0 0 0 3px rgba(99, 102, 241, 0.18)" : "none",
    transform: resetButtonActive ? "translateY(1px)" : "translateY(0)",
    opacity: resettingFirebaseSession ? 0.92 : 1,
    cursor: resettingFirebaseSession ? "progress" : "pointer",
  }), [resetButtonActive, resettingFirebaseSession]);

  useEffect(() => {
    if (!firebaseOperatorGateEnabled) {
      setCheckingFirebaseAuth(false);
      setFirebaseOperatorAuthed(false);
      setActorProfile(null);
      return undefined;
    }

    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (!user) {
        setFirebaseOperatorAuthed(false);
        setActorProfile(null);
        setCheckingFirebaseAuth(false);
        return;
      }

      try {
        const tokenResult = await user.getIdTokenResult();
        const role = String(tokenResult.claims?.role || "");
        const isOperator = PLATFORM_OPERATOR_ROLES.has(role);
        setFirebaseOperatorAuthed(isOperator);
        if (isOperator) {
          const profile = await loadFirebaseActorProfile();
          setActorProfile(profile || {
            email: user.email || "",
            claims: {
              tenantId: tokenResult.claims?.tenantId || null,
              role,
            },
          });
        } else {
          setActorProfile(null);
        }
      } catch (authError) {
        console.error("[AdminGate] token inspection failed:", authError.message);
        setFirebaseOperatorAuthed(false);
        setActorProfile(null);
      } finally {
        setCheckingFirebaseAuth(false);
      }
    });

    return unsubscribe;
  }, [firebaseOperatorGateEnabled]);

  if (isAuthed) {
    return (
      <div style={styles.sessionShell}>
        <div style={styles.operatorBar}>
          <div style={styles.operatorMeta}>
            <p style={styles.operatorEyebrow}>Operator Session</p>
            <p style={styles.operatorText}>
              {actorProfile?.email || auth.currentUser?.email || "Authenticated"} · tenant{" "}
              {actorProfile?.claims?.tenantId || "unknown"} · role {actorProfile?.claims?.role || "unknown"}
            </p>
          </div>
          {firebaseOperatorGateEnabled ? (
            <button
              type="button"
              style={styles.signOutButton}
              onClick={() => {
                setError("");
                signOutFirebaseSession().catch((authError) => {
                  setError(String(authError?.message || "Failed to sign out."));
                });
              }}
            >
              Sign Out
            </button>
          ) : null}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <p style={styles.brand}>NexTeam-Studio</p>
        <h1 style={styles.title}>Operator Access</h1>
        <p style={styles.copy}>
          This surface now requires a real Firebase operator account with server-issued platform claims. Legacy client-side password fallback is disabled.
        </p>
        {error ? <div style={styles.error}>{error}</div> : null}
        {statusMessage ? <div style={styles.status}>{statusMessage}</div> : null}

        {firebaseOperatorGateEnabled ? (
          <>
            <input
              type="email"
              value={operatorEmail}
              onChange={(event) => {
                setOperatorEmail(event.target.value);
                setStatusMessage("");
              }}
              placeholder="Operator email"
              autoComplete="username"
              style={styles.input}
            />
            <input
              type="password"
              value={operatorPassword}
              onChange={(event) => {
                setOperatorPassword(event.target.value);
                setStatusMessage("");
              }}
              placeholder="Operator password"
              autoComplete="current-password"
              style={styles.input}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  setError("");
                  setStatusMessage("");
                  signInFirebaseOperator({ email: operatorEmail, password: operatorPassword })
                    .then(() => {
                      setFirebaseOperatorAuthed(true);
                    })
                    .catch((authError) => {
                      setError(String(authError?.message || "Firebase operator sign-in failed."));
                    });
                }
              }}
            />
            <button
              type="button"
              style={styles.button}
              disabled={checkingFirebaseAuth}
              onClick={() => {
                setError("");
                setStatusMessage("");
                signInFirebaseOperator({ email: operatorEmail, password: operatorPassword })
                  .then(() => {
                    setFirebaseOperatorAuthed(true);
                  })
                  .catch((authError) => {
                    setError(String(authError?.message || "Firebase operator sign-in failed."));
                  });
              }}
            >
              {checkingFirebaseAuth ? "Checking operator session..." : "Sign In as Operator"}
            </button>
            <p style={styles.note}>
              The browser session is Firebase-backed, and the server verifies the platform role claim before protected admin surfaces load.
            </p>
            <button
              type="button"
              style={resetButtonStyle}
              disabled={resettingFirebaseSession}
              onMouseDown={() => setResetButtonActive(true)}
              onMouseUp={() => setResetButtonActive(false)}
              onMouseLeave={() => setResetButtonActive(false)}
              onBlur={() => setResetButtonActive(false)}
              onClick={async () => {
                setError("");
                setStatusMessage("");
                setResettingFirebaseSession(true);
                setResetButtonActive(true);
                try {
                  await signOutFirebaseSession();
                  setStatusMessage("Firebase session cleared. Sign in again to refresh operator claims.");
                } catch (authError) {
                  setError(String(authError?.message || "Failed to clear Firebase session."));
                } finally {
                  setResettingFirebaseSession(false);
                  setResetButtonActive(false);
                }
              }}
            >
              {resettingFirebaseSession ? "Resetting Firebase Session..." : "Reset Firebase Session"}
            </button>
          </>
        ) : (
          <p style={styles.note}>Firebase operator auth is disabled for this build.</p>
        )}
      </div>
    </div>
  );
}
