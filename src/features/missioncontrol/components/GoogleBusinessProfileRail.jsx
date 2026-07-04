import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  buildGoogleBusinessProfileConnectUrl,
  fetchGoogleBusinessProfileConnections,
  syncGoogleBusinessProfileConnection,
} from "../services/googleBusinessProfileRailClient.js";

const RETURN_TO = "/mission-control/google-business-profile";
const APPROVAL_CASE_ID = "6-2215000040637";

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #07111F 0%, #02060D 100%)",
    color: "#E2E8F0",
    padding: "32px 24px 72px",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  shell: {
    maxWidth: 1100,
    margin: "0 auto",
  },
  eyebrow: {
    color: "#7DD3FC",
    textTransform: "uppercase",
    letterSpacing: 2,
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 10,
  },
  title: {
    margin: 0,
    fontSize: 34,
    color: "#F8FAFC",
  },
  subtitle: {
    margin: "12px 0 24px",
    color: "#94A3B8",
    lineHeight: 1.65,
    maxWidth: 840,
  },
  notice: {
    background: "rgba(14,165,233,0.12)",
    border: "1px solid rgba(56,189,248,0.35)",
    color: "#BAE6FD",
    borderRadius: 16,
    padding: 18,
    marginBottom: 24,
    lineHeight: 1.6,
  },
  banner: (kind) => ({
    background:
      kind === "error"
        ? "rgba(239,68,68,0.12)"
        : kind === "success"
          ? "rgba(34,197,94,0.12)"
          : "rgba(245,158,11,0.12)",
    border:
      kind === "error"
        ? "1px solid rgba(248,113,113,0.35)"
        : kind === "success"
          ? "1px solid rgba(74,222,128,0.35)"
          : "1px solid rgba(251,191,36,0.35)",
    color: kind === "error" ? "#FCA5A5" : kind === "success" ? "#BBF7D0" : "#FDE68A",
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    lineHeight: 1.5,
  }),
  connectCard: {
    background: "rgba(10,15,28,0.92)",
    border: "1px solid #1E293B",
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
  },
  cardTitle: {
    margin: "0 0 8px",
    fontSize: 22,
    color: "#F8FAFC",
  },
  cardCopy: {
    margin: "0 0 18px",
    color: "#94A3B8",
    lineHeight: 1.6,
  },
  formRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 12,
    alignItems: "end",
  },
  label: {
    display: "block",
    marginBottom: 8,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#CBD5E1",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 12,
    border: "1px solid #334155",
    background: "#020617",
    color: "#F8FAFC",
    padding: "14px 16px",
    fontSize: 14,
  },
  button: {
    border: "none",
    borderRadius: 12,
    background: "linear-gradient(135deg, #0EA5E9, #2563EB)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
    padding: "14px 18px",
    cursor: "pointer",
    minWidth: 168,
  },
  helper: {
    margin: "10px 0 0",
    color: "#64748B",
    fontSize: 12,
  },
  empty: {
    background: "rgba(10,15,28,0.78)",
    border: "1px dashed #334155",
    borderRadius: 18,
    padding: 24,
    color: "#94A3B8",
  },
  connectionGrid: {
    display: "grid",
    gap: 18,
  },
  connectionCard: {
    background: "rgba(10,15,28,0.92)",
    border: "1px solid #1E293B",
    borderRadius: 18,
    padding: 22,
  },
  connectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  connectionTitle: {
    margin: 0,
    fontSize: 20,
    color: "#F8FAFC",
  },
  connectionMeta: {
    margin: "8px 0 0",
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 1.6,
  },
  syncButton: {
    border: "1px solid #2563EB",
    borderRadius: 10,
    background: "rgba(37,99,235,0.14)",
    color: "#BFDBFE",
    fontWeight: 700,
    fontSize: 13,
    padding: "10px 14px",
    cursor: "pointer",
  },
  pillRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  pill: (background, color) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background,
    color,
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 700,
  }),
  sectionTitle: {
    margin: "0 0 10px",
    fontSize: 13,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#7DD3FC",
  },
  statRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginBottom: 18,
  },
  statCard: {
    background: "#020617",
    border: "1px solid #1E293B",
    borderRadius: 14,
    padding: 14,
  },
  statLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  statValue: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: 700,
  },
  inventoryBlock: {
    background: "#020617",
    border: "1px solid #1E293B",
    borderRadius: 14,
    padding: 16,
  },
  list: {
    display: "grid",
    gap: 12,
  },
  listCard: {
    background: "rgba(15,23,42,0.78)",
    border: "1px solid #1E293B",
    borderRadius: 14,
    padding: 14,
  },
  listTitle: {
    margin: "0 0 6px",
    fontSize: 15,
    color: "#F8FAFC",
  },
  listMeta: {
    margin: 0,
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 1.6,
  },
};

