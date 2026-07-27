import React from "react";
import { AuthGate } from "../auth/AuthGate";
import { AuthSessionProvider } from "../auth/AuthSessionProvider";
import { AppRouter } from "../router/AppRouter";

export function AppBootstrap(): React.ReactElement {
  return <AuthSessionProvider><AuthGate><AppRouter /></AuthGate></AuthSessionProvider>;
}
