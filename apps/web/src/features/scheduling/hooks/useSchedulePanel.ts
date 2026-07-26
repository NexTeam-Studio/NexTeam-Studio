import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ScheduledVisit } from "../../../shared/contracts/scheduling";
import { recordBrowserEvent } from "../../../shared/telemetry/browserTelemetry";
import { fetchCalendar } from "../api/schedulingApi";

type ScheduleView = "day" | "week" | "map";

function dayRange(day: string, view: ScheduleView): { from: string; to: string } {
  const from = new Date(`${day}T00:00:00.000Z`);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + (view === "week" ? 7 : 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

export function useSchedulePanel(tenantId: string): {
  day: string;
  setDay: Dispatch<SetStateAction<string>>;
  setView: Dispatch<SetStateAction<ScheduleView>>;
  status: string;
  view: ScheduleView;
  visits: ScheduledVisit[];
} {
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("Loading schedule...");
  const [view, setView] = useState<ScheduleView>("day");
  const [visits, setVisits] = useState<ScheduledVisit[]>([]);

  useEffect(() => {
    let cancelled = false;
    const range = dayRange(day, view);
    setStatus("Loading schedule...");

    fetchCalendar({ tenantId, ...range })
      .then((body) => {
        if (cancelled) {
          return;
        }
        if (!body.ok) {
          setStatus(body.error ?? "Schedule unavailable.");
          setVisits([]);
          return;
        }
        setVisits(body.visits ?? []);
        setStatus((body.visits ?? []).length ? "" : "No native visits in this window yet.");
      })
      .catch((error) => {
        recordBrowserEvent("schedule.load_failed", {
          error: error instanceof Error ? error.message : "unknown",
          tenantId,
          view
        });
        if (!cancelled) {
          setStatus("Schedule API unreachable.");
          setVisits([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [day, tenantId, view]);

  return {
    day,
    setDay,
    setView,
    status,
    view,
    visits
  };
}
