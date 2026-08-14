import React, { useEffect, useMemo, useState } from "react";
import { ProductInlineLabel } from "../../../../../shared/branding/ProductBranding";
import {
  NexopsActionButton,
  NexopsActionRail,
  NexopsBanner,
  NexopsEmptyState,
  NexopsSectionCard,
  NexopsStatusPill,
  NexopsUploadQueue,
  type UploadQueueItem
} from "../../../../../shared/ui/NexOpsUiKit";

type TenantRole = "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";
type NexDocsDocumentKind =
  | "uploaded_file"
  | "quote_pdf"
  | "invoice_pdf"
  | "receipt"
  | "statement"
  | "field_report"
  | "signed_document"
  | "photo";

interface NexDocsLibraryEntry {
  id: string;
  section: "folder" | "office_records" | "nexcam";
  kind: NexDocsDocumentKind;
  source: "staff_upload" | "client_upload" | "generated" | "nexcam";
  label: string;
  fileName: string;
  mimeType: string;
  occurredAt: string;
  hiddenFromClient: boolean;
  generated: boolean;
  propertyLabel: string;
  folderId?: string;
  folderLabel?: string;
  propertyId?: string;
  jobId?: string;
  visitId?: string;
  quoteId?: string;
  invoiceId?: string;
  receiptReviewId?: string;
  signedDocumentId?: string;
  reportId?: string;
  mediaId?: string;
  sizeBytes?: number;
  searchText?: string;
}

