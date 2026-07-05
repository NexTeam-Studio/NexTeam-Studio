const COMPANYCAM_BASE_URL = "https://api.companycam.com/v2";

function createCompanyCamApiError(message, { status, detail, data, responseText } = {}) {
  const error = new Error(message);
  error.name = "CompanyCamApiError";
  error.status = status || 500;
  error.detail = detail || null;
  error.data = data ?? null;
  error.responseText = responseText ?? null;
  return error;
}

function getAuthHeaders(token) {
  if (!token) {
    throw new Error("COMPANYCAM_API_TOKEN is not configured.");
  }

  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "NexTeam-Studio/CompanyCam-ReadOnly",
  };
}

async function fetchCompanyCam(pathname, token, query = {}) {
  const url = new URL(`${COMPANYCAM_BASE_URL}${pathname}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, { headers: getAuthHeaders(token) });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    throw createCompanyCamApiError(`CompanyCam request failed ${response.status}: ${detail}`, {
      status: response.status,
      detail,
      data,
      responseText: text,
    });
  }

  return data;
}

export function hasCompanyCamToken(token = process.env.COMPANYCAM_API_TOKEN) {
  return Boolean(String(token || "").trim());
}

export async function listCompanyCamProjects({
  token = process.env.COMPANYCAM_API_TOKEN,
  perPage = 5,
  page,
  query,
  modifiedSince,
} = {}) {
  return fetchCompanyCam("/projects", token, {
    per_page: perPage,
    page,
    query,
    modified_since: modifiedSince,
  });
}

export async function listCompanyCamPhotos({
  token = process.env.COMPANYCAM_API_TOKEN,
  perPage = 100,
  page,
  query,
  modifiedSince,
} = {}) {
  return fetchCompanyCam("/photos", token, {
    per_page: perPage,
    page,
    query,
    modified_since: modifiedSince,
  });
}

export async function getCompanyCamProject({ token = process.env.COMPANYCAM_API_TOKEN, projectId }) {
  return fetchCompanyCam(`/projects/${projectId}`, token);
}

export async function getCompanyCamPhoto({ token = process.env.COMPANYCAM_API_TOKEN, photoId }) {
  return fetchCompanyCam(`/photos/${photoId}`, token);
}

export async function listCompanyCamProjectPhotos({ token = process.env.COMPANYCAM_API_TOKEN, projectId, perPage = 10 } = {}) {
  return fetchCompanyCam(`/projects/${projectId}/photos`, token, { per_page: perPage });
}

export async function listCompanyCamProjectLabels({ token = process.env.COMPANYCAM_API_TOKEN, projectId, perPage = 20 } = {}) {
  return fetchCompanyCam(`/projects/${projectId}/labels`, token, { per_page: perPage });
}

export async function listCompanyCamProjectChecklists({ token = process.env.COMPANYCAM_API_TOKEN, projectId } = {}) {
  return fetchCompanyCam(`/projects/${projectId}/checklists`, token);
}

export async function listCompanyCamProjectDocuments({ token = process.env.COMPANYCAM_API_TOKEN, projectId } = {}) {
  return fetchCompanyCam(`/projects/${projectId}/documents`, token);
}

export function summarizeCompanyCamProjects(projectResponse) {
  const items = Array.isArray(projectResponse) ? projectResponse : projectResponse?.projects || projectResponse?.items || [];
  return items.map((project) => ({
    id: project.id || null,
    name: project.name || "Unnamed project",
    city: project.address?.city || null,
    state: project.address?.state || null,
    postalCode: project.address?.postal_code || null,
    updatedAt: project.updated_at || null,
    publicUrl: project.public_url || null,
    projectUrl: project.project_url || null,
  }));
}
