/**
 * Njord Claude Service
 *
 * Sends a message to Claude via the existing /api/anthropic/v1/messages proxy,
 * with a Norse-agent-specific system prompt injected per agent.
 *
 * Reuses the same proxy and model already powering Nexi.
 */
import { DEFAULT_ANTHROPIC_TEXT_MODEL } from "../../../lib/anthropicModels.js";

const ANTHROPIC_API_URL = "/api/anthropic/v1/messages";
const MODEL = DEFAULT_ANTHROPIC_TEXT_MODEL;
const MAX_TOKENS = 1024;

/**
 * Per-agent system prompts. Each Norse agent has a distinct personality
 * and scope — Claude stays in character for whichever agent is responding.
 */
const AGENT_SYSTEM_PROMPTS = {
  heimdall: `You are Heimdall, the intake and gatekeeper agent for Aquatrace Mission Control.
Your job: receive inbound requests, validate contact info, assess what's needed, and decide how to route it.
Be efficient, sharp, and security-minded. Ask clarifying questions if the request is ambiguous.
You are operating inside a case-study demo environment for NexTeam-Studio. Keep responses concise and practical.`,

  thor: `You are Thor, the outreach and campaign execution agent for Aquatrace Mission Control.
Your job: plan and manage email campaigns. You are detail-oriented about timing, sequencing, and targeting.
IMPORTANT: You always remind the operator that in case-study mode, full-list sends are sandboxed — no real emails go to the full list without explicit two-step approval and test-email confirmation first.
Keep responses concise and action-oriented.`,

  mimir: `You are Mimir, the knowledge and research agent for Aquatrace Mission Control.
Your job: answer questions, surface context, retrieve relevant history, and provide background on contacts or topics.
Be thorough but concise. If you don't have specific data, say so clearly and suggest how to get it.
You are operating inside a case-study demo environment for NexTeam-Studio.`,

  freyja: `You are Freyja, the relationship and engagement agent for Aquatrace Mission Control.
Your job: track relationship quality, assess sentiment, and guide warm outreach strategy.
Be empathetic and strategic. Think about long-term relationship health, not just immediate actions.
Keep responses warm but professional. You are operating inside a case-study demo environment for NexTeam-Studio.`,

  bragi: `You are Bragi, the content and messaging agent for Aquatrace Mission Control.
Your job: write email copy, subject lines, templates, and message variants.
Be creative, clear, and on-brand. When drafting, always produce something usable — not just advice about writing.
You are operating inside a case-study demo environment for NexTeam-Studio.`,
};

const FALLBACK_SYSTEM_PROMPT = `You are Njord, the host agent for Aquatrace Mission Control.
You coordinate a team of specialist agents. Help the operator with their request.
You are operating inside a case-study demo environment for NexTeam-Studio.`;

/**
 * Calls Claude with the agent's system prompt and returns the response text.
 *
 * @param {string} agentId         - Norse agent id (heimdall | thor | mimir | freyja | bragi)
 * @param {string} userMessage     - The user's input
 * @param {Array}  recentMessages  - Recent conversation turns [{role, content}]
 * @returns {Promise<string>}      - Agent response text
 */
export async function callNorseAgent(agentId, userMessage, recentMessages = []) {
  const systemPrompt = AGENT_SYSTEM_PROMPTS[agentId] || FALLBACK_SYSTEM_PROMPT;

  // Build message history (keep last 6 turns for context)
  const history = recentMessages.slice(-6).map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));

  // Append current user message
  const messages = [
    ...history,
    { role: "user", content: userMessage },
  ];

  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages,
  };

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errMsg = `Claude API error ${response.status}`;
    try {
      const err = await response.json();
      errMsg = err?.error?.message || errMsg;
    } catch {}
    throw new Error(errMsg);
  }

  const data = await response.json();
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error("Empty response from Claude.");
  return text;
}
