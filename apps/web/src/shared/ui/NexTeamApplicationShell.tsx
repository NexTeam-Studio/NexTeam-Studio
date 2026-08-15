import React from "react";

/**
 * The shared structural frame for first-party NexTeam applications. Product
 * areas provide their own navigation and workspace content without forking
 * the header/sidebar/workspace geometry.
 */
export function NexTeamApplicationShell(props: {
  className: string;
  header?: React.ReactNode;
  navigation: React.ReactNode;
  children: React.ReactNode;
  navigationLabel: string;
}): React.ReactElement {
  return (
    <div className={`nexteam-application-shell ${props.className}`.trim()}>
      {props.header ?? null}
      <aside className="nexteam-application-shell__navigation" aria-label={props.navigationLabel}>{props.navigation}</aside>
      <main className="nexteam-application-shell__workspace">{props.children}</main>
    </div>
  );
}
