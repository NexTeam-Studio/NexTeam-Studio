function normalizeText(value = "") {
  return String(value || "").trim();
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function hasNamedJobLookupIntent(text) {
  return (
    includesAny(text, [
      "show me",
      "pull up",
      "find",
      "open",
      "details",
      "detail",
      "address",
      "notes",
      "quote status",
      "quote",
      "status",
    ]) &&
    includesAny(text, ["job", "client", "project", "quote"])
  );
}

function hasCompanyCamProjectDetailIntent(text) {
  const asksForTechnician = includesAny(text, [
    "technician",
    "tech",
    "who worked",
    "who was on",
    "who did",
  ]);

  const asksForProjectDetail = includesAny(text, [
    "project address",
    "job address",
    "where is",
    "where was",
    "project status",
    "job status",
  ]);

  const referencesNamedPlace = includesAny(text, [
    "camp mikell",
    "l3 campus",
    "statehouse",
    "state house",
    "oleta falls",
  ]) || /\b(pool|project|job|client|customer)\b/.test(text);

  return (asksForTechnician || asksForProjectDetail) && referencesNamedPlace;
}

function hasCompanyCamAccountSummaryIntent(text) {
  const asksForCount = includesAny(text, [
    "how many projects",
    "project count",
    "number of projects",
    "count projects",
    "current projects",
    "projects visible",
    "projects are there in company cam",
    "projects are there in companycam",
  ]);

  return asksForCount && includesAny(text, ["company cam", "companycam"]);
}

export function classifyNexiV1Question(question = "") {
  const normalized = normalizeText(question);
  const lower = normalized.toLowerCase();

  if (!normalized) {
    return {
      kind: "empty",
      handled: false,
      inScope: false,
      route: "none",
    };
  }

  if (
    includesAny(lower, ["photo", "photos", "picture", "pictures", "image", "images"]) &&
    includesAny(lower, ["show", "pull", "find", "open", "from"])
  ) {
    return {
      kind: "companycam_photos",
      handled: true,
      inScope: true,
      route: "companycam",
    };
  }

  if (
    includesAny(lower, [
      "gallonage",
      "gallon",
      "gallons",
      "pool volume",
      "volume",
      "square footage",
      "square foot",
      "sq ft",
      "surface area",
      "dimensions",
      "dimension",
      "average depth",
      "depth",
      "gallons per inch",
      "gallon per inch",
      "gallons / inch",
      "report",
      "checklist",
      "pdf",
      "measurement",
      "measurements",
      "findings",
      "issues",
      "issue",
      "problem",
      "problems",
      "what was found",
      "what was wrong",
    ]) &&
    (includesAny(lower, ["job", "project", "client", "pool", "report"]) || /\bfor\b/.test(lower))
  ) {
    return {
      kind: "companycam_report_question",
      handled: true,
      inScope: true,
      route: "companycam",
    };
  }

  if (hasCompanyCamAccountSummaryIntent(lower)) {
    return {
      kind: "companycam_account_summary",
      handled: true,
      inScope: true,
      route: "companycam",
    };
  }

  if (hasCompanyCamProjectDetailIntent(lower)) {
    return {
      kind: "companycam_project_detail",
      handled: true,
      inScope: true,
      route: "companycam",
    };
  }

  if (
    includesAny(lower, ["today", "this week", "tomorrow", "schedule", "calendar"]) &&
    includesAny(lower, ["job", "jobs", "appointment", "appointments"])
  ) {
    return {
      kind: "jobber_schedule",
      handled: true,
      inScope: true,
      route: "jobber",
    };
  }

  if (hasNamedJobLookupIntent(lower)) {
    return {
      kind: "jobber_job_detail",
      handled: true,
      inScope: true,
      route: "jobber",
    };
  }

  return {
    kind: "operational_or_out_of_scope",
    handled: false,
    inScope: false,
    route: "fallback",
  };
}

export const nexiV1QuestionClassifierInternals = {
  hasCompanyCamAccountSummaryIntent,
  hasCompanyCamProjectDetailIntent,
  hasNamedJobLookupIntent,
  includesAny,
  normalizeText,
};
