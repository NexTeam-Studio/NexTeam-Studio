import React from "react";

export const NEXOPS_MOBILE_BREAKPOINT = 880;
export const NEXOPS_SHARED_CREATE_MENU_ID = "nexops-shared-create-menu";
export const NEXOPS_MOBILE_CREATE_FAB_PULSE_KEY = "nexops.mobileCreateFabPulseSeen.v1";
export const NEXOPS_MOBILE_CREATE_FAB_IDLE_MS = 280;
export const NEXOPS_MOBILE_CREATE_FAB_SCROLL_DELTA = 12;
export const NEXOPS_MOBILE_CREATE_FAB_TOP_EXPAND_Y = 24;

export function mobileFabVisibleForViewport(viewportWidth: number): boolean {
  return viewportWidth <= NEXOPS_MOBILE_BREAKPOINT;
}

export function getMobileCreateFabScrollIntent(previousScrollY: number, nextScrollY: number): "expand" | "collapse" | "none" {
  if (nextScrollY <= NEXOPS_MOBILE_CREATE_FAB_TOP_EXPAND_Y) {
    return "expand";
  }
  const delta = nextScrollY - previousScrollY;
  if (delta >= NEXOPS_MOBILE_CREATE_FAB_SCROLL_DELTA) {
    return "collapse";
  }
  if (delta <= -NEXOPS_MOBILE_CREATE_FAB_SCROLL_DELTA) {
    return "expand";
  }
  return "none";
}

export function shouldPulseMobileCreateFab(storageValue: string | null): boolean {
  return !storageValue;
}

export function mobileFabCanFitViewport(viewportWidth: number): boolean {
  return viewportWidth >= 320;
}

export function mobileFabShouldHideOverlays(args: {
  mobileNavOpen: boolean;
  notificationsOpen: boolean;
  moduleSwitcherOpen: boolean;
}): boolean {
  return args.mobileNavOpen || args.notificationsOpen || args.moduleSwitcherOpen;
}

export function NexOpsMobileCreateFab(props: {
  collapsed: boolean;
  expanded: boolean;
  hidden?: boolean;
  pulse?: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      className={[
        "nexops-mobile-create-fab",
        props.collapsed ? "collapsed" : "",
        props.expanded ? "active" : "",
        props.hidden ? "hidden" : "",
        props.pulse ? "pulse" : ""
      ].filter(Boolean).join(" ")}
      type="button"
      aria-controls={NEXOPS_SHARED_CREATE_MENU_ID}
      aria-expanded={props.expanded}
      aria-label="Open create menu"
      onClick={props.onClick}
    >
      <span className="nexops-mobile-create-fab-icon" aria-hidden="true">+</span>
      <span className="nexops-mobile-create-fab-label">Create</span>
    </button>
  );
}
