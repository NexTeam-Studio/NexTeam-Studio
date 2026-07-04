import { stageConfig } from "../utils/stageConfig";

const styles = {
  bar: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    fontSize: 12,
    color: "#6B7280",
    flexWrap: "wrap"
  },
  badge: (tone = "neutral") => ({
    borderRadius: 999,
    padding: "4px 10px",
    background: tone === "error" ? "#FEF2F2" : tone === "success" ? "#ECFDF5" : "#F3F4F6",
    color: tone === "error" ? "#B91C1C" : tone === "success" ? "#166534" : "#374151",
    border: `1px solid ${tone === "error" ? "#FECACA" : tone === "success" ? "#BBF7D0" : "#E5E7EB"}`
  })
};

function formatStatus(status) {
  if (status === "error") return "Needs attention";
  if (status === "active") return "In progress";
  if (status === "completed") return "Complete";
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : "In progress";
}

function formatPersistenceState(persistenceState) {
  if (persistenceState === "saved") return "Saved";
  if (persistenceState === "saving") return "Saving";
  if (persistenceState === "error") return "Save issue";
  return persistenceState ? persistenceState.charAt(0).toUpperCase() + persistenceState.slice(1) : "Saving";
}

export function SessionStatusBar({ stage = "", status = "active", persistenceState = "saving" }) {
  const stageLabel = stageConfig[stage]?.label ?? stage;

  return (
    <div style={styles.bar}>
      <span style={styles.badge(status === "error" ? "error" : "neutral")}>{formatStatus(status)}</span>
      {stageLabel ? <span style={styles.badge()}>{stageLabel}</span> : null}
      <span style={styles.badge(persistenceState === "saved" ? "success" : persistenceState === "error" ? "error" : "neutral")}>
        {formatPersistenceState(persistenceState)}
      </span>
    </div>
  );
}
