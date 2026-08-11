import React, { Suspense, useEffect, useState } from "react";
import { NexCamPage } from "../../features/nexcam/areas/capture/components/NexCamPage";
import { NexiStandaloneChat } from "../../features/nexi/areas/chat/components/NexiStandaloneChat";
import { NexOpsWorkspace } from "../../features/nexopsShell/NexOpsWorkspace";
import { PlatformRoute } from "../../features/platform/routes/PlatformRoute";
import { useAuthSession } from "../auth/AuthSessionProvider";
import { establishNexCommandSession, hasFreshNexCommandAuthentication, hasNexCommandSession } from "../auth/authBootstrap";
import { usePathname } from "./usePathname";

const NexReachPage = React.lazy(async () => ({ default: (await import("../../features/nexreach/areas/reputation/components/NexReachPage")).NexReachPage }));

export function AppRouter(): React.ReactElement | null {
  const { auth, user } = useAuthSession();
  const pathname = usePathname();
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
  const { user } = useAuthSession();
  const [ready, setReady] = useState(hasNexCommandSession());
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    if (!user) return;
    if (hasNexCommandSession()) { setReady(true); return; }
    if (!hasFreshNexCommandAuthentication()) { setDenied(true); return; }
    void establishNexCommandSession(user).then(() => setReady(true)).catch(() => setDenied(true));
  }, [user]);
  if (denied) return <main className="shell"><section className="auth-card"><h1>NexCommand access denied</h1><p>This account does not have an active NexTeam internal profile and cannot open NexCommand.</p></section></main>;
  return ready ? <PlatformRoute /> : null;
}
