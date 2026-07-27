import React from "react";
import { ProductLogo } from "../../../shared/branding/ProductBranding";
import { NEXTEAM_WORKSPACE_OPTIONS } from "../domain/nexopsNavigation";

export function NexOpsModuleSwitcher(props: {
  open: boolean;
  onClose: () => void;
  onOpenProduct: (product: "nexops" | "nexcam" | "nexdocs" | "nexportal" | "nexreach") => void;
}): React.ReactElement | null {
  if (!props.open) {
    return null;
  }
  return (
    <>
      <button className="nexops-overlay-backdrop" type="button" aria-label="Close module switcher" onClick={props.onClose} />
      <section className="nexops-workspace-switcher" role="dialog" aria-label="Switch NexTeam modules">
        <div className="nexops-workspace-switcher-head">
          <div>
            <p className="eyebrow">Modules</p>
            <h2>Move across the platform</h2>
          </div>
          <button type="button" onClick={props.onClose}>Close</button>
        </div>
        <div className="nexops-workspace-switcher-grid">
          {NEXTEAM_WORKSPACE_OPTIONS.map((option) => (
            <button
              className={option.id === "nexops" ? "active" : ""}
              key={option.id}
              type="button"
              onClick={() => props.onOpenProduct(option.id)}
            >
              <ProductLogo product={option.id === "nexportal" ? "nexportal" : option.id} className="nexops-workspace-switcher-logo" alt={option.label} />
              <div>
                <strong>{option.label}</strong>
                <p>{option.detail}</p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