interface NexDocsFolderRecord {
  id: string;
  tenantId: string;
  clientId: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

interface NexDocsFolderView {
  folder: NexDocsFolderRecord;
  documents: NexDocsLibraryEntry[];
}

interface NexDocsSearchHit {
  entry: NexDocsLibraryEntry;
  score: number;
  matched: string[];
}

interface NexDocsClientLibrary {
  clientId: string;
  folders: NexDocsFolderView[];
  unfiled: NexDocsLibraryEntry[];
  officeRecords: NexDocsLibraryEntry[];
  nexcam: {
    reports: NexDocsLibraryEntry[];
    signedDocuments: NexDocsLibraryEntry[];
    media: NexDocsLibraryEntry[];
  };
  searchResults: NexDocsSearchHit[];
  counts: {
    uploaded: number;
    officeRecords: number;
    nexcam: number;
    total: number;
  };
}

interface NexDocsPermissions {
  canUpload: boolean;
  canManageFolders: boolean;
  canDeleteDocuments: boolean;
  canToggleVisibility: boolean;
}

interface NexDocsLibraryResponse {
  ok: boolean;
  permissions?: NexDocsPermissions;
  library?: NexDocsClientLibrary;
  error?: string;
}

interface NexDocsFolderMutationResponse {
  ok: boolean;
  folder?: NexDocsFolderRecord;
  error?: string;
}

interface NexDocsDocumentRecord {
  id: string;
  tenantId: string;
  clientId: string;
  folderId?: string;
  propertyId?: string;
  jobId?: string;
  visitId?: string;
  label: string;
  fileName: string;
  mimeType: string;
  storageRef: string;
  source: "staff_upload" | "client_upload" | "generated";
  hiddenFromClient: boolean;
  sizeBytes?: number;
  searchText?: string;
  uploadedBy?: string;
  createdAt: string;
  updatedAt: string;
}

interface NexDocsDocumentMutationResponse {
  ok: boolean;
  document?: NexDocsDocumentRecord;
  error?: string;
}

type NexDocsSection = "folders" | "office" | "nexcam";

export interface NexDocsClientWorkspaceProps {
  tenantId: string;
  clientId: string;
  clientName: string;
  role: TenantRole;
  nexcamCounts: {
    media: number;
    reports: number;
    signedDocuments: number;
  };
  propertyId?: string;
  jobId?: string;
  visitId?: string;
  contextLabel?: string;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", year: "numeric" });
}

function fileSizeLabel(sizeBytes: number | undefined): string {
  if (!sizeBytes || sizeBytes <= 0) {
    return "";
  }
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function kindLabel(kind: NexDocsDocumentKind): string {
  switch (kind) {
    case "uploaded_file":
      return "Uploaded file";
    case "quote_pdf":
      return "Quote PDF";
    case "invoice_pdf":
      return "Invoice PDF";
    case "receipt":
      return "Receipt";
    case "statement":
      return "Statement";
    case "field_report":
      return "Field report";
    case "signed_document":
      return "Signed document";
    case "photo":
      return "Photo / media";
    default:
      return "Document";
  }
}

function uploadSourceLabel(source: NexDocsLibraryEntry["source"]): string {
  switch (source) {
    case "client_upload":
      return "Client upload";
    case "staff_upload":
      return "Staff upload";
    case "generated":
      return "Generated";
    case "nexcam":
      return "NexCam";
    default:
      return "Document";
  }
}

function entryHref(tenantId: string, entry: NexDocsLibraryEntry): string {
  if (entry.kind === "uploaded_file") {
    return `/api/nexdocs/documents/${encodeURIComponent(entry.id)}/file?tenantId=${encodeURIComponent(tenantId)}&download=1`;
  }
  if (entry.kind === "quote_pdf" && entry.quoteId) {
    return `/api/crm/quotes/${encodeURIComponent(entry.quoteId)}/pdf?tenantId=${encodeURIComponent(tenantId)}`;
  }
  if (entry.kind === "invoice_pdf" && entry.invoiceId) {
    return `/api/crm/invoices/${encodeURIComponent(entry.invoiceId)}/pdf?tenantId=${encodeURIComponent(tenantId)}`;
  }
  if (entry.kind === "receipt" && entry.receiptReviewId) {
    return `/api/crm/receipt-reviews/${encodeURIComponent(entry.receiptReviewId)}?tenantId=${encodeURIComponent(tenantId)}`;
  }
  if (entry.kind === "statement") {
    return `/api/crm/clients/${encodeURIComponent(entry.id.replace(/^statement_/, ""))}/statement.pdf?tenantId=${encodeURIComponent(tenantId)}`;
  }
  if (entry.kind === "field_report" && entry.reportId) {
    return `/api/fielddocs/reports/${encodeURIComponent(entry.reportId)}/pdf?tenantId=${encodeURIComponent(tenantId)}`;
  }
  if (entry.kind === "signed_document" && entry.signedDocumentId) {
    return `/api/fielddocs/signed-documents/${encodeURIComponent(entry.signedDocumentId)}/pdf?tenantId=${encodeURIComponent(tenantId)}`;
  }
  if (entry.kind === "photo" && entry.mediaId) {
    return `/api/media/${encodeURIComponent(entry.mediaId)}?tenantId=${encodeURIComponent(tenantId)}`;
  }
  return "#";
}

async function fileToBase64(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function NexDocsClientWorkspace(props: NexDocsClientWorkspaceProps): React.ReactElement {
  const [library, setLibrary] = useState<NexDocsClientLibrary | null>(null);
  const [permissions, setPermissions] = useState<NexDocsPermissions | null>(null);
  const [statusMessage, setStatusMessage] = useState("Loading NexDocs...");
  const [busy, setBusy] = useState("");
  const [activeSection, setActiveSection] = useState<NexDocsSection>("folders");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [newFolderLabel, setNewFolderLabel] = useState("");
  const [uploadFolderId, setUploadFolderId] = useState("");
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);

  const folderOptions = useMemo(
    () => (library?.folders ?? []).map((view) => view.folder).sort((left, right) => left.label.localeCompare(right.label)),
    [library]
  );

  useEffect(() => {
    setSearchDraft("");
    setSearchQuery("");
    setCreateFolderOpen(false);
    setUploadOpen(false);
    setUploadFolderId("");
    setUploadLabel("");
    setUploadFile(null);
    setUploadQueue([]);
    setActiveSection("folders");
    void refreshLibrary("");
  }, [props.tenantId, props.clientId, props.propertyId, props.jobId, props.visitId]);

  async function refreshLibrary(query = searchQuery): Promise<void> {
    setBusy((current) => current || "refresh");
    try {
      const suffix = query.trim() ? `&q=${encodeURIComponent(query.trim())}` : "";
      const body = await fetch(`/api/nexdocs/clients/${encodeURIComponent(props.clientId)}/library?tenantId=${encodeURIComponent(props.tenantId)}${suffix}`)
        .then((response) => response.json() as Promise<NexDocsLibraryResponse>);
      if (!body.ok || !body.library || !body.permissions) {
        setLibrary(null);
        setPermissions(null);
        setStatusMessage(body.error ?? "NexDocs is unavailable right now.");
        return;
      }
      setLibrary(body.library);
      setPermissions(body.permissions);
      setStatusMessage(
        query.trim()
          ? `${body.library.searchResults.length} result${body.library.searchResults.length === 1 ? "" : "s"} across folders, office records, and NexCam.`
          : `${body.library.counts.total} total item${body.library.counts.total === 1 ? "" : "s"} loaded for ${props.clientName}.`
      );
    } catch {
      setLibrary(null);
      setPermissions(null);
      setStatusMessage("NexDocs API unreachable.");
    } finally {
      setBusy("");
    }
  }

  async function handleSearch(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextQuery = searchDraft.trim();
    setSearchQuery(nextQuery);
    await refreshLibrary(nextQuery);
  }

  async function handleCreateFolder(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!newFolderLabel.trim()) {
      setStatusMessage("Folder name is required.");
      return;
    }
    setBusy("create-folder");
    setStatusMessage("Creating folder...");
    try {
      const body = await fetch(`/api/nexdocs/clients/${encodeURIComponent(props.clientId)}/folders`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          label: newFolderLabel.trim()
        })
      }).then((response) => response.json() as Promise<NexDocsFolderMutationResponse>);
      if (!body.ok) {
        setStatusMessage(body.error ?? "Folder creation failed.");
        return;
      }
      setNewFolderLabel("");
      setCreateFolderOpen(false);
      setStatusMessage(`Created folder ${body.folder?.label ?? "folder"}.`);
      await refreshLibrary(searchQuery);
    } catch {
      setStatusMessage("Folder creation failed.");
    } finally {
      setBusy("");
    }
  }

  async function handleDeleteFolder(folder: NexDocsFolderRecord): Promise<void> {
    setBusy(`delete-folder-${folder.id}`);
    setStatusMessage(`Deleting ${folder.label}...`);
    try {
      const body = await fetch(`/api/nexdocs/clients/${encodeURIComponent(props.clientId)}/folders/${encodeURIComponent(folder.id)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          clientId: props.clientId
        })
      }).then((response) => response.json() as Promise<{ ok: boolean; error?: string }>);
      if (!body.ok) {
        setStatusMessage(body.error ?? "Folder delete failed.");
        return;
      }
      setStatusMessage(`${folder.label} deleted.`);
      await refreshLibrary(searchQuery);
    } catch {
      setStatusMessage("Folder delete failed.");
    } finally {
      setBusy("");
    }
  }

  async function handleUploadDocument(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!uploadFile) {
      setStatusMessage("Choose a file before uploading.");
      return;
    }
    const queueId = `upload-${Date.now()}`;
    setBusy("upload");
    setStatusMessage(`Uploading ${uploadFile.name}...`);
    setUploadQueue([{
      id: queueId,
      label: uploadFile.name,
      detail: uploadFolderId ? `Uploading into ${folderOptions.find((folder) => folder.id === uploadFolderId)?.label ?? "selected folder"}.` : "Uploading into the unfiled client stack.",
      progress: 20,
      status: "syncing"
    }]);
    try {
      const fileBase64 = await fileToBase64(uploadFile);
      setUploadQueue([{
        id: queueId,
        label: uploadFile.name,
        detail: "File encoded locally. Sending to NexDocs now.",
        progress: 55,
        status: "syncing"
      }]);
      const body = await fetch(`/api/nexdocs/clients/${encodeURIComponent(props.clientId)}/documents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          ...(uploadFolderId ? { folderId: uploadFolderId } : {}),
          ...(uploadLabel.trim() ? { label: uploadLabel.trim() } : {}),
          ...(props.propertyId ? { propertyId: props.propertyId } : {}),
          ...(props.jobId ? { jobId: props.jobId } : {}),
          ...(props.visitId ? { visitId: props.visitId } : {}),
          fileName: uploadFile.name,
          mimeType: uploadFile.type || "application/octet-stream",
          fileBase64
        })
      }).then((response) => response.json() as Promise<NexDocsDocumentMutationResponse>);
      if (!body.ok || !body.document) {
        setUploadQueue([{
          id: queueId,
          label: uploadFile.name,
          detail: body.error ?? "Upload failed.",
          progress: 100,
          status: "failed"
        }]);
        setStatusMessage(body.error ?? "Upload failed.");
        return;
      }
      setUploadQueue([{
        id: queueId,
        label: body.document.fileName,
        detail: "Upload complete. Staff and portal visibility are now in sync.",
        progress: 100,
        status: "done"
      }]);
      setUploadFile(null);
      setUploadFolderId("");
      setUploadLabel("");
      setUploadOpen(false);
      setStatusMessage(`${body.document.label} uploaded.`);
      await refreshLibrary(searchQuery);
    } catch {
      setUploadQueue([{
        id: queueId,
        label: uploadFile.name,
        detail: "Upload failed before NexDocs could save the file.",
        progress: 100,
        status: "failed"
      }]);
      setStatusMessage("Upload failed.");
    } finally {
      setBusy("");
    }
  }

  async function moveDocument(entry: NexDocsLibraryEntry, folderId: string): Promise<void> {
    setBusy(`move-${entry.id}`);
    setStatusMessage(`Moving ${entry.label}...`);
    try {
      const body = await fetch(`/api/nexdocs/documents/${encodeURIComponent(entry.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          clientId: props.clientId,
          folderId: folderId || null
        })
      }).then((response) => response.json() as Promise<NexDocsDocumentMutationResponse>);
      if (!body.ok) {
        setStatusMessage(body.error ?? "Document move failed.");
        return;
      }
      setStatusMessage(folderId ? `${entry.label} moved.` : `${entry.label} returned to unfiled.`);
      await refreshLibrary(searchQuery);
    } catch {
      setStatusMessage("Document move failed.");
    } finally {
      setBusy("");
    }
  }

  async function toggleVisibility(entry: NexDocsLibraryEntry): Promise<void> {
    setBusy(`visibility-${entry.id}`);
    setStatusMessage(`${entry.hiddenFromClient ? "Restoring" : "Hiding"} ${entry.label} in NexPortal...`);
    try {
      const body = await fetch(`/api/nexdocs/documents/${encodeURIComponent(entry.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          clientId: props.clientId,
          hiddenFromClient: !entry.hiddenFromClient
        })
      }).then((response) => response.json() as Promise<NexDocsDocumentMutationResponse>);
      if (!body.ok) {
        setStatusMessage(body.error ?? "Visibility update failed.");
        return;
      }
      setStatusMessage(body.document?.hiddenFromClient ? `${entry.label} is hidden from NexPortal.` : `${entry.label} is visible in NexPortal again.`);
      await refreshLibrary(searchQuery);
    } catch {
      setStatusMessage("Visibility update failed.");
    } finally {
      setBusy("");
    }
  }

  async function deleteDocument(entry: NexDocsLibraryEntry): Promise<void> {
    setBusy(`delete-doc-${entry.id}`);
    setStatusMessage(`Deleting ${entry.label}...`);
    try {
      const body = await fetch(`/api/nexdocs/documents/${encodeURIComponent(entry.id)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          clientId: props.clientId
        })
      }).then((response) => response.json() as Promise<{ ok: boolean; error?: string }>);
      if (!body.ok) {
        setStatusMessage(body.error ?? "Delete failed.");
        return;
      }
      setStatusMessage(`${entry.label} deleted.`);
      await refreshLibrary(searchQuery);
    } catch {
      setStatusMessage("Delete failed.");
    } finally {
      setBusy("");
    }
  }

  function renderEntryList(entries: NexDocsLibraryEntry[], emptyTitle: string, emptyDetail: string): React.ReactElement {
    const scopedEntries = entries.filter((entry) => (!props.jobId || entry.jobId === props.jobId) && (!props.visitId || entry.visitId === props.visitId) && (!props.propertyId || entry.propertyId === props.propertyId));
    if (!scopedEntries.length) {
      return <NexopsEmptyState kind="fresh" title={emptyTitle} detail={emptyDetail} />;
    }
    return (
      <ul className="nexdocs-entry-list">
        {scopedEntries.map((entry) => (
          <li key={entry.id} className="nexdocs-entry-card">
            <div className="nexdocs-entry-main">
              <div>
                <div className="nexdocs-entry-heading">
                  <strong>{entry.label}</strong>
                  <div className="nexdocs-entry-pills">
                    <NexopsStatusPill label={kindLabel(entry.kind)} tone={entry.section === "nexcam" ? "quiet" : "secondary"} />
                    <NexopsStatusPill label={uploadSourceLabel(entry.source)} tone={entry.source === "client_upload" ? "warning" : entry.generated ? "quiet" : "secondary"} />
                    {entry.hiddenFromClient ? <NexopsStatusPill label="Hidden from portal" tone="blocked" /> : null}
                  </div>
                </div>
                <p className="nexdocs-entry-meta">
                  {entry.propertyLabel}
                  {entry.folderLabel ? ` | ${entry.folderLabel}` : ""}
                  {fileSizeLabel(entry.sizeBytes) ? ` | ${fileSizeLabel(entry.sizeBytes)}` : ""}
                  {entry.searchText ? " | Searchable" : ""}
                </p>
                <small>{formatDateTime(entry.occurredAt)}</small>
              </div>
              <div className="nexdocs-entry-actions">
                <a className="nexops-link-button" href={entryHref(props.tenantId, entry)} target="_blank" rel="noreferrer">Open</a>
              </div>
            </div>
            {entry.kind === "uploaded_file" && (permissions?.canManageFolders || permissions?.canToggleVisibility || permissions?.canDeleteDocuments) ? (
              <details className="nexdocs-entry-manage">
                <summary>Manage file</summary>
                <div className="nexdocs-entry-manage-body">
                  {permissions?.canManageFolders ? (
                    <label className="nexops-field">
                      <span>Folder</span>
                      <select
                        value={entry.folderId ?? ""}
                        disabled={busy === `move-${entry.id}`}
                        onChange={(event) => void moveDocument(entry, event.target.value)}
                      >
                        <option value="">Unfiled</option>
                        {folderOptions.map((folder) => (
                          <option key={folder.id} value={folder.id}>{folder.label}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <div className="nexdocs-entry-manage-actions">
                    {permissions?.canToggleVisibility ? (
                      <button type="button" className="nexops-link-button" disabled={busy === `visibility-${entry.id}`} onClick={() => void toggleVisibility(entry)}>
                        {entry.hiddenFromClient ? "Show in portal" : "Hide from portal"}
                      </button>
                    ) : null}
                    {permissions?.canDeleteDocuments ? (
                      <button type="button" className="nexops-link-button danger" disabled={busy === `delete-doc-${entry.id}`} onClick={() => void deleteDocument(entry)}>
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              </details>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  function renderFoldersSection(): React.ReactElement {
    if (!library) {
      if (busy === "refresh") {
        return <NexopsEmptyState kind="fresh" title="Loading NexDocs" detail="Retrieving the client library and connected NexCam records." />;
      }
      return <NexopsEmptyState kind="offline" title="NexDocs offline" detail="The unified client library could not load yet." />;
    }
    return (
      <div className="nexdocs-section-stack">
        {library.folders.length ? library.folders.map(({ folder, documents }) => (
          <article key={folder.id} className="nexdocs-folder-card">
            <div className="nexdocs-folder-header">
              <div>
                <strong>{folder.label}</strong>
                <p>{documents.length} document{documents.length === 1 ? "" : "s"} in this folder.</p>
              </div>
              {permissions?.canManageFolders ? (
                <button type="button" className="nexops-link-button" disabled={busy === `delete-folder-${folder.id}`} onClick={() => void handleDeleteFolder(folder)}>
                  Delete folder
                </button>
              ) : null}
            </div>
            {renderEntryList(documents, "Folder is empty", "Upload into this folder or move an existing file here.")}
          </article>
        )) : (
          <NexopsEmptyState kind="fresh" title="No folders yet" detail="Create a freeform client folder for permits, certifications, plans, or anything else the office wants grouped together." />
        )}
        {library.unfiled.length ? (
          <article className="nexdocs-folder-card">
            <div className="nexdocs-folder-header">
              <div>
                <strong>Unfiled</strong>
                <p>Files waiting without a folder still stay searchable and portal-visible by default.</p>
              </div>
            </div>
            {renderEntryList(library.unfiled, "Nothing unfiled", "Every uploaded file is already sitting in a folder.")}
          </article>
        ) : null}
      </div>
    );
  }

  function renderOfficeRecordsSection(): React.ReactElement {
    return renderEntryList(
      library?.officeRecords ?? [],
      "No office records yet",
      "Quote PDFs, invoice PDFs, receipts, and the client statement will collect here instead of a separate document rail."
    );
  }

  function renderNexCamSection(): React.ReactElement {
    if (!library) {
      if (busy === "refresh") {
        return <NexopsEmptyState kind="fresh" title="Loading NexCam" detail="Retrieving field media and reports from the unified document library." />;
      }
      return <NexopsEmptyState kind="offline" title="NexCam rail offline" detail="The field rail could not load from the unified document library yet." />;
    }
    return (
      <div className="nexdocs-section-stack">
        <article className="nexdocs-folder-card">
          <div className="nexdocs-folder-header">
            <div>
              <strong>Reports</strong>
              <p>Posted field reports stay auto-organized exactly as NexCam already stores them.</p>
            </div>
          </div>
          {renderEntryList(library.nexcam.reports, "No field reports yet", "Posted visit reports will show up here automatically.")}
        </article>
        <article className="nexdocs-folder-card">
          <div className="nexdocs-folder-header">
            <div>
              <strong>Signed documents</strong>
              <p>Signed waivers, approvals, and completion records stay on the existing NexCam rail.</p>
            </div>
          </div>
          {renderEntryList(library.nexcam.signedDocuments, "No signed documents yet", "Signed PDFs will appear here when the visit flow creates them.")}
        </article>
        <article className="nexdocs-folder-card">
          <div className="nexdocs-folder-header">
            <div>
              <strong>Photos and media</strong>
              <p>Existing job and visit media is still auto-organized by NexCam and searchable from this unified view.</p>
            </div>
          </div>
          {renderEntryList(library.nexcam.media, "No media yet", "NexCam photos and videos will appear here once they are captured.")}
        </article>
      </div>
    );
  }

  const visibleSection = activeSection === "folders"
    ? renderFoldersSection()
    : activeSection === "office"
      ? renderOfficeRecordsSection()
      : renderNexCamSection();

  return (
    <NexopsSectionCard
      eyebrow="NexDocs"
      title={props.contextLabel ?? "Unified client library"}
      detail={props.contextLabel ? "Files created here inherit the selected client, job, and visit context automatically." : "One search across custom folders, office PDFs, and the unchanged NexCam field rail."}
      actions={<NexopsStatusPill label={`${library?.counts.total ?? 0} total`} tone="quiet" />}
      className="nexdocs-workspace"
    >
      <NexopsActionRail
        dominant={<NexopsActionButton label="Upload document" tone="dominant" disabled={!permissions?.canUpload || busy === "upload"} onClick={() => setUploadOpen((current) => !current)} />}
        secondary={permissions?.canManageFolders ? <NexopsActionButton label="Create folder" tone="secondary" disabled={busy === "create-folder"} onClick={() => setCreateFolderOpen((current) => !current)} /> : undefined}
        utility={<button type="button" className="nexops-link-button" disabled={busy === "refresh"} onClick={() => void refreshLibrary(searchQuery)}>Refresh</button>}
      />

      <div className="nexdocs-count-row">
        <NexopsStatusPill label={`${library?.counts.uploaded ?? 0} uploaded`} tone="secondary" />
        <NexopsStatusPill label={`${library?.counts.officeRecords ?? 0} office record${(library?.counts.officeRecords ?? 0) === 1 ? "" : "s"}`} tone="quiet" />
        <NexopsStatusPill label={`${props.nexcamCounts.media + props.nexcamCounts.reports + props.nexcamCounts.signedDocuments} NexCam item${props.nexcamCounts.media + props.nexcamCounts.reports + props.nexcamCounts.signedDocuments === 1 ? "" : "s"}`} tone="quiet" />
      </div>

      {props.role === "TECHNICIAN" ? (
        <NexopsBanner
          tone="quiet"
          title="Technician access"
          detail="You can upload and open files here. Folder structure, deletes, and portal visibility changes stay with office roles."
        />
      ) : null}

      <NexopsBanner
        tone="quiet"
        title="Upload rules"
        detail="Flat per-client folders, one folder per file, no version history, and a 100 MB file cap. PDFs and text-like files are searchable by content once indexed."
      />

      <form className="nexdocs-search-row" onSubmit={(event) => void handleSearch(event)}>
        <label className="nexops-field">
          <span>Search all documents</span>
          <input
            value={searchDraft}
            placeholder="Pool permit, receipt, leak report..."
            onChange={(event) => setSearchDraft(event.target.value)}
          />
        </label>
        <div className="nexdocs-search-actions">
          <button type="submit" className="nexops-link-button" disabled={busy === "refresh"}>Search</button>
          {searchQuery ? <button type="button" className="nexops-link-button" onClick={() => { setSearchDraft(""); setSearchQuery(""); void refreshLibrary(""); }}>Clear</button> : null}
        </div>
      </form>

      {uploadOpen ? (
        <form className="nexdocs-inline-panel" onSubmit={(event) => void handleUploadDocument(event)}>
          <div className="nexdocs-inline-panel-header">
            <div>
              <strong>Upload into NexDocs</strong>
              <p>{props.contextLabel ? `This file will stay linked to ${props.contextLabel}.` : "Staff uploads land here immediately and show in NexPortal unless you later hide them per document."}</p>
            </div>
          </div>
          <div className="nexdocs-inline-grid">
            <label className="nexops-field">
              <span>Folder</span>
              <select value={uploadFolderId} onChange={(event) => setUploadFolderId(event.target.value)}>
                <option value="">Unfiled</option>
                {folderOptions.map((folder) => (
                  <option key={folder.id} value={folder.id}>{folder.label}</option>
                ))}
              </select>
            </label>
            <label className="nexops-field">
              <span>Label</span>
              <input value={uploadLabel} placeholder="Optional document label" onChange={(event) => setUploadLabel(event.target.value)} />
            </label>
          </div>
          <label className="nexops-field">
            <span>File</span>
            <input type="file" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} />
          </label>
          <div className="nexops-inline-actions">
            <button type="submit" disabled={!uploadFile || busy === "upload"}>Upload now</button>
            <button type="button" className="ghost" onClick={() => { setUploadOpen(false); setUploadFile(null); setUploadLabel(""); setUploadFolderId(""); }}>Cancel</button>
          </div>
        </form>
      ) : null}

      {createFolderOpen ? (
        <form className="nexdocs-inline-panel" onSubmit={(event) => void handleCreateFolder(event)}>
          <div className="nexdocs-inline-panel-header">
            <div>
              <strong>Create a client folder</strong>
              <p>Folders stay flat in v1 and a file belongs to one folder at a time.</p>
            </div>
          </div>
          <div className="nexdocs-inline-grid">
            <label className="nexops-field">
              <span>Folder name</span>
              <input value={newFolderLabel} placeholder="Permit packet" onChange={(event) => setNewFolderLabel(event.target.value)} />
            </label>
          </div>
          <div className="nexops-inline-actions">
            <button type="submit" disabled={!newFolderLabel.trim() || busy === "create-folder"}>Save folder</button>
            <button type="button" className="ghost" onClick={() => { setCreateFolderOpen(false); setNewFolderLabel(""); }}>Cancel</button>
          </div>
        </form>
      ) : null}

      {uploadQueue.length ? <NexopsUploadQueue items={uploadQueue} /> : null}

      {statusMessage ? <p className="nexops-form-note">{statusMessage}</p> : null}

      {searchQuery ? (
        <section className="nexdocs-results-block">
          <div className="nexdocs-folder-header">
            <div>
              <strong>Search results</strong>
              <p>{library?.searchResults.length ?? 0} result{(library?.searchResults.length ?? 0) === 1 ? "" : "s"} matched "{searchQuery}".</p>
            </div>
          </div>
          {renderEntryList(
            library?.searchResults.map((hit) => hit.entry) ?? [],
            "No document matches",
            "Try a filename, permit number, invoice number, or text known to be inside the document."
          )}
        </section>
      ) : null}

      <div className="nexdocs-section-switcher" role="tablist" aria-label="Document sections">
        <button type="button" role="tab" aria-selected={activeSection === "folders"} className={activeSection === "folders" ? "active" : ""} onClick={() => setActiveSection("folders")}>
          Your folders
        </button>
        <button type="button" role="tab" aria-selected={activeSection === "office"} className={activeSection === "office" ? "active" : ""} onClick={() => setActiveSection("office")}>
          Office records
        </button>
        <button type="button" role="tab" aria-selected={activeSection === "nexcam"} className={activeSection === "nexcam" ? "active" : ""} onClick={() => setActiveSection("nexcam")}>
          <ProductInlineLabel product="nexcam" label="NexCam rail" />
        </button>
      </div>

      {visibleSection}
    </NexopsSectionCard>
  );
}
