import { useEffect, useState } from "react";
import { fetchAgentSessions } from "../services/adminfirestore.js";

const SPEC_FIELDS = [
  "businessName",
  "industry",
  "services",
  "teamSize",
  "location",
  "challenges",
  "currentTools",
  "goals"
];

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0D1117",
    color: "#E6EDF3",
    fontFamily: "system-ui, sans-serif",
    padding: "32px 24px"
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 32,
    borderBottom: "1px solid #21262D",
    paddingBottom: 16
  },

  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: "#E6EDF3"
  },
  brand: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 3,
    textTransform: "uppercase",
    color: "#4F46E5"
  },
  refreshBtn: {
    background: "transparent",
    border: "1px solid #30363D",
    color: "#8B949E",
    borderRadius: 6,
    padding: "6px 14px",
    fontSize: 13,
    cursor: "pointer"
  },
  stats: {
    display: "flex",
    gap: 16,
    marginBottom: 28
  },
  statCard: {
    background: "#161B22",
    border: "1px solid #21262D",
    borderRadius: 8,
    padding: "12px 20px",
    minWidth: 100
  },
  statNum: {
    fontSize: 26,
    fontWeight: 700,
    margin: 0
  },
  statLabel: {
    fontSize: 12,
    color: "#8B949E",
    margin: "2px 0 0 0"
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13
  },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    color: "#8B949E",
    fontWeight: 600,
    borderBottom: "1px solid #21262D",
    whiteSpace: "nowrap"
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #161B22",
    verticalAlign: "top"
  },
  badge: (status) => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    background:
      status === "completed"
        ? "rgba(34,197,94,0.15)"
        : status === "in_progress"
          ? "rgba(59,130,246,0.15)"
          : "rgba(139,148,158,0.15)",
    color:
      status === "completed"
        ? "#22C55E"
        : status === "in_progress"
          ? "#60A5FA"
          : "#8B949E"
  }),
  specGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "2px 12px",
    fontSize: 12
  },
  specField: {
    color: "#8B949E"
  },
  specValue: {
    color: "#E6EDF3"
  },
  emptyState: {
    textAlign: "center",
    color: "#8B949E",
    padding: 48
  },
  error: {
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 8,
    padding: "12px 16px",
    color: "#F87171",
    marginBottom: 24
  }
};

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function SpecSummary({ session }) {
  const present = SPEC_FIELDS.filter((f) => session[f]);
  if (!present.length) return <span style={{ color: "#8B949E" }}>No fields yet</span>;

  return (
    <div style={styles.specGrid}>
      {present.map((f) => (
        <div key={f}>
          <span style={styles.specField}>{f}: </span>
          <span style={styles.specValue}>
            {Array.isArray(session[f]) ? session[f].join(", ") : String(session[f]).slice(0, 60)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SessionsView() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAgentSessions(50);
      setSessions(data);
    } catch (err) {
      setError(err.message || "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const completed = sessions.filter((s) => s.status === "completed").length;
  const inProgress = sessions.filter((s) => s.status === "in_progress").length;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <p style={styles.brand}>NexTeam-Studio</p>
          <h1 style={styles.title}>Lead Sessions</h1>
        </div>
        <button type="button" style={styles.refreshBtn} onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {error ? <div style={styles.error}>Error: {error}</div> : null}

      {!loading && (
        <div style={styles.stats}>
          <div style={styles.statCard}>
            <p style={{ ...styles.statNum, color: "#E6EDF3" }}>{sessions.length}</p>
            <p style={styles.statLabel}>Total Sessions</p>
          </div>
          <div style={styles.statCard}>
            <p style={{ ...styles.statNum, color: "#22C55E" }}>{completed}</p>
            <p style={styles.statLabel}>Completed</p>
          </div>
          <div style={styles.statCard}>
            <p style={{ ...styles.statNum, color: "#60A5FA" }}>{inProgress}</p>
            <p style={styles.statLabel}>In Progress</p>
          </div>
        </div>
      )}

      {loading ? (
        <div style={styles.emptyState}>Loading sessions...</div>
      ) : sessions.length === 0 ? (
        <div style={styles.emptyState}>No sessions yet. Start a conversation to see data here.</div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Business</th>
              <th style={styles.th}>Tenant</th>
              <th style={styles.th}>Stage</th>
              <th style={styles.th}>Spec Summary</th>
              <th style={styles.th}>Started</th>
              <th style={styles.th}>Updated</th>
              <th style={styles.th}>Session ID</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td style={styles.td}>
                  <span style={styles.badge(s.status)}>{s.status ?? "unknown"}</span>
                </td>
                <td style={{ ...styles.td, fontWeight: 600 }}>{s.businessName ?? "—"}</td>
                <td style={{ ...styles.td, color: "#8B949E", fontSize: 11, fontFamily: "monospace" }}>{s.tenantId ?? "—"}</td>
                <td style={{ ...styles.td, color: "#8B949E" }}>{s.stage ?? "—"}</td>
                <td style={styles.td}>
                  <SpecSummary session={s} />
                </td>
                <td style={{ ...styles.td, color: "#8B949E", whiteSpace: "nowrap" }}>
                  {formatDate(s.createdAt)}
                </td>
                <td style={{ ...styles.td, color: "#8B949E", whiteSpace: "nowrap" }}>
                  {formatDate(s.updatedAt)}
                </td>
                <td style={{ ...styles.td, color: "#6E7681", fontSize: 11, fontFamily: "monospace" }}>
                  {(s.sessionId?.slice(0, 8) ?? s.id?.slice(0, 8)) + "..."}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
