import { useEffect, useRef, useState } from "react";
import { useElevenLabs } from "../hooks/useElevenLabs";

const composerStyles = {
  container: {
    display: "flex",
    gap: "8px",
    alignItems: "center"
  },
  input: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid #d0d7de"
  },
  sendButton: {
    padding: "10px 16px",
    borderRadius: "8px",
    border: "1px solid #d0d7de",
    background: "#ffffff",
    cursor: "pointer"
  },
  micButton: {
    background: "#1F2937",
    color: "#ffffff",
    border: "none",
    borderRadius: "50%",
    width: 48,
    height: 48,
    fontSize: 20,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center"
  },
  status: {
    fontSize: 12,
    color: "#EF4444",
    minWidth: 72
  }
};

export function Composer({ onSend, isSpeaking, onBarge }) {
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const submitTimeoutRef = useRef(null);
  const { stop } = useElevenLabs();

  useEffect(() => {
    return () => {
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
      }

      if (recognitionRef.current) {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onspeechstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      }
    };
  }, []);

  async function handleBarge() {
    if (isSpeaking) {
      await stop();

      if (onBarge) {
        onBarge();
      }
    }
  }

  async function handleMicClick() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return;
    }

    if (submitTimeoutRef.current) {
      clearTimeout(submitTimeoutRef.current);
      submitTimeoutRef.current = null;
    }

    await handleBarge();

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onspeechstart = () => {
      void handleBarge();
    };

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim() || "";

      if (!transcript) {
        setIsListening(false);
        return;
      }

      setInput(transcript);
      submitTimeoutRef.current = setTimeout(() => {
        setInput("");
        onSend?.(transcript);
      }, 150);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.start();
  }

  function handleSubmit() {
    const trimmed = input.trim();

    if (!trimmed) {
      return;
    }

    setInput("");
    onSend?.(trimmed);
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div style={composerStyles.container}>
      <input
        type="text"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Tell Nexi about your business or tap the mic"
        style={composerStyles.input}
      />
      <button type="button" onClick={handleSubmit} style={composerStyles.sendButton}>
        Send
      </button>
      <button
        type="button"
        onClick={() => void handleMicClick()}
        style={{
          ...composerStyles.micButton,
          background: isListening ? "#EF4444" : composerStyles.micButton.background,
          boxShadow: isListening ? "0 0 0 8px rgba(239,68,68,0.18)" : "none"
        }}
      >
        🎤
      </button>
      <div style={composerStyles.status}>{isListening ? "Listening now" : ""}</div>
    </div>
  );
}
