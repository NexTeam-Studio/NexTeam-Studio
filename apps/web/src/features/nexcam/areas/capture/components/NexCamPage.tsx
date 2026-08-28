import React, { useState } from "react";
import type { Auth, User } from "firebase/auth";
import { NexSuiteHeader } from "../../../../../shared/ui/NexSuiteHeader";
import { NexSuiteSidebar, type NexSuiteSidebarItem } from "../../../../../shared/ui/NexSuiteSidebar";
import { NexTeamApplicationShell } from "../../../../../shared/ui/NexTeamApplicationShell";
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
  } = workspace;

  const navigationItems: NexSuiteSidebarItem[] = [
    {
      id: "start-checklist",
      label: "Start Checklist",
      active: false,
      onSelect: () => void createChecklist()
    },
    ...NEXCAM_MODULES.map((item) => ({
      id: item.id,
      label: item.label,
      active: item.id === activeModule,
      onSelect: () => setModule(item.id)
    }))
  ];

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
    <NexTeamApplicationShell
      className="nexops-app nexcam-app"
      style={style}
      header={<NexSuiteHeader product="nexcam" menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((current) => !current)} onSignOut={() => void signOutOperator(props.auth)} />}
      navigation={<NexSuiteSidebar items={navigationItems} open={menuOpen} onClose={() => setMenuOpen(false)} onSelect={() => setMenuOpen(false)} />}
      navigationLabel="NexCam navigation"
      mobileNavigationMode="drawer"
    >
      {renderActiveModule()}
      <MediaReviewSurface workspace={workspace} />
    </NexTeamApplicationShell>
  );
}
