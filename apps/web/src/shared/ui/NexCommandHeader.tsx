import React from "react";
import { NexTeamProductHeader } from "./NexTeamProductHeader";

export function NexCommandHeader(props: Omit<React.ComponentProps<typeof NexTeamProductHeader>, "className"> & { className?: string }): React.ReactElement {
  return <NexTeamProductHeader {...props} className={`nexcommand-header ${props.className ?? ""}`.trim()} />;
}
