import React, { useEffect, useMemo, useState } from "react";
import { NexOpsNavGlyph } from "../../../nexopsShell/workspaceSupport";
import { ModuleHeroCard } from "../../../../shared/ui/NexOpsBusinessTemplates";
import { titleCaseInterfaceName } from "./interfaceTitleCase";

type TenantRole = "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";
type ActivityFilter = "requests" | "quotes" | "jobs" | "invoices" | "payments";

interface ScheduleWorkspaceVisit {
  id: string;
  jobId: string;
  clientId: string;
  clientName: string;
  jobTitle: string;
  propertyAddress: string;
  status: string;
  statusTone: "success" | "warning" | "danger" | "secondary";
  start: string;
  end: string;
  arrivalWindow: string;
  assignedTo: string[];
  assignedTeam: Array<{ id: string; name: string }>;
  details?: string;
}

interface HomeQueueRow {
  key: string;
  label: string;
  count: number;
  totalValue?: number;
  detail: string;
  target: {
    module: "requests" | "quotes" | "jobs" | "payments" | "schedule" | "capture";
    filterKey: string;
    filterValue: string;
  };
}

interface HomeHealthMetric {
  key: string;
  label: string;
  value: string;
  delta: string;
}

interface TechnicianHomeSnapshot {
  todayVisits: ScheduleWorkspaceVisit[];
  queues: HomeQueueRow[];
}

interface HomeSnapshot {
  role: TenantRole;
  queues: HomeQueueRow[];
  health: HomeHealthMetric[];
  technician?: TechnicianHomeSnapshot;
}

interface ActivityEntry {
  id: string;
  eventId: string;
  type: string;
  objectType: ActivityFilter;
  actor: string;
  action: string;
  reference: string;
  title: string;
  value?: string;
  occurredAt: string;
  relativeTime: string;
  target: {
    module: "requests" | "quotes" | "jobs" | "invoices" | "payments";
    objectId: string;
  };
}

interface DocumentationActivityRow {
  tenantUserId: string;
  displayName: string;
  role: TenantRole;
  photoUploads: number;
  completedChecklists: number;
  totalDocumentationEvents: number;
  lastOccurredAt?: string;
}

interface DocumentationActivitySnapshot {
  from: string;
  to: string;
  rows: DocumentationActivityRow[];
}

interface DashboardResponse {
  ok: boolean;
  home?: HomeSnapshot;
  entries?: ActivityEntry[];
  documentation?: DocumentationActivitySnapshot;
  error?: string;
}

type WorkspaceTarget = {
  module: "requests" | "quotes" | "jobs" | "invoices" | "payments" | "schedule" | "capture";
  filterKey?: string;
  filterValue?: string;
  objectId?: string;
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : value;
}

function activityFilterLabel(filter: "all" | ActivityFilter): string {
  if (filter === "all") {
    return "All";
  }
  return filter.charAt(0).toUpperCase() + filter.slice(1);
}

function queueGroupsForRole(home: HomeSnapshot | null): Array<{ key: string; title: string; rows: HomeQueueRow[] }> {
  if (!home) {
    return [];
  }
  if (home.role === "TECHNICIAN") {
    return [
      {
        key: "today",
        title: "Today",
        rows: home.queues.filter((row) => row.key === "today-visits")
      },
      {
        key: "attention",
        title: "Needs Attention",
        rows: home.queues.filter((row) => row.key === "late-assigned" || row.key === "unassigned-photo-batches")
      },
      {
        key: "upcoming",
        title: "Upcoming",
        rows: home.queues.filter((row) => row.key === "upcoming-assigned")
      }
    ].filter((group) => group.rows.length > 0);
  }

  return [
    {
      key: "today",
      title: "Today",
      rows: home.queues.filter((row) => ["today-visits", "new-requests"].includes(row.key))
    },
    {
      key: "upcoming",
      title: "Upcoming",
      rows: home.queues.filter((row) => ["upcoming-visits", "approved-quotes"].includes(row.key))
    },
    {
      key: "attention",
      title: "Needs Attention",
      rows: home.queues.filter((row) => [
        "unscheduled-jobs",
        "action-required",
        "requires-invoicing",
        "awaiting-payment",
        "past-due",
        "unassigned-photo-batches"
      ].includes(row.key))
    }
  ].filter((group) => group.rows.length > 0);
}

