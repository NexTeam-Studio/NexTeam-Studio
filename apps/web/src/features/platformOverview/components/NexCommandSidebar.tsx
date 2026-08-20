import React from "react";
import { PlatformMark } from "../../../shared/branding/ProductBranding";

export type NexCommandArea = "dashboard" | "live-status" | "team" | "tenants" | "prospects" | "blueprints" | "subscriptions" | "onboarding" | "migrations" | "support" | "modules" | "templates" | "integrations" | "system" | "releases" | "usage" | "billing" | "security" | "settings";

export const nexCommandNavigation: Array<[NexCommandArea, string, string]> = [
  ["dashboard", "Dashboard", "⌂"], ["live-status", "Live Build Status", "●"], ["tenants", "Tenants", "◫"], ["prospects", "Prospects", "◌"], ["blueprints", "Blueprints", "◇"], ["subscriptions", "Subscriptions", "◈"], ["onboarding", "Onboarding", "→"], ["migrations", "Migrations", "↻"], ["support", "Support", "?"], ["modules", "Modules", "▦"], ["templates", "Templates", "▤"], ["integrations", "Integrations", "⌁"], ["system", "Code & System", "⌘"], ["releases", "Releases", "↑"], ["usage", "Usage", "▥"], ["billing", "Billing", "$"], ["security", "Security & Audit", "◉"], ["settings", "Settings", "⚙"]
];

function liveStatusTone(state: string): "green" | "yellow" | "red" { return state === "COMPLETE" || state === "SUCCEEDED" || state === "IDLE" ? "green" : state === "FAILED" || state === "STALLED" || state === "BLOCKED" ? "red" : "yellow"; }

export function NexCommandSidebar(props: { area: NexCommandArea; open?: boolean; liveState: string; onSelect: (area: NexCommandArea) => void }): React.ReactElement {
  return <div className={`nexcommand__nav ${props.open ? "nexcommand__nav--open" : ""}`}><div className="nexcommand__nav-title"><PlatformMark decorative /><div><strong>NexCommand</strong><span>Internal operating console</span></div></div>{nexCommandNavigation.map(([key, label, icon]) => <button key={key} className={props.area === key ? "is-active" : ""} onClick={() => props.onSelect(key)}><i aria-hidden="true">{icon}</i><span>{label}</span>{key === "live-status" ? <b className={`nexcommand__live-status-icon nexcommand__live-status-icon--${liveStatusTone(props.liveState)}`} aria-label={`Live build status: ${props.liveState}`} /> : null}</button>)}</div>;
}
