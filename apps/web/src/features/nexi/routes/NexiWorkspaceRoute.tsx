import React from "react";
import { NexiChatFeature } from "../components/NexiChatFeature";

export function NexiWorkspaceRoute(props: { tenantId: string }): React.ReactElement {
  return <NexiChatFeature tenantId={props.tenantId} />;
}
