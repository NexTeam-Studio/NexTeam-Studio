import { STAGES, STAGE_LABELS } from "../constants/stages";

const styles = {
  rail: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 180
  },
  item: (active, complete) => ({
    padding: "8px 10px",
    borderRadius: 10,
    background: active ? "#EEF2FF" : "#F9FAFB",
    color: active ? "#4338CA" : complete ? "#166534" : "#6B7280",
    border: `1px solid ${active ? "#C7D2FE" : "#E5E7EB"}`,
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    textTransform: "none"
  })
};

export function ProgressRail({ currentStage = STAGES[0] }) {
  const currentIndex = STAGES.indexOf(currentStage);

  return (
    <div style={styles.rail}>
      {STAGES.map((stage, index) => (
        <div key={stage} style={styles.item(index === currentIndex, index < currentIndex)}>
          {STAGE_LABELS[stage] ?? stage}
        </div>
      ))}
    </div>
  );
}
