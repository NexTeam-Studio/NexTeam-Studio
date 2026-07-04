const styles = {
  bubble: {
    background: "rgba(255,255,255,0.95)",
    border: "1px solid #d0d7de",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 14,
    color: "#111827",
    maxWidth: 320,
    lineHeight: 1.5,
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.08)"
  }
};

export function AvatarSpeechBubble({ text = "" }) {
  if (!text) return null;
  return <div style={styles.bubble}>{text}</div>;
}
