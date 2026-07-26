import React from "react";
import "../styles/platformRoute.css";
import { renderPlatformSubroute } from "./platformSubroutes";
import { resolvePlatformSubroute } from "./resolvePlatformSubroute";
import { usePathname } from "../../../shared/router/usePathname";

export function PlatformRoute(): React.ReactElement {
  const subroute = resolvePlatformSubroute(usePathname());

  return (
    <main className="platform-route">
      {renderPlatformSubroute(subroute)}
    </main>
  );
}
