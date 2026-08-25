import React from "react";
import { PlatformMark } from "../branding/ProductBranding";
import "./nexCommandHeader.css";

export function NexCommandHeader(props: { menuOpen: boolean; onToggleMenu: () => void; onSignOut: () => void }): React.ReactElement {
  return <header className="nexcommand__topbar" aria-label="NexCommand header"><button className="nexcommand__menu" type="button" aria-expanded={props.menuOpen} aria-label="Open NexCommand navigation" onClick={props.onToggleMenu}>☰</button><div className="nexcommand__brand"><PlatformMark decorative /><span>NexCommand</span></div><div className="nexcommand__environment"><span>STAGING</span><small>nexstage.nexteam.studio</small></div><button className="nexcommand__signout" type="button" onClick={props.onSignOut}>Sign out</button></header>;
}
