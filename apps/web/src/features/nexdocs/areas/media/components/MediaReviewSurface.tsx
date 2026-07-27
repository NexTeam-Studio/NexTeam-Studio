import React from "react";
import type { NexCamWorkspaceBindings } from "../../../../nexcam/areas/capture/hooks/useNexCamWorkspace";

export function MediaReviewSurface(props: { workspace: NexCamWorkspaceBindings }): React.ReactElement | null {
  const {
    annotationPolyline,
    beginMediaDraw,
    closeMediaReview,
    drawMode,
    drawingPath,
    finishMediaDraw,
    mediaAnnotationsDraft,
    mediaCommentDraft,
    mediaContextLabel,
    mediaHiddenFromClientDraft,
    mediaManualTagsDraft,
    mediaReviewSaving,
    mediaStageRef,
    operatorContext,
    removeLastMarkup,
    saveMediaReview,
    selectedMedia,
    setDrawMode,
    setMediaCommentDraft,
    setMediaHiddenFromClientDraft,
    setMediaManualTagsDraft,
    setMediaTrashState,
    updateMediaDraw
  } = props.workspace;
  return selectedMedia ? (
        <>
          <button className="nexops-overlay-backdrop" type="button" aria-label="Close NexCam photo review" onClick={closeMediaReview} />
          <section className="nexops-overlay-panel nexcam-review-panel" role="dialog" aria-modal="true" aria-label="NexCam photo review">
            <div className="nexops-overlay-head">
              <div>
                <p className="eyebrow">Photo review</p>
                <h2>{selectedMedia.aiCaption || selectedMedia.id}</h2>
                <small>{mediaContextLabel(selectedMedia)}</small>
              </div>
              <button type="button" className="nexops-link-button" onClick={closeMediaReview}>Close</button>
            </div>
            <div className="nexcam-review-layout">
              <div className="nexcam-review-stage-card">
                <div className="nexops-inline-actions">
                  <button type="button" className={drawMode ? "active" : ""} onClick={() => setDrawMode((current) => !current)}>
                    {drawMode ? "Stop drawing" : "Draw markup"}
                  </button>
                  <button type="button" className="nexops-link-button" onClick={removeLastMarkup} disabled={!mediaAnnotationsDraft.length}>
                    Remove last markup
                  </button>
                  <a className="nexops-link-button" href={`/api/media/${encodeURIComponent(selectedMedia.id)}?tenantId=${encodeURIComponent(operatorContext.tenantId)}`} target="_blank" rel="noreferrer">Open original</a>
                </div>
                <div
                  ref={mediaStageRef}
                  className={`nexcam-review-stage${drawMode ? " draw-mode" : ""}`}
                  onPointerDown={beginMediaDraw}
                  onPointerMove={updateMediaDraw}
                  onPointerUp={finishMediaDraw}
                  onPointerLeave={finishMediaDraw}
                >
                  <img
                    className="nexcam-review-image"
                    src={`/api/media/${encodeURIComponent(selectedMedia.id)}?tenantId=${encodeURIComponent(operatorContext.tenantId)}`}
                    alt={selectedMedia.aiCaption || selectedMedia.id}
                  />
                  <svg className="nexcam-review-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    {mediaAnnotationsDraft.map((annotation) => (
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
                <small>{selectedMedia.exif?.ts ? `Captured ${new Date(selectedMedia.exif.ts).toLocaleString()}` : "No capture timestamp"} · {selectedMedia.exif?.gps ? `${selectedMedia.exif.gps.lat.toFixed(4)}, ${selectedMedia.exif.gps.lng.toFixed(4)}` : "No GPS on file"}</small>
              </div>
              <div className="nexcam-review-sidebar">
                <article className="nexops-module-card wide">
                  <p className="eyebrow">Tags</p>
                  <h3>{selectedMedia.aiTags.length ? selectedMedia.aiTags.join(", ") : "No AI tags yet"}</h3>
                  <small>Search and Nexi read this same tag/caption rail.</small>
                  <label className="nexops-field">
                    <span>Manual tags</span>
                    <input value={mediaManualTagsDraft} onChange={(event) => setMediaManualTagsDraft(event.target.value)} placeholder="pool, leak, equipment pad" />
                  </label>
                  <label className="nexops-check-field inline">
                    <input type="checkbox" checked={mediaHiddenFromClientDraft} onChange={(event) => setMediaHiddenFromClientDraft(event.target.checked)} />
                    Hide this single photo from the client
                  </label>
                  <div className="nexops-inline-actions">
                    <button type="button" className="nexops-link-button" onClick={() => void setMediaTrashState(!selectedMedia.trashedAt)} disabled={mediaReviewSaving}>
                      {selectedMedia.trashedAt ? "Restore from trash" : "Move to tenant trash"}
                    </button>
                  </div>
                  {selectedMedia.purgeAfter ? <small>Trash purges after {new Date(selectedMedia.purgeAfter).toLocaleDateString()} unless restored.</small> : null}
                </article>
                <article className="nexops-module-card wide">
                  <p className="eyebrow">Comments</p>
                  <ul className="nexops-mini-list nexcam-comment-list">
                    {(selectedMedia.comments ?? []).map((entry) => (
                      <li key={entry.id}>
                        <strong>{entry.author ?? "Field note"}</strong>
                        <span>{entry.text}</span>
                        <small>{new Date(entry.createdAt).toLocaleString()}</small>
                      </li>
                    ))}
                    {!(selectedMedia.comments ?? []).length ? (
                      <li>
                        <strong>No comments yet</strong>
                        <span>Add a job-specific note without editing the AI caption.</span>
                      </li>
                    ) : null}
                  </ul>
                  <label className="nexops-field">
                    <span>Add comment</span>
                    <textarea rows={4} value={mediaCommentDraft} onChange={(event) => setMediaCommentDraft(event.target.value)} />
                  </label>
                  <div className="nexops-inline-actions">
                    <button type="button" onClick={() => void saveMediaReview()} disabled={mediaReviewSaving}>
                      {mediaReviewSaving ? "Saving..." : "Save review"}
                    </button>
                  </div>
                </article>
              </div>
            </div>
          </section>
        </>
      ) : null;
}
