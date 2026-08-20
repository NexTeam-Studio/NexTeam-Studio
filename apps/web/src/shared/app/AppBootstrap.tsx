import React from "react";
import { AuthGate } from "../auth/AuthGate";
import { AuthSessionProvider } from "../auth/AuthSessionProvider";
import { AppRouter } from "../router/AppRouter";
import { HeaderReviewPage } from "../ui/HeaderReviewPage";

export function AppBootstrap(): React.ReactElement {
  if (typeof window !== "undefined" && window.location.pathname === "/design-system/layout-parts/header") return <HeaderReviewPage />;
  return <AuthSessionProvider><AuthGate><AppRouter /></AuthGate></AuthSessionProvider>;
}
