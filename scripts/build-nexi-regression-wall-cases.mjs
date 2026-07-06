import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const inputPath = process.env.NEXI_TRIAL_EXPORT || "receipts/m1/nexi-trial-full-session-export-redacted.json";
const outputPath = process.env.NEXI_REGRESSION_CASES || "tests/fixtures/nexi-trial-regression-cases.mjs";

const exportReceipt = JSON.parse(readFileSync(inputPath, "utf8"));

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "case";
}

function classify(question) {
  const lower = String(question || "").toLowerCase();
  if (/^reply with exactly:/i.test(String(question || "").trim())) {
    return {
      expectedIntent: "meta_echo",
      requiredTools: [],
      forbiddenTools: ["getJobDetail", "searchEmail", "draftEmail"],
      assertions: ["noNoSourceStonewall", "noRawToolError"]
    };
  }
  if (/\b(?:send|draft|compose|write)\s+(?:me\s+)?(?:an?\s+)?email\b/.test(lower)) {
    return {
      expectedIntent: "email_draft_action",
      requiredTools: ["draftEmail"],
      forbiddenTools: ["searchEmail"],
      assertions: ["draftQueued", "noNoSourceStonewall"]
    };
  }
  if (/\b(?:where\s+is\s+the\s+answer|what\s+is\s+the\s+answer|correct\s+answer|i\s+corrected\s+you|you\s+should\s+have\s+(?:replied|answered)|find\s+it\s+then)\b/.test(lower)) {
    return {
      expectedIntent: "job_detail_cross_rail",
      requiredTools: ["getJobDetail", "getDocuments"],
      forbiddenTools: ["searchEmail"],
      assertions: ["usesRequiredRails", "noRawToolError"]
    };
  }
  if (/\b(?:wrong|incorrect|not correct|somewhat correct|correction|corrected|format sucks|format|feedback|organization|organize|roagaize|readable|client would never|wasting\s+(?:api\s+)?tokens|asked\s+that|should\s+already|clickable|savable|saveable|tappable|explain this date)\b/.test(lower)
    || /^\s*(?:correct|ok|okay|good)\s*[.!]?\s*$/.test(lower)) {
    return {
      expectedIntent: "feedback_or_correction",
      requiredTools: [],
      forbiddenTools: ["searchEmail"],
      assertions: ["noNoSourceStonewall"]
    };
  }
  if (/\b(?:what sources?|what tools?|what systems?|what can you access)\b/.test(lower)) {
    return {
      expectedIntent: "meta_capability",
      requiredTools: [],
      forbiddenTools: [],
      assertions: ["noNoSourceStonewall"]
    };
  }
  if (/\b(?:how\s+far|distance|miles?|drive\s+time|travel\s+time|google\s+maps|open .*maps|from my house|from here)\b/.test(lower)
    || /^\s*\d{1,6}\s+.+\b(?:road|rd|street|st|lane|ln|drive|dr|court|ct)\b/i.test(question)) {
    return {
      expectedIntent: "capability_gap_distance_or_maps",
      requiredTools: [],
      forbiddenTools: ["getJobDetail", "searchEmail"],
      assertions: ["capabilityGap", "noNoSourceStonewall"]
    };
  }
  if (/\b(?:ytd|year to date|revenue|gross|sales)\b/.test(lower)) {
    return {
      expectedIntent: "capability_gap_revenue",
      requiredTools: [],
      forbiddenTools: ["getJobDetail", "searchEmail"],
      assertions: ["capabilityGap", "noNoSourceStonewall"]
    };
  }
  if (/\b(?:paid|pay|payment|invoice|zero\s+balance|receipt|owes?|owed|due|collected|charged)\b/.test(lower)) {
    return {
      expectedIntent: "payment_status_cross_rail",
      requiredTools: ["getSchedule", "getJobDetail", "invoiceStatus", "searchEmail"],
      forbiddenTools: [],
      assertions: ["noSingleRailPaymentConclusion", "noJan2024"]
    };
  }
  if (/\b(?:approved\s+but\s+not\s+scheduled|pipeline|unscheduled|not\s+scheduled)\b/.test(lower)) {
    return {
      expectedIntent: "pipeline_status",
      requiredTools: ["getPipeline"],
      forbiddenTools: [],
      assertions: ["usesRequiredRails"]
    };
  }
  if (/\b(?:sitejobblueprint|lookupsitejobblueprintfield)\b/.test(lower)) {
    return {
      expectedIntent: "site_blueprint_lookup",
      requiredTools: ["lookupSiteJobBlueprintField"],
      forbiddenTools: ["searchEmail"],
      assertions: ["usesRequiredRails"]
    };
  }
  if (/\b(?:gallons per inch|square footage|sq ft|ft2|ft²)\b/.test(lower)) {
    return {
      expectedIntent: "report_measurement_lookup",
      requiredTools: ["getDocuments", "lookupSiteJobBlueprintField"],
      forbiddenTools: ["searchEmail"],
      assertions: ["usesRequiredRails"]
    };
  }
  if (/\b(?:total gallons|pool gallons|how many gallons)\b/.test(lower)) {
    return {
      expectedIntent: "site_blueprint_lookup",
      requiredTools: ["lookupSiteJobBlueprintField"],
      forbiddenTools: ["searchEmail"],
      assertions: ["usesRequiredRails"]
    };
  }
  if (/\b(?:needs? my attention|what needs attention|triage|urgent|important)\b/.test(lower)) {
    return {
      expectedIntent: "email_triage",
      requiredTools: ["triageInbox"],
      forbiddenTools: [],
      assertions: ["usesRequiredRails", "noRawToolError"]
    };
  }
  if (/\b(?:emails?|mail|gmail|inbox|semrush|site audit|reply|replied|responded|oleta)\b/.test(lower)
    || /\b(?:sent|send)\b.*\breport\b/.test(lower)
    || /\bmedallion\s+pool\s+company\b.*\b(?:email|mail|gmail|sent|send|report)\b/.test(lower)) {
    if (/\b(?:came in today|emails came in|what emails)\b/.test(lower)) {
      return {
        expectedIntent: "email_summary",
        requiredTools: ["summarizeInbox"],
        forbiddenTools: [],
        assertions: ["usesRequiredRails", "noRawToolError"]
      };
    }
    return {
      expectedIntent: "email_search_or_read",
      requiredTools: ["searchEmail"],
      forbiddenTools: ["draftEmail"],
      assertions: ["noRawToolError"]
    };
  }
  if (/\b(?:schedule|calendar|appointments?|visits?|booked|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|eta|what time|when is)\b/.test(lower)) {
    return {
      expectedIntent: "schedule_lookup",
      requiredTools: ["getSchedule"],
      forbiddenTools: [],
      assertions: ["noJan2024"]
    };
  }
  if (/\b(?:photos?|pictures?|images?)\b/.test(lower)) {
    return {
      expectedIntent: "companycam_photo_lookup",
      requiredTools: ["getPhotos"],
      forbiddenTools: [],
      assertions: ["usesRequiredRails"]
    };
  }
  if (/\b(?:issue|issues|problem|finding|findings|result|results|report|document|checklist|technician|tech|completion|competion|service time|gallons|square footage|gallons per inch)\b/.test(lower)) {
    return {
      expectedIntent: "job_detail_cross_rail",
      requiredTools: ["getJobDetail", "getDocuments"],
      forbiddenTools: ["searchEmail"],
      assertions: ["usesRequiredRails"]
    };
  }
  return {
    expectedIntent: "general_job_fact",
    requiredTools: ["getJobDetail"],
    forbiddenTools: [],
    assertions: ["noRawToolError"]
  };
}

const sessions = Object.entries(exportReceipt.sessions)
  .map(([conversationId, turns]) => ({
    conversationId,
    cases: turns.map((turn, index) => {
      const policy = classify(turn.userText);
      return {
        id: `${turn.createdAt.replace(/[^0-9]/g, "").slice(0, 14)}-${index + 1}-${slug(turn.userText)}`,
        createdAt: turn.createdAt,
        originalConversationId: conversationId,
        question: turn.userText,
        expectedIntent: policy.expectedIntent,
        requiredTools: policy.requiredTools,
        forbiddenTools: policy.forbiddenTools,
        assertions: policy.assertions
      };
    })
  }))
  .filter((session) => session.cases.length > 0)
  .sort((left, right) => String(left.cases[0]?.createdAt || "").localeCompare(String(right.cases[0]?.createdAt || "")));

const file = `// Generated from ${inputPath}. Do not hand-edit cases; regenerate after each trial audit.\nexport const nexiTrialRegressionSessions = ${JSON.stringify(sessions, null, 2)};\n`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, file, "utf8");

console.log(JSON.stringify({
  ok: true,
  outputPath,
  sessions: sessions.length,
  cases: sessions.reduce((sum, session) => sum + session.cases.length, 0)
}, null, 2));
