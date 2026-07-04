import { MessageBubble } from "./MessageBubble";

export function StreamingAssistantBubble({ content = "" }) {
  return <MessageBubble role="assistant" content={content} isStreaming />;
}
