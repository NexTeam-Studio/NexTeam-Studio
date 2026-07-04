import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname, extname } from "path";
import { google } from "googleapis";
import {
  listCompanyCamProjects,
  listCompanyCamProjectPhotos,
  listCompanyCamProjectChecklists,
  listCompanyCamProjectDocuments,
  summarizeCompanyCamProjects,
} from "../src/features/missioncontrol/services/companyCamReadOnlyService.js";

const DROPBOX_BASE = "C:/Users/Peyto/Dropbox/Business/Aquatrace LLC/Aquatrace";
const CUSTOMERS_BASE = join(DROPBOX_BASE, "Customers");
const SYSTEM_BASE = join(DROPBOX_BASE, "_System", "CompanyCam Sync");
const SYSTEM_MANIFEST_PATH = join(SYSTEM_BASE, "companycam_sync_manifest.json");
const TRANSFER_LOG_PATH = join(SYSTEM_BASE, "companycam_2026_transfer_log.json");
const LEGACY_MANIFEST_PATH = join(CUSTOMERS_BASE, "companycam_sync_manifest.json");
const GOOGLE_OAUTH_CREDENTIALS_PATH = join(process.cwd(), "credentials", "nexteam-gmail-oauth.json");

const options = parseArgs(process.argv.slice(2));

loadLocalEnv();
if (!options.dryRun) {
  ensureDir(SYSTEM_BASE);
}

const googleOAuthSettings = loadGoogleOAuthSettings();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || googleOAuthSettings.clientId;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || googleOAuthSettings.clientSecret;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || googleOAuthSettings.redirectUri;
const GMAIL_SEND_AS_NAME = process.env.GMAIL_SEND_AS_NAME || "Chris Sears - Aquatrace Swimming Pool Leak Detection";
const GMAIL_SEND_FROM = process.env.GMAIL_SEND_FROM;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

const RESOLVED_PROJECT_MAPPINGS = {
  "102340604": {
    companyName: "ASP of Asheville",
    propertySubfolderName: "100 Southway Garden Road, Asheville, North Carolina 28704",
  },
  "102340592": {
    companyName: "ASP of Asheville",
    propertySubfolderName: "1 Pebble Creek Drive, Asheville, North Carolina 28803",
  },
  "102340558": {
    companyName: "ASP of Asheville",
    propertySubfolderName: "240 Marathon Lane, Candler, North Carolina 28715",
  },
  "102340546": {
    companyName: "ASP of Asheville",
    propertySubfolderName: "18 Tunnel Road, Asheville, North Carolina 28805",
  },
  "102340518": {
    companyName: "ASP of Asheville",
    propertySubfolderName: "3 Reynolds Mountain Boulevard, Asheville, North Carolina 28804",
  },
  "102340289": {
    companyName: "ASP of Asheville",
    propertySubfolderName: "4900 Idle Hour Drive, Asheville, North Carolina 28728",
  },
  "41415343": {
    companyName: "Swim State Pool Service",
    propertySubfolderName: "2323 Southwest 112 Street, Gainesville, Florida 32607",
  },
  "101472176": {
    companyName: "Swim State Pool Service",
    propertySubfolderName: "2323 Southwest 112 Street, Gainesville, Florida 32607",
  },
  "100475612": {
    companyName: "Aqua Pro Pools",
    propertySubfolderName: "Thomas Residence",
  },
  "100475455": {
    companyName: "Aqua Pro Pools",
    propertySubfolderName: "107 Wenmount Court, Greenwood, South Carolina 29646",
  },
};

const startedAt = new Date().toISOString();
const manifest = loadManifest();
const projectsResponse = await listCompanyCamProjects({ perPage: 250 });
const summarizedProjects = summarizeCompanyCamProjects(projectsResponse)
  .map((project) => ({
    ...project,
    updatedIso: project.updatedAt ? new Date(Number(project.updatedAt) * 1000).toISOString() : null,
  }))
  .filter((project) => project.updatedIso?.startsWith(`${options.year}-`));

const countsByProject = new Map();
for (const project of summarizedProjects) {
  countsByProject.set(project.id, await loadCounts(project.id));
}

const preflight = buildPreflight({ projects: summarizedProjects, manifest, countsByProject });
const dangerousBlockers = preflight.rows.filter((row) => row.dangerousBlocker);

