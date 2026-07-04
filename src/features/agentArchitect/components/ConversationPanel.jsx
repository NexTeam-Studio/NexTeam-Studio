import { MessageList } from "./MessageList";
import { Composer } from "./Composer";

const panelStyles = {
  container: {
    width: "100%",
    maxWidth: "900px",
    border: "1px solid #d0d7de",
    borderRadius: "12px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  },
  title: {
    margin: 0,
    fontSize: 28,
    color: "#111827"
  }
};

export function ConversationPanel(props) {
  const { title = "Meet Nexi — Your AI Operations Consultant", onSend, isSpeaking, onBarge } = props;

  return (
    <div style={panelStyles.container}>
      <h1 style={panelStyles.title}>{title}</h1>
      <MessageList {...props} />
      <Composer onSend={onSend} isSpeaking={isSpeaking} onBarge={onBarge} />
    </div>
  );
}
