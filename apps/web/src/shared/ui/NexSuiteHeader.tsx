import React from "react";
import { PlatformMark, ProductLogo, productLabel, type ProductBrand } from "../branding/ProductBranding";
import "./nexSuiteHeader.css";

export function NexSuiteHeader(props: { product: ProductBrand; menuOpen: boolean; onToggleMenu: () => void; onSignOut: () => void }): React.ReactElement {
  const label = productLabel(props.product);
  return <header className="nexsuite__topbar" aria-label={`${label} header`}><button className="nexsuite__menu" type="button" aria-expanded={props.menuOpen} aria-label={`Open ${label} navigation`} onClick={props.onToggleMenu}>☰</button><div className="nexsuite__brand"><PlatformMark decorative /><ProductLogo product={props.product} decorative /></div><div className="nexsuite__environment"><span>STAGING</span><small>nexstage.nexteam.studio</small></div><button className="nexsuite__signout" type="button" onClick={props.onSignOut}>Sign Out</button></header>;
}
