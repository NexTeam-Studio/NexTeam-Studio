import { createCompanyCamRail } from "../features/missioncontrol/services/companyCamRailService.js";
import { createOperationalQuestionService, classifyOperationalQuestion } from "./operationalQuestionService.js";

const DEFAULT_CLAWDIA_PUBLIC_URL = "http://127.0.0.1:8788";

function normalizeText(value) {
  return String(value || "").trim();
}

export function isNexiOperationalQuestion(question) {
  return classifyOperationalQuestion(question).handled;
}

function getClawdiaPublicUrl() {
  return normalizeText(process.env.CLAWDIA_BRAIN_PUBLIC_URL || DEFAULT_CLAWDIA_PUBLIC_URL);
}

function buildClawdiaOperatorQuestion(question, tenantId = "aquatrace") {
  return `Clawdia, answer this ${tenantId} operational job-data question: ${normalizeText(question)}`;
}

function createLocalOperationalQuestionService() {
  try {
    return createOperationalQuestionService({
      companyCamRail: createCompanyCamRail(),
    });
  } catch {
    return null;
  }
}

async function callClawdiaOperatorRoute({ tenantId, question, fetchImpl = fetch }) {
  const response = await fetchImpl(`${getClawdiaPublicUrl()}/public/operator/route`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question: buildClawdiaOperatorQuestion(question, tenantId),
      tenantId,
    }),
  });
  const payload = await response.json();

  if (!response.ok) {
    if (payload?.handled) {
      return {
        ok: false,
        handled: true,
        response: normalizeText(payload?.response || payload?.message || payload?.error),
        payload,
        status: response.status,
      };
    }

    const error = new Error(
      normalizeText(payload?.error || payload?.message || "Clawdia operator query failed.")
    );
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return {
    ok: payload?.ok !== false,
    handled: Boolean(payload?.handled),
    response: normalizeText(payload?.response || payload?.message),
    payload,
  };
}

export function createNexiOperatorQueryService({
  operationalQuestionService = null,
  operationalQuestionServiceFactory = createLocalOperationalQuestionService,
  fetchImpl = fetch,
} = {}) {
  let cachedOperationalQuestionService = operationalQuestionService;

  return {
    async answerQuestion({ question, tenantId = "aquatrace" } = {}) {
      const normalizedQuestion = normalizeText(question);
      if (!normalizedQuestion) {
        const error = new Error("question is required.");
        error.status = 400;
        throw error;
      }

      if (!isNexiOperationalQuestion(normalizedQuestion)) {
        return {
          ok: false,
          handled: false,
          reason: "unsupported_question",
        };
      }

      if (!cachedOperationalQuestionService) {
        cachedOperationalQuestionService =
          typeof operationalQuestionServiceFactory === "function"
            ? operationalQuestionServiceFactory()
            : null;
      }

      if (cachedOperationalQuestionService) {
        const localResult = await cachedOperationalQuestionService.answerQuestion({
          tenantId,
          question: normalizedQuestion,
        });

        if (localResult?.handled) {
          return {
            ok: localResult.ok !== false,
            handled: true,
            response: normalizeText(localResult.response),
            payload: {
              route: localResult.route,
              result: localResult.result || null,
              route_summary: `Resolved in product-local ${localResult.route?.lane || "work"} lane`,
              classification: localResult.classification || null,
            },
            status: localResult.ok === false ? Number(localResult.error?.status || 400) : 200,
          };
        }
      }

      return callClawdiaOperatorRoute({
        tenantId,
        question: normalizedQuestion,
        fetchImpl,
      });
    },
  };
}

const defaultNexiOperatorQueryService = createNexiOperatorQueryService({
  operationalQuestionService: null,
});

export async function answerNexiOperatorQuestion({ question, tenantId = "aquatrace" } = {}) {
  return defaultNexiOperatorQueryService.answerQuestion({ question, tenantId });
}

export const nexiOperatorQueryServiceInternals = {
  DEFAULT_CLAWDIA_PUBLIC_URL,
  buildClawdiaOperatorQuestion,
  createLocalOperationalQuestionService,
  createNexiOperatorQueryService,
  getClawdiaPublicUrl,
};
