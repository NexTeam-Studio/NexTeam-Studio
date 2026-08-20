import React, { Suspense, useEffect, useState } from "react";
import { NexCamPage } from "../../features/nexcam/areas/capture/components/NexCamPage";
import { NexiStandaloneChat } from "../../features/nexi/areas/chat/components/NexiStandaloneChat";
import { NexOpsWorkspace } from "../../features/nexopsShell/NexOpsWorkspace";
import { PlatformRoute } from "../../features/platform/routes/PlatformRoute";
import { NexCommandMark } from "../branding/ProductBranding";
import { HeaderReviewPage } from "../ui/HeaderReviewPage";
import { useAuthSession } from "../auth/AuthSessionProvider";
import { establishNexCommandSession, hasFreshNexCommandAuthentication, hasNexCommandSession, signOutOperator } from "../auth/authBootstrap";
import { usePathname } from "./usePathname";

const NexReachPage = React.lazy(async () => ({ default: (await import("../../features/nexreach/areas/reputation/components/NexReachPage")).NexReachPage }));

export function AppRouter(): React.ReactElement | null {
  const { auth, user } = useAuthSession();
  const pathname = usePathname();
  if (pathname === "/design-system/layout-parts/header") return <HeaderReviewPage />;
  if (!user) return null;
  if (pathname.startsWith("/platform") || pathname.startsWith("/nexcommand")) return <NexCommandSessionGate />;
  if (pathname.startsWith("/nexcam")) return <NexCamPage auth={auth} user={user} />;
  if (pathname.startsWith("/nexreach")) {
    return <Suspense fallback={<main className="shell"><section className="auth-card"><h1>Loading NexReach</h1></section></main>}><NexReachPage auth={auth} user={user} /></Suspense>;
  }
  // Retain support for the original preview link until an HTTP redirect can run.
  if (pathname.startsWith("/nexops/nexi")) return <NexiStandaloneChat auth={auth} user={user} />;
  if (pathname.startsWith("/nexops")) return <NexOpsWorkspace auth={auth} user={user} />;
  return <NexiStandaloneChat auth={auth} user={user} />;
}

function NexCommandSessionGate(): React.ReactElement | null {
  const { auth, user } = useAuthSession();
  const [ready, setReady] = useState(hasNexCommandSession());
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    if (!user) return;
    if (hasNexCommandSession()) { setReady(true); return; }
    // AuthGate renders the NexCommand sign-in form for this state. Do not turn
    // a missing browser marker into a profile denial before the server has had
    // a chance to authorize a fresh sign-in.
    if (!hasFreshNexCommandAuthentication()) return;
    void establishNexCommandSession(user).then(() => setReady(true)).catch(() => setDenied(true));
  }, [user]);
  if (denied) {
    return <main className="shell"><section className="auth-card">
      <NexCommandMark />
      <p className="auth-eyebrow">NexTeam platform</p>
      <h1>NexCommand access denied</h1>
      <p>This account is not authorized to access NexCommand. Tenant accounts can use NexOps only.</p>
      <div className="auth-denial-actions">
        <button type="button" onClick={() => void signOutOperator(auth, "/nexcommand/sign-in")}>Sign in with a different account</button>
        <button type="button" className="auth-secondary-action" onClick={() => void signOutOperator(auth, "/nexops/sign-in")}>Open NexOps</button>
      </div>
    </section></main>;
  }
  return ready ? <PlatformRoute /> : null;
}
