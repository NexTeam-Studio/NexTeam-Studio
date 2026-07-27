import React, { useEffect, useState } from "react";
import type { AddressSuggestion as CrmAddressSuggestion } from "@nexteam/shared";
import { NEXOPS_SHARED_CREATE_MENU_ID } from "./nexopsMobileCreateFab";
import { ProductLogo } from "./productBranding";
import { NEXOPS_CREATE_OPTIONS, type NexOpsCreateOption } from "./nexopsShell";
import {
  CLIENT_CUSTOM_FIELD_RESERVED_LABELS,
  createCustomFieldDraftRow,
  LEAD_SOURCE_ADD_NEW_OPTION,
  PROPERTY_CUSTOM_FIELD_RESERVED_LABELS,
  validateCustomFieldDraftRows,
  type CustomFieldDraftRow
} from "./nexopsClientsMobile";

type CaptureWorkspaceView = "session" | "unassigned";
type CreateClientPhoneLabel = "Main" | "Work" | "Mobile" | "Home" | "Fax" | "Other";
type CreateClientEmailLabel = "Main" | "Work" | "Personal" | "Other";

interface ClientPhoneDraft {
  id: string;
  label: CreateClientPhoneLabel;
  value: string;
  receivesMessages: boolean;
  smsCapability: "mobile" | "landline" | "fax" | "invalid" | "unknown";
}

interface ClientEmailDraft {
  id: string;
  label: CreateClientEmailLabel;
  value: string;
}

interface NexOpsCaptureWorkspaceProps {
  operatorTenantId: string;
  captureInputRef: React.RefObject<HTMLInputElement | null>;
  captureBusy: string;
  captureStatus: string;
  captureWorkspaceView: CaptureWorkspaceView;
  captureSession: any | null;
  captureSessionOrigin: string;
  captureSessionMode: string;
  captureInbox: any[];
  captureInboxStatus: string;
  activeCaptureMedia: any | null;
  captureSessionMedia: any[];
  captureAnchorGps: { lat: number; lng: number } | null;
  captureGpsMoved: boolean;
  filteredClients: any[];
  selectedCaptureClient: any | undefined;
  assignedCaptureClient: any | undefined;
  captureClientQuery: string;
  setCaptureClientQuery: React.Dispatch<React.SetStateAction<string>>;
  captureSelectedClientId: string;
  setCaptureSelectedClientId: React.Dispatch<React.SetStateAction<string>>;
  captureSelectedJobId: string;
  setCaptureSelectedJobId: React.Dispatch<React.SetStateAction<string>>;
  captureSelectedVisitId: string;
  setCaptureSelectedVisitId: React.Dispatch<React.SetStateAction<string>>;
  captureTargets: { jobs: any[]; visits: any[] };
  visibleCaptureVisits: any[];
  onStartCaptureSession: () => Promise<any> | void;
  onOpenCaptureWorkspace: (view: CaptureWorkspaceView) => void;
  onFinishCaptureSession: () => void;
  onUploadCapturePhotos: (files: FileList | null) => Promise<void> | void;
  onSetCaptureSelectedMediaId: React.Dispatch<React.SetStateAction<string>>;
  onRouteCaptureToNewRequest: (batch?: any) => void;
  onMarkCaptureDecideLater: () => Promise<void> | void;
  onSetCaptureSessionMode: React.Dispatch<React.SetStateAction<any>>;
  onSetCaptureStatus: React.Dispatch<React.SetStateAction<string>>;
  onLoadCaptureTargets: (clientId: string) => Promise<void> | void;
  onAssignCaptureToExistingClient: () => Promise<void> | void;
  onReopenCaptureBatch: (batch: any, nextMode: any, statusText: string) => void;
  onSetCaptureSession: React.Dispatch<React.SetStateAction<any>>;
  onSetCaptureSessionOrigin: React.Dispatch<React.SetStateAction<any>>;
  clientDisplayName: (client: any) => string;
  clientPrimaryAddress: (client: any) => string;
  contactSummary: (client: any) => string;
}

interface NexOpsCreateClientPanelProps {
  tenantId: string;
  newClient: any;
  setNewClient: React.Dispatch<React.SetStateAction<any>>;
  createStatus: string;
  createClientCanSave: boolean;
  createClientMissingFields: string[];
  leadSourceOptions?: string[];
  mode?: "create" | "edit";
  layout?: "drawer" | "page";
  surface?: "client" | "contact" | "property";
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void> | void;
}

interface NexOpsNotificationPanelProps {
  notificationStatus: string;
  notifications: Array<{ id: string; title: string; body: string; relativeTime: string; unread?: boolean }>;
  onMarkAllRead: () => Promise<void> | void;
  onOpenNotification: (entry: any) => Promise<void> | void;
  onClose?: () => void;
}

interface NexOpsCreateMenuProps {
  presentation: "flyout" | "sheet";
  activeContextLabel?: string;
  onClose: () => void;
  onSelect: (option: NexOpsCreateOption) => void;
}

