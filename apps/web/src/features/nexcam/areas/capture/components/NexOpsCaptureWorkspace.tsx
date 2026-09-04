import React from "react";
import { ModuleHeroCard } from "../../../../../shared/ui/NexOpsBusinessTemplates";
import type {
  CrmClient,
  FieldDocsMediaRecord
} from "../../../../nexopsShell/contracts/workspaceContracts";
import type {
  CaptureBatchRecord,
  CaptureClientTargetJob,
  CaptureClientTargetVisit,
  CaptureSessionMode,
  CaptureSessionOrigin,
  CaptureWorkspaceView
} from "../contracts/captureContracts";
import { NexOpsNavGlyph } from "../../../../nexopsShell/workspaceSupport";

interface NexOpsCaptureWorkspaceProps {
  operatorTenantId: string;
  captureInputRef: React.RefObject<HTMLInputElement | null>;
  captureBusy: string;
  captureStatus: string;
  captureWorkspaceView: CaptureWorkspaceView;
  captureSession: CaptureBatchRecord | null;
  captureSessionOrigin: CaptureSessionOrigin;
  captureSessionMode: CaptureSessionMode;
  captureInbox: CaptureBatchRecord[];
  captureInboxStatus: string;
  activeCaptureMedia: FieldDocsMediaRecord | null;
  captureSessionMedia: FieldDocsMediaRecord[];
  captureAnchorGps: { lat: number; lng: number } | null | undefined;
  captureGpsMoved: boolean;
  filteredClients: CrmClient[];
  selectedCaptureClient: CrmClient | undefined;
  assignedCaptureClient: CrmClient | undefined;
  captureClientQuery: string;
  setCaptureClientQuery: React.Dispatch<React.SetStateAction<string>>;
  captureSelectedClientId: string;
  setCaptureSelectedClientId: React.Dispatch<React.SetStateAction<string>>;
  captureSelectedJobId: string;
  setCaptureSelectedJobId: React.Dispatch<React.SetStateAction<string>>;
  captureSelectedVisitId: string;
  setCaptureSelectedVisitId: React.Dispatch<React.SetStateAction<string>>;
  captureTargets: { jobs: CaptureClientTargetJob[]; visits: CaptureClientTargetVisit[] };
  visibleCaptureVisits: CaptureClientTargetVisit[];
  onStartCaptureSession: () => Promise<CaptureBatchRecord | null> | void;
  onOpenCaptureWorkspace: (view: CaptureWorkspaceView) => void;
  onFinishCaptureSession: () => void;
  onUploadCapturePhotos: (files: FileList | null) => Promise<void> | void;
  onSetCaptureSelectedMediaId: React.Dispatch<React.SetStateAction<string>>;
  onRouteCaptureToNewRequest: (batch?: CaptureBatchRecord | null) => void;
  onMarkCaptureDecideLater: () => Promise<void> | void;
  onSetCaptureSessionMode: React.Dispatch<React.SetStateAction<CaptureSessionMode>>;
  onSetCaptureStatus: React.Dispatch<React.SetStateAction<string>>;
  onLoadCaptureTargets: (clientId: string) => Promise<void> | void;
  onAssignCaptureToExistingClient: () => Promise<void> | void;
  onReopenCaptureBatch: (batch: CaptureBatchRecord, nextMode: CaptureSessionMode, statusText: string) => void;
  onSetCaptureSession: React.Dispatch<React.SetStateAction<CaptureBatchRecord | null>>;
  onSetCaptureSessionOrigin: React.Dispatch<React.SetStateAction<CaptureSessionOrigin>>;
  clientDisplayName: (client: CrmClient) => string;
  clientPrimaryAddress: (client: CrmClient) => string;
  contactSummary: (client: CrmClient) => string;
}

