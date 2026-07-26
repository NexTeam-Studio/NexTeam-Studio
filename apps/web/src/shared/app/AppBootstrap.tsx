import React from "react";
import { AuthGate } from "../auth/AuthGate";
import { AuthSessionProvider } from "../auth/AuthSessionProvider";
import { AppRouter } from "../router/AppRouter";
import { AppShell } from "../shell/AppShell";

export function AppBootstrap(): React.ReactElement {
  return (
    <AuthSessionProvider>
      <AppShell>
        <AuthGate>
          <AppRouter />
        </AuthGate>
      </AppShell>
    </AuthSessionProvider>
  );
}
