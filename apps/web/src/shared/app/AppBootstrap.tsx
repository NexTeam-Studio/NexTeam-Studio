import React from "react";
import type { Auth, User } from "firebase/auth";
import { AuthGate } from "../auth/AuthGate";
import { AuthSessionProvider, useAuthSession } from "../auth/AuthSessionProvider";

export function AppBootstrap(props: {
  renderAuthenticated: (session: { auth: Auth | null; user: User }) => React.ReactNode;
}): React.ReactElement {
  return <AuthSessionProvider><AuthenticatedApp {...props} /></AuthSessionProvider>;
}

function AuthenticatedApp(props: {
  renderAuthenticated: (session: { auth: Auth | null; user: User }) => React.ReactNode;
}): React.ReactElement {
  const { auth, user } = useAuthSession();
  return <AuthGate>{user ? props.renderAuthenticated({ auth, user }) : null}</AuthGate>;
}
