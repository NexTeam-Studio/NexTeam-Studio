import React from "react";
import { AuthGate } from "../auth/AuthGate";
import { AuthSessionProvider } from "../auth/AuthSessionProvider";
import { AppRouter } from "../router/AppRouter";
import { HeaderReviewPage } from "../ui/HeaderReviewPage";
import { SidebarReviewPage } from "../ui/SidebarReviewPage";

export function AppBootstrap(): React.ReactElement {
  if (typeof window !== "undefined" && window.location.pathname === "/design-system/layout-parts/header") return <HeaderReviewPage />;
  if (typeof window !== "undefined" && window.location.pathname === "/design-system/layout-parts/sidebar") return <SidebarReviewPage />;
  return <AuthSessionProvider><AuthGate><AppRouter /></AuthGate></AuthSessionProvider>;
}
