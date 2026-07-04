import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMissionControlClients } from "../services/missionControlRegistry.js";

const styles = {
  page: {
    minHeight: "100vh",
    background: "#060D18",
    color: "#E2E8F0",
    fontFamily: "system-ui, -apple-system, sans-serif",
    padding: "32px 24px"
  },
  shell: {
    maxWidth: 1080,
    margin: "0 auto"
  },
  eyebrow: {
    color: "#38BDF8",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 10
  },
  title: {
    margin: 0,
    fontSize: 32,
    fontWeight: 700,
    color: "#F8FAFC"
  },
  subtitle: {
    margin: "10px 0 28px 0",
    color: "#94A3B8",
    maxWidth: 760,
    lineHeight: 1.6
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 18
  },
  card: {
    background: "#0B1120",
    border: "1px solid #1E293B",
    borderRadius: 16,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 12
  },
  badgeRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap"
  },
  badge: (bg, fg) => ({
    display: "inline-block",
    background: bg,
    color: fg,
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.4
  }),
  clientName: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700
  },
  meta: {
    margin: 0,
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 1.55
  },
  routeBtn: {
    marginTop: 6,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #0EA5E9, #0284C7)",
    color: "#fff",
    textDecoration: "none",
    borderRadius: 10,
    padding: "12px 14px",
    fontWeight: 700
  },
  empty: {
    padding: 28,
    borderRadius: 16,
    border: "1px dashed #334155",
    color: "#94A3B8"
  },
  error: {
    marginBottom: 20,
    background: "rgba(239,68,68,0.12)",
    border: "1px solid rgba(239,68,68,0.35)",
    borderRadius: 12,
    padding: 14,
    color: "#FCA5A5"
  }
};

function formatUpdatedAt(value) {
  if (!value) return "Not yet synced from shared registry";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function MissionControlHome() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchMissionControlClients();
        if (mounted) setClients(data);
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load Mission Control clients.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.eyebrow}>Mission Control</div>
        <h1 style={styles.title}>Client host-agent registry</h1>
        <p style={styles.subtitle}>
          Shared Mission Control entry points now read from tenant registry state when available.
          Case-study clients can still appear here, but provisioned clients only show up when
          their tenant record is both registry-visible and Mission Control enabled.
        </p>

        {error ? <div style={styles.error}>Error: {error}</div> : null}

        {loading ? (
          <div style={styles.empty}>Loading Mission Control clients…</div>
        ) : clients.length === 0 ? (
          <div style={styles.empty}>No Mission Control clients are enabled yet.</div>
        ) : (
          <div style={styles.grid}>
            {clients.map((client) => (
              <div key={client.tenantId} style={styles.card}>
                <div style={styles.badgeRow}>
                  <span style={styles.badge("rgba(14,165,233,0.16)", "#7DD3FC")}>{client.hostAgent || "Host agent pending"}</span>
                  {client.caseStudyMode ? (
                    <span style={styles.badge("rgba(245,158,11,0.16)", "#FCD34D")}>case-study</span>
                  ) : (
                    <span style={styles.badge("rgba(34,197,94,0.16)", "#86EFAC")}>live registry</span>
                  )}
                </div>
                <h2 style={styles.clientName}>{client.brandName}</h2>
                <p style={styles.meta}>
                  Tenant: <code>{client.tenantId}</code><br />
                  Industry: {client.industry}<br />
                  Updated: {formatUpdatedAt(client.updatedAt)}
                </p>
                <Link to={client.route} style={styles.routeBtn}>
                  {client.caseStudyMode ? "Open Njord Workspace →" : "Open Mission Control"}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
