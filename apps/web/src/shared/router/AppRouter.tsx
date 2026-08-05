import React, { Suspense } from "react";
import { NexCamPage } from "../../features/nexcam/areas/capture/components/NexCamPage";
import { NexiStandaloneChat } from "../../features/nexi/areas/chat/components/NexiStandaloneChat";
import { NexOpsWorkspace } from "../../features/nexopsShell/NexOpsWorkspace";
import { PlatformRoute } from "../../features/platform/routes/PlatformRoute";
import { useAuthSession } from "../auth/AuthSessionProvider";
import { usePathname } from "./usePathname";

const NexReachPage = React.lazy(async () => ({ default: (await import("../../features/nexreach/areas/reputation/components/NexReachPage")).NexReachPage }));

export function AppRouter(): React.ReactElement | null {
  const { auth, user } = useAuthSession();
  const pathname = usePathname();
  if (!user) return null;
  if (pathname.startsWith("/platform")) return <PlatformRoute />;
  if (pathname.startsWith("/nexcam")) return <NexCamPage auth={auth} user={user} />;
  if (pathname.startsWith("/nexreach")) {
    return <Suspense fallback={<main className="shell"><section className="auth-card"><h1>Loading NexReach</h1></section></main>}><NexReachPage auth={auth} user={user} /></Suspense>;
  }
  // Retain support for the original preview link until an HTTP redirect can run.
  if (pathname.startsWith("/nexops/nexi")) return <NexiStandaloneChat auth={auth} user={user} />;
  if (pathname.startsWith("/nexops")) return <NexOpsWorkspace auth={auth} user={user} />;
  return <NexiStandaloneChat auth={auth} user={user} />;
}
