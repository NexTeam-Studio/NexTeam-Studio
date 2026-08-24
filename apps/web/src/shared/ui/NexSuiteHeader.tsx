import React from "react";
import { NexTeamProductHeader } from "./NexTeamProductHeader";

export function NexSuiteHeader(props: Omit<React.ComponentProps<typeof NexTeamProductHeader>, "className"> & { className?: string }): React.ReactElement {
  return <NexTeamProductHeader {...props} className={`nexsuite-header ${props.className ?? ""}`.trim()} />;
}