function formatTimestamp(value) {
  if (!value) {
    return "Not yet";
  }

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function readBannerState(searchParams) {
  const status = searchParams.get("oauth");
  if (!status) {
    return null;
  }

  if (status === "connected") {
    return {
      kind: "success",
      message: `Google account connected for ${searchParams.get("accountKey") || "the selected label"}.`,
    };
  }

  if (status === "inventory-blocked") {
    return {
      kind: "warning",
      message:
        searchParams.get("message") ||
        "OAuth succeeded, but Google approval is still blocking the live account/location inventory call.",
    };
  }

  return {
    kind: "error",
    message: searchParams.get("message") || "Google OAuth did not complete.",
  };
}

export function GoogleBusinessProfileRail() {
  const [searchParams] = useSearchParams();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connectLabel, setConnectLabel] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [banner, setBanner] = useState(() => readBannerState(searchParams));

  useEffect(() => {
    setBanner(readBannerState(searchParams));
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadConnections() {
      setLoading(true);
      setError("");

      try {
        const nextConnections = await fetchGoogleBusinessProfileConnections();
        if (!cancelled) {
          setConnections(nextConnections);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Failed to load Google Business Profile connections.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadConnections();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshConnections() {
    const nextConnections = await fetchGoogleBusinessProfileConnections();
    setConnections(nextConnections);
  }

  async function handleSync(accountKey) {
    setBusyKey(accountKey);
    setError("");

    try {
      const result = await syncGoogleBusinessProfileConnection(accountKey);
      setConnections((currentConnections) =>
        currentConnections.map((connection) =>
          connection.accountKey === accountKey ? result.connection : connection
        )
      );
      setBanner({
        kind: "success",
        message: `Inventory refreshed for ${accountKey}. Pulled ${result.snapshot.totalLocations || 0} locations.`,
      });
    } catch (requestError) {
      const snapshot = requestError.data?.snapshot;
      await refreshConnections().catch(() => {});

      if (snapshot?.blockedByGoogleApproval) {
        setBanner({
          kind: "warning",
          message:
            snapshot.error?.detail ||
            "OAuth is complete, but Google approval is still blocking the live account/location call.",
        });
      } else {
        setError(requestError.message || "Inventory sync failed.");
      }
    } finally {
      setBusyKey("");
    }
  }

  function startConnect() {
    const trimmedLabel = connectLabel.trim();
    if (!trimmedLabel) {
      setError("Enter the managing Google account email or label before connecting.");
      return;
    }

    const url = buildGoogleBusinessProfileConnectUrl({
      accountLabel: trimmedLabel,
      loginHint: trimmedLabel,
      returnTo: RETURN_TO,
    });

    window.location.assign(url);
  }

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.eyebrow}>Mission Control</div>
        <h1 style={styles.title}>Google Business Profile Rail</h1>
        <p style={styles.subtitle}>
          Layer 1 is focused on plain plumbing: connect a managing Google account, store the
          offline tokens encrypted at rest, refresh them when needed, and inventory the
          accessible Business Profile accounts and locations. One managing login can represent
          multiple client locations, and the connection model stays multi-account ready from the
          start.
        </p>

        <div style={styles.notice}>
          OAuth is ready now. The only live dependency still outside the repo is Google’s API
          approval on case <strong>{APPROVAL_CASE_ID}</strong>. Until that clears, the inventory
          call may come back with a Google-side access or quota block even though the connect flow
          itself works.
        </div>

        {banner ? <div style={styles.banner(banner.kind)}>{banner.message}</div> : null}
        {error ? <div style={styles.banner("error")}>{error}</div> : null}

        <div style={styles.connectCard}>
          <h2 style={styles.cardTitle}>Connect Google</h2>
          <p style={styles.cardCopy}>
            Use the managing Google account that owns or administers the client’s Business
            Profiles. The label you enter here becomes the vault key for that connection, so keep
            it stable per Google account.
          </p>
          <div style={styles.formRow}>
            <div>
              <label htmlFor="gbp-google-account-label" style={styles.label}>
                Managing Google Account
              </label>
              <input
                id="gbp-google-account-label"
                type="email"
                value={connectLabel}
                onChange={(event) => setConnectLabel(event.target.value)}
                placeholder="aquatraceleak@gmail.com"
                style={styles.input}
              />
            </div>
            <button type="button" style={styles.button} onClick={startConnect}>
              Connect Google
            </button>
          </div>
          <p style={styles.helper}>
            Redirect target: <code>http://127.0.0.1:5173/auth/google/callback</code>
          </p>
          <p style={styles.helper}>
            Local dev: run <code>npm run dev:gbp</code> so the callback host on port <code>5173</code>
            stays live during Google sign-in.
          </p>
        </div>

        {loading ? (
          <div style={styles.empty}>Loading stored GBP connections…</div>
        ) : connections.length === 0 ? (
          <div style={styles.empty}>
            No Google Business Profile connections are stored yet. Connect a managing Google
            account to initialize the encrypted token vault.
          </div>
        ) : (
          <div style={styles.connectionGrid}>
            {connections.map((connection) => {
              const sync = connection.latestSync || null;

              return (
                <div key={connection.accountKey} style={styles.connectionCard}>
                  <div style={styles.connectionHeader}>
                    <div>
                      <h2 style={styles.connectionTitle}>{connection.accountLabel}</h2>
                      <p style={styles.connectionMeta}>
                        Vault key: <code>{connection.accountKey}</code>
                        <br />
                        Connected: {formatTimestamp(connection.connectedAt)}
                        <br />
                        Last token refresh target: {formatTimestamp(connection.accessTokenExpiresAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      style={styles.syncButton}
                      onClick={() => void handleSync(connection.accountKey)}
                      disabled={busyKey === connection.accountKey}
                    >
                      {busyKey === connection.accountKey ? "Syncing…" : "Run Account + Location Inventory"}
                    </button>
                  </div>

                  <div style={styles.pillRow}>
                    <span style={styles.pill("rgba(34,197,94,0.14)", "#86EFAC")}>
                      {connection.hasRefreshToken ? "Refresh token stored" : "Refresh token missing"}
                    </span>
                    <span style={styles.pill("rgba(14,165,233,0.14)", "#7DD3FC")}>
                      Scope: {connection.scope || "pending"}
                    </span>
                    <span
                      style={styles.pill(
                        sync?.blockedByGoogleApproval
                          ? "rgba(245,158,11,0.14)"
                          : "rgba(59,130,246,0.14)",
                        sync?.blockedByGoogleApproval ? "#FCD34D" : "#BFDBFE"
                      )}
                    >
                      {sync?.blockedByGoogleApproval ? "Waiting on Google approval" : "Inventory ready"}
                    </span>
                  </div>

                  <div style={styles.statRow}>
                    <div style={styles.statCard}>
                      <div style={styles.statLabel}>Google Accounts</div>
                      <div style={styles.statValue}>{sync?.totalAccounts ?? "—"}</div>
                    </div>
                    <div style={styles.statCard}>
                      <div style={styles.statLabel}>Locations</div>
                      <div style={styles.statValue}>{sync?.totalLocations ?? "—"}</div>
                    </div>
                    <div style={styles.statCard}>
                      <div style={styles.statLabel}>Last Inventory</div>
                      <div style={styles.statValue}>{formatTimestamp(sync?.syncedAt)}</div>
                    </div>
                  </div>

                  <div style={styles.inventoryBlock}>
                    <p style={styles.sectionTitle}>Latest Inventory Snapshot</p>
                    {sync?.error ? (
                      <div style={styles.banner(sync.blockedByGoogleApproval ? "warning" : "error")}>
                        {sync.error.detail || sync.error.message}
                      </div>
                    ) : null}

                    {Array.isArray(sync?.locationsByAccount) && sync.locationsByAccount.length > 0 ? (
                      <div style={styles.list}>
                        {sync.locationsByAccount.map((entry) => (
                          <div key={entry.account.name} style={styles.listCard}>
                            <h3 style={styles.listTitle}>
                              {entry.account.accountName || entry.account.name}
                            </h3>
                            <p style={styles.listMeta}>
                              Account ID: <code>{entry.account.accountId}</code>
                              <br />
                              Type: {entry.account.type || "unknown"} · Locations: {entry.locations.length}
                            </p>
                            <div style={{ ...styles.list, marginTop: 12 }}>
                              {entry.locations.map((location) => (
                                <div key={location.name} style={styles.listCard}>
                                  <h4 style={{ ...styles.listTitle, fontSize: 14 }}>{location.title || location.name}</h4>
                                  <p style={styles.listMeta}>
                                    Location ID: <code>{location.locationId}</code>
                                    <br />
                                    Address: {location.address || "No storefront address returned"}
                                    <br />
                                    Phone: {location.primaryPhone || "No primary phone returned"}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={styles.cardCopy}>
                        {sync?.blockedByGoogleApproval
                          ? "The live inventory call is waiting on Google approval. Re-run this panel after the case is approved."
                          : "No live inventory has been captured yet. Run the inventory action after connecting."}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
