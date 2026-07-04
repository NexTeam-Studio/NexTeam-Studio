import { useEffect, useRef, useState } from "react";
import { streamInterviewerTurn, extractPatch } from "../services/architectApi";
import { applyAgentPatch, completeAgent, fetchAgentSession } from "../services/firestoreSession";
import AvatarPanel from "./AvatarPanel";
import { Composer } from "./Composer";
import SpecReviewPanel from "./SpecReviewPanel";
import { AVATAR_STATES } from "../constants/avatarStates";
import { resolveAvatarState } from "../utils/avatarStateMap";
import { useAgentArchitectSelector, useAgentArchitectSession } from "../hooks/useAgentArchitectSession";
import { unlockAudio, useElevenLabs } from "../hooks/useElevenLabs";

function stripMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/#{1,6}\s/g, "");
}

const shellStyles = {
  page: {
    display: "flex",
    justifyContent: "center",
    padding: "24px",
    fontFamily: "sans-serif"
  },
  layout: {
    display: "flex",
    gap: "24px",
    alignItems: "flex-start",
    width: "100%",
    maxWidth: "1224px"
  },
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
    margin: 0
  },

  status: {
    fontSize: "14px",
    color: "#57606a"
  },
  messages: {
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
  bubbleRow: {
    display: "flex"
  },
  bubble: {
    maxWidth: "75%",
    padding: "10px 12px",
    borderRadius: "10px",
    whiteSpace: "pre-wrap"
  },
  assistantBubble: {
    background: "#ffffff",
    border: "1px solid #d0d7de"
  },
  userBubble: {
    background: "#dbeafe",
    border: "1px solid #93c5fd",
    marginLeft: "auto"
  },
  patchPreview: {
    margin: 0,
    padding: "12px",
    borderRadius: "8px",
    background: "#0d1117",
    color: "#e6edf3",
    fontSize: "12px",
    overflowX: "auto"
  },
  splashOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    background: "#0A0A14",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999
  },
  splashBrand: {
    color: "#4F46E5",
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: 4,
    textTransform: "uppercase",
    marginBottom: 24
  },

  splashTitle: {
    color: "#ffffff",
    fontSize: 42,
    fontWeight: 800,
    marginTop: 24,
    marginBottom: 8
  },
  splashSubtitle: {
    color: "#9CA3AF",
    fontSize: 18,
    marginBottom: 48
  },
  splashButton: {
    background: "linear-gradient(135deg, #4F46E5, #7C3AED)",
    color: "#ffffff",
    fontSize: 18,
    fontWeight: 600,
    padding: "18px 48px",
    borderRadius: 50,
    border: "none",
    cursor: "pointer",
    boxShadow: "0 0 40px rgba(79,70,229,0.5)",
    transition: "opacity 0.2s ease, transform 0.2s ease"
  },
  reviewLoading: {
    width: "100%",
    maxWidth: "900px",
    border: "1px solid #E5E7EB",
    borderRadius: "20px",
    background: "#ffffff",
    padding: "32px",
    color: "#374151"
  },
  reviewError: {
    width: "100%",
    maxWidth: "900px",
    border: "1px solid #FECACA",
    borderRadius: "20px",
    background: "#FEF2F2",
    padding: "32px",
    color: "#991B1B"
  }
};

