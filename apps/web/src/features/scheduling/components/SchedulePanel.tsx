import React from "react";
import { useSchedulePanel } from "../hooks/useSchedulePanel";
import "../styles/scheduling.css";

function formatVisitTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function SchedulePanel(props: { tenantId: string }): React.ReactElement {
  const { day, setDay, setView, status, view, visits } = useSchedulePanel(props.tenantId);

  return (
    <aside className="schedule-panel">
      <div className="schedule-panel__heading">
        <div>
          <p className="ui-eyebrow">M3 Scheduling</p>
          <h2>Calendar Board</h2>
        </div>
        <input
          aria-label="Schedule date"
          type="date"
          value={day}
          onChange={(event) => setDay(event.target.value)}
        />
      </div>
      <div className="schedule-panel__tabs" aria-label="Calendar views">
        {(["day", "week", "map"] as const).map((candidate) => (
          <button
            className={candidate === view ? "is-active" : ""}
            key={candidate}
            type="button"
            onClick={() => setView(candidate)}
          >
            {candidate}
          </button>
        ))}
      </div>
      {status ? <p className="schedule-panel__status">{status}</p> : null}
      <div className={`schedule-panel__visit-list schedule-panel__visit-list--${view}`}>
        {visits.map((visit) => (
          <article className="schedule-panel__visit-card" key={visit.id}>
            <div>
              <p className="schedule-panel__visit-time">{formatVisitTime(visit.start)} - {formatVisitTime(visit.end)}</p>
              <h3>{visit.title}</h3>
              <p>{visit.location?.label ?? "No location label"} - {visit.assignedTo.join(", ") || "Unassigned"}</p>
            </div>
            <span className="schedule-panel__visit-status">{visit.status}</span>
            {view === "map" ? (
              <p className="schedule-panel__map-line">
                {visit.location?.geo ? `${visit.location.geo.lat.toFixed(4)}, ${visit.location.geo.lng.toFixed(4)}` : "No coordinates yet"}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </aside>
  );
}
