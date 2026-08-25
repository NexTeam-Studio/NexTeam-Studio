import React from "react";
import { PlatformMark } from "../branding/ProductBranding";
import "./nexSuiteHeader.css";

export function NexSuiteHeader(props: { productName: string; menuOpen: boolean; onToggleMenu: () => void; onSignOut: () => void }): React.ReactElement {
  return <header className="nexsuite__topbar" aria-label={`${props.productName} header`}><button className="nexsuite__menu" type="button" aria-expanded={props.menuOpen} aria-label={`Open ${props.productName} navigation`} onClick={props.onToggleMenu}>☰</button><div className="nexsuite__brand"><PlatformMark decorative /><span>{props.productName}</span></div><div className="nexsuite__environment"><span>STAGING</span><small>nexstage.nexteam.studio</small></div><button className="nexsuite__signout" type="button" onClick={props.onSignOut}>Sign out</button></header>;
}
