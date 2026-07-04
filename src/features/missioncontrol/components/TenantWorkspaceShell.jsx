import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchTenantWorkspaceSnapshot } from "../services/tenantWorkspaceService.js";

const styles = {
  page: {
    minHeight: "100vh",
    background: "#06101d",
    color: "#E2E8F0",
    fontFamily: "system-ui, -apple-system, sans-serif",
    padding: "32px 24px 48px",
  },
  shell: {
    maxWidth: 1080,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  hero: {
    background: "linear-gradient(135deg, rgba(14,165,233,0.18), rgba(37,99,235,0.08))",
    border: "1px solid rgba(56,189,248,0.18)",
    borderRadius: 22,
    padding: 28,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#7DD3FC",
    fontWeight: 700,
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: 32,
    color: "#F8FAFC",
  },
  subtitle: {
    margin: "10px 0 0 0",
    color: "#94A3B8",
    maxWidth: 760,
    lineHeight: 1.6,
  },
  quickLinks: {
    marginTop: 18,
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
  },
  quickLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    borderRadius: 12,
    padding: "12px 14px",
    fontWeight: 700,
    background: "#0EA5E9",
    color: "#fff",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
  },
  card: {
    background: "#0B1324",
    border: "1px solid #1E293B",
    borderRadius: 18,
    padding: 20,
  },
  cardTitle: {
    margin: "0 0 14px 0",
    fontSize: 18,
    color: "#F8FAFC",
  },
  meta: {
    margin: 0,
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 1.65,
  },
  badgeRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  badge: (bg, fg) => ({
    display: "inline-block",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 700,
    background: bg,
    color: fg,
  }),
  list: {
    margin: 0,
    paddingLeft: 18,
    color: "#CBD5E1",
    lineHeight: 1.6,
  },
  mono: {
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
    color: "#F8FAFC",
  },
  empty: {
    background: "#0B1324",
    border: "1px dashed #334155",
    borderRadius: 18,
    padding: 22,
    color: "#94A3B8",
  },
};

function renderList(items = [], formatter = (item) => item) {
  if (!items.length) {
    return <p style={styles.meta}>None yet.</p>;
  }

  return (
    <ul style={styles.list}>
      {items.map((item, index) => (
        <li key={`${String(item)}-${index}`}>{formatter(item)}</li>
      ))}
    </ul>
  );
}

export function TenantWorkspaceShell() {
  const { tenantId = "" } = useParams();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const nextSnapshot = await fetchTenantWorkspaceSnapshot(tenantId);
        if (mounted) {
          setSnapshot(nextSnapshot);
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError.message || "Failed to load tenant workspace.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [tenantId]);

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <div style={styles.empty}>Loading tenant workspace…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <div style={styles.empty}>Error: {error}</div>
        </div>
      </div>
    );
  }

  if (!snapshot?.root) {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <div style={styles.empty}>
            No tenant root document exists for <span style={styles.mono}>{tenantId}</span> yet.
          </div>
        </div>
      </div>
    );
  }

  const { root, config, runtimeSummary, subagents, starterBlueprint, activeOnboardingSession } = snapshot;

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <section style={styles.hero}>
          <div style={styles.eyebrow}>Generated Tenant Workspace</div>
          <h1 style={styles.title}>{root.brandName}</h1>
          <p style={styles.subtitle}>
            This shell is driven from the tenant root, the normalized config, the starter blueprint,
            and the onboarding session created by the conversation-to-tenant provisioner.
          </p>
          <div style={styles.quickLinks}>
            <Link to="/mission-control/clients" style={styles.quickLink}>
              Operator Registry
            </Link>
            <Link to="/agent-architect" style={{ ...styles.quickLink, background: "#1E293B" }}>
              Nexi Intake
            </Link>
          </div>
        </section>

        <section style={styles.grid}>
          <article style={styles.card}>
            <div style={styles.badgeRow}>
              <span style={styles.badge("rgba(14,165,233,0.16)", "#7DD3FC")}>{root.avatarName}</span>
              <span style={styles.badge("rgba(34,197,94,0.16)", "#86EFAC")}>{root.industry}</span>
            </div>
            <h2 style={styles.cardTitle}>Tenant Root</h2>
            <p style={styles.meta}>
              Tenant: <span style={styles.mono}>{root.tenantId}</span>
              <br />
              Route: <span style={styles.mono}>{root.route}</span>
              <br />
              Mission Control enabled: {String(root.missionControlEnabled)}
              <br />
              Registry visible: {String(root.registryVisible)}
            </p>
          </article>

          <article style={styles.card}>
            <h2 style={styles.cardTitle}>Runtime Summary</h2>
            {runtimeSummary ? (
              <p style={styles.meta}>
                Status: {runtimeSummary.status}
                <br />
                Tier: {runtimeSummary.tier}
                <br />
                Connected channels: {runtimeSummary.connectivity?.connectedCount ?? 0}
                <br />
                Pending channels: {runtimeSummary.connectivity?.pendingCount ?? 0}
                <br />
                Owner goals: {(runtimeSummary.dashboard?.ownerGoals || []).join(" | ") || "None yet"}
              </p>
            ) : (
              <p style={styles.meta}>Runtime summary has not been written yet.</p>
            )}
          </article>

          <article style={styles.card}>
            <h2 style={styles.cardTitle}>Normalized Config</h2>
            {config ? (
              <p style={styles.meta}>
                Public agent: {config.profile?.publicAgentName || root.avatarName}
                <br />
                Service area: {(config.profile?.serviceArea?.territories || []).join(", ") || "Pending confirmation"}
                <br />
                Services: {(config.businessRules?.services || []).join(", ") || "Pending"}
                <br />
                Launch sequence: {(config.workflow?.launchSequence || []).join(" -> ") || "None set"}
              </p>
            ) : (
              <p style={styles.meta}>Normalized config has not been written yet.</p>
            )}
          </article>

          <article style={styles.card}>
            <h2 style={styles.cardTitle}>Active Subagents</h2>
            {renderList(subagents, (subagent) => `${subagent.name} — ${subagent.role}`)}
          </article>

          <article style={styles.card}>
            <h2 style={styles.cardTitle}>Starter Blueprint</h2>
            {starterBlueprint ? (
              <>
                <p style={styles.meta}>
                  <span style={styles.mono}>{starterBlueprint.id}</span>
                  <br />
                  {starterBlueprint.description}
                </p>
                {renderList(starterBlueprint.agentRoster || [], (agent) => `${agent.agentName} — ${agent.role}`)}
              </>
            ) : (
              <p style={styles.meta}>No starter blueprint found for this tenant yet.</p>
            )}
          </article>

          <article style={styles.card}>
            <h2 style={styles.cardTitle}>Onboarding Session</h2>
            {activeOnboardingSession ? (
              <>
                <p style={styles.meta}>
                  Progress: {activeOnboardingSession.progress ?? 0}%
                  <br />
                  State: {activeOnboardingSession.state}
                </p>
                {renderList(
                  (activeOnboardingSession.tasks || []).map((task) => `${task.title} (${task.state})`)
                )}
              </>
            ) : (
              <p style={styles.meta}>No onboarding session found for this tenant yet.</p>
            )}
          </article>
        </section>
      </div>
    </div>
  );
}
