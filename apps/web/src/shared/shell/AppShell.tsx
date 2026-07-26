import React from "react";
import "./appShell.css";

export function AppShell(props: { children: React.ReactNode }): React.ReactElement {
  return <div className="app-shell">{props.children}</div>;
}
