import React, { useState } from "react";
import type { Auth, User } from "firebase/auth";
import { ProductLogo, SidebarBrandStack } from "../../../../../shared/branding/ProductBranding";
import { NexSuiteHeader } from "../../../../../shared/ui/NexSuiteHeader";
import "../../../../../shared/ui/nexSuiteHeaderDrawer.css";
import { signOutOperator } from "../../../../../shared/auth/authBootstrap";
import { NexCamOverviewSurface } from "../../overview/components/NexCamOverviewSurface";
import { ChecklistTemplatesSurface } from "../../../../nexdocs/areas/checklists/components/ChecklistTemplatesSurface";
import { MediaLibrarySurface } from "../../../../nexdocs/areas/media/components/MediaLibrarySurface";
import { MediaReviewSurface } from "../../../../nexdocs/areas/media/components/MediaReviewSurface";
import { ReportsSurface } from "../../../../nexdocs/areas/reports/components/ReportsSurface";
import { NEXCAM_MODULES, useNexCamWorkspace } from "../hooks/useNexCamWorkspace";
import "../styles/nexcam.css";

export function NexCamPage(props: { auth: Auth | null; user: User }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const workspace = useNexCamWorkspace(props);
  const {
    activeModule,
    createChecklist,
    operatorContext,
    setModule,
    status,
    style,
    tenantBranding
  } = workspace;

  function renderOverview(): React.ReactElement {
    return <NexCamOverviewSurface workspace={workspace} />;
  }

  function renderTemplatesPanel(): React.ReactElement {
    return <ChecklistTemplatesSurface workspace={workspace} />;
  }

  function renderPhotosPanel(): React.ReactElement {
    return <MediaLibrarySurface workspace={workspace} />;
  }

  function renderReportsPanel(): React.ReactElement {
    return <ReportsSurface workspace={workspace} />;
  }

  function renderActiveModule(): React.ReactElement {
    if (activeModule === "templates") return renderTemplatesPanel();
    if (activeModule === "photos") return renderPhotosPanel();
    if (activeModule === "reports") return renderReportsPanel();
    return renderOverview();
  }

  return (
    <main className="nexops-app nexcam-app" style={style}>
      <aside className="nexops-app-sidebar" aria-label="NexCam navigation">
        <div className="nexops-app-logo">
          <SidebarBrandStack product="nexcam" branding={tenantBranding} tenantId={operatorContext.tenantId} />
        </div>
        <button className="nexops-create-button" type="button" onClick={() => void createChecklist()}>Start Checklist</button>
        <nav className="nexops-nav">
          {NEXCAM_MODULES.map((item) => (
            <button className={item.id === activeModule ? "active" : ""} type="button" key={item.id} onClick={() => setModule(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="nexops-web-main">
        <NexSuiteHeader productName="NexCam" menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((current) => !current)} onSignOut={() => void signOutOperator(props.auth)} />
        {menuOpen ? <nav className="nexsuite__drawer" aria-label="NexCam navigation"><button type="button" onClick={() => { void createChecklist(); setMenuOpen(false); }}>Start Checklist</button>{NEXCAM_MODULES.map((item) => <button key={item.id} type="button" onClick={() => { setModule(item.id); setMenuOpen(false); }}>{item.label}</button>)}</nav> : null}
        {renderActiveModule()}
      </section>
      {<MediaReviewSurface workspace={workspace} />}
    </main>
  );
}