function NexOpsCreateGlyph(props: { option: NexOpsCreateOption["id"] }): React.ReactElement {
  switch (props.option) {
    case "client":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M8.2 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3.7 16c.5-2.1 2.3-3.6 4.5-3.6 2.1 0 3.9 1.5 4.4 3.6M14.1 6.2v4.1M12 8.3h4.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "request":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M5.3 4.2h9.4a1 1 0 0 1 1 1v9.6a1 1 0 0 1-1 1H5.3a1 1 0 0 1-1-1V5.2a1 1 0 0 1 1-1Zm0 0v-1m4.7 1v-1M6.2 8.4h7.6M6.2 11.1h7.6M6.2 13.8h4.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "quote":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M5.1 3.8h7.2l2.7 2.7v9.5a1 1 0 0 1-1 1H5.1a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M12.3 3.8v2.8h2.8M6.8 10h6.6M6.8 12.8h4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "job":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="m7 5.3 2.9 2.9-5.5 5.5H1.8v-2.6L7 5.3Zm0 0L9 3.2a1.4 1.4 0 0 1 2 0l1.5 1.5a1.4 1.4 0 0 1 0 2L10.4 8.8M11.8 12.5h5M10.6 15.8h6.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "invoice":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M5.2 3.8h9.6a1 1 0 0 1 1 1V16l-2-1-1.9 1-1.9-1-1.9 1-1.9-1-1.9 1V4.8a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M7 7.2h6M7 10h6M7 12.8h3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "payment":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <rect x="3.3" y="5" width="13.4" height="10" rx="1.8" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3.3 8.2h13.4M7 11.7h2.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "task":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M6.2 4.4h7.6a1.2 1.2 0 0 1 1.2 1.2v9a1.2 1.2 0 0 1-1.2 1.2H6.2A1.2 1.2 0 0 1 5 14.6v-9a1.2 1.2 0 0 1 1.2-1.2Zm1.4 3.1h4.8M7.6 10h4.8M7.6 12.5h2.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "property":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="m3.7 8.4 6.3-4.8 6.3 4.8v7.5H3.7V8.4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M7.8 15.9v-4h4.4v4M6.2 8.6h.1M13.7 8.6h.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "contact":
    default:
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M10 10a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2Zm-5.6 6.2c.5-2.3 2.6-3.8 5.6-3.8s5.1 1.5 5.6 3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
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
  const [reviewMedia, setReviewMedia] = React.useState<any | null>(null);
  const [reviewCommentDraft, setReviewCommentDraft] = React.useState("");
  const [reviewManualTagsDraft, setReviewManualTagsDraft] = React.useState("");
  const [reviewHiddenFromClientDraft, setReviewHiddenFromClientDraft] = React.useState(false);
  const [reviewAnnotationsDraft, setReviewAnnotationsDraft] = React.useState<any[]>([]);
  const [reviewSaving, setReviewSaving] = React.useState(false);
  const [drawMode, setDrawMode] = React.useState(false);
  const [drawingPath, setDrawingPath] = React.useState<Array<{ x: number; y: number }> | null>(null);
  const reviewStageRef = React.useRef<HTMLDivElement | null>(null);

  function syncCaptureMediaRecord(nextMedia: any): void {
    setReviewMedia(nextMedia);
    onSetCaptureSession((current) => current && current.media.some((item: any) => item.id === nextMedia.id)
      ? {
          ...current,
          media: current.media.map((item: any) => item.id === nextMedia.id ? { ...item, ...nextMedia } : item)
        }
      : current);
  }

  function openCaptureMediaReview(media: any): void {
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
      const body = await response.json() as { ok: boolean; media?: any; error?: string };
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
      const body = await response.json() as { ok: boolean; media?: any; error?: string };
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

  function mediaContextLabel(media: any): string {
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
          accept="image/*"
          multiple
          capture="environment"
          onChange={(event) => {
            void onUploadCapturePhotos(event.target.files);
            event.currentTarget.value = "";
          }}
        />
        <div className="nexops-page-heading">
          <div>
            <p className="eyebrow">NexCam capture</p>
            <h1>Capture and route</h1>
            <p>Shoot first, then route to a new request, an existing client, or the unassigned inbox without leaving the NexOps shell.</p>
          </div>
          <div className="nexops-inline-actions">
            <button type="button" onClick={() => void onStartCaptureSession()} disabled={Boolean(captureBusy)}>New capture</button>
            <button type="button" className="secondary" onClick={() => onOpenCaptureWorkspace("unassigned")}>Continue unassigned batch</button>
          </div>
        </div>

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
                <small>{reviewMedia.exif?.ts ? `Captured ${new Date(reviewMedia.exif.ts).toLocaleString()}` : "No capture timestamp"} · {reviewMedia.exif?.gps ? `${reviewMedia.exif.gps.lat.toFixed(4)}, ${reviewMedia.exif.gps.lng.toFixed(4)}` : "No GPS on file"}</small>
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
                    {(reviewMedia.comments ?? []).map((entry: any) => (
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

export function NexOpsCreateClientPanel(props: NexOpsCreateClientPanelProps): React.ReactElement {
  const {
    tenantId,
    newClient,
    setNewClient,
    createStatus,
    createClientCanSave,
    createClientMissingFields,
    leadSourceOptions = [],
    mode = "create",
    layout = "drawer",
    surface = "client",
    onClose,
    onSubmit
  } = props;
  const [addressSuggestions, setAddressSuggestions] = useState<CrmAddressSuggestion[]>([]);
  const [addressLookupBusy, setAddressLookupBusy] = useState(false);
  const pageLayout = layout === "page";
  const editing = mode === "edit";
  const smsPrompt = newClient.phoneReceivesMessages && newClient.smsCapability !== "mobile"
    ? "This number has not been confirmed as mobile. NexOps will treat texts as one-way and should prompt before sending."
    : "Texts stay one-way unless an upgraded two-way SMS tier is enabled.";
  const surfaceHeading = surface === "property"
    ? "New property contact rail"
    : surface === "contact"
      ? "New contact"
      : editing ? "Edit client" : "New client";
  const surfaceBody = surface === "property"
    ? "Start with the client relationship, then capture the service address and access rules without losing the full CRM context."
    : surface === "contact"
      ? "Capture the core contact details first, then expand into billing, communication, and property context only if needed."
      : editing
        ? "Update the core client details in the same mobile intake workspace used for new records, without losing the parent, contact, or property structure."
        : "Capture the parent relationship first, then add service sites, local property contacts, and communication rules without mixing billing or field access.";

  useEffect(() => {
    if (surface === "contact") {
      setAddressSuggestions([]);
      return undefined;
    }
    const query = [newClient.street1, newClient.city, newClient.province, newClient.postalCode].filter(Boolean).join(", ").trim();
    if (newClient.street1.trim().length < 4) {
      setAddressSuggestions([]);
      setAddressLookupBusy(false);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAddressLookupBusy(true);
      try {
        const response = await fetch(`/api/crm/address-suggestions?tenantId=${encodeURIComponent(tenantId)}&query=${encodeURIComponent(query)}`, {
          signal: controller.signal
        });
        const body = await response.json() as { ok: boolean; suggestions?: CrmAddressSuggestion[] };
        if (!body.ok) {
          setAddressSuggestions([]);
          return;
        }
        setAddressSuggestions(body.suggestions ?? []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setAddressSuggestions([]);
        }
      } finally {
        setAddressLookupBusy(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [tenantId, newClient.street1, newClient.city, newClient.province, newClient.postalCode, surface]);

  function applyAddressSuggestion(suggestion: CrmAddressSuggestion): void {
    setNewClient({
      ...newClient,
      street1: suggestion.street1,
      city: suggestion.city,
      province: suggestion.province,
      postalCode: suggestion.postalCode,
      country: suggestion.country,
      propertyGeoLat: suggestion.lat,
      propertyGeoLng: suggestion.lng
    });
    setAddressSuggestions([]);
  }

  const [leadSourcePickerOpen, setLeadSourcePickerOpen] = useState(false);
  const [leadSourceQuery, setLeadSourceQuery] = useState("");
  const [leadSourceAddNewOpen, setLeadSourceAddNewOpen] = useState(false);
  const [leadSourceAddNewValue, setLeadSourceAddNewValue] = useState("");
  const [companyExpanded, setCompanyExpanded] = useState(Boolean(newClient.company?.trim()));
  const [emailExpanded, setEmailExpanded] = useState(Boolean(newClient.email?.trim() || (newClient.additionalEmails ?? []).length));
  const [additionalInfoExpanded, setAdditionalInfoExpanded] = useState(Boolean(
    newClient.referredBy?.trim()
    || newClient.promoCode?.trim()
    || newClient.leadSource?.trim()
    || (newClient.clientCustomFieldsDraft ?? []).length
  ));
  const [propertyInfoExpanded, setPropertyInfoExpanded] = useState(Boolean(
    newClient.propertyGatedEntry
    || newClient.propertyGateCodes?.trim()
    || newClient.propertyClientName?.trim()
    || newClient.propertyClientPhone?.trim()
    || newClient.propertyClientEmail?.trim()
    || newClient.propertyAccessNotes?.trim()
    || (newClient.propertyCustomFieldsDraft ?? []).length
  ));
  const clientCustomFieldValidation = validateCustomFieldDraftRows(newClient.clientCustomFieldsDraft ?? [], CLIENT_CUSTOM_FIELD_RESERVED_LABELS);
  const propertyCustomFieldValidation = validateCustomFieldDraftRows(newClient.propertyCustomFieldsDraft ?? [], PROPERTY_CUSTOM_FIELD_RESERVED_LABELS);
  const filteredLeadSourceOptions = leadSourceOptions.filter((option) => option.toLowerCase().includes(leadSourceQuery.trim().toLowerCase()));
  const trimmedLeadSource = newClient.leadSource.trim();
  const showReferralField = trimmedLeadSource === "Referral";
  const phoneLabelOptions: CreateClientPhoneLabel[] = ["Main", "Work", "Mobile", "Home", "Fax", "Other"];
  const emailLabelOptions: CreateClientEmailLabel[] = ["Main", "Work", "Personal", "Other"];

  useEffect(() => {
    if (!leadSourcePickerOpen) {
      setLeadSourceAddNewOpen(false);
      setLeadSourceAddNewValue("");
      setLeadSourceQuery("");
    }
  }, [leadSourcePickerOpen]);

  function patchClientDraft(patch: Record<string, unknown>): void {
    setNewClient({ ...newClient, ...patch });
  }

  function addPhoneDraft(): void {
    patchClientDraft({
      additionalPhones: [
        ...(newClient.additionalPhones ?? []),
        {
          id: `phone_${Math.random().toString(36).slice(2, 10)}`,
          label: "Other",
          value: "",
          receivesMessages: false,
          smsCapability: "unknown"
        }
      ]
    });
  }

  function updatePhoneDraft(id: string, patch: Record<string, unknown>): void {
    patchClientDraft({
      additionalPhones: (newClient.additionalPhones ?? []).map((entry: Record<string, unknown>) => entry.id === id ? { ...entry, ...patch } : entry)
    });
  }

  function removePhoneDraft(id: string): void {
    patchClientDraft({
      additionalPhones: (newClient.additionalPhones ?? []).filter((entry: Record<string, unknown>) => entry.id !== id)
    });
  }

  function addEmailDraft(): void {
    patchClientDraft({
      additionalEmails: [
        ...(newClient.additionalEmails ?? []),
        {
          id: `email_${Math.random().toString(36).slice(2, 10)}`,
          label: "Other",
          value: ""
        }
      ]
    });
  }

  function updateEmailDraft(id: string, patch: Record<string, unknown>): void {
    patchClientDraft({
      additionalEmails: (newClient.additionalEmails ?? []).map((entry: Record<string, unknown>) => entry.id === id ? { ...entry, ...patch } : entry)
    });
  }

  function removeEmailDraft(id: string): void {
    patchClientDraft({
      additionalEmails: (newClient.additionalEmails ?? []).filter((entry: Record<string, unknown>) => entry.id !== id)
    });
  }

  function addCustomFieldDraft(scope: "client" | "property"): void {
    const key = scope === "client" ? "clientCustomFieldsDraft" : "propertyCustomFieldsDraft";
    patchClientDraft({
      [key]: [...(newClient[key] ?? []), createCustomFieldDraftRow(scope)]
    });
  }

  function updateCustomFieldDraft(scope: "client" | "property", id: string, patch: Partial<CustomFieldDraftRow>): void {
    const key = scope === "client" ? "clientCustomFieldsDraft" : "propertyCustomFieldsDraft";
    patchClientDraft({
      [key]: (newClient[key] ?? []).map((entry: CustomFieldDraftRow) => entry.id === id ? { ...entry, ...patch } : entry)
    });
  }

  function removeCustomFieldDraft(scope: "client" | "property", id: string): void {
    const key = scope === "client" ? "clientCustomFieldsDraft" : "propertyCustomFieldsDraft";
    patchClientDraft({
      [key]: (newClient[key] ?? []).filter((entry: CustomFieldDraftRow) => entry.id !== id)
    });
  }

  function selectLeadSource(value: string): void {
    patchClientDraft({
      leadSource: value,
      ...(value === "Referral" ? {} : { referredBy: "" })
    });
    setLeadSourcePickerOpen(false);
    setLeadSourceQuery("");
    setLeadSourceAddNewOpen(false);
    setLeadSourceAddNewValue("");
    setAdditionalInfoExpanded(true);
  }

  function saveOneOffLeadSource(): void {
    const value = leadSourceAddNewValue.trim();
    if (!value) {
      return;
    }
    selectLeadSource(value);
  }

  function renderCustomFieldRows(scope: "client" | "property"): React.ReactElement {
    const rows: CustomFieldDraftRow[] = scope === "client"
      ? (newClient.clientCustomFieldsDraft ?? [])
      : (newClient.propertyCustomFieldsDraft ?? []);
    return (
      <div className="nexops-mobile-custom-field-list">
        {rows.map((row) => (
          <div className="nexops-mobile-custom-field-row" key={row.id}>
            <label className="nexops-mobile-client-field">
              <span>Label</span>
              <input value={row.label} onChange={(event) => updateCustomFieldDraft(scope, row.id, { label: event.target.value })} />
            </label>
            <label className="nexops-mobile-client-field">
              <span>Value</span>
              <input value={row.value} onChange={(event) => updateCustomFieldDraft(scope, row.id, { value: event.target.value })} />
            </label>
            <button className="nexops-mobile-inline-link danger" type="button" onClick={() => removeCustomFieldDraft(scope, row.id)}>Remove</button>
          </div>
        ))}
      </div>
    );
  }

  if (pageLayout) {
    const helperCopy = clientCustomFieldValidation.hasBlockingIssues
      ? "Client custom field labels must be unique and cannot reuse built-in fields."
      : propertyCustomFieldValidation.hasBlockingIssues
        ? "Property custom field labels must be unique and cannot reuse built-in fields."
        : createStatus || (createClientCanSave ? (editing ? "Ready to save changes." : "Ready to save.") : "Name, phone, and address needed to save");

    if (leadSourcePickerOpen) {
      return (
        <section className="nexops-mobile-client-screen nexops-mobile-client-screen-sheet">
          <header className="nexops-mobile-client-head">
            <button type="button" onClick={() => setLeadSourcePickerOpen(false)} aria-label="Back">←</button>
            <h1>How They Found Us</h1>
            <span />
          </header>
          <div className="nexops-mobile-client-body">
            <label className="nexops-mobile-client-field">
              <span>Search lead sources</span>
              <input
                value={leadSourceQuery}
                placeholder="Search lead sources"
                onChange={(event) => setLeadSourceQuery(event.target.value)}
              />
            </label>
            <button className="nexops-mobile-client-row-action add" type="button" onClick={() => setLeadSourceAddNewOpen((current) => !current)}>
              {LEAD_SOURCE_ADD_NEW_OPTION}
            </button>
            {leadSourceAddNewOpen ? (
              <div className="nexops-mobile-inline-panel">
                <label className="nexops-mobile-client-field">
                  <span>One-time lead source</span>
                  <input
                    value={leadSourceAddNewValue}
                    placeholder="Enter a source for this client only"
                    onChange={(event) => setLeadSourceAddNewValue(event.target.value)}
                  />
                </label>
                <div className="nexops-inline-actions wrap">
                  <button className="nexops-mobile-inline-link" type="button" onClick={saveOneOffLeadSource}>Save this source</button>
                  <button
                    className="nexops-mobile-inline-link danger"
                    type="button"
                    onClick={() => {
                      setLeadSourceAddNewOpen(false);
                      setLeadSourceAddNewValue("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
            <div className="nexops-mobile-client-list">
              {filteredLeadSourceOptions.map((option) => (
                <button
                  className={`nexops-mobile-client-list-row${newClient.leadSource === option ? " active" : ""}`}
                  key={option}
                  type="button"
                  onClick={() => selectLeadSource(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </section>
      );
    }

    return (
      <form className="nexops-mobile-client-screen" onSubmit={(event) => void onSubmit(event)}>
        <header className="nexops-mobile-client-head">
          <button type="button" onClick={onClose} aria-label="Close">×</button>
          <h1>{surfaceHeading}</h1>
          <span />
        </header>
        <div className="nexops-mobile-client-body">
          <button className="nexops-mobile-client-row-action" type="button">Add From Contacts</button>
          <label className="nexops-mobile-client-field">
            <span>First name</span>
            <input value={newClient.firstName} placeholder="First name" onChange={(event) => patchClientDraft({ firstName: event.target.value })} />
          </label>
          <label className="nexops-mobile-client-field">
            <span>Last name</span>
            <input value={newClient.lastName} placeholder="Last name" onChange={(event) => patchClientDraft({ lastName: event.target.value })} />
          </label>

          <button className="nexops-mobile-client-row-action" type="button" onClick={() => setCompanyExpanded((current) => !current)}>
            {companyExpanded || newClient.company.trim() ? "Company name" : "Add Company Name"}
          </button>
          {companyExpanded ? (
            <div className="nexops-mobile-inline-panel">
              <label className="nexops-mobile-client-field">
                <span>Company name</span>
                <input
                  value={newClient.company}
                  placeholder="Company name"
                  onChange={(event) => patchClientDraft({
                    company: event.target.value,
                    displayNamePreference: event.target.value ? newClient.displayNamePreference : "person"
                  })}
                />
              </label>
              <label className="nexops-mobile-toggle-row">
                <span>Commercial client: Use company name as client name</span>
                <input
                  type="checkbox"
                  checked={newClient.displayNamePreference === "company"}
                  onChange={(event) => patchClientDraft({ displayNamePreference: event.target.checked ? "company" : "person" })}
                />
              </label>
            </div>
          ) : null}

          <div className="nexops-mobile-inline-panel">
            <label className="nexops-mobile-client-field">
              <span>Phone number</span>
              <input value={newClient.phone} placeholder="Phone number" onChange={(event) => patchClientDraft({ phone: event.target.value })} />
            </label>
            <label className="nexops-mobile-client-field">
              <span>Label</span>
              <select value={newClient.phoneLabel} onChange={(event) => patchClientDraft({ phoneLabel: event.target.value })}>
                {phoneLabelOptions.map((label) => <option key={label} value={label}>{label}</option>)}
              </select>
            </label>
            <label className="nexops-mobile-toggle-row">
              <span>Receives text messages</span>
              <input type="checkbox" checked={newClient.phoneReceivesMessages} onChange={(event) => patchClientDraft({ phoneReceivesMessages: event.target.checked })} />
            </label>
            {(newClient.additionalPhones ?? []).map((entry: ClientPhoneDraft) => (
              <div className="nexops-mobile-inline-panel nested" key={entry.id}>
                <label className="nexops-mobile-client-field">
                  <span>Additional phone</span>
                  <input value={entry.value} placeholder="Phone number" onChange={(event) => updatePhoneDraft(entry.id, { value: event.target.value })} />
                </label>
                <label className="nexops-mobile-client-field">
                  <span>Label</span>
                  <select value={entry.label} onChange={(event) => updatePhoneDraft(entry.id, { label: event.target.value })}>
                    {phoneLabelOptions.map((label) => <option key={label} value={label}>{label}</option>)}
                  </select>
                </label>
                <label className="nexops-mobile-toggle-row">
                  <span>Receives text messages</span>
                  <input type="checkbox" checked={entry.receivesMessages} onChange={(event) => updatePhoneDraft(entry.id, { receivesMessages: event.target.checked })} />
                </label>
                <button className="nexops-mobile-inline-link danger" type="button" onClick={() => removePhoneDraft(entry.id)}>Remove phone</button>
              </div>
            ))}
            <button className="nexops-mobile-inline-link" type="button" onClick={addPhoneDraft}>Add another phone number</button>
          </div>

          <button className="nexops-mobile-client-row-action" type="button" onClick={() => setEmailExpanded((current) => !current)}>
            {emailExpanded || newClient.email.trim() ? "Email" : "Add Email"}
          </button>
          {emailExpanded ? (
            <div className="nexops-mobile-inline-panel">
              <label className="nexops-mobile-client-field">
                <span>Email address</span>
                <input type="email" value={newClient.email} placeholder="Email address" onChange={(event) => patchClientDraft({ email: event.target.value })} />
              </label>
              <label className="nexops-mobile-client-field">
                <span>Label</span>
                <select value={newClient.emailLabel} onChange={(event) => patchClientDraft({ emailLabel: event.target.value })}>
                  {emailLabelOptions.map((label) => <option key={label} value={label}>{label}</option>)}
                </select>
              </label>
              {(newClient.additionalEmails ?? []).map((entry: ClientEmailDraft) => (
                <div className="nexops-mobile-inline-panel nested" key={entry.id}>
                  <label className="nexops-mobile-client-field">
                    <span>Additional email</span>
                    <input type="email" value={entry.value} placeholder="Email address" onChange={(event) => updateEmailDraft(entry.id, { value: event.target.value })} />
                  </label>
                  <label className="nexops-mobile-client-field">
                    <span>Label</span>
                    <select value={entry.label} onChange={(event) => updateEmailDraft(entry.id, { label: event.target.value })}>
                      {emailLabelOptions.map((label) => <option key={label} value={label}>{label}</option>)}
                    </select>
                  </label>
                  <button className="nexops-mobile-inline-link danger" type="button" onClick={() => removeEmailDraft(entry.id)}>Remove email</button>
                </div>
              ))}
              <button className="nexops-mobile-inline-link" type="button" onClick={addEmailDraft}>Add Another Email</button>
            </div>
          ) : null}

          <button className="nexops-mobile-client-row-action" type="button" onClick={() => setLeadSourcePickerOpen(true)}>
            {trimmedLeadSource ? `How They Found Us: ${trimmedLeadSource}` : "How They Found Us"}
          </button>

          <button className="nexops-mobile-client-row-action" type="button" onClick={() => setAdditionalInfoExpanded((current) => !current)}>
            Add Additional Info
          </button>
          {additionalInfoExpanded ? (
            <div className="nexops-mobile-inline-panel">
              {showReferralField ? (
                <label className="nexops-mobile-client-field">
                  <span>Referred By</span>
                  <input value={newClient.referredBy} placeholder="Referred By" onChange={(event) => patchClientDraft({ referredBy: event.target.value })} />
                </label>
              ) : null}
              <label className="nexops-mobile-client-field">
                <span>Promo Code</span>
                <input value={newClient.promoCode} placeholder="Promo Code" onChange={(event) => patchClientDraft({ promoCode: event.target.value })} />
              </label>
              {renderCustomFieldRows("client")}
              <button className="nexops-mobile-inline-link" type="button" onClick={() => addCustomFieldDraft("client")}>Add Custom Field</button>
              {clientCustomFieldValidation.hasBlockingIssues ? <p className="nexops-mobile-validation-note">Client custom field labels must be unique and cannot match built-in fields.</p> : null}
            </div>
          ) : null}

          <label className="nexops-mobile-client-field">
            <span>Property address</span>
            <input
              value={newClient.street1}
              placeholder="Property address"
              onChange={(event) => patchClientDraft({ street1: event.target.value })}
            />
          </label>
          {addressLookupBusy ? <p className="nexops-mobile-helper-note">Looking up matching addresses…</p> : null}
          {addressSuggestions.length ? (
            <div className="nexops-mobile-client-list">
              {addressSuggestions.map((suggestion) => (
                <button className="nexops-mobile-client-list-row" type="button" key={`${suggestion.label}-${suggestion.lat}-${suggestion.lng}`} onClick={() => applyAddressSuggestion(suggestion)}>
                  <strong>{suggestion.street1}</strong>
                  <small>{suggestion.city}, {suggestion.province} {suggestion.postalCode}</small>
                </button>
              ))}
            </div>
          ) : null}
          <div className="nexops-mobile-two-up">
            <label className="nexops-mobile-client-field">
              <span>City</span>
              <input value={newClient.city} placeholder="City" onChange={(event) => patchClientDraft({ city: event.target.value })} />
            </label>
            <label className="nexops-mobile-client-field">
              <span>State</span>
              <input value={newClient.province} placeholder="State" onChange={(event) => patchClientDraft({ province: event.target.value })} />
            </label>
          </div>
          <div className="nexops-mobile-two-up">
            <label className="nexops-mobile-client-field">
              <span>ZIP code</span>
              <input value={newClient.postalCode} placeholder="ZIP code" onChange={(event) => patchClientDraft({ postalCode: event.target.value })} />
            </label>
            <label className="nexops-mobile-client-field">
              <span>Street 2</span>
              <input value={newClient.street2} placeholder="Apartment, suite, etc." onChange={(event) => patchClientDraft({ street2: event.target.value })} />
            </label>
          </div>

          <button className="nexops-mobile-client-row-action" type="button" onClick={() => setPropertyInfoExpanded((current) => !current)}>
            Add Additional Property Info
          </button>
          {propertyInfoExpanded ? (
            <div className="nexops-mobile-inline-panel">
              <label className="nexops-mobile-toggle-row">
                <span>Gated Entry</span>
                <input type="checkbox" checked={newClient.propertyGatedEntry} onChange={(event) => patchClientDraft({ propertyGatedEntry: event.target.checked })} />
              </label>
              {newClient.propertyGatedEntry ? (
                <>
                  <label className="nexops-mobile-client-field">
                    <span>Gate Entry Code(s)</span>
                    <input value={newClient.propertyGateCodes} placeholder="Gate Entry Code(s)" onChange={(event) => patchClientDraft({ propertyGateCodes: event.target.value })} />
                  </label>
                  <label className="nexops-mobile-client-field">
                    <span>Access note</span>
                    <input value={newClient.propertyAccessNotes} placeholder="Access note" onChange={(event) => patchClientDraft({ propertyAccessNotes: event.target.value })} />
                  </label>
                </>
              ) : null}
              <label className="nexops-mobile-client-field">
                <span>Property Client Name</span>
                <input value={newClient.propertyClientName} placeholder="Property Client Name" onChange={(event) => patchClientDraft({ propertyClientName: event.target.value })} />
              </label>
              <label className="nexops-mobile-client-field">
                <span>Property Client Telephone Number</span>
                <input value={newClient.propertyClientPhone} placeholder="Property Client Telephone Number" onChange={(event) => patchClientDraft({ propertyClientPhone: event.target.value })} />
              </label>
              <label className="nexops-mobile-client-field">
                <span>Property Client Email Address</span>
                <input type="email" value={newClient.propertyClientEmail} placeholder="Property Client Email Address" onChange={(event) => patchClientDraft({ propertyClientEmail: event.target.value })} />
              </label>
              {renderCustomFieldRows("property")}
              <button className="nexops-mobile-inline-link" type="button" onClick={() => addCustomFieldDraft("property")}>Add Custom Field</button>
              {propertyCustomFieldValidation.hasBlockingIssues ? <p className="nexops-mobile-validation-note">Property custom field labels must be unique and cannot match built-in fields.</p> : null}
            </div>
          ) : null}
        </div>
        <footer className="nexops-mobile-client-footer">
          <p>{helperCopy}</p>
          <button type="submit" disabled={!createClientCanSave}>{editing ? "Save changes" : "Save"}</button>
        </footer>
      </form>
    );
  }

  const form = (
    <form className={pageLayout ? "nexops-client-profile-panel nexops-client-form nexops-client-form-page" : "nexops-drawer nexops-client-form"} onSubmit={(event) => void onSubmit(event)}>
      {pageLayout ? (
        <div className="nexops-client-form-page-head">
          <div>
            <p className="eyebrow">New record</p>
            <h2>{surfaceHeading}</h2>
            <p>{surfaceBody}</p>
          </div>
          <div className="nexops-inline-actions wrap">
            <span className="nexops-client-form-page-note">Save the parent client first, then add extra contacts, properties, and billing details from the full workspace.</span>
            <button className="nexops-link-button" type="button" onClick={onClose}>Back to clients</button>
          </div>
        </div>
      ) : (
        <div className="nexops-drawer-heading nexops-client-form-hero">
          <div className="nexops-client-form-hero-copy">
            <ProductLogo product="nexops" className="nexops-client-form-brand" alt="NexOps" />
            <p className="eyebrow">NexOps CRM</p>
            <h2>{surfaceHeading}</h2>
            <p>{surfaceBody}</p>
          </div>
          <div className="nexops-client-form-hero-actions">
            <span>Proof screen: final NexTeam design system</span>
            <button type="button" onClick={onClose}>Close</button>
          </div>
          <ul className="nexops-form-principles" aria-label="Client setup rules">
            <li>Parent client owns billing</li>
            <li>Company display is optional</li>
            <li>Texts stay one-way unless upgraded</li>
          </ul>
        </div>
      )}
        <section className="nexops-form-section">
          <div className="nexops-section-copy">
            <h3>Primary contact details</h3>
            <p>Start with the essentials only: name, best phone, best email, and the primary service address.</p>
          </div>
          <div className="nexops-section-fields">
            <div className="nexops-field-row">
              <label className="nexops-field"><span>First name</span><input value={newClient.firstName} onChange={(event) => setNewClient({ ...newClient, firstName: event.target.value })} /></label>
              <label className="nexops-field"><span>Last name</span><input value={newClient.lastName} onChange={(event) => setNewClient({ ...newClient, lastName: event.target.value })} /></label>
            </div>
            <div className="nexops-field-row">
              <label className="nexops-field"><span>Company name (optional)</span><input value={newClient.company} onChange={(event) => setNewClient({ ...newClient, company: event.target.value, displayNamePreference: event.target.value ? "company" : "person" })} /></label>
              <label className="nexops-field"><span>Display as</span><select value={newClient.displayNamePreference} onChange={(event) => setNewClient({ ...newClient, displayNamePreference: event.target.value as "person" | "company" })}>
                <option value="person">First name Last name</option>
                <option value="company" disabled={!newClient.company}>Company name</option>
              </select></label>
            </div>
            <div className="nexops-field-row">
              <label className="nexops-field"><span>Phone number</span><input value={newClient.phone} onChange={(event) => setNewClient({ ...newClient, phone: event.target.value })} /></label>
              <label className="nexops-field"><span>Email (recommended)</span><input type="email" value={newClient.email} onChange={(event) => setNewClient({ ...newClient, email: event.target.value })} /></label>
            </div>
            <label className="nexops-check-field"><input type="checkbox" checked={newClient.phoneReceivesMessages} onChange={(event) => setNewClient({ ...newClient, phoneReceivesMessages: event.target.checked })} /> Allow one-way texts to this number</label>
            {newClient.phoneReceivesMessages ? (
              <label className="nexops-field"><span>SMS check</span><select value={newClient.smsCapability} onChange={(event) => setNewClient({ ...newClient, smsCapability: event.target.value })}>
                <option value="unknown">Unknown - prompt before sending</option>
                <option value="mobile">Mobile - can receive texts</option>
                <option value="landline">Landline - prompt</option>
                <option value="fax">Fax - text off unless changed</option>
                <option value="invalid">Invalid - text off</option>
              </select></label>
            ) : null}
            <p className="nexops-form-note">{smsPrompt}</p>
            <p className="nexops-form-note">Email is recommended so quotes, invoices, and follow-ups have a reliable destination, but it is not required to save the client.</p>
            <details className="nexops-extra-panel">
              <summary>Communication and lead settings</summary>
              <div className="nexops-extra-panel-body">
                <div className="nexops-field-row">
                  <label className="nexops-field compact"><span>Phone label</span><select value={newClient.phoneLabel} onChange={(event) => setNewClient({ ...newClient, phoneLabel: event.target.value })}>
                    {["Main", "Work", "Mobile", "Home", "Fax", "Other"].map((label) => <option key={label}>{label}</option>)}
                  </select></label>
                  <label className="nexops-field compact"><span>Email label</span><select value={newClient.emailLabel} onChange={(event) => setNewClient({ ...newClient, emailLabel: event.target.value })}>
                    {["Main", "Work", "Personal", "Other"].map((label) => <option key={label}>{label}</option>)}
                  </select></label>
                </div>
                <label className="nexops-field"><span>Role</span><input value={newClient.role} onChange={(event) => setNewClient({ ...newClient, role: event.target.value })} /></label>
                <label className="nexops-field"><span>Lead source</span><input value={newClient.leadSource} onChange={(event) => setNewClient({ ...newClient, leadSource: event.target.value })} /></label>
                <div className="nexops-field-row">
                  <label className="nexops-field"><span>Payment terms</span><input value={newClient.paymentTerms} onChange={(event) => setNewClient({ ...newClient, paymentTerms: event.target.value })} /></label>
                  <label className="nexops-check-field inline"><input type="checkbox" checked={newClient.askForReview} onChange={(event) => setNewClient({ ...newClient, askForReview: event.target.checked })} /> Ask for a review</label>
                </div>
              </div>
            </details>
            <details className="nexops-extra-panel">
              <summary>Additional client details</summary>
              <div className="nexops-extra-panel-body">
                <p>Create custom fields to track additional client-level details.</p>
                <button type="button">Add Custom Field</button>
                <div className="nexops-field-row">
                  <label className="nexops-field"><span>Custom field name</span><input value={newClient.clientCustomFieldName} onChange={(event) => setNewClient({ ...newClient, clientCustomFieldName: event.target.value })} /></label>
                  <label className="nexops-field"><span>Custom field value</span><input value={newClient.clientCustomFieldValue} onChange={(event) => setNewClient({ ...newClient, clientCustomFieldValue: event.target.value })} /></label>
                </div>
              </div>
            </details>
            <details className="nexops-extra-panel">
              <summary>Additional contacts</summary>
              <div className="nexops-extra-panel-body">
                <p>For contacts with access to all properties, like spouse/family for residential or property managers for commercial.</p>
                <button type="button">Add Contact</button>
                <div className="nexops-field-row">
                  <label className="nexops-field"><span>Contact name</span><input value={newClient.additionalContactName} onChange={(event) => setNewClient({ ...newClient, additionalContactName: event.target.value })} /></label>
                  <label className="nexops-field"><span>Role</span><input value={newClient.additionalContactRole} onChange={(event) => setNewClient({ ...newClient, additionalContactRole: event.target.value })} /></label>
                </div>
                <div className="nexops-field-row">
                  <label className="nexops-field"><span>Phone</span><input value={newClient.additionalContactPhone} onChange={(event) => setNewClient({ ...newClient, additionalContactPhone: event.target.value })} /></label>
                  <label className="nexops-field"><span>Email</span><input type="email" value={newClient.additionalContactEmail} onChange={(event) => setNewClient({ ...newClient, additionalContactEmail: event.target.value })} /></label>
                </div>
              </div>
            </details>
          </div>
        </section>
        <section className="nexops-form-section">
          <div className="nexops-section-copy">
            <h3>Property address</h3>
            <p>Start with the main service address. Optional billing and property details stay tucked away until you actually need them.</p>
          </div>
          <div className="nexops-section-fields">
            <label className="nexops-field"><span>Site name</span><input value={newClient.siteName} onChange={(event) => setNewClient({ ...newClient, siteName: event.target.value })} placeholder="Optional, e.g. Mulberry Farms" /></label>
            <label className="nexops-field">
              <span>Primary address</span>
              <input value={newClient.street1} onChange={(event) => setNewClient({ ...newClient, street1: event.target.value })} placeholder="Start typing the street address" />
            </label>
            {addressLookupBusy ? <p className="nexops-form-note">Looking up matching addresses...</p> : null}
            {addressSuggestions.length ? (
              <div className="nexops-mini-list">
                {addressSuggestions.map((suggestion) => (
                  <button className="nexops-list-select" type="button" key={`${suggestion.label}-${suggestion.lat}-${suggestion.lng}`} onClick={() => applyAddressSuggestion(suggestion)}>
                    <strong>{suggestion.street1}</strong>
                    <small>{suggestion.city}, {suggestion.province} {suggestion.postalCode}</small>
                  </button>
                ))}
              </div>
            ) : null}
            <label className="nexops-field"><span>Street 2</span><input value={newClient.street2} onChange={(event) => setNewClient({ ...newClient, street2: event.target.value })} /></label>
            <div className="nexops-field-row">
              <label className="nexops-field"><span>City</span><input value={newClient.city} onChange={(event) => setNewClient({ ...newClient, city: event.target.value })} /></label>
              <label className="nexops-field compact"><span>State</span><input value={newClient.province} onChange={(event) => setNewClient({ ...newClient, province: event.target.value })} /></label>
            </div>
            <div className="nexops-field-row">
              <label className="nexops-field compact"><span>ZIP code</span><input value={newClient.postalCode} onChange={(event) => setNewClient({ ...newClient, postalCode: event.target.value })} /></label>
              <label className="nexops-field"><span>Country</span><select value={newClient.country} onChange={(event) => setNewClient({ ...newClient, country: event.target.value })}><option value="US">United States</option><option value="CA">Canada</option></select></label>
            </div>
            {newClient.propertyGeoLat && newClient.propertyGeoLng ? <p className="nexops-form-note">Drive-time coordinates captured for scheduling. You can still overwrite the address manually.</p> : <p className="nexops-form-note">Manual addresses still save even if nothing is recognized. Suggestions only speed up the entry.</p>}
            <label className="nexops-field"><span>Tax rate</span><select value="none" onChange={() => undefined}><option value="none">No tax rate created</option></select></label>
            <label className="nexops-check-field"><input type="checkbox" checked={newClient.billingSameAsPrimaryProperty} onChange={(event) => setNewClient({ ...newClient, billingSameAsPrimaryProperty: event.target.checked })} /> Billing address is the same as property address</label>
            {!newClient.billingSameAsPrimaryProperty ? (
              <div className="nexops-subsection">
                <h4>Billing address</h4>
                <label className="nexops-field"><span>Billing street 1</span><input value={newClient.billingStreet1} onChange={(event) => setNewClient({ ...newClient, billingStreet1: event.target.value })} /></label>
                <label className="nexops-field"><span>Billing street 2</span><input value={newClient.billingStreet2} onChange={(event) => setNewClient({ ...newClient, billingStreet2: event.target.value })} /></label>
                <div className="nexops-field-row">
                  <label className="nexops-field"><span>Billing city</span><input value={newClient.billingCity} onChange={(event) => setNewClient({ ...newClient, billingCity: event.target.value })} /></label>
                  <label className="nexops-field compact"><span>Billing state</span><input value={newClient.billingProvince} onChange={(event) => setNewClient({ ...newClient, billingProvince: event.target.value })} /></label>
                </div>
                <label className="nexops-field compact"><span>Billing ZIP</span><input value={newClient.billingPostalCode} onChange={(event) => setNewClient({ ...newClient, billingPostalCode: event.target.value })} /></label>
              </div>
            ) : null}
            <details className="nexops-extra-panel">
              <summary>Property details</summary>
              <div className="nexops-extra-panel-body">
                <p>Create custom fields to track additional property details.</p>
                <button type="button">Add Custom Field</button>
                <label className="nexops-check-field inline"><input type="checkbox" checked={newClient.propertyGatedEntry} onChange={(event) => setNewClient({ ...newClient, propertyGatedEntry: event.target.checked })} /> Gated entry</label>
                <label className="nexops-field"><span>Gate entry code(s)</span><input value={newClient.propertyGateCodes} onChange={(event) => setNewClient({ ...newClient, propertyGateCodes: event.target.value })} /></label>
                <label className="nexops-field"><span>Property client name</span><input value={newClient.propertyClientName} onChange={(event) => setNewClient({ ...newClient, propertyClientName: event.target.value })} /></label>
                <label className="nexops-field"><span>Property client telephone number</span><input value={newClient.propertyClientPhone} onChange={(event) => setNewClient({ ...newClient, propertyClientPhone: event.target.value })} /></label>
                <label className="nexops-field"><span>Property client email address</span><input type="email" value={newClient.propertyClientEmail} onChange={(event) => setNewClient({ ...newClient, propertyClientEmail: event.target.value })} /></label>
                <div className="nexops-field-row">
                  <label className="nexops-field"><span>Custom field name</span><input value={newClient.propertyCustomFieldName} onChange={(event) => setNewClient({ ...newClient, propertyCustomFieldName: event.target.value })} /></label>
                  <label className="nexops-field"><span>Custom field value</span><input value={newClient.propertyCustomFieldValue} onChange={(event) => setNewClient({ ...newClient, propertyCustomFieldValue: event.target.value })} /></label>
                </div>
              </div>
            </details>
            <details className="nexops-extra-panel">
              <summary>Property contacts</summary>
              <div className="nexops-extra-panel-body single-row">
                <p>For contacts with access limited to this property. These contacts do not receive parent-client correspondence by default.</p>
                <button type="button">Add Contact</button>
              </div>
            </details>
          </div>
        </section>
        <div className={`nexops-drawer-actions${pageLayout ? " nexops-client-form-page-actions" : ""}`}>
          <span>{createStatus || (createClientCanSave ? "Name, address, and telephone are present. Email is optional." : `Add ${createClientMissingFields.join(", ")} before Save becomes available.`)}</span>
          <button type="button" onClick={onClose}>{pageLayout ? "Back to clients" : "Cancel"}</button>
          <button type="submit" disabled={!createClientCanSave}>Save client</button>
        </div>
    </form>
  );

  if (pageLayout) {
    return form;
  }

  return (
    <div className="nexops-drawer-backdrop" role="presentation">
      {form}
    </div>
  );
}

export function NexOpsCreateMenu(props: NexOpsCreateMenuProps): React.ReactElement {
  return (
    <>
      <button className="nexops-overlay-backdrop nexops-create-menu-backdrop" type="button" aria-label="Close create menu" onClick={props.onClose} />
      <section id={NEXOPS_SHARED_CREATE_MENU_ID} className={`nexops-create-menu nexops-create-menu-${props.presentation}`} role="dialog" aria-modal="true" aria-label="Create a new record">
        <div className="nexops-create-menu-head">
          <div>
            <p className="eyebrow">Create</p>
            <h2>Start the next record</h2>
            <p>{props.activeContextLabel ?? "Pick the object you want to create. The menu closes as soon as the workflow opens."}</p>
          </div>
          <button type="button" onClick={props.onClose}>Close</button>
        </div>
        <div className="nexops-create-menu-grid">
          {NEXOPS_CREATE_OPTIONS.map((option) => (
            <button className="nexops-create-menu-option" key={option.id} type="button" onClick={() => props.onSelect(option)}>
              <span className="nexops-create-menu-icon">
                <NexOpsCreateGlyph option={option.id} />
              </span>
              <span className="nexops-create-menu-copy">
                <strong>{option.label}</strong>
                <small>{option.detail}</small>
              </span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

export function NexOpsNotificationPanel(props: NexOpsNotificationPanelProps): React.ReactElement {
  const { notificationStatus, notifications, onMarkAllRead, onOpenNotification, onClose } = props;

  return (
    <section className="nexops-notification-panel" role="dialog" aria-label="Notifications">
      <div className="nexops-notification-head">
        <div>
          <p className="eyebrow">Updates</p>
          <h2>Notifications</h2>
        </div>
        <div className="nexops-inline-actions">
          <button type="button" onClick={() => void onMarkAllRead()}>Mark all read</button>
          {onClose ? <button type="button" onClick={onClose}>Close</button> : null}
        </div>
      </div>
      {notificationStatus ? <p className="nexops-module-status">{notificationStatus}</p> : null}
      <div className="nexops-notification-list">
        {notifications.map((entry) => (
          <button className={`nexops-notification-row${entry.unread ? " unread" : ""}`} key={entry.id} type="button" onClick={() => void onOpenNotification(entry)}>
            <div>
              <strong>{entry.title}</strong>
              <p>{entry.body}</p>
            </div>
            <small>{entry.relativeTime}</small>
          </button>
        ))}
        {!notifications.length && !notificationStatus ? <p className="nexops-module-status">Nothing is waiting in this notification rail right now.</p> : null}
      </div>
    </section>
  );
}