function queueGroupHeadline(title: string): string {
  switch (title) {
    case "Today":
      return "Handle the Next Few Hours";
    case "Upcoming":
      return "See What Is Coming Next";
    case "Needs Attention":
      return "Clear the Blockers";
    default:
      return title;
  }
}

export function NexOpsHomePage(props: {
  tenantId: string;
  onOpenTarget: (target: WorkspaceTarget) => void;
}): React.ReactElement {
  const [home, setHome] = useState<HomeSnapshot | null>(null);
  const [homeStatus, setHomeStatus] = useState("Loading live queues...");
  const [activityFilter, setActivityFilter] = useState<"all" | ActivityFilter>("all");
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activityStatus, setActivityStatus] = useState("Loading recent activity...");
  const [documentation, setDocumentation] = useState<DocumentationActivitySnapshot | null>(null);
  const [documentationStatus, setDocumentationStatus] = useState("Loading documentation activity...");
  const queueGroups = useMemo(() => queueGroupsForRole(home), [home]);

  async function loadDashboard(filter: "all" | ActivityFilter): Promise<void> {
    setHomeStatus("Loading live queues...");
    setActivityStatus("Loading recent activity...");
    setDocumentationStatus("Loading documentation activity...");
    try {
      const params = new URLSearchParams({ tenantId: props.tenantId });
      if (filter !== "all") {
        params.set("objectType", filter);
      }
      const body = await fetch(`/api/crm/dashboard?${params.toString()}`)
        .then((response) => response.json() as Promise<DashboardResponse>);
      if (!body.ok || !body.home || !body.documentation) {
        setHome(null);
        setHomeStatus(body.error ?? "Home queues are unavailable right now.");
        setActivity([]);
        setActivityStatus(body.error ?? "Activity feed is unavailable right now.");
        setDocumentation(null);
        setDocumentationStatus(body.error ?? "Documentation activity is unavailable right now.");
        return;
      }
      setHome(body.home);
      setHomeStatus("");
      const nextEntries = body.entries ?? [];
      setActivity(nextEntries);
      setActivityStatus(nextEntries.length ? "" : "No lifecycle events have landed in this feed yet.");
      setDocumentation(body.documentation);
      setDocumentationStatus(body.documentation.rows.length ? "" : "No photo uploads or checklist completions landed in this window yet.");
    } catch {
      setHome(null);
      setHomeStatus("Home API unreachable.");
      setActivity([]);
      setActivityStatus("Activity feed API unreachable.");
      setDocumentation(null);
      setDocumentationStatus("Documentation activity API unreachable.");
    }
  }

  useEffect(() => {
    void loadDashboard(activityFilter);
    const onMutation = () => void loadDashboard(activityFilter);
    window.addEventListener("nexops:crm-mutated", onMutation);
    return () => window.removeEventListener("nexops:crm-mutated", onMutation);
  }, [activityFilter, props.tenantId]);

  return (
    <section className="nexops-dashboard nexops-home-surface">
      <ModuleHeroCard
        title="Home"
        detail="Live queues, recent movement, and the next place the office needs to act."
        icon={<NexOpsNavGlyph module="home" />}
      />

      {home?.health.length ? (
        <section className="nexops-home-health-strip" aria-label="Business Health">
          {home.health.map((metric) => (
            <article key={metric.key} className="nexops-home-health-metric">
              <span>{titleCaseInterfaceName(metric.label)}</span>
              <strong>{metric.value}</strong>
              <small>{metric.delta}</small>
            </article>
          ))}
        </section>
      ) : null}

      <div className="nexops-home-layout">
        <section className="nexops-module-card wide">
          <div className="nexops-home-queue-grid">
            {queueGroups.map((group) => (
              <section key={group.key} className="nexops-home-queue-group" aria-label={titleCaseInterfaceName(group.title)}>
                <div className="nexops-home-section-head">
                  <p className="eyebrow">{titleCaseInterfaceName(group.title)}</p>
                  <h2>{queueGroupHeadline(group.title)}</h2>
                </div>
                <div className="nexops-home-queue-list">
                  {group.rows.map((row) => (
                    <button
                      className="nexops-home-queue-row"
                      key={row.key}
                      type="button"
                      onClick={() => props.onOpenTarget({
                        module: row.target.module,
                        filterKey: row.target.filterKey,
                        filterValue: row.target.filterValue
                      })}
                    >
                      <div className="nexops-home-queue-row-main">
                        <div>
                          <strong>{titleCaseInterfaceName(row.label)}</strong>
                          <p>{row.detail}</p>
                        </div>
                        <div className="nexops-home-queue-row-stats">
                          <span>{row.count}</span>
                          {typeof row.totalValue === "number" ? <small>${row.totalValue.toFixed(0)}</small> : null}
                        </div>
                      </div>
                      <span className="nexops-home-queue-chevron" aria-hidden="true">›</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
          {homeStatus ? <p className="nexops-module-status">{homeStatus}</p> : null}
          {home?.role === "TECHNICIAN" && home.technician ? (
            <section className="nexops-home-technician-rail">
              <div className="nexops-home-section-head">
                <p className="eyebrow">Today</p>
                <h2>Assigned Visits</h2>
              </div>
              <div className="nexops-home-visit-list">
                {home.technician.todayVisits.map((visit) => (
                  <button
                    className="nexops-home-visit-row"
                    key={visit.id}
                    type="button"
                    onClick={() => props.onOpenTarget({ module: "jobs", objectId: visit.jobId })}
                  >
                    <div>
                      <strong>{visit.clientName}</strong>
                      <p>{visit.jobTitle}</p>
                      <small>{visit.arrivalWindow} | {visit.propertyAddress}</small>
                    </div>
                    <span>{visit.status}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </section>

        <section className="nexops-module-card">
          <div className="nexops-home-section-head">
            <p className="eyebrow">Productivity</p>
            <h2>Documentation Activity</h2>
          </div>
          {documentation ? (
            <p className="nexops-empty-copy">
              {formatDateTime(documentation.from)} to {formatDateTime(documentation.to)}
            </p>
          ) : null}
          {documentationStatus ? <p className="nexops-module-status">{documentationStatus}</p> : null}
          <div className="nexops-record-list">
            {(documentation?.rows ?? []).map((row) => (
              <div className="nexops-jobs-sublist-item" key={row.tenantUserId}>
                <div>
                  <strong>{row.displayName}</strong>
                  <small>{row.role === "TECHNICIAN" ? "Technician" : row.role}{row.lastOccurredAt ? ` | Last activity ${formatDateTime(row.lastOccurredAt)}` : ""}</small>
                </div>
                <div>
                  <span>{row.photoUploads} photos</span>
                  <small>{row.completedChecklists} checklists | {row.totalDocumentationEvents} total</small>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="nexops-module-card">
          <div className="nexops-home-section-head">
            <p className="eyebrow">Live activity</p>
            <h2>Recent Activity</h2>
          </div>
          <div className="nexops-home-filter-row" role="tablist" aria-label="Activity Filters">
            {(["all", "requests", "quotes", "jobs", "invoices", "payments"] as const).map((filter) => (
              <button
                key={filter}
                className={filter === activityFilter ? "active" : ""}
                type="button"
                onClick={() => setActivityFilter(filter)}
              >
                {activityFilterLabel(filter)}
              </button>
            ))}
          </div>
          {activityStatus ? <p className="nexops-module-status">{activityStatus}</p> : null}
          <div className="nexops-activity-feed">
            {activity.map((entry) => (
              <button
                className="nexops-activity-row"
                key={entry.id}
                type="button"
                onClick={() => props.onOpenTarget({ module: entry.target.module, objectId: entry.target.objectId })}
              >
                <div className="nexops-activity-copy">
                  <strong>{entry.actor} {entry.action}</strong>
                  <p>{entry.reference} | {entry.title}</p>
                </div>
                <div className="nexops-activity-meta">
                  {entry.value ? <span>{entry.value}</span> : null}
                  <small title={formatDateTime(entry.occurredAt)}>{entry.relativeTime}</small>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
