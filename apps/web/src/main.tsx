import React, { Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./features/quotes/components/quoteTemplates/quoteTemplates.css";
import "./features/jobs/components/jobCore/jobCore.css";
import "./features/visits/components/visitCore/visitCore.css";
import "./features/invoices/components/invoiceStructure/invoiceStructure.css";
import "./features/invoices/components/paymentRails/paymentRails.css";
import "./features/nexopsShell/documentPrimitives.css";
import "./features/quotes/components/quoteEngine/quoteEngine.css";
import "./features/settings/components/catalog/catalog.css";
import "./features/settings/components/tenantConfig/tenantConfig.css";
import { NexOpsWorkspace } from "./features/nexopsShell/NexOpsWorkspace";
import { AppBootstrap } from "./shared/app/AppBootstrap";
import { NexiStandaloneChat } from "./features/nexi/areas/chat/components/NexiStandaloneChat";
import { NexCamPage } from "./features/nexcam/areas/capture/components/NexCamPage";
import { PlatformRoute } from "./features/platform/routes/PlatformRoute";













const NexReachPage = React.lazy(async () => ({ default: (await import("./nexreach")).NexReachPage }));

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <AppBootstrap
      renderAuthenticated={({ auth, user }) => {
        if (window.location.pathname.startsWith("/platform")) return <PlatformRoute />;
        if (window.location.pathname.startsWith("/nexcam")) return <NexCamPage auth={auth} user={user} />;
        if (window.location.pathname.startsWith("/nexreach")) {
          return <Suspense fallback={<main className="shell"><section className="auth-card"><h1>Loading NexReach</h1></section></main>}><NexReachPage auth={auth} user={user} /></Suspense>;
        }
        if (window.location.pathname.startsWith("/nexops")) return <NexOpsWorkspace auth={auth} user={user} />;
        return <NexiStandaloneChat auth={auth} user={user} />;
      }}
    />
  );
}

