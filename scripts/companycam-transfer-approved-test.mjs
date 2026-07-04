import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join, extname, dirname } from "path";
import {
  listCompanyCamProjects,
  listCompanyCamProjectPhotos,
  listCompanyCamProjectChecklists,
  listCompanyCamProjectDocuments,
  summarizeCompanyCamProjects,
} from "../src/features/missioncontrol/services/companyCamReadOnlyService.js";

const DROPBOX_BASE = "C:/Users/Peyto/Dropbox/Business/Aquatrace LLC/Aquatrace/Customers";
const MANIFEST_PATH = join(DROPBOX_BASE, "companycam_sync_manifest.json");
const APPROVED_PROJECTS = [
  {
    name: "Michael Whelan",
    expectedPath: join(DROPBOX_BASE, "2026", "04 - April", "whelan, michael"),
  },
  {
    name: "Kyle Brookshire",
    expectedPath: join(DROPBOX_BASE, "2026", "04 - April", "brookshire, kyle"),
  },
];

loadLocalEnv();

const manifest = loadManifest();
const projectLookup = await getApprovedProjects();
const results = [];

for (const approved of APPROVED_PROJECTS) {
  const project = projectLookup.get(approved.name);
  if (!project) {
    throw new Error(`Approved project not found in CompanyCam: ${approved.name}`);
  }

  const photos = await listCompanyCamProjectPhotos({ projectId: project.id, perPage: 250 });
  const checklists = await listCompanyCamProjectChecklists({ projectId: project.id });
  const documents = await listCompanyCamProjectDocuments({ projectId: project.id });

  const photoItems = normalizeCollection(photos, ["photos"]);
  const checklistItems = normalizeCollection(checklists, ["checklists", "todo_lists"]);
  const documentItems = normalizeCollection(documents, ["documents"]);

  const { clientRoot, reusedExistingFolder } = resolveClientRoot(approved.expectedPath);
  const photoDir = join(clientRoot, "CompanyCam Photos");
  const reportDir = join(clientRoot, "CompanyCam Reports");
  const metadataDir = join(clientRoot, "CompanyCam Metadata");

  ensureDir(photoDir);
  ensureDir(reportDir);
  ensureDir(metadataDir);

  const downloadedPhotos = [];
  const skippedPhotos = [];
  const downloadedDocuments = [];
  const skippedDocuments = [];
  const downloadedChecklists = [];
  const skippedChecklists = [];

  for (const photo of photoItems) {
    const key = `photo:${photo.id}`;
    const manifestPath = manifest.items[key]?.path;
    const outputPath = shouldReuseManifestPath(manifestPath, photoDir)
      ? manifestPath
      : join(photoDir, buildPhotoFilename(photo));
    if (!existsSync(outputPath)) {
      const photoUrl = pickPhotoUrl(photo);
      if (photoUrl) {
        await downloadFile(photoUrl, outputPath);
        downloadedPhotos.push(outputPath);
      }
    } else {
      skippedPhotos.push(outputPath);
    }

    manifest.items[key] = {
      projectId: project.id,
      type: "photo",
      path: outputPath,
      updatedAt: new Date().toISOString(),
    };
  }

  for (const document of documentItems) {
    const key = `document:${document.id}`;
    const manifestPath = manifest.items[key]?.path;
    const outputPath = shouldReuseManifestPath(manifestPath, reportDir)
      ? manifestPath
      : join(reportDir, buildDocumentFilename(document));
    if (!existsSync(outputPath) && document.url) {
      await downloadFile(document.url, outputPath);
      downloadedDocuments.push(outputPath);
    } else {
      skippedDocuments.push(outputPath);
    }

    manifest.items[key] = {
      projectId: project.id,
      type: "document",
      path: outputPath,
      updatedAt: new Date().toISOString(),
    };
  }

  for (const checklist of checklistItems) {
    const key = `checklist:${checklist.id}`;
    const manifestPath = manifest.items[key]?.path;
    const outputPath = shouldReuseManifestPath(manifestPath, reportDir)
      ? manifestPath
      : join(reportDir, buildChecklistFilename(checklist));
    if (!existsSync(outputPath)) {
      const sanitizedChecklist = sanitizeChecklist(checklist);
      writeFileSync(outputPath, `${JSON.stringify(sanitizedChecklist, null, 2)}\n`, "utf8");
      downloadedChecklists.push(outputPath);
    } else {
      skippedChecklists.push(outputPath);
    }

    manifest.items[key] = {
      projectId: project.id,
      type: "checklist",
      path: outputPath,
      updatedAt: new Date().toISOString(),
    };
  }

  const metadataPath = join(metadataDir, "companycam_project_metadata.json");
  const metadata = buildProjectMetadata({
    project,
    photoItems,
    documentItems,
    checklistItems,
    clientRoot,
  });
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  results.push({
    name: approved.name,
    projectId: project.id,
    clientRoot,
    reusedExistingFolder,
    photoDir,
    reportDir,
    metadataPath,
    photoCountDownloaded: downloadedPhotos.length,
    photoCountSkipped: skippedPhotos.length,
    documentCountDownloaded: downloadedDocuments.length,
    documentCountSkipped: skippedDocuments.length,
    checklistCountDownloaded: downloadedChecklists.length,
    checklistCountSkipped: skippedChecklists.length,
  });
}

manifest.updatedAt = new Date().toISOString();
writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  ok: true,
  transferredProjects: results,
  manifestPath: MANIFEST_PATH,
  projectCount: results.length,
}, null, 2));

