import { useEffect, useRef, useState } from "react";
import { fileToBase64 } from "../../../../../shared/files/fileEncoding";
import type { FieldDocsMediaRecord, UploadMediaResponse } from "../../../../nexopsShell/contracts/workspaceContracts";
import type {
  CaptureBatchListResponse,
  CaptureBatchMutationResponse,
  CaptureBatchRecord,
  CaptureClientTargetsResponse,
  CaptureClientTargetJob,
  CaptureClientTargetVisit,
  CaptureRequestIntent,
  CaptureSessionMode,
  CaptureSessionOrigin,
  CaptureWorkspaceView
} from "../contracts/captureContracts";

interface CaptureControllerOptions {
  active: boolean;
  tenantId: string;
  tenantUserId: string;
  selectedClientId: string;
  onOpenWorkspace: (view: CaptureWorkspaceView) => void;
  onOpenRequests: () => void;
  onReturnHome: () => void;
  onEmitMutation: () => void;
  onRefreshClientRails: (clientId: string) => Promise<void>;
  onSelectClient: (clientId: string) => void;
}

export function useNexOpsCaptureController(options: CaptureControllerOptions) {
  const [captureWorkspaceView, setCaptureWorkspaceView] = useState<CaptureWorkspaceView>("session");
  const [captureSession, setCaptureSession] = useState<CaptureBatchRecord | null>(null);
  const [captureSessionMode, setCaptureSessionMode] = useState<CaptureSessionMode>("fresh");
  const [captureSessionOrigin, setCaptureSessionOrigin] = useState<CaptureSessionOrigin>("new");
  const [captureSelectedMediaId, setCaptureSelectedMediaId] = useState("");
  const [captureStatus, setCaptureStatus] = useState("Open the camera to start a capture batch.");
  const [captureBusy, setCaptureBusy] = useState("");
  const [captureClientQuery, setCaptureClientQuery] = useState("");
  const [captureSelectedClientId, setCaptureSelectedClientId] = useState("");
  const [captureSelectedJobId, setCaptureSelectedJobId] = useState("");
  const [captureSelectedVisitId, setCaptureSelectedVisitId] = useState("");
  const [captureTargets, setCaptureTargets] = useState<{ jobs: CaptureClientTargetJob[]; visits: CaptureClientTargetVisit[] }>({ jobs: [], visits: [] });
  const [captureInbox, setCaptureInbox] = useState<CaptureBatchRecord[]>([]);
  const [captureInboxStatus, setCaptureInboxStatus] = useState("Loading capture inbox...");
  const [captureRequestIntent, setCaptureRequestIntent] = useState<CaptureRequestIntent | null>(null);
  const captureInputRef = useRef<HTMLInputElement | null>(null);

  function resetCaptureAssignmentDraft(): void {
    setCaptureClientQuery("");
    setCaptureSelectedClientId("");
    setCaptureSelectedJobId("");
    setCaptureSelectedVisitId("");
    setCaptureTargets({ jobs: [], visits: [] });
  }

  function openCaptureWorkspace(view: CaptureWorkspaceView): void {
    setCaptureWorkspaceView(view);
    options.onOpenWorkspace(view);
  }

  function reopenCaptureBatch(batch: CaptureBatchRecord, nextMode: CaptureSessionMode, statusText: string): void {
    setCaptureSession(batch);
    setCaptureSessionOrigin("reopened");
    setCaptureSessionMode(nextMode);
    setCaptureStatus(statusText);
    openCaptureWorkspace("session");
  }

  async function loadCaptureInbox(tenantId = options.tenantId): Promise<void> {
    setCaptureInboxStatus("Loading capture inbox...");
    try {
      const body = await fetch(`/api/fielddocs/capture-batches?tenantId=${encodeURIComponent(tenantId)}&status=unassigned&limit=50`)
        .then((response) => response.json() as Promise<CaptureBatchListResponse>);
      if (!body.ok) {
        setCaptureInbox([]);
        setCaptureInboxStatus(body.error ?? "Capture inbox is unavailable right now.");
        return;
      }
      const batches = body.batches ?? [];
      setCaptureInbox(batches);
      setCaptureInboxStatus(batches.length ? `${batches.length} unassigned capture batch${batches.length === 1 ? "" : "es"} ready to route.` : "No unassigned photo batches are waiting right now.");
    } catch {
      setCaptureInbox([]);
      setCaptureInboxStatus("Capture inbox is unavailable right now.");
    }
  }

  async function fetchCaptureBatch(batchId: string, tenantId = options.tenantId): Promise<CaptureBatchRecord | null> {
    try {
      const body = await fetch(`/api/fielddocs/capture-batches?tenantId=${encodeURIComponent(tenantId)}&limit=100`)
        .then((response) => response.json() as Promise<CaptureBatchListResponse>);
      return body.ok ? body.batches?.find((batch) => batch.id === batchId) ?? null : null;
    } catch {
      return null;
    }
  }

  async function startCaptureSession(): Promise<CaptureBatchRecord | null> {
    if (captureBusy) return captureSession;
    setCaptureBusy("capture-start");
    setCaptureStatus("Starting a fresh capture batch...");
    try {
      const body = await fetch("/api/fielddocs/capture-batches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: options.tenantId })
      }).then((response) => response.json() as Promise<CaptureBatchMutationResponse>);
      if (!body.ok || !body.batch) {
        setCaptureStatus(body.error ?? "Capture session could not start.");
        return null;
      }
      const batch = { ...body.batch, media: body.media ?? [] };
      setCaptureSession(batch);
      setCaptureSessionMode("fresh");
      setCaptureSessionOrigin("new");
      setCaptureSelectedMediaId("");
      resetCaptureAssignmentDraft();
      setCaptureStatus("Camera is ready. Capture one or more photos, then choose where they go.");
      openCaptureWorkspace("session");
      return batch;
    } catch {
      setCaptureStatus("Capture session could not start.");
      return null;
    } finally {
      setCaptureBusy("");
    }
  }

  async function loadCaptureTargets(clientId: string): Promise<void> {
    if (!clientId) {
      setCaptureTargets({ jobs: [], visits: [] });
      return;
    }
    setCaptureBusy("capture-targets");
    setCaptureStatus("Loading open jobs and visits for that client...");
    try {
      const body = await fetch(`/api/fielddocs/clients/${encodeURIComponent(clientId)}/targets?tenantId=${encodeURIComponent(options.tenantId)}`)
        .then((response) => response.json() as Promise<CaptureClientTargetsResponse>);
      if (!body.ok) {
        setCaptureTargets({ jobs: [], visits: [] });
        setCaptureStatus(body.error ?? "Client capture targets are unavailable.");
        return;
      }
      setCaptureTargets({ jobs: body.jobs ?? [], visits: body.visits ?? [] });
      setCaptureStatus(body.jobs?.length || body.visits?.length ? "Choose a job or visit, or leave this client-level only." : "No open jobs or visits are available. Photos will attach at the client level.");
    } catch {
      setCaptureTargets({ jobs: [], visits: [] });
      setCaptureStatus("Client capture targets are unavailable.");
    } finally {
      setCaptureBusy("");
    }
  }

  async function uploadCapturePhotos(files: FileList | null): Promise<void> {
    if (!files?.length) return;
    const activeBatch = captureSession ?? await startCaptureSession();
    if (!activeBatch) return;
    setCaptureBusy("capture-upload");
    setCaptureStatus(`Uploading ${files.length} capture${files.length === 1 ? "" : "s"}...`);
    try {
      for (const file of Array.from(files)) {
        const fileBase64 = await fileToBase64(file);
        const mime = file.type || "image/jpeg";
        const body = await fetch("/api/fielddocs/uploads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tenantId: options.tenantId,
            captureBatchId: activeBatch.id,
            filename: file.name,
            mime,
            fileBase64,
            tags: ["nexcam-capture-tool"],
            capturedBy: options.tenantUserId,
            ...(mime.startsWith("image/") ? { imageBase64: fileBase64, imageMime: mime } : {})
          })
        }).then((response) => response.json() as Promise<UploadMediaResponse>);
        if (!body.ok || !body.media) throw new Error(body.error ?? "Capture upload failed.");
      }
      const refreshed = await fetchCaptureBatch(activeBatch.id);
      if (refreshed) {
        setCaptureSession(refreshed);
        setCaptureSessionMode(refreshed.status === "assigned" ? "continued" : refreshed.status === "unassigned" ? "unassigned" : "fresh");
      }
      setCaptureStatus(captureSessionOrigin === "reopened"
        ? "Photos saved back into this batch. Markup is optional. Keep capturing or tap Done to return it where it belongs."
        : "Photos saved. Markup is optional. Keep capturing, or tap Done when you're ready to route this batch.");
      await loadCaptureInbox();
    } catch (error) {
      setCaptureStatus(error instanceof Error ? error.message : "Capture upload failed.");
    } finally {
      setCaptureBusy("");
    }
  }

  async function markCaptureDecideLater(): Promise<void> {
    if (!captureSession) return;
    setCaptureBusy("capture-decide-later");
    setCaptureStatus("Parking this batch in the unassigned inbox...");
    try {
      const body = await fetch(`/api/fielddocs/capture-batches/${encodeURIComponent(captureSession.id)}/assign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: options.tenantId, mode: "decide_later" })
      }).then((response) => response.json() as Promise<CaptureBatchMutationResponse>);
      if (!body.ok || !body.batch) {
        setCaptureStatus(body.error ?? "Could not move this batch to the unassigned inbox.");
        return;
      }
      setCaptureSession(body.batch);
      setCaptureSessionMode("unassigned");
      setCaptureStatus("This batch is waiting in the unassigned inbox. You can keep capturing or route it later.");
      options.onEmitMutation();
      await loadCaptureInbox();
    } catch {
      setCaptureStatus("Could not move this batch to the unassigned inbox.");
    } finally {
      setCaptureBusy("");
    }
  }

  async function assignCaptureToExistingClient(): Promise<void> {
    if (!captureSession || !captureSelectedClientId) {
      setCaptureStatus("Choose an existing client before attaching this batch.");
      return;
    }
    setCaptureBusy("capture-assign-existing");
    setCaptureStatus("Attaching this batch to the selected client...");
    try {
      const body = await fetch(`/api/fielddocs/capture-batches/${encodeURIComponent(captureSession.id)}/assign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: options.tenantId,
          mode: "existing_client",
          clientId: captureSelectedClientId,
          ...(captureSelectedJobId ? { jobId: captureSelectedJobId } : {}),
          ...(captureSelectedVisitId ? { visitId: captureSelectedVisitId } : {})
        })
      }).then((response) => response.json() as Promise<CaptureBatchMutationResponse>);
      if (!body.ok || !body.batch) {
        setCaptureStatus(body.error ?? "Could not attach this batch to the selected client.");
        return;
      }
      setCaptureSession(body.batch);
      setCaptureSessionMode("continued");
      resetCaptureAssignmentDraft();
      setCaptureStatus("This capture session is now scoped to the selected client. Keep shooting or tap done when you're finished.");
      options.onEmitMutation();
      await loadCaptureInbox();
      if (options.selectedClientId === captureSelectedClientId) await options.onRefreshClientRails(options.selectedClientId);
    } catch {
      setCaptureStatus("Could not attach this batch to the selected client.");
    } finally {
      setCaptureBusy("");
    }
  }

  function routeCaptureToNewRequest(batch = captureSession): void {
    if (!batch) return;
    setCaptureRequestIntent({ batchId: batch.id, mediaIds: batch.media.map((entry) => entry.id) });
    setCaptureSessionMode("new-client");
    resetCaptureAssignmentDraft();
    options.onOpenRequests();
  }

  async function handleCaptureRequestCreated(request: { id: string; clientName: string; selectedClientId?: string }): Promise<void> {
    if (!captureRequestIntent) return;
    setCaptureBusy("capture-assign-request");
    setCaptureStatus("Attaching the capture batch to the new request...");
    try {
      const body = await fetch(`/api/fielddocs/capture-batches/${encodeURIComponent(captureRequestIntent.batchId)}/assign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: options.tenantId, mode: "request", requestId: request.id })
      }).then((response) => response.json() as Promise<CaptureBatchMutationResponse>);
      if (!body.ok || !body.batch) {
        setCaptureStatus(body.error ?? "The new request saved, but the capture batch did not attach yet.");
        return;
      }
      setCaptureSession(body.batch);
      setCaptureSessionMode("continued");
      setCaptureRequestIntent(null);
      setCaptureWorkspaceView("session");
      setCaptureStatus(`Request ${request.id} saved. Further photos in this session now attach directly to ${request.clientName}.`);
      options.onEmitMutation();
      openCaptureWorkspace("session");
      await loadCaptureInbox();
      if (body.clientId) {
        options.onSelectClient(body.clientId);
        await options.onRefreshClientRails(body.clientId);
      }
    } catch {
      setCaptureStatus("The new request saved, but the capture batch did not attach yet.");
    } finally {
      setCaptureBusy("");
    }
  }

  function finishCaptureSession(): void {
    if (captureSessionOrigin === "new" && captureSession?.status === "draft" && captureSession.media.length) {
      setCaptureSessionMode("choose");
      setCaptureStatus("Choose where this capture batch should go: New Client, Existing Client, or Decide Later.");
      return;
    }
    const returnToInbox = captureSessionOrigin === "reopened" && captureSession?.status === "unassigned";
    setCaptureSession(null);
    setCaptureSessionMode("fresh");
    setCaptureSessionOrigin("new");
    setCaptureSelectedMediaId("");
    setCaptureRequestIntent(null);
    resetCaptureAssignmentDraft();
    if (returnToInbox) {
      setCaptureStatus("Reopened batch saved. It is back in the unassigned inbox until you route it.");
      setCaptureWorkspaceView("unassigned");
      options.onOpenWorkspace("unassigned");
      void loadCaptureInbox();
      return;
    }
    setCaptureStatus("Capture session closed. Open the camera again for a fresh batch.");
    setCaptureWorkspaceView("session");
    options.onReturnHome();
  }

  useEffect(() => {
    if (!captureSession?.mediaIds.length) {
      setCaptureSelectedMediaId("");
      return;
    }
    setCaptureSelectedMediaId((current) => current && captureSession.mediaIds.includes(current)
      ? current
      : captureSession.mediaIds[captureSession.mediaIds.length - 1] ?? "");
  }, [captureSession?.id, captureSession?.mediaIds.join("|")]);

  useEffect(() => {
    if (options.active) void loadCaptureInbox();
  }, [options.active, options.tenantId]);

  const mediaById = new Map(captureSession?.media.map((entry) => [entry.id, entry]) ?? []);
  const captureSessionMedia = (captureSession?.mediaIds ?? [])
    .map((id) => mediaById.get(id))
    .filter((entry): entry is FieldDocsMediaRecord => Boolean(entry));
  const activeCaptureMedia = captureSessionMedia.find((media) => media.id === captureSelectedMediaId)
    ?? captureSessionMedia[captureSessionMedia.length - 1]
    ?? null;

  return {
    captureInputRef, captureBusy, captureStatus, captureWorkspaceView, captureSession,
    captureSessionOrigin, captureSessionMode, captureInbox, captureInboxStatus, captureRequestIntent,
    captureClientQuery, captureSelectedClientId, captureSelectedJobId, captureSelectedVisitId,
    captureTargets, captureSessionMedia, activeCaptureMedia,
    captureAnchorGps: captureSession?.originGps ?? captureSession?.latestGps,
    captureGpsMoved: Boolean(captureSession?.originGps && captureSession.latestGps
      && (captureSession.originGps.lat !== captureSession.latestGps.lat || captureSession.originGps.lng !== captureSession.latestGps.lng)),
    visibleCaptureVisits: captureTargets.visits.filter((visit) => !captureSelectedJobId || visit.jobId === captureSelectedJobId),
    setCaptureClientQuery, setCaptureSelectedClientId, setCaptureSelectedJobId, setCaptureSelectedVisitId,
    setCaptureSelectedMediaId, setCaptureSessionMode, setCaptureStatus, setCaptureSession, setCaptureSessionOrigin,
    startCaptureSession, openCaptureWorkspace, finishCaptureSession, uploadCapturePhotos,
    routeCaptureToNewRequest, markCaptureDecideLater, loadCaptureTargets, assignCaptureToExistingClient,
    reopenCaptureBatch, handleCaptureRequestCreated
  };
}
