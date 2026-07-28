import React, { Suspense } from "react";
import type { CrmClient } from "../../../../nexopsShell/contracts/workspaceContracts";
import type { useNexOpsCaptureController } from "../hooks/useNexOpsCaptureController";

const NexOpsCaptureWorkspace = React.lazy(async () => ({ default: (await import("./NexOpsCaptureWorkspace")).NexOpsCaptureWorkspace }));

export function NexOpsCaptureModule(props: {
  tenantId: string;
  clients: CrmClient[];
  controller: ReturnType<typeof useNexOpsCaptureController>;
  clientDisplayName: (client: CrmClient) => string;
  clientPrimaryAddress: (client: CrmClient) => string;
  contactSummary: (client: CrmClient) => string;
}): React.ReactElement {
  const capture = props.controller;
  const filteredClients = props.clients.filter((client) => !capture.captureClientQuery.trim() || [
    props.clientDisplayName(client),
    ...client.emails,
    ...client.phones,
    props.clientPrimaryAddress(client)
  ].join(" ").toLowerCase().includes(capture.captureClientQuery.trim().toLowerCase())).slice(0, 8);
  const selectedCaptureClient = props.clients.find((client) => client.id === capture.captureSelectedClientId);
  const assignedCaptureClient = capture.captureSession?.assignedClientId
    ? props.clients.find((client) => client.id === capture.captureSession?.assignedClientId)
    : undefined;

  return (
    <Suspense fallback={<section className="nexops-module-page"><div className="nexops-module-grid"><article className="nexops-module-card"><p className="eyebrow">Loading</p><h2>Opening capture workspace</h2><p>Pulling the deferred capture rail into the shell now.</p></article></div></section>}>
      <NexOpsCaptureWorkspace
        operatorTenantId={props.tenantId}
        captureInputRef={capture.captureInputRef}
        captureBusy={capture.captureBusy}
        captureStatus={capture.captureStatus}
        captureWorkspaceView={capture.captureWorkspaceView}
        captureSession={capture.captureSession}
        captureSessionOrigin={capture.captureSessionOrigin}
        captureSessionMode={capture.captureSessionMode}
        captureInbox={capture.captureInbox}
        captureInboxStatus={capture.captureInboxStatus}
        activeCaptureMedia={capture.activeCaptureMedia}
        captureSessionMedia={capture.captureSessionMedia}
        captureAnchorGps={capture.captureAnchorGps}
        captureGpsMoved={capture.captureGpsMoved}
        filteredClients={filteredClients}
        selectedCaptureClient={selectedCaptureClient}
        assignedCaptureClient={assignedCaptureClient}
        captureClientQuery={capture.captureClientQuery}
        setCaptureClientQuery={capture.setCaptureClientQuery}
        captureSelectedClientId={capture.captureSelectedClientId}
        setCaptureSelectedClientId={capture.setCaptureSelectedClientId}
        captureSelectedJobId={capture.captureSelectedJobId}
        setCaptureSelectedJobId={capture.setCaptureSelectedJobId}
        captureSelectedVisitId={capture.captureSelectedVisitId}
        setCaptureSelectedVisitId={capture.setCaptureSelectedVisitId}
        captureTargets={capture.captureTargets}
        visibleCaptureVisits={capture.visibleCaptureVisits}
        onStartCaptureSession={capture.startCaptureSession}
        onOpenCaptureWorkspace={capture.openCaptureWorkspace}
        onFinishCaptureSession={capture.finishCaptureSession}
        onUploadCapturePhotos={capture.uploadCapturePhotos}
        onSetCaptureSelectedMediaId={capture.setCaptureSelectedMediaId}
        onRouteCaptureToNewRequest={capture.routeCaptureToNewRequest}
        onMarkCaptureDecideLater={capture.markCaptureDecideLater}
        onSetCaptureSessionMode={capture.setCaptureSessionMode}
        onSetCaptureStatus={capture.setCaptureStatus}
        onLoadCaptureTargets={capture.loadCaptureTargets}
        onAssignCaptureToExistingClient={capture.assignCaptureToExistingClient}
        onReopenCaptureBatch={capture.reopenCaptureBatch}
        onSetCaptureSession={capture.setCaptureSession}
        onSetCaptureSessionOrigin={capture.setCaptureSessionOrigin}
        clientDisplayName={props.clientDisplayName}
        clientPrimaryAddress={props.clientPrimaryAddress}
        contactSummary={props.contactSummary}
      />
    </Suspense>
  );
}
