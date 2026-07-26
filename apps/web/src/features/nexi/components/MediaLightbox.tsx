import React from "react";
import type { Source } from "../../../shared/contracts/nexi";
import { mediaDownloadUrl, mediaUrl } from "../utils/sourceMedia";

export function MediaLightbox(props: { source: Source; onClose: () => void }): React.ReactElement {
  return (
    <div
      className="nexi-chat__lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={props.source.label}
      onClick={props.onClose}
    >
      <div className="nexi-chat__lightbox-card" onClick={(event) => event.stopPropagation()}>
        <img src={mediaUrl(props.source)} alt={props.source.label} />
        <div className="nexi-chat__lightbox-actions">
          <a href={mediaDownloadUrl(props.source)} download={`companycam-${props.source.ref}.jpg`}>
            Save full-size
          </a>
          <button type="button" onClick={props.onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
