import React from "react";
import { OpsWorkspaceRoute } from "../../features/opsWorkspace/routes/OpsWorkspaceRoute";
import { PlatformRoute } from "../../features/platform/routes/PlatformRoute";
import { resolveAppRoute } from "./routes";
import { usePathname } from "./usePathname";

export function AppRouter(): React.ReactElement {
  const route = resolveAppRoute(usePathname());
  return route === "platform" ? <PlatformRoute /> : <OpsWorkspaceRoute />;
}