export function NexOpsCaptureWorkspace(props: NexOpsCaptureWorkspaceProps): React.ReactElement {
  const {
    operatorTenantId,
    captureInputRef,
    captureBusy,
    captureStatus,
    captureWorkspaceView,
    captureSession,
    captureSessionOrigin,
    captureSessionMode,
    captureInbox,
    captureInboxStatus,
    activeCaptureMedia,
    captureSessionMedia,
    captureAnchorGps,
    captureGpsMoved,
    filteredClients,
    selectedCaptureClient,
    assignedCaptureClient,
    captureClientQuery,
    setCaptureClientQuery,
    captureSelectedClientId,
    setCaptureSelectedClientId,
    captureSelectedJobId,
    setCaptureSelectedJobId,
    captureSelectedVisitId,
    setCaptureSelectedVisitId,
    captureTargets,
    visibleCaptureVisits,
    onStartCaptureSession,
    onOpenCaptureWorkspace,
    onFinishCaptureSession,
    onUploadCapturePhotos,
    onSetCaptureSelectedMediaId,
    onRouteCaptureToNewRequest,
    onMarkCaptureDecideLater,
    onSetCaptureSessionMode,
    onSetCaptureStatus,
    onLoadCaptureTargets,
    onAssignCaptureToExistingClient,
    onReopenCaptureBatch,
    onSetCaptureSession,
    onSetCaptureSessionOrigin,
    clientDisplayName,
    clientPrimaryAddress,
    contactSummary
  } = props;
  const [reviewMedia, setReviewMedia] = React.useState<FieldDocsMediaRecord | null>(null);
  const [reviewCommentDraft, setReviewCommentDraft] = React.useState("");
  const [reviewManualTagsDraft, setReviewManualTagsDraft] = React.useState("");
  const [reviewHiddenFromClientDraft, setReviewHiddenFromClientDraft] = React.useState(false);
  const [reviewAnnotationsDraft, setReviewAnnotationsDraft] = React.useState<NonNullable<FieldDocsMediaRecord["annotations"]>>([]);
  const [reviewSaving, setReviewSaving] = React.useState(false);
  const [drawMode, setDrawMode] = React.useState(false);
  const [drawingPath, setDrawingPath] = React.useState<Array<{ x: number; y: number }> | null>(null);
  const reviewStageRef = React.useRef<HTMLDivElement | null>(null);

  function syncCaptureMediaRecord(nextMedia: FieldDocsMediaRecord): void {
    setReviewMedia(nextMedia);
    onSetCaptureSession((current) => current && current.media.some((item) => item.id === nextMedia.id)
      ? {
          ...current,
          media: current.media.map((item) => item.id === nextMedia.id ? { ...item, ...nextMedia } : item)
        }
      : current);
  }

  function openCaptureMediaReview(media: FieldDocsMediaRecord): void {
    setReviewMedia(media);
    setReviewCommentDraft("");
    setReviewManualTagsDraft((media.manualTags ?? []).join(", "));
    setReviewHiddenFromClientDraft(media.hiddenFromClient === true);
    setReviewAnnotationsDraft(media.annotations ?? []);
    setDrawingPath(null);
    setDrawMode(false);
  }

  function closeCaptureMediaReview(): void {
    setReviewMedia(null);
    setReviewCommentDraft("");
    setReviewManualTagsDraft("");
    setReviewHiddenFromClientDraft(false);
    setReviewAnnotationsDraft([]);
    setReviewSaving(false);
    setDrawingPath(null);
    setDrawMode(false);
  }

  function mediaPoint(event: React.PointerEvent<HTMLDivElement>): { x: number; y: number } | null {
    const bounds = reviewStageRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      return null;
    }
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
    };
  }

  function beginMediaDraw(event: React.PointerEvent<HTMLDivElement>): void {
    if (!drawMode || !reviewMedia || reviewMedia.type !== "photo") {
      return;
    }
    const point = mediaPoint(event);
    if (!point) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrawingPath([point]);
  }

  function updateMediaDraw(event: React.PointerEvent<HTMLDivElement>): void {
    if (!drawMode || !drawingPath) {
      return;
    }
    const point = mediaPoint(event);
    if (!point) {
      return;
    }
    setDrawingPath((current) => current ? [...current, point] : current);
  }

  function finishMediaDraw(event: React.PointerEvent<HTMLDivElement>): void {
    if (!drawMode || !drawingPath) {
      return;
    }
    const point = mediaPoint(event);
    const points = point ? [...drawingPath, point] : drawingPath;
    if (points.length >= 2) {
      setReviewAnnotationsDraft((current) => [
        ...current,
        {
          id: `annotation_${crypto.randomUUID()}`,
          kind: "path",
          color: "#106060",
          createdAt: new Date().toISOString(),
          points
        }
      ]);
      onSetCaptureStatus("Markup added. Save media review to keep it.");
    }
    setDrawingPath(null);
  }

  function removeLastMarkup(): void {
    setReviewAnnotationsDraft((current) => current.slice(0, -1));
    onSetCaptureStatus("Last markup removed. Save media review to keep the change.");
  }

  function annotationPolyline(points: Array<{ x: number; y: number }>): string {
    return points.map((point) => `${(point.x * 100).toFixed(2)},${(point.y * 100).toFixed(2)}`).join(" ");
  }

  async function saveCaptureMediaReview(): Promise<void> {
    if (!reviewMedia || reviewSaving) {
      return;
    }
    setReviewSaving(true);
    onSetCaptureStatus("Saving photo review...");
    try {
      const response = await fetch(`/api/fielddocs/media/${encodeURIComponent(reviewMedia.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorTenantId,
          ...(reviewCommentDraft.trim() ? { comment: reviewCommentDraft.trim() } : {}),
          manualTags: reviewManualTagsDraft.split(",").map((tag) => tag.trim()).filter(Boolean),
          hiddenFromClient: reviewHiddenFromClientDraft,
          annotations: reviewAnnotationsDraft
        })
      });
      const body = await response.json() as { ok: boolean; media?: FieldDocsMediaRecord; error?: string };
      if (!response.ok || !body.ok || !body.media) {
        throw new Error(body.error ?? "Photo review save failed.");
      }
      syncCaptureMediaRecord(body.media);
      setReviewCommentDraft("");
      setDrawingPath(null);
      setDrawMode(false);
      onSetCaptureStatus("Photo review saved.");
    } catch (error) {
      onSetCaptureStatus(error instanceof Error ? error.message : "Photo review save failed.");
    } finally {
      setReviewSaving(false);
    }
  }

  async function setCaptureMediaTrashState(trashed: boolean): Promise<void> {
    if (!reviewMedia || reviewSaving) {
      return;
    }
    setReviewSaving(true);
    onSetCaptureStatus(trashed ? "Moving photo to tenant trash..." : "Restoring photo from tenant trash...");
    try {
      const response = await fetch(`/api/fielddocs/media/${encodeURIComponent(reviewMedia.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorTenantId,
          trashedAt: trashed ? new Date().toISOString() : null,
          purgeAfter: trashed ? new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString() : null
        })
      });
      const body = await response.json() as { ok: boolean; media?: FieldDocsMediaRecord; error?: string };
      if (!response.ok || !body.ok || !body.media) {
        throw new Error(body.error ?? "Photo trash update failed.");
      }
      syncCaptureMediaRecord(body.media);
      onSetCaptureStatus(trashed ? "Photo moved to tenant trash. It will purge after 30 days unless restored." : "Photo restored from tenant trash.");
    } catch (error) {
      onSetCaptureStatus(error instanceof Error ? error.message : "Photo trash update failed.");
    } finally {
      setReviewSaving(false);
    }
  }

  function mediaContextLabel(media: FieldDocsMediaRecord): string {
    if (media.visitId) return `Visit ${media.visitId}`;
    if (media.jobId) return `Job ${media.jobId}`;
    if (media.propertyId) return `Property ${media.propertyId}`;
    return "Unassigned review queue";
  }

  return (
    <>
      <section className="nexops-module-page nexops-capture-workspace">
        <input
          ref={captureInputRef}
          className="sr-only"
          type="file"
          multiple
          onChange={(event) => {
            void onUploadCapturePhotos(event.target.files);
            event.currentTarget.value = "";
          }}
        />
        <ModuleHeroCard
          eyebrow="NexCam capture"
          title="Capture and route"
          detail="Shoot first, then route to a new request, an existing client, or the unassigned inbox without leaving the NexOps shell."
          icon={<NexOpsNavGlyph module="capture" />}
          primaryAction={<button className="nexops-hero-primary-button" type="button" onClick={() => void onStartCaptureSession()} disabled={Boolean(captureBusy)}>New capture</button>}
          secondaryActions={<button type="button" onClick={() => onOpenCaptureWorkspace("unassigned")}>Continue unassigned batch</button>}
          className="module-hero-card--quote"
        />

        <div className="nexops-module-grid nexops-module-grid-wide">
          <article className="nexops-module-card">
            <div className="nexops-detail-header">
              <div>
                <p className="eyebrow">{captureWorkspaceView === "unassigned" ? "Inbox" : "Live session"}</p>
                <h2>{captureWorkspaceView === "unassigned" ? "Unassigned capture batches" : captureSession ? "Current capture batch" : "Start a new capture batch"}</h2>
                <p>{captureStatus}</p>
              </div>
              {captureSession ? (
                <span className="nexops-stat-chip">
                  {captureSession.media.length} photo{captureSession.media.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>

            {captureWorkspaceView === "session" ? (
              captureSession ? (
                <>
                  <div className="nexops-inline-actions">
                    <button type="button" onClick={() => captureInputRef.current?.click()} disabled={Boolean(captureBusy)}>
                      {captureSession.media.length ? "Capture more photos" : "Open camera"}
                    </button>
                    <button type="button" className="secondary" onClick={() => onOpenCaptureWorkspace("unassigned")}>Inbox</button>
                    <button type="button" className="ghost" onClick={onFinishCaptureSession}>Done</button>
                  </div>
                  {activeCaptureMedia ? (
                    <article className="nexops-capture-preview-card">
                      <div className="nexops-detail-header">
                        <div>
                          <p className="eyebrow">{captureSessionOrigin === "reopened" ? "Reopened batch" : "Latest capture"}</p>
                          <h3>{activeCaptureMedia.aiCaption ?? `Capture ${captureSessionMedia.findIndex((media) => media.id === activeCaptureMedia.id) + 1}`}</h3>
                          <p>
                            {activeCaptureMedia.exif?.ts ? new Date(activeCaptureMedia.exif.ts).toLocaleString() : "No capture timestamp"}
                            {activeCaptureMedia.exif?.gps ? ` - ${activeCaptureMedia.exif.gps.lat.toFixed(4)}, ${activeCaptureMedia.exif.gps.lng.toFixed(4)}` : ""}
                            {activeCaptureMedia.clientId ? " - Client-scoped" : activeCaptureMedia.jobId ? " - Job-scoped" : activeCaptureMedia.visitId ? " - Visit-scoped" : " - Unrouted"}
                          </p>
                        </div>
                        <div className="nexops-inline-actions">
                          <button type="button" className="secondary" onClick={() => openCaptureMediaReview(activeCaptureMedia)}>Markup photo</button>
                          <a className="nexops-link-button" href={`/api/media/${encodeURIComponent(activeCaptureMedia.id)}?tenantId=${encodeURIComponent(operatorTenantId)}`} target="_blank" rel="noreferrer">Open</a>
                        </div>
                      </div>
                      <img
                        className="nexops-capture-preview-image"
                        src={`/api/media/${encodeURIComponent(activeCaptureMedia.id)}?tenantId=${encodeURIComponent(operatorTenantId)}`}
                        alt={activeCaptureMedia.aiCaption ?? activeCaptureMedia.id}
                      />
                      <div className="nexops-capture-preview-footnote">
                        <span>{activeCaptureMedia.annotations?.length ? `${activeCaptureMedia.annotations.length} markup path${activeCaptureMedia.annotations.length === 1 ? "" : "s"} saved.` : "Markup is optional on every photo."}</span>
                        {captureSessionOrigin === "reopened" && captureAnchorGps ? (
                          <span>
                            Batch anchor {captureAnchorGps.lat.toFixed(4)}, {captureAnchorGps.lng.toFixed(4)}
                            {captureGpsMoved && captureSession?.latestGps ? ` | Latest capture ${captureSession.latestGps.lat.toFixed(4)}, ${captureSession.latestGps.lng.toFixed(4)}` : ""}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  ) : null}
                  {captureSessionMedia.length ? (
                    <div className="nexops-capture-carousel" aria-label="Current session photos">
                      {captureSessionMedia.map((media, index) => (
                        <button
                          key={media.id}
                          type="button"
                          className={`nexops-capture-thumb${media.id === activeCaptureMedia?.id ? " active" : ""}`}
                          onClick={() => onSetCaptureSelectedMediaId(media.id)}
                        >
                          <img src={`/api/media/${encodeURIComponent(media.id)}?tenantId=${encodeURIComponent(operatorTenantId)}`} alt={media.aiCaption ?? `Capture ${index + 1}`} />
                          <span>#{index + 1}</span>
                          <small>{media.annotations?.length ? "Markup saved" : "Tap to review"}</small>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {captureSessionMode === "choose" ? (
                    <div className="nexops-capture-decision-row">
                      <button type="button" onClick={() => onRouteCaptureToNewRequest(captureSession)}>New Client</button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          onSetCaptureSessionMode("existing-client");
                          onSetCaptureStatus("Pick the existing client that should own this capture batch.");
                        }}
                      >
                        Existing Client
                      </button>
                      <button type="button" className="ghost" onClick={() => void onMarkCaptureDecideLater()}>Decide Later</button>
                    </div>
                  ) : null}

                  {captureSessionMode === "existing-client" ? (
                    <div className="nexops-capture-assignment-panel">
                      <label className="nexops-field">
                        <span>Find client</span>
                        <input value={captureClientQuery} placeholder="Search by name, phone, email, or address" onChange={(event) => setCaptureClientQuery(event.target.value)} />
                      </label>
                      <div className="nexops-mini-list">
                        {filteredClients.map((client) => (
                          <button
                            className={`nexops-list-select ${client.id === captureSelectedClientId ? "active" : ""}`}
                            type="button"
                            key={client.id}
                            onClick={() => {
                              setCaptureSelectedClientId(client.id);
                              setCaptureSelectedJobId("");
                              setCaptureSelectedVisitId("");
                              void onLoadCaptureTargets(client.id);
                            }}
                          >
                            <strong>{clientDisplayName(client)}</strong>
                            <small>{clientPrimaryAddress(client) || contactSummary(client)}</small>
                          </button>
                        ))}
                      </div>
                      {selectedCaptureClient ? (
                        <div className="nexops-two-column">
                          <label className="nexops-field">
                            <span>Attach to job (optional)</span>
                            <select value={captureSelectedJobId} onChange={(event) => { setCaptureSelectedJobId(event.target.value); setCaptureSelectedVisitId(""); }}>
                              <option value="">Keep client-level only</option>
                              {captureTargets.jobs.map((job) => (
                                <option value={job.id} key={job.id}>{job.number ? `${job.number} - ` : ""}{job.title} - {job.status}</option>
                              ))}
                            </select>
                          </label>
                          <label className="nexops-field">
                            <span>Attach to visit (optional)</span>
                            <select value={captureSelectedVisitId} onChange={(event) => setCaptureSelectedVisitId(event.target.value)} disabled={!visibleCaptureVisits.length}>
                              <option value="">No visit selected</option>
                              {visibleCaptureVisits.map((visit) => (
                                <option value={visit.id} key={visit.id}>{visit.title} - {new Date(visit.start).toLocaleString()}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ) : null}
                      <div className="nexops-inline-actions">
                        <button type="button" onClick={() => void onAssignCaptureToExistingClient()} disabled={!captureSelectedClientId || Boolean(captureBusy)}>Attach batch</button>
                        <button type="button" className="ghost" onClick={() => onSetCaptureSessionMode("choose")}>Back</button>
                      </div>
                    </div>
                  ) : null}

                  {captureSessionMode === "continued" ? (
                    <div className="nexops-success-banner">
                      <strong>{assignedCaptureClient ? clientDisplayName(assignedCaptureClient) : "Client attached"}</strong>
                      <span>
                        Further photos in this session attach directly to{" "}
                        {assignedCaptureClient ? clientDisplayName(assignedCaptureClient) : captureSession.assignedClientId ?? "the selected client"}.
                      </span>
                    </div>
                  ) : null}

                  {captureSessionMode === "unassigned" ? (
                    <div className="nexops-warning-banner">
                      <strong>Waiting in the inbox</strong>
                      <span>This batch is parked in the decide-later inbox. You can keep adding photos now or route it later from the queue.</span>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="nexops-empty-list">
                  <h3>No active capture batch</h3>
                  <p>Start a fresh batch here or reopen an unassigned one without leaving the capture rail.</p>
                  <div className="nexops-inline-actions">
                    <button type="button" onClick={() => void onStartCaptureSession()}>Start capture</button>
                    <button type="button" className="secondary" onClick={() => onOpenCaptureWorkspace("unassigned")}>Continue unassigned batch</button>
                  </div>
                </div>
              )
            ) : (
              <>
                <p>{captureInboxStatus}</p>
                {captureInbox.length ? (
                  <ul className="nexops-mini-list nexops-capture-batch-list">
                    {captureInbox.map((batch) => (
                      <li key={batch.id}>
                        <span>
                          <strong>{batch.media.length} photo{batch.media.length === 1 ? "" : "s"} waiting</strong>
                          <small>
                            {batch.latestCapturedAt ? `Last capture ${new Date(batch.latestCapturedAt).toLocaleString()}` : "No capture timestamp"}
                            {batch.originGps ? ` - Anchor ${batch.originGps.lat.toFixed(4)}, ${batch.originGps.lng.toFixed(4)}` : batch.latestGps ? ` - Anchor ${batch.latestGps.lat.toFixed(4)}, ${batch.latestGps.lng.toFixed(4)}` : ""}
                            {batch.originGps && batch.latestGps && (batch.originGps.lat !== batch.latestGps.lat || batch.originGps.lng !== batch.latestGps.lng)
                              ? ` | Latest ${batch.latestGps.lat.toFixed(4)}, ${batch.latestGps.lng.toFixed(4)}`
                              : ""}
                          </small>
                        </span>
                        <span className="nexops-inline-actions">
                          <button
                            type="button"
                            onClick={() => {
                              onReopenCaptureBatch(batch, "existing-client", "Pick the client that should own this reopened batch.");
                            }}
                          >
                            Existing client
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => {
                              onSetCaptureSession(batch);
                              onSetCaptureSessionOrigin("reopened");
                              onRouteCaptureToNewRequest(batch);
                            }}
                          >
                            New client
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => {
                              onReopenCaptureBatch(batch, "unassigned", "Reopened batch ready. Add more photos, markup any shot, or tap Done to return it to the inbox.");
                            }}
                          >
                            Reopen
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="nexops-empty-list">
                    <h3>No batches waiting</h3>
                    <p>Decide-later capture batches will surface here with GPS and capture time once they exist.</p>
                  </div>
                )}
              </>
            )}
          </article>

          <article className="nexops-module-card">
            <p className="eyebrow">Session rules</p>
            <h2>How this rail behaves</h2>
            <ul className="nexops-checklist">
              <li>New Client opens the existing request form and preloads the captured images.</li>
              <li>After request submit, the same session returns here and keeps attaching photos to that client.</li>
              <li>Existing Client defaults to client-level media unless you intentionally pin the batch to a job or visit.</li>
              <li>Done is the routing gate on a fresh batch. Reopened batches skip that chooser and return to their existing batch state.</li>
              <li>Decide Later creates an unassigned batch so nothing gets stranded on a random job.</li>
            </ul>
          </article>
        </div>
      </section>
      {reviewMedia ? (
        <>
          <button className="nexops-overlay-backdrop" type="button" aria-label="Close capture photo review" onClick={closeCaptureMediaReview} />
          <section className="nexops-overlay-panel nexcam-review-panel" role="dialog" aria-modal="true" aria-label="Capture photo review">
            <div className="nexops-overlay-head">
              <div>
                <p className="eyebrow">Photo review</p>
                <h2>{reviewMedia.aiCaption || reviewMedia.id}</h2>
                <small>{mediaContextLabel(reviewMedia)}</small>
              </div>
              <button type="button" className="nexops-link-button" onClick={closeCaptureMediaReview}>Close</button>
            </div>
            <div className="nexcam-review-layout">
              <div className="nexcam-review-stage-card">
                <div className="nexops-inline-actions">
                  <button type="button" className={drawMode ? "active" : ""} onClick={() => setDrawMode((current) => !current)}>
                    {drawMode ? "Stop drawing" : "Draw markup"}
                  </button>
                  <button type="button" className="nexops-link-button" onClick={removeLastMarkup} disabled={!reviewAnnotationsDraft.length}>
                    Remove last markup
                  </button>
                  <a className="nexops-link-button" href={`/api/media/${encodeURIComponent(reviewMedia.id)}?tenantId=${encodeURIComponent(operatorTenantId)}`} target="_blank" rel="noreferrer">Open original</a>
                </div>
                <div
                  ref={reviewStageRef}
                  className={`nexcam-review-stage${drawMode ? " draw-mode" : ""}`}
                  onPointerDown={beginMediaDraw}
                  onPointerMove={updateMediaDraw}
                  onPointerUp={finishMediaDraw}
                  onPointerLeave={finishMediaDraw}
                >
                  <img
                    className="nexcam-review-image"
                    src={`/api/media/${encodeURIComponent(reviewMedia.id)}?tenantId=${encodeURIComponent(operatorTenantId)}`}
                    alt={reviewMedia.aiCaption || reviewMedia.id}
                  />
                  <svg className="nexcam-review-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    {reviewAnnotationsDraft.map((annotation) => (
                      <polyline
                        key={annotation.id}
                        points={annotationPolyline(annotation.points)}
                        fill="none"
                        stroke={annotation.color ?? "#106060"}
                        strokeWidth={1.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                    {drawingPath?.length ? (
                      <polyline
                        points={annotationPolyline(drawingPath)}
                        fill="none"
                        stroke="#28d7ff"
                        strokeWidth={1.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray="2 2"
                      />
                    ) : null}
                  </svg>
                </div>
                <small>{reviewMedia.exif?.ts ? `Captured ${new Date(reviewMedia.exif.ts).toLocaleString()}` : "No capture timestamp"} Â· {reviewMedia.exif?.gps ? `${reviewMedia.exif.gps.lat.toFixed(4)}, ${reviewMedia.exif.gps.lng.toFixed(4)}` : "No GPS on file"}</small>
              </div>
              <div className="nexcam-review-sidebar">
                <article className="nexops-module-card wide">
                  <p className="eyebrow">Tags</p>
                  <h3>{reviewMedia.aiTags.length ? reviewMedia.aiTags.join(", ") : "No AI tags yet"}</h3>
                  <small>Search and Nexi read this same tag/caption rail.</small>
                  <label className="nexops-field">
                    <span>Manual tags</span>
                    <input value={reviewManualTagsDraft} onChange={(event) => setReviewManualTagsDraft(event.target.value)} placeholder="pool, leak, equipment pad" />
                  </label>
                  <label className="nexops-check-field inline">
                    <input type="checkbox" checked={reviewHiddenFromClientDraft} onChange={(event) => setReviewHiddenFromClientDraft(event.target.checked)} />
                    Hide this single photo from the client
                  </label>
                  <div className="nexops-inline-actions">
                    <button type="button" className="nexops-link-button" onClick={() => void setCaptureMediaTrashState(!reviewMedia.trashedAt)} disabled={reviewSaving}>
                      {reviewMedia.trashedAt ? "Restore from trash" : "Move to tenant trash"}
                    </button>
                  </div>
                  {reviewMedia.purgeAfter ? <small>Trash purges after {new Date(reviewMedia.purgeAfter).toLocaleDateString()} unless restored.</small> : null}
                </article>
                <article className="nexops-module-card wide">
                  <p className="eyebrow">Comments</p>
                  <ul className="nexops-mini-list nexcam-comment-list">
                    {(reviewMedia.comments ?? []).map((entry) => (
                      <li key={entry.id}>
                        <strong>{entry.author ?? "Field note"}</strong>
                        <span>{entry.text}</span>
                        <small>{new Date(entry.createdAt).toLocaleString()}</small>
                      </li>
                    ))}
                    {!(reviewMedia.comments ?? []).length ? (
                      <li>
                        <strong>No comments yet</strong>
                        <span>Add a job-specific note without editing the AI caption.</span>
                      </li>
                    ) : null}
                  </ul>
                  <label className="nexops-field">
                    <span>Add comment</span>
                    <textarea rows={4} value={reviewCommentDraft} onChange={(event) => setReviewCommentDraft(event.target.value)} />
                  </label>
                  <div className="nexops-inline-actions">
                    <button type="button" onClick={() => void saveCaptureMediaReview()} disabled={reviewSaving}>
                      {reviewSaving ? "Saving..." : "Save review"}
                    </button>
                  </div>
                </article>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