if (options.dryRun) {
  const uniquePropertySummary = buildUniquePropertySummary({ preflightRows: preflight.rows });
  const payload = {
    ok: dangerousBlockers.length === 0,
    startedAt,
    finishedAt: new Date().toISOString(),
    mode: "dry-run",
    year: options.year,
    total2026ProjectsFound: preflight.rows.length,
    totalProjectsTransferred: 0,
    totalProjectsSkippedAsAlreadySynced: preflight.rows.filter((row) => row.alreadySynced).length,
    totalUniquePropertiesFound: uniquePropertySummary.totalUniquePropertiesFound,
    totalUniquePropertiesSynced: uniquePropertySummary.totalUniquePropertiesSynced,
    totalUniquePropertiesNotSynced: uniquePropertySummary.totalUniquePropertiesNotSynced,
    totalWouldSync: preflight.rows.filter((row) => !row.alreadySynced).length,
    totalNeedsReview: uniquePropertySummary.totalUniquePropertiesNotSynced,
    totalPhotosDownloaded: 0,
    totalPhotosSkipped: 0,
    totalDocumentsReportsDownloaded: 0,
    totalChecklistsDownloaded: 0,
    totalErrors: dangerousBlockers.length,
    dangerousBlockers: dangerousBlockers.map((row) => ({
      projectId: row.projectId,
      projectName: row.projectName,
      blocker: row.dangerousBlocker,
    })),
    top10ProjectSummary: preflight.rows.slice(0, 10).map(toSummaryLine),
    uniquePropertySummary,
    manifestPath: SYSTEM_MANIFEST_PATH,
    transferLogPath: TRANSFER_LOG_PATH,
  };

  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

if (dangerousBlockers.length > 0) {
  const payload = {
    ok: false,
    startedAt,
    finishedAt: new Date().toISOString(),
    mode: "preflight-blocked",
    total2026ProjectsFound: preflight.rows.length,
    totalProjectsTransferred: 0,
    totalProjectsSkippedAsAlreadySynced: preflight.rows.filter((row) => row.alreadySynced).length,
    totalPhotosDownloaded: 0,
    totalPhotosSkipped: 0,
    totalDocumentsReportsDownloaded: 0,
    totalChecklistsDownloaded: 0,
    totalErrors: dangerousBlockers.length,
    dangerousBlockers: dangerousBlockers.map((row) => ({
      projectId: row.projectId,
      projectName: row.projectName,
      blocker: row.dangerousBlocker,
    })),
    top10ProjectSummary: preflight.rows.slice(0, 10).map(toSummaryLine),
    uniquePropertySummary: buildUniquePropertySummary({ preflightRows: preflight.rows }),
    manifestPath: SYSTEM_MANIFEST_PATH,
    transferLogPath: TRANSFER_LOG_PATH,
  };

  saveManifest(manifest);
  saveTransferLog(payload);
  const emailResult = await sendTransferStatusEmail(payload).catch((error) => ({
    sent: false,
    error: error.message,
  }));
  console.log(JSON.stringify({ ...payload, emailResult }, null, 2));
  process.exit(0);
}

const transferResults = [];
let totalPhotosDownloaded = 0;
let totalPhotosSkipped = 0;
let totalDocumentsReportsDownloaded = 0;
let totalChecklistsDownloaded = 0;
let totalErrors = 0;

for (const row of preflight.rows) {
  try {
    const transfer = await transferProject(row, manifest);
    transferResults.push(transfer);
    totalPhotosDownloaded += transfer.photoCountDownloaded;
    totalPhotosSkipped += transfer.photoCountSkipped;
    totalDocumentsReportsDownloaded += transfer.documentCountDownloaded;
    totalChecklistsDownloaded += transfer.checklistCountDownloaded;
  } catch (error) {
    totalErrors += 1;
    transferResults.push({
      projectId: row.projectId,
      projectName: row.projectName,
      status: "error",
      error: error.message,
      dropboxPath: row.proposedDropboxPath,
    });
  }
}

manifest.updatedAt = new Date().toISOString();
saveManifest(manifest);

const transferred = transferResults.filter((row) => row.status === "transferred" || row.status === "already-synced");
const payload = {
  ok: true,
  startedAt,
  finishedAt: new Date().toISOString(),
  mode: "transferred",
  total2026ProjectsFound: preflight.rows.length,
  totalProjectsTransferred: transferResults.filter((row) => row.status === "transferred").length,
  totalProjectsSkippedAsAlreadySynced: transferResults.filter((row) => row.status === "already-synced").length,
  totalPhotosDownloaded,
  totalPhotosSkipped,
  totalDocumentsReportsDownloaded,
  totalChecklistsDownloaded,
  totalErrors,
  top10ProjectSummary: transferred.slice(0, 10).map((row) => ({
    projectName: row.projectName,
    dropboxPath: row.dropboxPath,
    status: row.status,
    photoCountDownloaded: row.photoCountDownloaded,
    photoCountSkipped: row.photoCountSkipped,
    documentCountDownloaded: row.documentCountDownloaded,
    checklistCountDownloaded: row.checklistCountDownloaded,
  })),
  uniquePropertySummary: buildUniquePropertySummary({ preflightRows: preflight.rows, transferResults }),
  manifestPath: SYSTEM_MANIFEST_PATH,
  transferLogPath: TRANSFER_LOG_PATH,
};

saveTransferLog(payload);
const emailResult = await sendTransferStatusEmail(payload).catch((error) => ({
  sent: false,
  error: error.message,
}));
console.log(JSON.stringify({ ...payload, emailResult }, null, 2));

async function loadCounts(projectId) {
  const photos = await listCompanyCamProjectPhotos({ projectId, perPage: 250 }).catch(() => []);
  const documents = await listCompanyCamProjectDocuments({ projectId }).catch(() => []);
  const checklists = await listCompanyCamProjectChecklists({ projectId }).catch(() => []);

  return {
    photos: normalizeCollection(photos, ["photos"]).length,
    documents: normalizeCollection(documents, ["documents"]).length,
    checklists: normalizeCollection(checklists, ["checklists", "todo_lists"]).length,
  };
}

function buildPreflight({ projects, manifest, countsByProject }) {
  const byKey = new Map();
  for (const project of projects) {
    const duplicateKey = `${normalizeName(project.name)}|${normalizeValue(project.city)}|${normalizeValue(project.state)}`;
    if (!byKey.has(duplicateKey)) byKey.set(duplicateKey, []);
    byKey.get(duplicateKey).push(project);
  }

  const nameFrequency = new Map();
  for (const project of projects) {
    const key = normalizeName(project.name);
    nameFrequency.set(key, (nameFrequency.get(key) || 0) + 1);
  }

  const rows = projects
    .map((project) => {
      const monthFolder = buildMonthFolder(project.updatedIso);
      const mapping = mapProjectFolder(project, nameFrequency);
      const resolvedClientRoot = resolveClientRoot(mapping.clientRootPath);
      const manifestHits = Object.values(manifest.items).filter((item) => item.projectId === project.id);
      const counts = countsByProject.get(project.id) || { photos: 0, documents: 0, checklists: 0 };
      const duplicateKey = `${normalizeName(project.name)}|${normalizeValue(project.city)}|${normalizeValue(project.state)}`;
      const sameNameSameCityCount = byKey.get(duplicateKey)?.length || 0;

      let dangerousBlocker = null;
      if (!mapping.clientFolderName) {
        dangerousBlocker = "cannot determine client folder name";
      } else if (sameNameSameCityCount > 1 && !mapping.propertySubfolderName) {
        dangerousBlocker = "duplicate project name with no city/property separator";
      } else if (!normalizePath(resolvedClientRoot.clientRoot).startsWith(normalizePath(CUSTOMERS_BASE))) {
        dangerousBlocker = "proposed path would write outside approved Dropbox base";
      }

      return {
        projectId: project.id,
        projectName: project.name,
        city: project.city || null,
        state: project.state || null,
        postalCode: project.postalCode || null,
        dateUsedForMapping: project.updatedIso?.slice(0, 10) || null,
        monthFolder,
        mappingType: mapping.mappingType,
        confidence: mapping.confidence,
        confidenceReason: mapping.confidenceReason,
        proposedDropboxPath: resolvedClientRoot.clientRoot,
        existingFolderFound: resolvedClientRoot.reusedExistingFolder,
        alreadySynced: manifestHits.length > 0,
        photoCount: counts.photos,
        documentCount: counts.documents,
        checklistCount: counts.checklists,
        dangerousBlocker,
        propertySubfolderName: mapping.propertySubfolderName || null,
      };
    })
    .sort((a, b) => String(b.dateUsedForMapping).localeCompare(String(a.dateUsedForMapping)));

  return { rows };
}

function mapProjectFolder(project, nameFrequency) {
  const monthFolder = buildMonthFolder(project.updatedIso);
  const explicitMapping = RESOLVED_PROJECT_MAPPINGS[String(project.id)];
  if (explicitMapping) {
    return {
      clientFolderName: explicitMapping.companyName,
      propertySubfolderName: explicitMapping.propertySubfolderName,
      clientRootPath: join(CUSTOMERS_BASE, "2026", monthFolder, explicitMapping.companyName, explicitMapping.propertySubfolderName),
      mappingType: "multi-site/property",
      confidence: "high",
      confidenceReason: "Approved resolved contractor mapping.",
    };
  }

  const normalizedName = normalizeName(project.name);
  const personalName = extractPersonalName(project.name);
  const duplicateNameCount = nameFrequency.get(normalizedName) || 0;

  if (personalName) {
    const clientFolderName = `${personalName.last}, ${personalName.first}`;
    if (duplicateNameCount > 1 && project.city) {
      return {
        clientFolderName,
        propertySubfolderName: cleanFolderSegment(project.city),
        clientRootPath: join(CUSTOMERS_BASE, "2026", monthFolder, clientFolderName, cleanFolderSegment(project.city)),
        mappingType: "multi-site/property",
        confidence: "medium",
        confidenceReason: "Duplicate same-client project name; city used as the temporary subfolder.",
      };
    }

    return {
      clientFolderName,
      clientRootPath: join(CUSTOMERS_BASE, "2026", monthFolder, clientFolderName),
      mappingType: "individual",
      confidence: "high",
      confidenceReason: "",
    };
  }

  if (project.name && project.city) {
    const clientFolderName = cleanFolderSegment(project.name);
    return {
      clientFolderName,
      clientRootPath: join(CUSTOMERS_BASE, "2026", monthFolder, clientFolderName),
      mappingType: "individual",
      confidence: duplicateNameCount > 1 ? "medium" : "high",
      confidenceReason: duplicateNameCount > 1 ? "Non-personal project naming may still represent multiple related jobs." : "",
    };
  }

  return {
    clientFolderName: "",
    clientRootPath: join(CUSTOMERS_BASE, "2026", monthFolder, "needs-manual-review"),
    mappingType: "uncertain",
    confidence: "low",
    confidenceReason: "Project name could not be safely normalized into a client folder.",
  };
}

function buildMonthFolder(updatedIso) {
  const date = new Date(updatedIso);
  const monthNumber = String(date.getMonth() + 1).padStart(2, "0");
  const monthName = date.toLocaleString("en-US", { month: "long" });
  return `${monthNumber} - ${monthName}`;
}

function extractPersonalName(name) {
  const trimmed = String(name || "").trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (/[,&-]/.test(trimmed) || /\b(llc|inc|pools|mechanical|service|lodge|reserve|flats|asheville|state|elm|pro)\b/i.test(trimmed)) {
    return null;
  }

  const parts = trimmed.split(" ");
  if (parts.length < 2) {
    return null;
  }

  const first = toTitleCase(parts[0]);
  const last = toTitleCase(parts.at(-1));
  if (!first || !last) {
    return null;
  }

  return { first, last };
}

function resolveClientRoot(expectedPath) {
  const parentDir = dirname(expectedPath);
  const desiredName = expectedPath.split(/[/\\]+/).pop() || "";
  ensureDir(parentDir);
  const existingEntries = readdirSafe(parentDir);
  const matched = existingEntries.find((entry) => entry.toLowerCase() === desiredName.toLowerCase());
  if (matched) {
    return {
      clientRoot: join(parentDir, matched),
      reusedExistingFolder: true,
    };
  }

  return {
    clientRoot: expectedPath,
    reusedExistingFolder: false,
  };
}

async function transferProject(row, manifest) {
  const projectId = row.projectId;
  const photos = normalizeCollection(await listCompanyCamProjectPhotos({ projectId, perPage: 250 }), ["photos"]);
  const documents = normalizeCollection(await listCompanyCamProjectDocuments({ projectId }), ["documents"]);
  const checklists = normalizeCollection(await listCompanyCamProjectChecklists({ projectId }), ["checklists", "todo_lists"]);

  const photoDir = join(row.proposedDropboxPath, "CompanyCam Photos");
  const reportDir = join(row.proposedDropboxPath, "CompanyCam Reports");
  const checklistDir = join(row.proposedDropboxPath, "CompanyCam Checklists");
  ensureDir(photoDir);
  ensureDir(reportDir);
  ensureDir(checklistDir);

  let photoCountDownloaded = 0;
  let photoCountSkipped = 0;
  let documentCountDownloaded = 0;
  let checklistCountDownloaded = 0;

  for (const photo of photos) {
    const key = `photo:${photo.id}`;
    const manifestPath = manifest.items[key]?.path;
    const outputPath = shouldReuseManifestPath(manifestPath, photoDir)
      ? manifestPath
      : uniquePath(join(photoDir, buildPhotoFilename(photo)));

    if (existsSync(outputPath)) {
      photoCountSkipped += 1;
    } else {
      const photoUrl = pickPhotoUrl(photo);
      if (photoUrl) {
        await downloadFile(photoUrl, outputPath);
        photoCountDownloaded += 1;
      }
    }

    manifest.items[key] = {
      projectId,
      type: "photo",
      path: outputPath,
      updatedAt: new Date().toISOString(),
    };
  }

  for (const document of documents) {
    const key = `document:${document.id}`;
    const manifestPath = manifest.items[key]?.path;
    const outputPath = shouldReuseManifestPath(manifestPath, reportDir)
      ? manifestPath
      : uniquePath(join(reportDir, buildDocumentFilename(document)));

    if (!existsSync(outputPath) && document.url) {
      await downloadFile(document.url, outputPath);
      documentCountDownloaded += 1;
    }

    manifest.items[key] = {
      projectId,
      type: "document",
      path: outputPath,
      updatedAt: new Date().toISOString(),
    };
  }

  for (const checklist of checklists) {
    const key = `checklist:${checklist.id}`;
    const manifestPath = manifest.items[key]?.path;
    const outputPath = shouldReuseManifestPath(manifestPath, checklistDir)
      ? manifestPath
      : uniquePath(join(checklistDir, buildChecklistFilename(checklist)));

    if (!existsSync(outputPath)) {
      writeFileSync(outputPath, `${JSON.stringify(sanitizeChecklist(checklist), null, 2)}\n`, "utf8");
      checklistCountDownloaded += 1;
    }

    manifest.items[key] = {
      projectId,
      type: "checklist",
      path: outputPath,
      updatedAt: new Date().toISOString(),
    };
  }

  writeProjectMetadata(row, { photos, documents, checklists });

  return {
    projectId,
    projectName: row.projectName,
    dropboxPath: row.proposedDropboxPath,
    status: row.alreadySynced ? "already-synced" : "transferred",
    photoCountDownloaded,
    photoCountSkipped,
    documentCountDownloaded,
    checklistCountDownloaded,
  };
}

function writeProjectMetadata(row, { photos, documents, checklists }) {
  const safeFileName = `project_${row.projectId}_metadata.json`;
  const outputPath = join(SYSTEM_BASE, safeFileName);
  const payload = {
    projectId: row.projectId,
    projectName: row.projectName,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    dateUsedForMapping: row.dateUsedForMapping,
    proposedDropboxPath: row.proposedDropboxPath,
    mappingType: row.mappingType,
    confidence: row.confidence,
    photoCount: photos.length,
    documentCount: documents.length,
    checklistCount: checklists.length,
    photoIds: photos.map((item) => item.id),
    documentIds: documents.map((item) => item.id),
    checklistIds: checklists.map((item) => item.id),
    note: "Sanitized metadata only. Full street address intentionally omitted.",
  };
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function uniquePath(initialPath) {
  if (!existsSync(initialPath)) {
    return initialPath;
  }

  const ext = extname(initialPath);
  const base = ext ? initialPath.slice(0, -ext.length) : initialPath;
  let counter = 2;
  let candidate = `${base}_${counter}${ext}`;
  while (existsSync(candidate)) {
    counter += 1;
    candidate = `${base}_${counter}${ext}`;
  }
  return candidate;
}

function saveManifest(manifest) {
  writeFileSync(SYSTEM_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function saveTransferLog(payload) {
  writeFileSync(TRANSFER_LOG_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function loadManifest() {
  const sourcePath = existsSync(SYSTEM_MANIFEST_PATH)
    ? SYSTEM_MANIFEST_PATH
    : existsSync(LEGACY_MANIFEST_PATH)
      ? LEGACY_MANIFEST_PATH
      : null;

  if (!sourcePath) {
    return { updatedAt: null, items: {} };
  }

  try {
    const parsed = JSON.parse(readFileSync(sourcePath, "utf8"));
    return {
      updatedAt: parsed.updatedAt || null,
      items: parsed.items || {},
    };
  } catch {
    return { updatedAt: null, items: {} };
  }
}

function toSummaryLine(row) {
  return {
    projectName: row.projectName,
    city: row.city,
    dateUsedForMapping: row.dateUsedForMapping,
    proposedDropboxPath: row.proposedDropboxPath,
    mappingType: row.mappingType,
    confidence: row.confidence,
    photoCount: row.photoCount,
    documentCount: row.documentCount,
    checklistCount: row.checklistCount,
    existingFolderFound: row.existingFolderFound,
    alreadySynced: row.alreadySynced,
    dangerousBlocker: row.dangerousBlocker,
  };
}

function buildUniquePropertySummary({ preflightRows, transferResults = [] }) {
  const transferByProjectId = new Map(
    transferResults.map((row) => [String(row.projectId), row]),
  );
  const properties = new Map();
  const notSyncedReasonBreakdown = {
    missingPropertyAddressIdentifier: 0,
    duplicateAmbiguousContractorProject: 0,
    apiError: 0,
    noDownloadableFiles: 0,
    alreadySynced: 0,
    otherBlocker: 0,
  };

  for (const row of preflightRows) {
    const transfer = transferByProjectId.get(String(row.projectId)) || null;
    const property = resolvePropertyIdentity(row);
    if (!properties.has(property.key)) {
      properties.set(property.key, {
        identifier: property.identifier,
        contractorClient: row.projectName,
        city: row.city || null,
        state: row.state || null,
        postalCode: row.postalCode || null,
        synced: false,
        notSyncedReason: null,
        photoCount: 0,
        documentCount: 0,
        checklistCount: 0,
      });
    }

    const summary = properties.get(property.key);
    const isAlreadySynced = Boolean(row.alreadySynced) || transfer?.status === "already-synced";
    const isTransferred = transfer?.status === "transferred";
    const wasSynced = isAlreadySynced || isTransferred;

    if (wasSynced) {
      summary.synced = true;
      summary.photoCount += Number(transfer?.photoCountDownloaded || 0);
      summary.documentCount += Number(transfer?.documentCountDownloaded || 0);
      summary.checklistCount += Number(transfer?.checklistCountDownloaded || 0);
      if (isAlreadySynced) {
        notSyncedReasonBreakdown.alreadySynced += 1;
      }
      continue;
    }

    const reason = classifyNotSyncedReason(row, transfer);
    summary.notSyncedReason = reason;
    notSyncedReasonBreakdown[reason] += 1;
  }

  const propertyList = Array.from(properties.values());
  const synced = propertyList.filter((item) => item.synced);
  const notSynced = propertyList.filter((item) => !item.synced);

  return {
    totalUniquePropertiesFound: propertyList.length,
    totalUniquePropertiesSynced: synced.length,
    totalUniquePropertiesNotSynced: notSynced.length,
    notSyncedReasonBreakdown,
    synced: synced.map((item) => ({
      propertyIdentifier: item.identifier,
      contractorClient: item.contractorClient,
      cityStateZip: formatCityStateZip(item),
      fileCounts: {
        photos: item.photoCount,
        documentsReports: item.documentCount,
        checklists: item.checklistCount,
      },
    })),
    notSynced: notSynced.map((item) => ({
      propertyIdentifier: item.identifier,
      contractorClient: item.contractorClient,
      cityStateZip: formatCityStateZip(item),
      reason: item.notSyncedReason,
    })),
  };
}

function resolvePropertyIdentity(row) {
  if (row.propertySubfolderName) {
    return {
      key: `${row.projectName}|${row.propertySubfolderName}`,
      identifier: row.propertySubfolderName,
    };
  }

  const location = formatCityStateZip(row);
  if (location) {
    return {
      key: `${row.projectName}|${location}`,
      identifier: location,
    };
  }

  return {
    key: `${row.projectName}|${row.projectId}`,
    identifier: `Project ${row.projectId}`,
  };
}

function classifyNotSyncedReason(row, transfer) {
  if (transfer?.status === "error") {
    return "apiError";
  }
  if (row.dangerousBlocker === "duplicate project name with no city/property separator") {
    return "duplicateAmbiguousContractorProject";
  }
  if (row.dangerousBlocker === "cannot determine client folder name") {
    return "missingPropertyAddressIdentifier";
  }
  if ((row.photoCount || 0) === 0 && (row.documentCount || 0) === 0 && (row.checklistCount || 0) === 0) {
    return "noDownloadableFiles";
  }
  return "otherBlocker";
}

function formatCityStateZip(row) {
  const city = row.city || "";
  const state = row.state || "";
  const postalCode = row.postalCode || "";
  const cityState = [city, state].filter(Boolean).join(", ");
  if (cityState && postalCode) {
    return `${cityState} ${postalCode}`;
  }
  return cityState || postalCode || null;
}

function normalizeCollection(value, keys) {
  if (Array.isArray(value)) return value;
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
}

function ensureDir(pathname) {
  mkdirSync(pathname, { recursive: true });
}

function buildPhotoFilename(photo) {
  const date = new Date(Number(photo.captured_at || photo.created_at || Date.now() / 1000) * 1000);
  return `${formatDate(date)}_${formatTime(date)}_companycam_photo_${photo.id}${inferExtensionFromPhoto(photo)}`;
}

function buildDocumentFilename(document) {
  const date = new Date(Number(document.created_at || document.updated_at || Date.now() / 1000) * 1000);
  return `${formatDate(date)}_companycam_document_${document.id}${inferDocumentExtension(document)}`;
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
  const clean = String(pickPhotoUrl(photo) || "").split("?")[0];
  return extname(clean) || ".jpg";
}

function inferDocumentExtension(document) {
  const fromName = extname(document?.name || "");
  if (fromName) return fromName;
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
  if (!Array.isArray(subTasks)) return [];
  return subTasks.map((subTask) => ({
    id: subTask.id,
    label: subTask.label || "",
    answer_type: subTask.answer_type || "",
    answer_text: subTask.answer_text || null,
    answer_choices: Array.isArray(subTask.answer_choices) ? subTask.answer_choices : null,
  }));
}

function shouldReuseManifestPath(manifestPath, targetDir) {
  if (!manifestPath) return false;
  return normalizePath(manifestPath).startsWith(normalizePath(targetDir));
}

function normalizePath(value) {
  return String(value || "").replaceAll("/", "\\").toLowerCase();
}

function normalizeFolderName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function cleanFolderSegment(value) {
  return String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeName(value) {
  return normalizeFolderName(value);
}

function normalizeValue(value) {
  return normalizeFolderName(value || "");
}

function readdirSafe(pathname) {
  try {
    return readdirSync(pathname, { withFileTypes: false });
  } catch {
    return [];
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
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(args) {
  const parsed = {
    dryRun: false,
    year: "2026",
  };

  for (let index = 0; index < args.length; index += 1) {
    const value = String(args[index] || "").trim();
    if (value === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (value === "--year") {
      const next = String(args[index + 1] || "").trim();
      if (next) {
        parsed.year = next;
        index += 1;
      }
    }
  }

  return parsed;
}

function loadGoogleOAuthSettings() {
  if (!existsSync(GOOGLE_OAUTH_CREDENTIALS_PATH)) {
    return { clientId: "", clientSecret: "", redirectUri: "" };
  }

  try {
    const parsed = JSON.parse(readFileSync(GOOGLE_OAUTH_CREDENTIALS_PATH, "utf8"));
    const credentials = parsed.web || parsed.installed || {};
    return {
      clientId: credentials.client_id || "",
      clientSecret: credentials.client_secret || "",
      redirectUri: credentials.redirect_uris?.[0] || "",
    };
  } catch {
    return { clientId: "", clientSecret: "", redirectUri: "" };
  }
}

function createGoogleOAuthClient() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error("Google OAuth settings are not configured.");
  }
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

function buildGmailRawMessage({ fromName, fromAddress, toAddress, subject, body }) {
  const lines = [
    `From: ${fromName} <${fromAddress}>`,
    `To: ${toAddress}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

async function sendGmailMessage({ toAddress, subject, body }) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI || !GMAIL_SEND_FROM || !GOOGLE_REFRESH_TOKEN) {
    throw new Error("Google email settings are not configured for CompanyCam transfer email.");
  }

  const client = createGoogleOAuthClient();
  client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  const gmail = google.gmail({ version: "v1", auth: client });
  const raw = buildGmailRawMessage({
    fromName: GMAIL_SEND_AS_NAME,
    fromAddress: GMAIL_SEND_FROM,
    toAddress,
    subject,
    body,
  });
  const response = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
  return {
    sent: true,
    messageId: response.data.id,
  };
}

async function sendTransferStatusEmail(payload) {
  const toAddress = "chris@aquatraceleak.com";
  const subject = "CompanyCam 2026 Dropbox Transfer Complete";
  const body = buildTransferStatusEmailBody(payload);
  const sent = await sendGmailMessage({ toAddress, subject, body });
  return { toAddress, subject, ...sent };
}

function buildTransferStatusEmailBody(payload) {
  const statusLine = payload.ok && payload.totalErrors === 0 ? "COMPLETE" : "NOT COMPLETE";
  const unique = payload.uniquePropertySummary || {};
  const lines = [
    `transfer status: ${statusLine}${payload.ok && payload.totalErrors === 0 ? "" : " + blocker"}`,
    `total 2026 projects found: ${payload.total2026ProjectsFound}`,
    `total projects transferred: ${payload.totalProjectsTransferred}`,
    `total projects skipped as already synced: ${payload.totalProjectsSkippedAsAlreadySynced}`,
    `total photos downloaded: ${payload.totalPhotosDownloaded}`,
    `total photos skipped: ${payload.totalPhotosSkipped}`,
    `total documents/reports downloaded: ${payload.totalDocumentsReportsDownloaded}`,
    `total checklists downloaded: ${payload.totalChecklistsDownloaded}`,
    `total errors: ${payload.totalErrors}`,
    `sync manifest path: ${payload.manifestPath}`,
    `transfer log path: ${payload.transferLogPath}`,
    "",
    `total unique properties found: ${unique.totalUniquePropertiesFound ?? 0}`,
    `total unique properties synced: ${unique.totalUniquePropertiesSynced ?? 0}`,
    `total unique properties not synced: ${unique.totalUniquePropertiesNotSynced ?? 0}`,
    "",
    "not synced reason breakdown:",
    `- missing property/address identifier: ${unique.notSyncedReasonBreakdown?.missingPropertyAddressIdentifier ?? 0}`,
    `- duplicate/ambiguous contractor project: ${unique.notSyncedReasonBreakdown?.duplicateAmbiguousContractorProject ?? 0}`,
    `- API error: ${unique.notSyncedReasonBreakdown?.apiError ?? 0}`,
    `- no downloadable files: ${unique.notSyncedReasonBreakdown?.noDownloadableFiles ?? 0}`,
    `- already synced: ${unique.notSyncedReasonBreakdown?.alreadySynced ?? 0}`,
    `- other blocker: ${unique.notSyncedReasonBreakdown?.otherBlocker ?? 0}`,
    "",
    "SYNCED:",
    ...((unique.synced || []).slice(0, 20).map((item) => `- ${item.propertyIdentifier} | ${item.contractorClient} | ${item.cityStateZip || "n/a"} | photos ${item.fileCounts?.photos ?? 0}, docs/reports ${item.fileCounts?.documentsReports ?? 0}, checklists ${item.fileCounts?.checklists ?? 0}`)),
    "",
    "NOT SYNCED / NEEDS REVIEW:",
    ...((unique.notSynced || []).slice(0, 20).map((item) => `- ${item.propertyIdentifier} | ${item.contractorClient} | ${item.cityStateZip || "n/a"} | ${item.reason}`)),
    "",
    "reminder: CompanyCam was not modified",
    "reminder: no projects outside 2026 were downloaded",
    `next recommended action: ${payload.ok && payload.totalErrors === 0 ? "Review the transfer log and then decide whether to expand from 2026 sync into scheduled daily syncs." : "Review the listed blockers and resolve the remaining discrepancies before the next transfer run."}`,
  ];

  if (Array.isArray(payload.dangerousBlockers) && payload.dangerousBlockers.length) {
    lines.push("", "blockers:");
    for (const blocker of payload.dangerousBlockers) {
      lines.push(`- ${blocker.projectName} (${blocker.projectId}): ${blocker.blocker}`);
    }
  }

  return lines.join("\n");
}
