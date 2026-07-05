import {
  answerCompanyCamReportQuestion,
  formatCompanyCamReportAnswer,
} from "../features/missioncontrol/services/companyCamQuestionService.js";
import { resolveCompanyCamFastLookup } from "./companyCamFastLookupService.js";

const FAST_LOOKUP_PATTERNS = [
  /\bwho(?:'s| is)\b/i,
  /\bcustomer at\b/i,
  /\bclient at\b/i,
  /\bhomeowner at\b/i,
  /\bowner at\b/i,
  /\bproject at\b/i,
  /\bjob at\b/i,
  /\blook up\b/i,
  /\bpull up\b/i,
  /\bshow me\b/i,
  /\bfind\b/i,
  /\bstatus on\b/i,
  /\bwhat'?s the status on\b/i,
];

const REPORT_LOOKUP_PATTERNS = [
  /\bgallonage\b/i,
  /\bgallons?\b/i,
  /\bpool volume\b/i,
  /\bsquare footage\b/i,
  /\bsquare foot\b/i,
  /\bsq ft\b/i,
  /\bsurface area\b/i,
  /\bdimensions?\b/i,
  /\breport\b/i,
  /\bchecklist\b/i,
  /\bpdf\b/i,
  /\bcalculate\b/i,
  /\bcalculation\b/i,
  /\bsummarize\b/i,
  /\bsummary\b/i,
  /\bopen\b/i,
  /\bread\b/i,
  /\bparse\b/i,
  /\bextract\b/i,
  /\bmeasurement\b/i,
  /\bfindings?\b/i,
  /\bissues?\b/i,
  /\bproblems?\b/i,
  /\baverage depth\b/i,
  /\bdepth\b/i,
  /\bgallons? per inch\b/i,
];

function normalizeText(value = "") {
  return String(value || "").trim();
}

function isProjectEntityQuestion(question = "") {
  return (
    /\b\d{2,}\b/.test(question) ||
    /\bcourt\b|\broad\b|\brd\b|\bdrive\b|\bdr\b|\bstreet\b|\bst\b|\blane\b|\bln\b|\bavenue\b|\bave\b/i.test(question) ||
    /\bcamp mikell\b|\bl3 campus\b|\bstatehouse\b/i.test(question)
  );
}

function referencesPersonOrProject(question = "") {
  return /\bcustomer\b|\bclient\b|\bhomeowner\b|\bowner\b|\bproject\b|\bjob\b|\baccount\b/i.test(question);
}

function hasPatternHit(question, patterns = []) {
  return patterns.some((pattern) => pattern.test(question));
}

function computeConfidence(primaryScore, secondaryScore) {
  if (primaryScore <= 0) {
    return 0;
  }
  const gap = Math.max(primaryScore - secondaryScore, 0);
  if (gap >= 4) {
    return 0.96;
  }
  if (gap >= 2) {
    return 0.87;
  }
  return 0.72;
}

export function classifyOperationalQuestion(question = "") {
  const normalizedQuestion = normalizeText(question);
  if (!normalizedQuestion) {
    return {
      handled: false,
      kind: "unsupported",
      lane: "work",
      confidence: 0,
      candidates: [],
      reason: "empty-question",
      method: "rule-based",
    };
  }

  let fastScore = hasPatternHit(normalizedQuestion, FAST_LOOKUP_PATTERNS) ? 4 : 0;
  let reportScore = hasPatternHit(normalizedQuestion, REPORT_LOOKUP_PATTERNS) ? 4 : 0;

  if (isProjectEntityQuestion(normalizedQuestion) && referencesPersonOrProject(normalizedQuestion)) {
    fastScore += 3;
  }

  if (/\b(gallonage|gallons?|volume|report|checklist|pdf)\b/i.test(normalizedQuestion)) {
    reportScore += 2;
  }

  const scored = [
    {
      kind: "fast_lookup",
      lane: "fast",
      score: fastScore,
      reason: "simple-lookup-request",
    },
    {
      kind: "report_lookup",
      lane: "work",
      score: reportScore,
      reason: "heavy-companycam-report-request",
    },
  ].sort((left, right) => right.score - left.score);

  const top = scored[0];
  const next = scored[1];

  if (!top || top.score <= 0) {
    return {
      handled: false,
      kind: "unsupported",
      lane: "work",
      confidence: 0.42,
      candidates: [],
      reason: "unsupported-operational-question",
      method: "rule-based",
    };
  }

  return {
    handled: true,
    kind: top.kind,
    lane: top.lane,
    confidence: computeConfidence(top.score, next?.score || 0),
    candidates: scored.filter((entry) => entry.score > 0).map((entry) => entry.kind),
    reason: top.reason,
    method: "rule-based",
  };
}

function buildSourcePlan({ classification, companyCamRail, jobberFastLookupResolver, jobberReportResolver }) {
  const sourcePlan = [];

  if (companyCamRail) {
    if (classification.kind === "fast_lookup") {
      sourcePlan.push("companycam");
    }
    if (classification.kind === "report_lookup") {
      sourcePlan.push("companycam", "dropbox_customer_exports");
    }
  }

  if (classification.kind === "fast_lookup" && typeof jobberFastLookupResolver === "function") {
    sourcePlan.push("jobber");
  }

  if (classification.kind === "report_lookup" && typeof jobberReportResolver === "function") {
    sourcePlan.push("jobber");
  }

  return [...new Set(sourcePlan)];
}

function buildRouteSummary({ classification, routeKind, sourcePlan, resourceProvider = "" }) {
  return {
    kind: routeKind,
    lane: classification.lane,
    delivery: "product-local",
    sourcePlan,
    resourceProvider: normalizeText(resourceProvider) || null,
  };
}

function buildFailureResponse(message, route, extra = {}) {
  return {
    ok: false,
    handled: true,
    response: message,
    route,
    ...extra,
  };
}

function buildUnhandledResponse(classification, sourcePlan, reason) {
  return {
    ok: false,
    handled: false,
    classification,
    route: {
      kind: "unsupported",
      lane: classification.lane,
      delivery: "product-local",
      sourcePlan,
      resourceProvider: null,
    },
    reason,
  };
}

export function createOperationalQuestionService({
  companyCamRail = null,
  companyCamFastLookupResolver = null,
  companyCamReportResolver = null,
  jobberFastLookupResolver = null,
  jobberReportResolver = null,
} = {}) {
  async function answerQuestion({ tenantId, question }) {
    const classification = classifyOperationalQuestion(question);
    const sourcePlan = buildSourcePlan({
      classification,
      companyCamRail,
      jobberFastLookupResolver,
      jobberReportResolver,
    });

    if (!classification.handled) {
      return buildUnhandledResponse(classification, sourcePlan, "unsupported_question");
    }

    if (sourcePlan.length === 0) {
      return buildUnhandledResponse(classification, sourcePlan, "no_connected_source");
    }

    if (classification.kind === "fast_lookup") {
      if (companyCamRail) {
        const result = typeof companyCamFastLookupResolver === "function"
          ? await companyCamFastLookupResolver({ companyCamRail, tenantId, question })
          : await resolveCompanyCamFastLookup({
              companyCamRail,
              tenantId,
              question,
            });

        const route = buildRouteSummary({
          classification,
          routeKind: "companycam_fast_lookup",
          sourcePlan,
          resourceProvider: result?.handled ? "companycam" : "",
        });

        if (result?.ok && result?.handled) {
          return {
            ok: true,
            handled: true,
            classification,
            response: result.answerText,
            result,
            route,
          };
        }

        if (result?.handled === false) {
          return buildFailureResponse(
            "I could not find a matching live project in the connected operational sources yet.",
            route,
            {
              classification,
              result,
            }
          );
        }
      }

      if (typeof jobberFastLookupResolver === "function") {
        const result = await jobberFastLookupResolver({ tenantId, question });
        if (result?.handled) {
          return {
            ok: Boolean(result.ok),
            handled: true,
            classification,
            response: normalizeText(result.answerText || result.response || ""),
            result,
            route: buildRouteSummary({
              classification,
              routeKind: "jobber_fast_lookup",
              sourcePlan,
              resourceProvider: "jobber",
            }),
          };
        }
      }
    }

    if (classification.kind === "report_lookup") {
      if (companyCamRail) {
        try {
          const result = typeof companyCamReportResolver === "function"
            ? await companyCamReportResolver({ companyCamRail, tenantId, question })
            : await answerCompanyCamReportQuestion({
                companyCamRail,
                tenantId,
                question,
              });

          return {
            ok: true,
            handled: true,
            classification,
            response: formatCompanyCamReportAnswer(result),
            result,
            route: buildRouteSummary({
              classification,
              routeKind: "companycam_job_data",
              sourcePlan,
              resourceProvider: result?.resourcePath?.provider || "companycam",
            }),
          };
        } catch (error) {
          const knownFailure = /not approved|scope denied|not found|required|unsupported|could not find/i.test(
            String(error?.message || "")
          );

          if (knownFailure) {
            return buildFailureResponse(String(error.message || "Operational report lookup failed."), buildRouteSummary({
              classification,
              routeKind: "companycam_job_data",
              sourcePlan,
              resourceProvider: "companycam",
            }), {
              classification,
              error: {
                code: String(error?.code || "OPERATIONAL_REPORT_LOOKUP_FAILED"),
                status: Number(error?.status || 400) || 400,
              },
            });
          }

          throw error;
        }
      }

      if (typeof jobberReportResolver === "function") {
        const result = await jobberReportResolver({ tenantId, question });
        if (result?.handled) {
          return {
            ok: Boolean(result.ok),
            handled: true,
            classification,
            response: normalizeText(result.answerText || result.response || ""),
            result,
            route: buildRouteSummary({
              classification,
              routeKind: "jobber_job_data",
              sourcePlan,
              resourceProvider: "jobber",
            }),
          };
        }
      }
    }

    return buildUnhandledResponse(classification, sourcePlan, "no_matching_source_handler");
  }

  return {
    answerQuestion,
  };
}

export const operationalQuestionServiceInternals = {
  FAST_LOOKUP_PATTERNS,
  REPORT_LOOKUP_PATTERNS,
  buildSourcePlan,
  computeConfidence,
  hasPatternHit,
  isProjectEntityQuestion,
  referencesPersonOrProject,
};
