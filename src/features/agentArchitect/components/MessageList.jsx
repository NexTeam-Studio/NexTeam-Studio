import { MessageBubble } from "./MessageBubble";
import { StreamingAssistantBubble } from "./StreamingAssistantBubble";

const listStyles = {
  container: {
    border: "1px solid #d0d7de",
    borderRadius: "8px",
    padding: "12px",
    minHeight: "360px",
    maxHeight: "480px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    background: "#f6f8fa"
  },
  error: {
    color: "#b42318",
    fontSize: "14px"
  }
};

export function MessageList({ messages = [], streamingText = "", isStreaming = false, errorMessage = "", containerRef }) {
  return (
    <div ref={containerRef} style={listStyles.container}>
      {errorMessage ? <div style={listStyles.error}>{errorMessage}</div> : null}

      {messages.map((message, index) => (
        <MessageBubble key={`${message.role}-${index}`} role={message.role} content={message.content} />
      ))}

      {isStreaming && streamingText ? <StreamingAssistantBubble content={streamingText} /> : null}
    </div>
  );
}
