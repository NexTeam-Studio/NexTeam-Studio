import React from "react";
import type { Auth, User } from "firebase/auth";
import { ProductLogo, SidebarBrandStack } from "../../../../../shared/branding/ProductBranding";
import { NexSuiteHeader } from "../../../../../shared/ui/NexSuiteHeader";
import { signOutOperator } from "../../../../../shared/auth/authBootstrap";
import { NexCamOverviewSurface } from "../../overview/components/NexCamOverviewSurface";
import { ChecklistTemplatesSurface } from "../../../../nexdocs/areas/checklists/components/ChecklistTemplatesSurface";
import { MediaLibrarySurface } from "../../../../nexdocs/areas/media/components/MediaLibrarySurface";
import { MediaReviewSurface } from "../../../../nexdocs/areas/media/components/MediaReviewSurface";
import { ReportsSurface } from "../../../../nexdocs/areas/reports/components/ReportsSurface";
import { NEXCAM_MODULES, useNexCamWorkspace } from "../hooks/useNexCamWorkspace";
import "../styles/nexcam.css";

export function NexCamPage(props: { auth: Auth | null; user: User }) {
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
        <NexSuiteHeader className="nexops-web-topbar" ariaLabel="NexCam header" brand={<div className="nexops-web-brand">
            <ProductLogo product="nexcam" className="nexops-header-product-logo" alt="NexCam" />
            <div className="nexops-web-brand-copy">
              <strong>NexCam</strong>
              <span>{operatorContext.tenantId}</span>
            </div>
        </div>} utilities={<div className="nexops-web-tools">
          <span>{status}</span><span>{props.user.email ?? "Operator"}</span><button type="button" onClick={() => void signOutOperator(props.auth)}>Sign out</button>
        </div>} />
        {renderActiveModule()}
      </section>
      {<MediaReviewSurface workspace={workspace} />}
    </main>
  );
}
