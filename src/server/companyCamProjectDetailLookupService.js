import {
  assertAquatraceCompanyCamTenantScope,
  companyCamQuestionServiceInternals,
} from "../features/missioncontrol/services/companyCamQuestionService.js";

function normalizeText(value = "") {
  return String(value || "").trim();
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function formatAddress(address = {}) {
  return [
    normalizeText(address?.street_address_1),
    normalizeText(address?.street_address_2),
    normalizeText(address?.city),
    normalizeText(address?.state),
    normalizeText(address?.postal_code),
  ]
    .filter(Boolean)
    .join(", ");
}

function buildCreatorSummary(photos = []) {
  const counts = new Map();

  for (const photo of photos) {
    const creatorName = normalizeText(photo?.creator_name);
    if (!creatorName) {
      continue;
    }
    counts.set(creatorName, (counts.get(creatorName) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return left.name.localeCompare(right.name);
    });
}

function detectProjectDetailIntent(question = "") {
  const lower = normalizeText(question).toLowerCase();

  if (includesAny(lower, ["technician", "tech", "who worked", "who was on", "who did"])) {
    return "technician";
  }

  if (includesAny(lower, ["address", "where is", "where was", "location"])) {
    return "address";
  }

  if (includesAny(lower, ["status", "project status", "job status"])) {
    return "status";
  }

  return "project_summary";
}

function buildProjectDetailAnswer({ question, project, photos, matchedDocument }) {
  const intent = detectProjectDetailIntent(question);
  const creatorSummary = buildCreatorSummary(photos);
  const primaryTechnician = creatorSummary[0]?.name || "";
  const address = formatAddress(project?.address);
  const matchedDocLabel = normalizeText(matchedDocument?.name);

  if (intent === "technician") {
    const evidenceSnippet = primaryTechnician
      ? `creator_name: ${primaryTechnician}${creatorSummary[0]?.count ? ` (${creatorSummary[0].count} photo${creatorSummary[0].count === 1 ? "" : "s"})` : ""}`
      : matchedDocLabel
        ? `matched CompanyCam document: ${matchedDocLabel}`
        : "No creator_name value was present on the fetched project photos.";

    return {
      fieldLabel: "Technician",
      rawValue: primaryTechnician || "unknown",
      numericValue: null,
      unit: "",
      displayValue: primaryTechnician || "No technician name was present on the CompanyCam project photos.",
      evidenceSnippet,
    };
  }

  if (intent === "address") {
    return {
      fieldLabel: "Project Address",
      rawValue: address || "unknown",
      numericValue: null,
      unit: "",
      displayValue: address || "No project address was present in CompanyCam.",
      evidenceSnippet: address || "No address fields were present on the CompanyCam project record.",
    };
  }

  if (intent === "status") {
    const status = normalizeText(project?.status) || "unknown";
    return {
      fieldLabel: "Project Status",
      rawValue: status,
      numericValue: null,
      unit: "",
      displayValue: status,
      evidenceSnippet: `project status: ${status}`,
    };
  }

  return {
    fieldLabel: "Project Summary",
    rawValue: primaryTechnician || address || normalizeText(project?.status) || "unknown",
    numericValue: null,
    unit: "",
    displayValue: [
      primaryTechnician ? `technician: ${primaryTechnician}` : "",
      address ? `address: ${address}` : "",
      normalizeText(project?.status) ? `status: ${normalizeText(project.status)}` : "",
    ]
      .filter(Boolean)
      .join(" | ") || "No extra CompanyCam project details were available.",
    evidenceSnippet: matchedDocLabel
      ? `matched document: ${matchedDocLabel}`
      : creatorSummary.length > 0
        ? `creator_name values: ${creatorSummary.map((entry) => `${entry.name} (${entry.count})`).join(", ")}`
        : "Project record only.",
  };
}

function formatProjectDetailAnswer(result = {}) {
  return [
    "COMPANYCAM PROJECT DETAIL",
    `- project: ${normalizeText(result?.project?.name) || "unknown"}`,
    `- address: ${formatAddress(result?.project?.address) || "unknown"}`,
    `- answer: ${normalizeText(result?.answer?.fieldLabel) || "Project Detail"} = ${normalizeText(result?.answer?.displayValue) || "unknown"}`,
    `- source: ${normalizeText(result?.source?.type) || "companycam"}`,
    `- evidence: ${normalizeText(result?.source?.evidenceSnippet) || "not available"}`,
    `- matched document: ${normalizeText(result?.sourceDocument?.name) || "none"}`,
    `- alternate project matches: ${
      Array.isArray(result?.alternativeProjects) && result.alternativeProjects.length > 0
        ? result.alternativeProjects.map((project) => `${project.name} (${project.id})`).join(" ; ")
        : "none"
    }`,
    "- CompanyCam mode: read-only",
  ].join("\n");
}

export async function resolveCompanyCamProjectDetailQuestion({
  companyCamRail,
  tenantId,
  question,
  projectQuery,
  projectId,
  photoSampleSize = 40,
} = {}) {
  const scopedTenantId = assertAquatraceCompanyCamTenantScope(tenantId);
  const normalizedQuestion = normalizeText(question);

  if (!companyCamRail) {
    throw new Error("companyCamRail is required for CompanyCam project-detail lookup.");
  }
  if (!normalizedQuestion) {
    throw new Error("question is required for CompanyCam project-detail lookup.");
  }

  const projectCandidates = await companyCamQuestionServiceInternals.collectCompanyCamProjectCandidates({
    companyCamRail,
    question: normalizedQuestion,
    projectQuery,
    projectId,
  });

  if (!Array.isArray(projectCandidates) || projectCandidates.length === 0) {
    return {
      ok: false,
      handled: false,
      tenantId: scopedTenantId,
      reason: "project_not_found",
    };
  }

  const enrichedCandidates = [];
  for (const project of projectCandidates.slice(0, 8)) {
    const documents = await companyCamRail.listProjectDocuments(project.id).catch(() => []);
    const photos = await companyCamRail.listProjectPhotos(project.id, { perPage: photoSampleSize }).catch(() => []);
    const rankedDocuments = [...documents]
      .map((document) => ({
        ...document,
        _score: companyCamQuestionServiceInternals.scoreDocumentAgainstQuestion(document, normalizedQuestion),
      }))
      .sort((left, right) => {
        if (right._score !== left._score) {
          return right._score - left._score;
        }
        return Number(right?.updated_at || right?.created_at || 0) - Number(left?.updated_at || left?.created_at || 0);
      });

    const bestDocument = rankedDocuments[0] || null;
    const bestDocumentScore = Number(bestDocument?._score || 0);
    const creatorSummary = buildCreatorSummary(photos);
    const creatorBoost =
      detectProjectDetailIntent(normalizedQuestion) === "technician" && creatorSummary.length > 0 ? 5 : 0;

    enrichedCandidates.push({
      ...project,
      _detailScore:
        Number(project?._score || 0) +
        bestDocumentScore * 3 +
        creatorBoost,
      _matchedDocument: bestDocument,
      _photos: photos,
      _creatorSummary: creatorSummary,
    });
  }

  const selectedProject = enrichedCandidates.sort((left, right) => {
    if (right._detailScore !== left._detailScore) {
      return right._detailScore - left._detailScore;
    }
    return Number(right?.updated_at || 0) - Number(left?.updated_at || 0);
  })[0];

  const answer = buildProjectDetailAnswer({
    question: normalizedQuestion,
    project: selectedProject,
    photos: selectedProject?._photos || [],
    matchedDocument: selectedProject?._matchedDocument || null,
  });

  return {
    ok: true,
    handled: true,
    tenantId: scopedTenantId,
    question: normalizedQuestion,
    project: {
      id: selectedProject.id,
      name: selectedProject.name,
      status: selectedProject.status || null,
      address: selectedProject.address || null,
      projectUrl: selectedProject.project_url || "",
      publicUrl: selectedProject.public_url || "",
    },
    answer,
    sourceDocument: selectedProject?._matchedDocument
      ? {
          id: selectedProject._matchedDocument.id,
          name: selectedProject._matchedDocument.name,
          contentType: selectedProject._matchedDocument.content_type || null,
          byteSize: selectedProject._matchedDocument.byte_size ?? null,
          updatedAt: selectedProject._matchedDocument.updated_at || selectedProject._matchedDocument.created_at || null,
          url: selectedProject._matchedDocument.url || "",
        }
      : null,
    source: {
      type:
        detectProjectDetailIntent(normalizedQuestion) === "technician"
          ? "companycam_project_photos"
          : selectedProject?._matchedDocument
            ? "companycam_project_documents"
            : "companycam_project_record",
      evidenceSnippet: answer.evidenceSnippet,
      creatorSummary: selectedProject?._creatorSummary || [],
    },
    resourcePath: {
      provider: "companycam",
      attemptedProviders: ["companycam"],
      companyCamPreferred: true,
      dropboxFallbackUsed: false,
      jobberReady: false,
    },
    alternativeProjects: enrichedCandidates
      .slice(1, 4)
      .map((project) => ({
        id: project.id,
        name: project.name,
        address: project.address || null,
        score: project._detailScore,
      })),
    answerText: formatProjectDetailAnswer({
      project: selectedProject,
      answer,
      sourceDocument: selectedProject?._matchedDocument || null,
      source: {
        type:
          detectProjectDetailIntent(normalizedQuestion) === "technician"
            ? "companycam_project_photos"
            : selectedProject?._matchedDocument
              ? "companycam_project_documents"
              : "companycam_project_record",
        evidenceSnippet: answer.evidenceSnippet,
      },
      alternativeProjects: enrichedCandidates.slice(1, 4),
    }),
  };
}

export const companyCamProjectDetailLookupServiceInternals = {
  buildCreatorSummary,
  buildProjectDetailAnswer,
  detectProjectDetailIntent,
  formatAddress,
  formatProjectDetailAnswer,
};
