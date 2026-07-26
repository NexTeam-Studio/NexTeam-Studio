import React from "react";
import { SchedulePanel } from "../components/SchedulePanel";

export function SchedulingWorkspaceRoute(props: { tenantId: string }): React.ReactElement {
  return <SchedulePanel tenantId={props.tenantId} />;
}
