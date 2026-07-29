import React from "react";
import { NexOpsNavGlyph } from "../workspaceSupport";
import type { NexOpsModule } from "../domain/nexopsNavigation";

/** Shared opening title for every NexOps page. */
export function NexOpsPageTitle(props: { module: NexOpsModule; children: React.ReactNode }): React.ReactElement {
  return (
    <h1 className="nexops-page-title-with-icon">
      <NexOpsNavGlyph module={props.module} />
      <span>{props.children}</span>
    </h1>
  );
}
