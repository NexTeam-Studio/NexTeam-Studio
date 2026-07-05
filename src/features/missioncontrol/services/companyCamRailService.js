import {
  getCompanyCamProject,
  getCompanyCamPhoto,
  hasCompanyCamToken,
  listCompanyCamPhotos,
  listCompanyCamProjectPhotos,
  listCompanyCamProjectChecklists,
  listCompanyCamProjectDocuments,
  listCompanyCamProjects,
} from "./companyCamReadOnlyService.js";

function normalizeCompanyCamToken(token) {
  const value = String(token || process.env.COMPANYCAM_API_TOKEN || "").trim();
  if (!value) {
    throw new Error("COMPANYCAM_API_TOKEN is not configured.");
  }

  return value;
}

function toPhotoCollection(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.photos)) {
    return response.photos;
  }

  return [];
}

function normalizeCompanyCamPhoto(photo = {}) {
  return {
    id: photo.id || null,
    project_id: photo.project_id || null,
    company_id: photo.company_id || null,
    creator_id: photo.creator_id || null,
    creator_name: photo.creator_name || null,
    creator_type: photo.creator_type || null,
    status: photo.status || null,
    processing_status: photo.processing_status || null,
    internal: photo.internal ?? null,
    captured_at: photo.captured_at || null,
    created_at: photo.created_at || null,
    updated_at: photo.updated_at || null,
    description: photo.description ?? null,
    coordinates: photo.coordinates || null,
    photo_url: photo.photo_url || null,
    uris: Array.isArray(photo.uris) ? photo.uris : [],
  };
}

function normalizeCompanyCamProject(project = {}) {
  return {
    id: project.id || null,
    name: project.name || null,
    status: project.status || null,
    archived: project.archived ?? null,
    public: project.public ?? null,
    address: project.address || null,
    coordinates: project.coordinates || null,
    photo_count: project.photo_count ?? null,
    project_url: project.project_url || null,
    public_url: project.public_url || null,
    integrations: Array.isArray(project.integrations) ? project.integrations : [],
    created_at: project.created_at || null,
    updated_at: project.updated_at || null,
  };
}

function normalizeCompanyCamDocument(document = {}) {
  return {
    id: document.id || null,
    project_id: document.project_id || null,
    company_id: document.company_id || null,
    name: document.name || null,
    content_type: document.content_type || null,
    byte_size: document.byte_size ?? null,
    created_at: document.created_at || null,
    updated_at: document.updated_at || null,
    url: document.url || null,
  };
}

function normalizeCompanyCamChecklist(checklist = {}) {
  return {
    id: checklist.id || null,
    project_id: checklist.project_id || null,
    name: checklist.name || null,
    completed_at: checklist.completed_at || null,
    created_at: checklist.created_at || null,
    updated_at: checklist.updated_at || null,
    sections: Array.isArray(checklist.sections) ? checklist.sections : [],
  };
}

function toProjectCollection(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.projects)) {
    return response.projects;
  }

  if (Array.isArray(response?.items)) {
    return response.items;
  }

  return [];
}

function toDocumentCollection(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.documents)) {
    return response.documents;
  }

  if (Array.isArray(response?.items)) {
    return response.items;
  }

  return [];
}

function toChecklistCollection(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.checklists)) {
    return response.checklists;
  }

  if (Array.isArray(response?.items)) {
    return response.items;
  }

  return [];
}

export async function searchProjects({
  token = process.env.COMPANYCAM_API_TOKEN,
  perPage = 10,
  page,
  query,
  modifiedSince,
} = {}) {
  const response = await listCompanyCamProjects({
    token: normalizeCompanyCamToken(token),
    perPage,
    page,
    query,
    modifiedSince,
  });

  return toProjectCollection(response).map((project) => normalizeCompanyCamProject(project));
}

export async function listAllPhotos({
  token = process.env.COMPANYCAM_API_TOKEN,
  perPage = 100,
  page,
  query,
  modifiedSince,
} = {}) {
  const response = await listCompanyCamPhotos({
    token: normalizeCompanyCamToken(token),
    perPage,
    page,
    query,
    modifiedSince,
  });

  return toPhotoCollection(response).map((photo) => normalizeCompanyCamPhoto(photo));
}

export async function getPhoto(photoId, { token = process.env.COMPANYCAM_API_TOKEN } = {}) {
  const normalizedPhotoId = String(photoId || "").trim();
  if (!normalizedPhotoId) {
    throw new Error("A CompanyCam photo ID is required.");
  }

  const response = await getCompanyCamPhoto({
    token: normalizeCompanyCamToken(token),
    photoId: normalizedPhotoId,
  });

  return normalizeCompanyCamPhoto(response);
}

export async function getProject(projectId, { token = process.env.COMPANYCAM_API_TOKEN } = {}) {
  const normalizedProjectId = String(projectId || "").trim();
  if (!normalizedProjectId) {
    throw new Error("A CompanyCam project ID is required.");
  }

  const response = await getCompanyCamProject({
    token: normalizeCompanyCamToken(token),
    projectId: normalizedProjectId,
  });

  return normalizeCompanyCamProject(response);
}

export async function listProjectDocuments(projectId, { token = process.env.COMPANYCAM_API_TOKEN } = {}) {
  const normalizedProjectId = String(projectId || "").trim();
  if (!normalizedProjectId) {
    throw new Error("A CompanyCam project ID is required.");
  }

  const response = await listCompanyCamProjectDocuments({
    token: normalizeCompanyCamToken(token),
    projectId: normalizedProjectId,
  });

  return toDocumentCollection(response).map((document) => normalizeCompanyCamDocument(document));
}

export async function listProjectPhotos(projectId, { token = process.env.COMPANYCAM_API_TOKEN, perPage = 10 } = {}) {
  const normalizedProjectId = String(projectId || "").trim();
  if (!normalizedProjectId) {
    throw new Error("A CompanyCam project ID is required.");
  }

  const response = await listCompanyCamProjectPhotos({
    token: normalizeCompanyCamToken(token),
    projectId: normalizedProjectId,
    perPage,
  });

  return toPhotoCollection(response).map((photo) => normalizeCompanyCamPhoto(photo));
}

export async function listProjectChecklists(projectId, { token = process.env.COMPANYCAM_API_TOKEN } = {}) {
  const normalizedProjectId = String(projectId || "").trim();
  if (!normalizedProjectId) {
    throw new Error("A CompanyCam project ID is required.");
  }

  const response = await listCompanyCamProjectChecklists({
    token: normalizeCompanyCamToken(token),
    projectId: normalizedProjectId,
  });

  return toChecklistCollection(response).map((checklist) => normalizeCompanyCamChecklist(checklist));
}

export function createCompanyCamRail({ token = process.env.COMPANYCAM_API_TOKEN } = {}) {
  const railToken = normalizeCompanyCamToken(token);

  return {
    hasToken: () => hasCompanyCamToken(railToken),
    searchProjects: (options = {}) => searchProjects({ ...options, token: railToken }),
    listAllPhotos: (options = {}) => listAllPhotos({ ...options, token: railToken }),
    getPhoto: (photoId, options = {}) => getPhoto(photoId, { ...options, token: railToken }),
    getProject: (projectId, options = {}) => getProject(projectId, { ...options, token: railToken }),
    listProjectPhotos: (projectId, options = {}) => listProjectPhotos(projectId, { ...options, token: railToken }),
    listProjectDocuments: (projectId, options = {}) => listProjectDocuments(projectId, { ...options, token: railToken }),
    listProjectChecklists: (projectId, options = {}) => listProjectChecklists(projectId, { ...options, token: railToken }),
  };
}
