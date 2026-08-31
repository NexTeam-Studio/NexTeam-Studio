import React from "react";
import { AuthGate } from "../auth/AuthGate";
import { AuthSessionProvider } from "../auth/AuthSessionProvider";
import { AppRouter } from "../router/AppRouter";
import { HeaderReviewPage } from "../ui/HeaderReviewPage";
import { SidebarReviewPage } from "../ui/SidebarReviewPage";
import { ApplicationShellReviewPage, ModuleHeroCardReviewPage, NexOpsCreationTemplateReviewPage, NexOpsDetailTemplateReviewPage, NexOpsRosterTemplateReviewPage } from "../ui/TemplateReviewPages";

export function AppBootstrap(): React.ReactElement {
  if (typeof window !== "undefined" && window.location.pathname === "/design-system/layout-parts/header") return <HeaderReviewPage />;
  if (typeof window !== "undefined" && window.location.pathname === "/design-system/layout-parts/sidebar") return <SidebarReviewPage />;
  if (typeof window !== "undefined" && window.location.pathname === "/design-system/layout-parts/module-hero-card") return <ModuleHeroCardReviewPage />;
  if (typeof window !== "undefined" && window.location.pathname === "/design-system/page-templates/application-shell") return <ApplicationShellReviewPage />;
  if (typeof window !== "undefined" && window.location.pathname === "/design-system/page-templates/nexops-roster-template") return <NexOpsRosterTemplateReviewPage />;
  if (typeof window !== "undefined" && window.location.pathname === "/design-system/page-templates/nexops-creation-template") return <NexOpsCreationTemplateReviewPage />;
  if (typeof window !== "undefined" && window.location.pathname === "/design-system/page-templates/nexops-detail-template") return <NexOpsDetailTemplateReviewPage />;
  return <AuthSessionProvider><AuthGate><AppRouter /></AuthGate></AuthSessionProvider>;
}
