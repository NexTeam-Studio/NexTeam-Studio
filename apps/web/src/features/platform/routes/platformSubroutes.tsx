import React from "react";
import { ClientsRoute } from "../../clients/routes/ClientsRoute";
import { InvoicesRoute } from "../../invoices/routes/InvoicesRoute";
import { JobsRoute } from "../../jobs/routes/JobsRoute";
import { PlatformOverviewRoute } from "../../platformOverview/routes/PlatformOverviewRoute";
import { QuotesRoute } from "../../quotes/routes/QuotesRoute";
import { SettingsRoute } from "../../settings/routes/SettingsRoute";
import type { PlatformSubroute } from "./resolvePlatformSubroute";

export function renderPlatformSubroute(subroute: PlatformSubroute): React.ReactElement {
  switch (subroute) {
    case "clients":
      return <ClientsRoute />;
    case "quotes":
      return <QuotesRoute />;
    case "jobs":
      return <JobsRoute />;
    case "settings":
      return <SettingsRoute />;
    case "invoices":
      return <InvoicesRoute />;
    case "overview":
    default:
      return <PlatformOverviewRoute />;
  }
}
