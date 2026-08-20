import React from "react";
import { NexCommandSidebar, type NexCommandArea } from "../../features/platformOverview/components/NexCommandSidebar";
import { PlatformMark } from "../branding/ProductBranding";
import { NexTeamApplicationShell } from "./NexTeamApplicationShell";
import { NexTeamProductHeader } from "./NexTeamProductHeader";

function openNexCommandArea(area: NexCommandArea): void {
  window.location.assign(`/nexcommand?area=${area}`);
}

export function SidebarReviewPage(): React.ReactElement {
  return <NexTeamApplicationShell className="header-review-shell" navigationLabel="NexSuite design navigation" mobileNavigationMode="collapse" header={<NexTeamProductHeader className="header-review-shell__topbar" ariaLabel="NexSuite design Header" brand={<div className="header-review-shell__brand"><PlatformMark decorative /><span>NexSuite Design</span></div>} context={<span>Design system</span>} />} navigation={<nav className="header-review-shell__navigation"><a className="is-active" href="/nexcommand?area=templates">Templates</a></nav>}><section className="sidebar-review-page"><header className="sidebar-review-page__intro"><p className="ui-eyebrow">NexSuite design system · layout part</p><h1>Sidebar</h1><p>Current NexCommand navigation is shown below as a live reference specimen. It is not a final Global Sidebar design.</p></header><section className="sidebar-review-specimen" aria-label="Sidebar specimen under review"><header><p className="ui-eyebrow">Component specimen</p><h2>NexCommand Sidebar — current reference</h2><p>The surrounding NexSuite shell is review navigation. This framed Sidebar is the component under review.</p></header><div className="sidebar-review-specimen__frame"><NexCommandSidebar area="templates" liveState="IDLE" onSelect={openNexCommandArea} /></div></section></section></NexTeamApplicationShell>;
}
