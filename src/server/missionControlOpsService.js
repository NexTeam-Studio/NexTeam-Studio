import crypto from "crypto";
import { classifyOperationalQuestion } from "./operationalQuestionService.js";

function normalizeText(value = "") {
  return String(value || "").trim();
}

function createWorkItemId() {
  return `work-${crypto.randomUUID()}`;
}

export function classifyMissionControlRequest(question = "") {
  const normalizedQuestion = normalizeText(question);
  if (!normalizedQuestion) {
    return {
      lane: "work",
      reason: "empty-question-default",
      operationalClassification: classifyOperationalQuestion(normalizedQuestion),
    };
  }

  const operationalClassification = classifyOperationalQuestion(normalizedQuestion);
  if (operationalClassification.handled && operationalClassification.kind === "report_lookup") {
    return {
      lane: "work",
      reason: operationalClassification.reason,
      operationalClassification,
    };
  }

  if (operationalClassification.handled && operationalClassification.kind === "fast_lookup") {
    return {
      lane: "fast",
      reason: operationalClassification.reason,
      operationalClassification,
    };
  }

  return {
    lane: "work",
    reason: "default-to-work",
    operationalClassification,
  };
}

function createWorkAck(question, operationalClassification = classifyOperationalQuestion(question)) {
  const normalizedQuestion = normalizeText(question).toLowerCase();

  if (operationalClassification?.kind === "report_lookup" && normalizedQuestion.includes("gallon")) {
    return "Acknowledged. I'm opening the exported report and pulling the total gallons now.";
  }

  if (
    operationalClassification?.kind === "report_lookup" &&
    (normalizedQuestion.includes("report") || normalizedQuestion.includes("checklist"))
  ) {
    return "Acknowledged. I'm reading the exported report now and will return the answer as soon as it's parsed.";
  }

  return "Acknowledged. I'm pulling the live job data now and will return the result as soon as it's ready.";
}

export function createMissionControlOpsService({
  fastLookupResolver,
  workResolver,
  now = () => new Date().toISOString(),
  idFactory = createWorkItemId,
} = {}) {
  if (typeof fastLookupResolver !== "function") {
    throw new Error("MissionControlOpsService requires fastLookupResolver(questionContext).");
  }
  if (typeof workResolver !== "function") {
    throw new Error("MissionControlOpsService requires workResolver(questionContext).");
  }

  const workItems = new Map();

  async function dispatch({ tenantId, question }) {
    const classification = classifyMissionControlRequest(question);
    if (classification.lane === "fast") {
      const result = await fastLookupResolver({ tenantId, question });
      return {
        ok: true,
        lane: "fast",
        classification,
        result,
      };
    }

    const workItemId = idFactory();
    const workItem = {
      id: workItemId,
      tenantId,
      question: normalizeText(question),
      lane: "work",
      status: "queued",
      queuedAt: now(),
      acknowledgedText: createWorkAck(question, classification.operationalClassification),
      result: null,
      error: null,
    };
    workItems.set(workItemId, workItem);

    Promise.resolve()
      .then(async () => {
        workItem.status = "running";
        workItem.startedAt = now();
        try {
          const result = await workResolver({ tenantId, question });
          workItem.status = "completed";
          workItem.completedAt = now();
          workItem.result = result;
        } catch (error) {
          workItem.status = "error";
          workItem.completedAt = now();
          workItem.error = {
            message: String(error?.message || "Mission Control work-lane request failed."),
            code: String(error?.code || "MISSION_CONTROL_WORK_LANE_FAILED"),
            status: Number(error?.status || 500) || 500,
          };
        }
      })
      .catch((error) => {
        workItem.status = "error";
        workItem.completedAt = now();
        workItem.error = {
          message: String(error?.message || "Mission Control work-lane request failed."),
          code: String(error?.code || "MISSION_CONTROL_WORK_LANE_FAILED"),
          status: Number(error?.status || 500) || 500,
        };
      });

    return {
      ok: true,
      lane: "work",
      classification,
      acknowledged: true,
      workItemId,
      acknowledgedText: workItem.acknowledgedText,
    };
  }

  function getWorkItem(workItemId) {
    return workItems.get(normalizeText(workItemId)) || null;
  }

  function clearWorkItem(workItemId) {
    workItems.delete(normalizeText(workItemId));
  }

  return {
    dispatch,
    getWorkItem,
    clearWorkItem,
  };
}

export const missionControlOpsServiceInternals = {
  createWorkAck,
  createWorkItemId,
};
