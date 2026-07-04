/**
 * useNjordSession — React Hook
 *
 * Core session handler for the Njord host agent.
 * Manages:
 *   - Text chat input → intent classification → agent routing → response
 *   - Session lifecycle (init, log turns, close)
 *   - Voice hook (stub — wire ElevenLabs or similar here)
 *
 * Used by NjordMissionControl component.
 */

import { useCallback, useRef, useState } from "react";
import { classifyIntent } from "../services/njordIntentClassifier.js";
import { routeToNorseAgent } from "../services/njordRouter.js";
import { initNjordSession, logNjordTurn, closeNjordSession } from "../services/njordSessionLogger.js";
import { maybeRunClawdiaOperatorAction } from "../services/clawdiaOperatorService.js";
import { loadClawdiaOperationalTruth } from "../services/clawdiaOperationalTruthService.js";
import { maybeRunGoonieConsult } from "../services/gooniesConsultService.js";

/**
 * @typedef {Object} NjordMessage
 * @property {string} id        - Unique message id
 * @property {'user'|'agent'|'system'} role
 * @property {string} content
 * @property {string} [agentName]   - Which Norse agent responded
 * @property {string} [intent]      - Classified intent
 * @property {boolean} [stub]       - True if response is a scaffold stub
 * @property {number} timestamp
 */

let _msgCounter = 0;
function nextMsgId() {
  _msgCounter += 1;
  return `njord-msg-${Date.now()}-${_msgCounter}`;
}

/**
 * @param {string} sessionId - Caller-provided unique session id
 * @returns {Object} hook state and actions
 */
export function useNjordSession(sessionId) {
  const [messages, setMessages] = useState(/** @type {NjordMessage[]} */ ([]));
  const [thinking, setThinking] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const sessionRef = useRef(sessionId);
  const operationalTruthRef = useRef(null);

  /** Initialize the Firestore session doc on first message. */
  const ensureSessionInit = useCallback(async () => {
    if (initialized) return;
    await initNjordSession(sessionRef.current, { source: "mission-control-ui" });
    operationalTruthRef.current = loadClawdiaOperationalTruth();
    setInitialized(true);
  }, [initialized]);

  /**
   * Appends a message to local state.
   * @param {Omit<NjordMessage, 'id'|'timestamp'>} msg
   */
  const pushMessage = useCallback((msg) => {
    setMessages((prev) => [
      ...prev,
      { ...msg, id: nextMsgId(), timestamp: Date.now() },
    ]);
  }, []);

  /**
   * Handles a user text input turn:
   *   1. Log user message
   *   2. Classify intent
   *   3. Route to Norse subagent
   *   4. Render response
   *
   * @param {string} userInput
   */
  const sendMessage = useCallback(
    async (userInput) => {
      if (!userInput?.trim() || thinking) return;

      await ensureSessionInit();

      // Add user message to UI
      pushMessage({ role: "user", content: userInput });

      // Log user turn to Firestore
      await logNjordTurn(sessionRef.current, "user", userInput);

      setThinking(true);

      try {
        const clawdiaOperatorAction = await maybeRunClawdiaOperatorAction(
          userInput,
          operationalTruthRef.current
        );
        if (clawdiaOperatorAction?.handled) {
          pushMessage({
            role: "system",
            content:
              clawdiaOperatorAction.routeSummary
                ? `→ Clawdia route: ${clawdiaOperatorAction.routeSummary}`
                : "→ Clawdia checked the live action registry and operational truth before routing the request",
            intent: "clawdia-operator",
          });

          await logNjordTurn(sessionRef.current, "agent", clawdiaOperatorAction.response, {
            routedTo: "clawdia-operator",
            agentName: "Clawdia",
            intent: "clawdia-operator",
            consultOnly: false,
            stub: false,
          });

          pushMessage({
            role: "agent",
            content: clawdiaOperatorAction.response,
            agentName: "Clawdia",
            intent: "clawdia-operator",
            stub: false,
          });

          return;
        }

        const goonieConsult = await maybeRunGoonieConsult(userInput);
        if (goonieConsult?.handled) {
          const goonieName = goonieConsult.goonie?.name || "Advisory Bench";

          pushMessage({
            role: "system",
            content: `→ Advisory consult routed to ${goonieName} through the shared brain (consult-only)`,
            intent: "goonie-consult",
          });

          await logNjordTurn(sessionRef.current, "agent", goonieConsult.response, {
            routedTo: goonieConsult.goonie?.id || "goonie-clarify",
            agentName: `Clawdia · ${goonieName}`,
            intent: "goonie-consult",
            consultOnly: true,
            stub: false,
          });

          pushMessage({
            role: "agent",
            content: goonieConsult.response,
            agentName: `Clawdia · ${goonieName}`,
            intent: "goonie-consult",
            stub: false,
          });

          return;
        }

        // Classify intent
        const classification = classifyIntent(userInput);

        // Add a system note showing routing (visible in dev; could be hidden in prod)
        pushMessage({
          role: "system",
          content: `→ Intent: ${classification.intent} (${classification.method}) · Routing to Norse agent…`,
          intent: classification.intent,
        });

        // Route to appropriate Norse subagent (pass recent turns for context)
        const recentTurns = messages
          .filter((m) => m.role === "user" || m.role === "agent")
          .slice(-6)
          .map((m) => ({ role: m.role === "agent" ? "assistant" : "user", content: m.content }));

        const result = await routeToNorseAgent(
          sessionRef.current,
          classification.intent,
          userInput,
          recentTurns
        );

        // Add agent response to UI
        pushMessage({
          role: "agent",
          content: result.response,
          agentName: result.agentName,
          intent: classification.intent,
          stub: result.stub,
        });
      } catch (err) {
        console.error("[useNjordSession] ERROR:", err.message);
        pushMessage({
          role: "system",
          content: `Error: ${err.message}`,
        });
      } finally {
        setThinking(false);
      }
    },
    [thinking, ensureSessionInit, pushMessage]
  );

  /**
   * Voice hook stub.
   * Wire ElevenLabs or browser SpeechSynthesis here to speak agent responses.
   *
   * @param {string} text - Text to speak
   */
  const speakResponse = useCallback((text) => {
    // STUB: Replace with actual TTS call
    console.log("[useNjordSession] 🔊 voice stub — would speak:", text?.slice(0, 80));
    // Example: await elevenLabsSpeak(text, { voiceId: NJORD_VOICE_ID });
  }, []);

  /**
   * Closes the current session.
   */
  const closeSession = useCallback(async () => {
    await closeNjordSession(sessionRef.current);
  }, []);

  return {
    messages,
    thinking,
    initialized,
    sendMessage,
    speakResponse,
    closeSession,
  };
}
