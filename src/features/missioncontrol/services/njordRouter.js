/**
 * Njord Router — Live Claude-backed Norse Subagents
 *
 * Routes a classified intent to the correct Norse subagent,
 * calls Claude with that agent's system prompt, and returns the response.
 */

import { getNorseAgentsForIntent } from "../config/norseRoster.js";
import { logNjordTurn } from "./njordSessionLogger.js";
import { callNorseAgent } from "./njordClaudeService.js";

/**
 * @typedef {Object} RouteResult
 * @property {string}  routedTo   - Agent id that handled the request
 * @property {string}  agentName  - Display name of the agent
 * @property {string}  response   - Response text from Claude
 * @property {boolean} stub       - Always false now — live responses
 */

/**
 * Routes a classified intent to the correct Norse subagent,
 * calls Claude, logs the response, and returns it.
 *
 * @param {string} sessionId
 * @param {string} intent
 * @param {string} userMessage
 * @param {Array}  recentMessages - Recent turns for context [{role, content}]
 * @returns {Promise<RouteResult>}
 */
export async function routeToNorseAgent(sessionId, intent, userMessage, recentMessages = []) {
  const [agent] = getNorseAgentsForIntent(intent);

  let response;
  try {
    response = await callNorseAgent(agent.id, userMessage, recentMessages);
  } catch (err) {
    response = `${agent.name} encountered an error: ${err.message}`;
  }

  // Log the agent response to Firestore
  await logNjordTurn(sessionId, "agent", response, {
    routedTo: agent.id,
    agentName: agent.name,
    intent,
    stub: false,
  });

  return {
    routedTo: agent.id,
    agentName: agent.name,
    response,
    stub: false,
  };
}
