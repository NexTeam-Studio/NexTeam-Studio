import React from "react";
import { NEXOPS_SHARED_CREATE_MENU_ID } from "./NexOpsMobileCreateFab";
import { NEXOPS_CREATE_OPTIONS, type NexOpsCreateOption } from "../domain/nexopsNavigation";

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

