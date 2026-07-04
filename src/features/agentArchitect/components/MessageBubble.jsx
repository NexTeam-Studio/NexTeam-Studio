const bubbleStyles = {
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 4
  },
  label: (isUser) => ({
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: isUser ? "#1D4ED8" : "#6B7280",
    alignSelf: isUser ? "flex-end" : "flex-start"
  }),
  bubble: {
    maxWidth: "75%",
    padding: "10px 12px",
    borderRadius: "10px",
    whiteSpace: "pre-wrap",
    lineHeight: 1.5,
    fontSize: 14
  },
  assistant: {
    background: "#ffffff",
    border: "1px solid #d0d7de",
    color: "#111827"
  },
  user: {
    background: "#dbeafe",
    border: "1px solid #93c5fd",
    color: "#111827"
  }
};

export function MessageBubble({ role = "assistant", content = "", isStreaming = false }) {
  const isUser = role === "user";
  const speakerLabel = isUser ? "You" : "Nexi";

  return (
    <div style={{ ...bubbleStyles.row, alignItems: isUser ? "flex-end" : "flex-start" }}>
      <div style={bubbleStyles.label(isUser)}>{speakerLabel}</div>
      <div
        style={{
          ...bubbleStyles.bubble,
          ...(isUser ? bubbleStyles.user : bubbleStyles.assistant),
          opacity: isStreaming ? 0.9 : 1
        }}
      >
        {content}
      </div>
    </div>
  );
}
