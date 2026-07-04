import { resolveCompanyCamFastLookup } from "./companyCamFastLookupService.js";

function normalizeText(value = "") {
  return String(value || "").trim();
}

function formatPhotoLookupAnswer({ project, photos = [] } = {}) {
  const lines = [
    "NEXI PHOTO LOOKUP",
    `- project: ${normalizeText(project?.name) || "unknown"}`,
    `- address: ${
      [
        normalizeText(project?.address?.street_address_1),
        normalizeText(project?.address?.city),
        normalizeText(project?.address?.state),
        normalizeText(project?.address?.postal_code),
      ]
        .filter(Boolean)
        .join(", ") || "unknown"
    }`,
    `- photos returned: ${photos.length}`,
  ];

  for (const photo of photos) {
    lines.push(`- photo ${photo.id || "unknown"}: ${normalizeText(photo.photo_url) || "no url"}`);
  }

  return lines.join("\n");
}

export async function resolveCompanyCamProjectPhotos({
  companyCamRail,
  tenantId,
  question,
  perPage = 6,
} = {}) {
  if (!companyCamRail) {
    throw new Error("companyCamRail is required for CompanyCam photo lookup.");
  }

  const lookup = await resolveCompanyCamFastLookup({
    companyCamRail,
    tenantId,
    question,
  });

  if (!lookup?.ok || !lookup?.handled || !lookup?.project?.id) {
    return {
      ok: false,
      handled: false,
      tenantId,
      reason: "project_not_found",
    };
  }

  const photos = await companyCamRail.listProjectPhotos(lookup.project.id, { perPage });
  return {
    ok: true,
    handled: true,
    tenantId,
    lane: "work",
    action: "companycam-project-photos",
    project: lookup.project,
    alternativeProjects: lookup.alternativeProjects || [],
    photos: photos.map((photo) => ({
      id: photo.id,
      project_id: photo.project_id,
      description: photo.description || "",
      captured_at: photo.captured_at || null,
      photo_url: photo.photo_url || "",
      uris: Array.isArray(photo.uris) ? photo.uris : [],
    })),
    answerText: formatPhotoLookupAnswer({
      project: lookup.project,
      photos,
    }),
  };
}

export const companyCamPhotoLookupServiceInternals = {
  formatPhotoLookupAnswer,
};