export function AgentArchitectShell() {
  const { actorRef, send } = useAgentArchitectSession();
  const machineAvatarState = useAgentArchitectSelector(actorRef, (snapshot) => snapshot.context.avatarState);
  const machineState = useAgentArchitectSelector(actorRef, (snapshot) => snapshot.value);
  const { pushChunk, flushBuffer, stop, speakGreeting, isSpeaking, amplitudeRef, currentTimeRef } = useElevenLabs();
  const [messages, setMessages] = useState([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isStartHovered, setIsStartHovered] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [draftPatch, setDraftPatch] = useState({});
  const [savedAgentSpec, setSavedAgentSpec] = useState(null);
  const [isLoadingSavedSpec, setIsLoadingSavedSpec] = useState(false);
  const [currentStage, setCurrentStage] = useState("name");
  const [latestAssistantText, setLatestAssistantText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const hasBootstrappedRef = useRef(false);
  const chatContainerRef = useRef(null);

  const avatarState = resolveAvatarState({
    isStreaming: isStreaming || !!streamingText,
    isSpeaking,
    machineAvatarState,
    machineState
  });

  useEffect(() => {
    send({ type: "BOOT" });
    setSessionId(crypto.randomUUID());
    setAgentId(crypto.randomUUID());
  }, [send]);

  useEffect(() => {
    if (!voiceEnabled || !sessionId || !agentId || hasBootstrappedRef.current) {
      return;
    }

    hasBootstrappedRef.current = true;
    send({ type: "BOOT_SUCCESS" });
    send({ type: "READY_FOR_INPUT" });
  }, [voiceEnabled, sessionId, agentId, send]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  useEffect(() => {
    if (machineState !== "completed" || !sessionId) {
      return;
    }

    let cancelled = false;

    async function loadSavedSpec() {
      setIsLoadingSavedSpec(true);
      try {
        const saved = await fetchAgentSession(sessionId);
        if (!cancelled && saved) {
          setSavedAgentSpec(saved);
          setDraftPatch((current) => ({ ...saved, ...current }));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSavedSpec(false);
        }
      }
    }

    void loadSavedSpec();

    return () => {
      cancelled = true;
    };
  }, [machineState, sessionId]);

  async function handleStartConversation() {
    const greetingText = stripMarkdown(
      "Hey there! I'm Nexi from NexTeam-Studio. I help field service businesses design practical AI agents for the work they handle every day. Let's start with the basics — what's your business called?"
    );

    setVoiceEnabled(true);
    unlockAudio();
    setMessages([
      {
        role: "assistant",
        content: greetingText
      }
    ]);
    setLatestAssistantText(greetingText);

    await new Promise((resolve) => setTimeout(resolve, 300));
    await speakGreeting(greetingText);
  }

  async function sendTurn(rawInput, shouldAppendUserMessage = true) {
    const trimmedInput = rawInput.trim();
    const userMessage = {
      role: "user",
      content: trimmedInput
    };

    const nextMessages = shouldAppendUserMessage ? [...messages, userMessage] : messages;

    if (shouldAppendUserMessage) {
      setMessages(nextMessages);
    }

    setErrorMessage("");
    setIsStreaming(true);
    setStreamingText("");
    send({ type: "SUBMIT_TURN" });

    let assistantText = "";

    await streamInterviewerTurn(
      shouldAppendUserMessage
        ? nextMessages
        : [{ role: "user", content: "Hello, I am ready to build an agent." }],
      (delta) => {
        if (!assistantText) {
          send({ type: "TURN_ACCEPTED" });
        }

        const cleanDelta = stripMarkdown(delta);

        assistantText += cleanDelta;
        pushChunk(cleanDelta);
        setStreamingText((current) => current + cleanDelta);
      },
      async (completionMeta = {}) => {
        const COMPLETION_PHRASES = [
          "give me a moment while i put it together",
          "give me a moment while i put this together",
          "i have everything i need to build"
        ];
        const assembledText = stripMarkdown(assistantText);
        const lowerText = assembledText.toLowerCase();
        const assistantIndicatedCompletion = COMPLETION_PHRASES.some((phrase) => lowerText.includes(phrase));

        await flushBuffer();

        const assistantMessage = {
          role: "assistant",
          content: assembledText
        };
        const transcript = [...nextMessages, assistantMessage];

        setMessages(transcript);
        setLatestAssistantText(assembledText);
        setStreamingText("");
        setIsStreaming(false);
        send({ type: "STREAM_COMPLETE" });

        if (completionMeta?.bypassExtractor) {
          send({ type: "READY_FOR_INPUT" });
          return;
        }

        const extracted = await extractPatch(transcript, draftPatch);

        if (!extracted) {
          send({ type: "READY_FOR_INPUT" });
          return;
        }

        send({ type: "PATCH_EXTRACTED" });
        setCurrentStage(extracted.stage || "name");
        const mergedPatch = {
          ...draftPatch,
          ...(extracted.patch || {})
        };
        setDraftPatch(mergedPatch);

        await applyAgentPatch(
          agentId,
          sessionId,
          extracted.patch || {},
          extracted.stage || "name",
          extracted.missingFields || []
        );

        if (assistantIndicatedCompletion || extracted.isComplete) {
          await completeAgent(agentId, sessionId);
          const saved = await fetchAgentSession(sessionId);
          setSavedAgentSpec(saved || mergedPatch);
          send({ type: "READY_TO_REVIEW" });
          send({ type: "COMPLETE" });
        } else {
          send({ type: "PATCH_PERSISTED" });
          send({ type: "READY_FOR_INPUT" });
        }
      },
      (error) => {
        console.error(error);
        setStreamingText("");
        setIsStreaming(false);
        setErrorMessage(error?.isFriendly ? error.message : "Something went wrong. Please try again.");
        send({ type: "STREAM_FAILURE" });
      },
      draftPatch,
      currentStage
    );
  }

  async function handleSend(text) {
    if (!text?.trim() || isStreaming) {
      return;
    }

    await sendTurn(text, true);
  }

  if (!voiceEnabled) {
    return (
      <>
        <div style={shellStyles.splashOverlay}>
          <div style={shellStyles.splashBrand}>NexTeam-Studio</div>
          <AvatarPanel
            conversationState={AVATAR_STATES.IDLE}
            spokenText=""
            isSpeaking={false}
            amplitudeRef={{ current: 0 }}
            currentTimeRef={{ current: 0 }}
            width={200}
            height={280}
            showGlow={false}
            showDebugLabel={false}
            showWordHighlight={false}
          />
          <div style={shellStyles.splashTitle}>Meet Nexi</div>
          <div style={shellStyles.splashSubtitle}>Your guide to building the right AI workflow for your business</div>
          <button
            type="button"
            onClick={() => void handleStartConversation()}
            onMouseEnter={() => setIsStartHovered(true)}
            onMouseLeave={() => setIsStartHovered(false)}
            style={{
              ...shellStyles.splashButton,
              opacity: isStartHovered ? 0.9 : 1,
              transform: isStartHovered ? "scale(1.02)" : "scale(1)"
            }}
          >
            Start Conversation →
          </button>
        </div>
      </>
    );
  }

  const reviewSpec = savedAgentSpec || draftPatch;
  const hasReviewSpec = Boolean(reviewSpec && Object.keys(reviewSpec).length);

  return (
    <div style={shellStyles.page}>
      <div style={shellStyles.layout}>
        <AvatarPanel
          conversationState={avatarState || AVATAR_STATES.IDLE}
          spokenText={latestAssistantText}
          isSpeaking={isSpeaking}
          amplitudeRef={amplitudeRef}
          currentTimeRef={currentTimeRef}
        />

        {machineState === "completed" ? (
          isLoadingSavedSpec && !hasReviewSpec ? (
            <div style={shellStyles.reviewLoading}>Loading your blueprint…</div>
          ) : hasReviewSpec ? (
            <SpecReviewPanel agentSpec={reviewSpec} sessionId={sessionId} agentId={agentId} />
          ) : (
            <div style={shellStyles.reviewError}>
              Your blueprint was completed, but we couldn’t load it into the review screen. Please refresh and try again.
            </div>
          )
        ) : (
          <div style={shellStyles.container}>
            <h1 style={shellStyles.title}>Meet Nexi — Build the right AI workflow for your business</h1>

            <div ref={chatContainerRef} style={shellStyles.messages}>
              {errorMessage ? (
                <div style={{ color: "#b42318", fontSize: "14px" }}>{errorMessage}</div>
              ) : null}

              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  style={{
                    ...shellStyles.bubbleRow,
                    justifyContent: message.role === "user" ? "flex-end" : "flex-start"
                  }}
                >
                  <div
                    style={{
                      ...shellStyles.bubble,
                      ...(message.role === "user" ? shellStyles.userBubble : shellStyles.assistantBubble)
                    }}
                  >
                    {message.content}
                  </div>
                </div>
              ))}

              {isStreaming && streamingText ? (
                <div style={{ ...shellStyles.bubbleRow, justifyContent: "flex-start" }}>
                  <div style={{ ...shellStyles.bubble, ...shellStyles.assistantBubble }}>{streamingText}</div>
                </div>
              ) : null}
            </div>

            <Composer
              onSend={(text) => handleSend(text)}
              isSpeaking={isSpeaking}
              onBarge={() => stop()}
            />

          </div>
        )}
      </div>
    </div>
  );
}

