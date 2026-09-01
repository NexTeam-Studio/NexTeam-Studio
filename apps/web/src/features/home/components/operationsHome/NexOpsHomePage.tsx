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

const QUEUE_URGENCY_ORDER = [
  "action-required",
  "past-due",
  "requires-invoicing",
  "awaiting-payment",
  "unassigned-photo-batches",
  "new-requests",
  "approved-quotes",
  "unscheduled-jobs",
  "today-visits",
  "late-assigned",
  "upcoming-assigned",
  "upcoming-visits"
];

function greetingForCurrentTime(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function urgencyOrderedQueues(home: HomeSnapshot | null): HomeQueueRow[] {
  if (!home) return [];
  return [...home.queues].sort((left, right) => {
    const leftIndex = QUEUE_URGENCY_ORDER.indexOf(left.key);
    const rightIndex = QUEUE_URGENCY_ORDER.indexOf(right.key);
    return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
  });
}

function queueIconModule(row: HomeQueueRow): React.ComponentProps<typeof NexOpsNavGlyph>["module"] {
  if (["new-requests"].includes(row.key)) return "requests";
  if (["approved-quotes"].includes(row.key)) return "quotes";
  if (["action-required", "requires-invoicing", "unscheduled-jobs", "late-assigned"].includes(row.key)) return "jobs";
  if (["awaiting-payment", "past-due"].includes(row.key)) return "payments";
  if (["today-visits", "upcoming-visits", "upcoming-assigned"].includes(row.key)) return "schedule";
  return "capture";
}

export function NexOpsHomePage(props: {
  tenantId: string;
  operatorName: string;
  onOpenTarget: (target: WorkspaceTarget) => void;
}): React.ReactElement {
  const [home, setHome] = useState<HomeSnapshot | null>(null);
  const [homeStatus, setHomeStatus] = useState("Loading live queues...");
  const [activityFilter, setActivityFilter] = useState<"all" | ActivityFilter>("all");
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activityStatus, setActivityStatus] = useState("Loading recent activity...");
  const [documentation, setDocumentation] = useState<DocumentationActivitySnapshot | null>(null);
  const [documentationStatus, setDocumentationStatus] = useState("Loading documentation activity...");
  const liveQueues = useMemo(() => urgencyOrderedQueues(home), [home]);

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

      <section className="nexops-home-greeting nexops-home-section-head" aria-live="polite">
        <h2>{greetingForCurrentTime()}, {props.operatorName}</h2>
      </section>

      <section className="nexops-module-card wide nexops-home-section-card" aria-label="Live Queues">
        <div className="nexops-home-section-head">
          <p className="eyebrow">Office Action</p>
          <h2>Live Queues</h2>
        </div>
        <div className="nexops-home-queue-list">
          {liveQueues.map((row) => (
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
              <span className="nexops-home-queue-icon" aria-hidden="true"><NexOpsNavGlyph module={queueIconModule(row)} /></span>
              <div className="nexops-home-queue-row-main">
                <strong><span>{row.count}</span> {titleCaseInterfaceName(row.label)}</strong>
                {typeof row.totalValue === "number" ? <small>${row.totalValue.toFixed(0)}</small> : null}
              </div>
              <span className="nexops-home-queue-chevron" aria-hidden="true">›</span>
            </button>
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
        <section className="nexops-module-card nexops-home-section-card">
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

        <section className="nexops-module-card nexops-home-section-card">
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