async function getApprovedProjects() {
  const response = await listCompanyCamProjects({ perPage: 100 });
  const items = summarizeCompanyCamProjects(response);
  const approvedNames = new Set(APPROVED_PROJECTS.map((item) => item.name));
  const map = new Map();
  for (const item of items) {
    if (approvedNames.has(item.name)) {
      map.set(item.name, item);
    }
  }
  return map;
}

function normalizeCollection(value, keys) {
  if (Array.isArray(value)) {
    return value;
  }

  for (const key of keys) {
    if (Array.isArray(value?.[key])) {
      return value[key];
    }
  }

  return [];
}

function ensureDir(pathname) {
  mkdirSync(pathname, { recursive: true });
}

function resolveClientRoot(expectedPath) {
  const parentDir = dirname(expectedPath);
  const desiredName = expectedPath.split(/[/\\]+/).pop() || "";
  ensureDir(parentDir);

  let reusedExistingFolder = false;
  let resolvedPath = expectedPath;

  const existingEntries = readdirSafe(parentDir);
  const matched = existingEntries.find((name) => name.toLowerCase() === desiredName.toLowerCase());
  if (matched) {
    resolvedPath = join(parentDir, matched);
    reusedExistingFolder = true;
  }

  return { clientRoot: resolvedPath, reusedExistingFolder };
}

function readdirSafe(pathname) {
  try {
    return readdirSync(pathname, { withFileTypes: false });
  } catch {
    return [];
  }
}

function shouldReuseManifestPath(manifestPath, targetDir) {
  if (!manifestPath) {
    return false;
  }

  const normalizedManifest = normalizePath(manifestPath);
  const normalizedTarget = normalizePath(targetDir);
  return normalizedManifest.startsWith(normalizedTarget);
}

function normalizePath(value) {
  return String(value || "").replaceAll("/", "\\").toLowerCase();
}

function buildPhotoFilename(photo) {
  const date = new Date(Number(photo.captured_at || photo.created_at || Date.now() / 1000) * 1000);
  const extension = inferExtensionFromPhoto(photo);
  return `${formatDate(date)}_${formatTime(date)}_companycam_photo_${photo.id}${extension}`;
}

function buildDocumentFilename(document) {
  const date = new Date(Number(document.created_at || document.updated_at || Date.now() / 1000) * 1000);
  const extension = inferDocumentExtension(document);
  return `${formatDate(date)}_companycam_document_${document.id}${extension}`;
}

function buildChecklistFilename(checklist) {
  const date = new Date(Number(checklist.created_at || checklist.updated_at || Date.now() / 1000) * 1000);
  return `${formatDate(date)}_companycam_checklist_${checklist.id}.json`;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatTime(date) {
  return date.toISOString().slice(11, 16).replace(":", "");
}

function pickPhotoUrl(photo) {
  const original = Array.isArray(photo.uris) ? photo.uris.find((uri) => uri.type === "original") : null;
  return original?.url || photo?.url || photo?.photo_url || null;
}

function inferExtensionFromPhoto(photo) {
  const url = pickPhotoUrl(photo) || "";
  const clean = url.split("?")[0];
  const extension = extname(clean);
  return extension || ".jpg";
}

function inferDocumentExtension(document) {
  const nameExtension = extname(document?.name || "");
  if (nameExtension) {
    return nameExtension;
  }

  const contentType = String(document?.content_type || "").toLowerCase();
  if (contentType.includes("pdf")) return ".pdf";
  if (contentType.includes("json")) return ".json";
  return ".bin";
}

async function downloadFile(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed ${response.status} for ${outputPath}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  writeFileSync(outputPath, Buffer.from(arrayBuffer));
}

function sanitizeChecklist(checklist) {
  return {
    id: checklist.id,
    title: checklist.title || checklist.name || "Checklist",
    created_at: checklist.created_at || null,
    updated_at: checklist.updated_at || null,
    sections: Array.isArray(checklist.sections)
      ? checklist.sections.map((section) => ({
          id: section.id,
          title: section.title || "",
          position: section.position ?? null,
          tasks: Array.isArray(section.tasks)
            ? section.tasks.map((task) => ({
                id: task.id,
                title: task.title || "",
                position: task.position ?? null,
                details: task.details || "",
                answer_summary: summarizeSubTasks(task.sub_tasks),
              }))
            : [],
        }))
      : [],
  };
}

function summarizeSubTasks(subTasks) {
  if (!Array.isArray(subTasks)) {
    return [];
  }

  return subTasks.map((subTask) => ({
    id: subTask.id,
    label: subTask.label || "",
    answer_type: subTask.answer_type || "",
    answer_text: subTask.answer_text || null,
    answer_choices: Array.isArray(subTask.answer_choices) ? subTask.answer_choices : null,
  }));
}

function buildProjectMetadata({ project, photoItems, documentItems, checklistItems, clientRoot }) {
  return {
    projectId: project.id,
    projectName: project.name,
    city: project.city || null,
    state: project.state || null,
    postalCode: project.postalCode || null,
    updatedAt: project.updatedAt || null,
    clientRoot,
    photoCount: photoItems.length,
    documentCount: documentItems.length,
    checklistCount: checklistItems.length,
    photoIds: photoItems.map((item) => item.id),
    documentIds: documentItems.map((item) => item.id),
    checklistIds: checklistItems.map((item) => item.id),
    note: "Sanitized metadata only. Full street address intentionally omitted.",
  };
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    return { updatedAt: null, items: {} };
  }

  try {
    const parsed = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
    return {
      updatedAt: parsed.updatedAt || null,
      items: parsed.items || {},
    };
  } catch {
    return { updatedAt: null, items: {} };
  }
}

function loadLocalEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
