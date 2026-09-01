import React, { useState } from "react";
import type { Auth, User } from "firebase/auth";
import { NexSuiteHeader } from "../../../../../shared/ui/NexSuiteHeader";
import { NexSuiteSidebar, type NexSuiteSidebarItem } from "../../../../../shared/ui/NexSuiteSidebar";
import { NexTeamApplicationShell } from "../../../../../shared/ui/NexTeamApplicationShell";
import { NexOpsCreationTemplate, NexOpsRosterSurface } from "../../../../../shared/ui/NexOpsBusinessTemplates";
import "../../../../../shared/ui/nexSuiteHeaderDrawer.css";
import { signOutOperator } from "../../../../../shared/auth/authBootstrap";
import { NexOpsNavGlyph } from "../../../../nexopsShell/workspaceSupport";
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
    recentMedia,
    reports,
    setModule,
    style,
    templates,
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
    return (
      <NexOpsCreationTemplate
        eyebrow="NexCam field documentation"
        title="Create Field Checklist"
        detail="Start from the property and visit rail, record the field evidence, and carry property facts forward."
        icon={<NexOpsNavGlyph module="capture" />}
        backAction={<button className="nexops-hero-primary-button" type="button" onClick={() => setModule("overview")}>NexCam Overview</button>}
        heroClassName="module-hero-card--quote"
      >
        <NexCamOverviewSurface workspace={workspace} embedded />
      </NexOpsCreationTemplate>
    );
  }

  function renderTemplatesPanel(): React.ReactElement {
    return renderRosterSurface("Checklist Templates", "Build and maintain reusable field-checklist definitions.", "Template", templates.length, <ChecklistTemplatesSurface workspace={workspace} />);
  }

  function renderPhotosPanel(): React.ReactElement {
    return renderRosterSurface("Photos & Media", "Review visit-scoped field evidence and media metadata.", "Media workspace", recentMedia.length, <MediaLibrarySurface workspace={workspace} />);
  }

  function renderReportsPanel(): React.ReactElement {
    return renderRosterSurface("Reports", "Create and review closeout-ready field reports.", "Report", reports.length, <ReportsSurface workspace={workspace} />);
  }

  function renderRosterSurface(
    title: string,
    detail: string,
    resultNoun: string,
    resultCount: number,
    content: React.ReactNode
  ): React.ReactElement {
    return (
      <NexOpsRosterSurface
        ariaLabel={`NexCam ${title}`}
        searchTitle={title}
        search={<p className="nexcam-roster-surface__copy">{detail}</p>}
        filter={<button className="nexops-quote-filter-trigger" type="button" onClick={() => setModule("overview")}><span className="nexops-quote-filter-label">Field Checklist</span></button>}
        resultCount={resultCount}
        resultNoun={resultNoun}
        showResults
      >
        {content}
      </NexOpsRosterSurface>
    );
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
