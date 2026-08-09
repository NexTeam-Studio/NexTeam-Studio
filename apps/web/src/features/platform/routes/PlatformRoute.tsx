import React from "react";
import "../styles/platformRoute.css";
import { renderPlatformSubroute } from "./platformSubroutes";
import { resolvePlatformSubroute } from "./resolvePlatformSubroute";
import { usePathname } from "../../../shared/router/usePathname";
import { NexCommandRoute } from "../../platformOverview/routes/NexCommandRoute";

export function PlatformRoute(): React.ReactElement {
  const pathname = usePathname();
  const subroute = resolvePlatformSubroute(pathname);

  if (pathname === "/platform" || pathname === "/platform/" || pathname.startsWith("/nexcommand")) {
    return <main className="platform-route"><NexCommandRoute /></main>;
  }

  return (
    <main className="platform-route">
      {renderPlatformSubroute(subroute)}
    </main>
  );
}
