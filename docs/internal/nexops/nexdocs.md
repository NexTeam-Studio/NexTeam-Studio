# NexOps NexDocs

Last updated: 2026-07-19  
Build piece: NexDocs tenant document library

## Link integrity

An uploaded document may link to one client and optionally one property, job, and visit. The server resolves every supplied link from the active tenant, rejects client/property/job/visit mismatches, and derives the job property when it is omitted. This is the shared metadata contract used by library search, portal filtering, and Nexi `searchDocuments`; callers never supply trusted link metadata directly.

## Statuses

### Uploaded document visibility

#### `visible`
- Default state for every uploaded NexDocs document.
- Staff sees it in NexOps immediately after upload.
- Clients see it in NexPortal unless staff later opts that one document out.

#### `hidden_from_client`
- Set per uploaded document with `hiddenFromClient = true`.
- Staff still sees the file in NexOps and unified search.
- NexPortal omits that file while leaving the rest of the library intact.

### Folder state

#### `active`
- Freeform folder exists for one client.
- Folder can contain any mix of uploaded permits, plans, certificates, videos, and other freeform files.

## Transitions

### Staff creates folder
- Triggered by:
  - `POST /api/nexdocs/folders`
  - NexOps NexDocs folder-create surface
  - Nexi `createFolder` with chat-native approval
- Result:
  - one flat client-scoped folder
  - no nesting in v1
  - duplicate folder names for the same client are blocked

### Staff upload
- Triggered by:
  - `POST /api/nexdocs/documents`
  - NexOps NexDocs upload flow
  - Nexi `uploadDocumentToFolder` after yes/no approval
- Result:
  - file lands as a new `uploaded_file`
  - local text extraction runs first when supported
  - image OCR can run afterward when enabled and within the tenant spend cap
  - file becomes searchable alongside NexCam and office-record entries

### Client upload
- Triggered by:
  - `POST /api/nexportal/documents/upload`
- Result:
  - file lands directly with `source = "client_upload"`
  - no approval queue
  - staff-side NexOps library sees it immediately on the same shared rail

### Move document between folders
- Triggered by:
  - `PATCH /api/nexdocs/documents/:id`
  - NexOps NexDocs document-management controls
- Result:
  - document keeps one folder membership at a time
  - setting a new `folderId` removes the old one
  - setting `folderId = null` returns the file to `Unfiled`

### Toggle portal visibility
- Triggered by:
  - `PATCH /api/nexdocs/documents/:id`
  - NexOps NexDocs per-document visibility control
- Result:
  - only that one file hides from or returns to NexPortal
  - no job-wide side effects

## Triggers

### Staff routes
- `GET /api/nexdocs/library`
- `GET /api/nexdocs/folders`
- `POST /api/nexdocs/folders`
- `DELETE /api/nexdocs/folders/:id`
- `POST /api/nexdocs/documents`
- `PATCH /api/nexdocs/documents/:id`
- `DELETE /api/nexdocs/documents/:id`
- `GET /api/nexdocs/documents/:id/file`

### Client routes
- `GET /nexportal/documents`
- `POST /api/nexportal/documents/upload`
- `GET /nexportal/documents/:id/file`

### Nexi tools
- `searchDocuments`
- `listClientFolders`
- `createFolder`
- `uploadDocumentToFolder`

## Cascades

### A1-A3 unified library rule
- NexCam keeps its existing client -> job -> visit organization untouched.
- NexDocs adds a parallel freeform folder rail for generic documents.
- NexPortal and NexOps browse both through one library/search surface without merging the underlying storage models.

### C5 absorption rule
- Quote PDFs, invoice PDFs, receipt-review artifacts, and client statements now appear inside NexDocs `officeRecords`.
- NexPortal no longer depends on a separate document surface for those items.

### OCR and unified search rule
- Uploaded PDFs/TXT/CSV and other supported text-bearing files extract searchable text.
- JPG/PNG uploads can call the Anthropic OCR rail only when:
  - `NEXDOCS_OCR_ENABLED` is not forced off
  - approved Anthropic credentials are present
  - the estimated OCR spend stays within `NEXDOCS_OCR_BUDGET_CAP_USD`
- When the OCR cap is exceeded, the upload still lands, but the AI OCR call is skipped and a blocked usage record is written instead of spending.
- Unified search returns:
  - NexDocs uploaded files
  - office records
  - NexCam reports
  - NexCam signed documents
  - NexCam photos/media through the existing media-search path

### File-handling rule
- Current cap is `100 MB` per file.
- Supported uploads currently include:
  - PDF
  - DOC/DOCX
  - XLS/XLSX
  - CSV
  - TXT
  - JPG/JPEG
  - PNG
  - MP4
- Re-uploads create a new entry; there is no replace/version-history model in v1.

### Role fence rule
- `OWNER` and `OFFICE_ADMIN` can:
  - browse
  - upload
  - create folders
  - move documents
  - toggle client visibility
  - delete documents/folders
- `TECHNICIAN` can:
  - browse
  - upload
- `TECHNICIAN` cannot:
  - create/delete/reorganize folders
  - hide or delete documents

### Visual structure rule
- NexPortal unified view separates:
  - search
  - upload
  - freeform folders
  - office records
  - NexCam field rail
- NexOps keeps one dominant action on the staff surface and uses grouped sections instead of multiple disconnected document products.

## Current deliberate limits

- Folder structure is flat in v1; nested folders are not built.
- One document belongs to one folder at a time.
- Uploaded-file version history is not built.
- External OCR is currently image-only (`JPG/PNG`) and is parked behind a tenant spend cap before any provider call is made.
