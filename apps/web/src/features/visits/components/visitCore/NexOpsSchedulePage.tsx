import React, { useEffect, useMemo, useState } from "react";
import { ProductInlineLabel } from "../../../../shared/branding/ProductBranding";
import { NexOpsDetailTemplate, NexOpsRosterTemplate } from "../../../../shared/ui/NexOpsBusinessTemplates";
import { NexDocsClientWorkspace } from "../../../nexdocs/areas/clientWorkspace/components/NexDocsClientWorkspace";
import { visitCanBeCompleted } from "./visitCompletion";

type TenantRole = "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";
type ScheduleView = "day" | "week" | "month" | "list";
type ScheduleScope = "all" | "today" | "upcoming";

export function scheduleViewLabel(view: ScheduleView): string {
  return ({ day: "Day", week: "Week", month: "Month", list: "List" })[view];
}

export function scheduleScopeLabel(scope: ScheduleScope): string {
  return ({ all: "All", today: "Today", upcoming: "Upcoming" })[scope];
}

interface TeamMember {
  id: string;
  name: string;
}

interface ScheduleWorkspaceVisit {
  id: string;
  jobId: string;
  requestId?: string;
  quoteId?: string;
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
  assignedTeam: TeamMember[];
  details?: string;
  source?: string;
  readOnly?: boolean;
}

interface ScheduleWorkspaceJobQueueItem {
  jobId: string;
  clientId: string;
  clientName: string;
  title: string;
  number?: string;
  propertyAddress: string;
  totalValue: number;
}

interface ScheduleWorkspace {
  visits: ScheduleWorkspaceVisit[];
  unscheduledJobs: ScheduleWorkspaceJobQueueItem[];
  teamMembers: TeamMember[];
}

interface ScheduleWorkspaceResponse {
  ok: boolean;
  actorRole?: TenantRole;
  workspace?: ScheduleWorkspace;
  error?: string;
}

interface JobSummary {
  id: string;
  clientId: string;
  number?: string;
  title: string;
  status: string;
  client?: { id: string; name: string };
}

interface JobsResponse {
  ok: boolean;
  jobs?: JobSummary[];
  error?: string;
}

interface JobMutationResponse {
  ok: boolean;
  job?: unknown;
  visit?: ScheduleWorkspaceVisit;
  visits?: ScheduleWorkspaceVisit[];
  shiftedVisits?: ScheduleWorkspaceVisit[];
  error?: string;
}

interface FieldDocsMediaRecord {
  id: string;
  type: "photo" | "video" | "pdf";
  jobId?: string;
  visitId?: string;
  propertyId?: string;
  storageRef: string;
  aiTags: string[];
  aiCaption?: string;
  exif?: { gps?: { lat: number; lng: number }; ts?: string };
}

interface FieldDocsMediaListResponse {
  ok: boolean;
  media?: FieldDocsMediaRecord[];
  error?: string;
}

interface FieldDocsReportRecord {
  id: string;
  title: string;
  pdfRef: string;
  status: string;
  jobId: string;
  propertyId?: string;
  visitId?: string;
  createdAt?: string;
  postedAt?: string;
}

interface FieldDocsReportsListResponse {
  ok: boolean;
  reports?: FieldDocsReportRecord[];
  error?: string;
}

interface VisitDraft {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  details: string;
  assignedTo: string[];
}

function dayKey(value: string): string {
  return value.slice(0, 10);
}

function startOfDay(date: string): string {
  return `${date}T00:00:00.000Z`;
}

function endOfDay(date: string): string {
  return `${date}T23:59:59.999Z`;
}

function startOfWeek(date: string): string {
  const cursor = new Date(`${date}T12:00:00.000Z`);
  const weekday = (cursor.getUTCDay() + 6) % 7;
  cursor.setUTCDate(cursor.getUTCDate() - weekday);
  cursor.setUTCHours(0, 0, 0, 0);
  return cursor.toISOString();
}

function endOfWeek(date: string): string {
  const cursor = new Date(startOfWeek(date));
  cursor.setUTCDate(cursor.getUTCDate() + 6);
  cursor.setUTCHours(23, 59, 59, 999);
  return cursor.toISOString();
}

function startOfMonth(date: string): string {
  const cursor = new Date(`${date}T12:00:00.000Z`);
  cursor.setUTCDate(1);
  cursor.setUTCHours(0, 0, 0, 0);
  return cursor.toISOString();
}

function endOfMonth(date: string): string {
  const cursor = new Date(startOfMonth(date));
  cursor.setUTCMonth(cursor.getUTCMonth() + 1, 0);
  cursor.setUTCHours(23, 59, 59, 999);
  return cursor.toISOString();
}

function addDays(date: string, days: number): string {
  const cursor = new Date(`${date}T12:00:00.000Z`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

export function dateRange(date: string, view: ScheduleView, scope: ScheduleScope): { from: string; to: string } {
  if (scope === "today") {
    return { from: startOfDay(date), to: endOfDay(date) };
  }
  if (scope === "upcoming") {
    return { from: startOfDay(date), to: endOfWeek(addDays(date, 14)) };
  }
  if (view === "day") {
    return { from: startOfDay(date), to: endOfDay(date) };
  }
  if (view === "month") {
    return { from: startOfMonth(date), to: endOfMonth(date) };
  }
  if (view === "list") {
    return { from: startOfDay(date), to: endOfWeek(addDays(date, 6)) };
  }
  return { from: startOfWeek(date), to: endOfWeek(date) };
}

function defaultView(): ScheduleView {
  if (typeof window !== "undefined" && window.innerWidth < 780) {
    return "list";
  }
  return "week";
}

function defaultScope(): ScheduleScope {
  return "all";
}

function toIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

function emptyVisitDraft(date: string, hour = "09:00"): VisitDraft {
  const [hourValue] = hour.split(":");
  const nextHour = String(Math.min(Number(hourValue) + 2, 23)).padStart(2, "0");
  return {
    id: crypto.randomUUID(),
    title: "",
    date,
    startTime: hour,
    endTime: `${nextHour}:00`,
    details: "",
    assignedTo: []
  };
}

function formatDateHeading(value: string): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : value;
}

export function visitToneClass(tone: ScheduleWorkspaceVisit["statusTone"]): string {
  switch (tone) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "danger":
      return "danger";
    default:
      return "secondary";
  }
}

function visitStartsInSlot(visit: ScheduleWorkspaceVisit, day: string, hour: number): boolean {
  const start = new Date(visit.start);
  return dayKey(visit.start) === day && start.getHours() === hour;
}

function monthDays(anchorDate: string): string[] {
  const start = new Date(startOfMonth(anchorDate));
  const days: string[] = [];
  const month = start.getUTCMonth();
  while (start.getUTCMonth() === month) {
    days.push(start.toISOString().slice(0, 10));
    start.setUTCDate(start.getUTCDate() + 1);
  }
  return days;
}

function byDay(visits: ScheduleWorkspaceVisit[]): Map<string, ScheduleWorkspaceVisit[]> {
  const grouped = new Map<string, ScheduleWorkspaceVisit[]>();
  for (const visit of visits) {
    const key = dayKey(visit.start);
    const current = grouped.get(key) ?? [];
    current.push(visit);
    grouped.set(key, current);
  }
  for (const value of grouped.values()) {
    value.sort((left, right) => left.start.localeCompare(right.start));
  }
  return grouped;
}

export function NexOpsSchedulePage(props: {
  tenantId: string;
  role: TenantRole;
  onOpenJob: (jobId: string) => void;
  onCrmMutation?: () => void;
  initialScope?: ScheduleScope;
}): React.ReactElement {
  const [view, setView] = useState<ScheduleView>(() => defaultView());
  const [scope, setScope] = useState<ScheduleScope>(() => props.initialScope ?? defaultScope());
  const [anchorDate, setAnchorDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [workspace, setWorkspace] = useState<ScheduleWorkspace | null>(null);
  const [jobOptions, setJobOptions] = useState<JobSummary[]>([]);
  const [status, setStatus] = useState("Loading schedule...");
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerStatus, setComposerStatus] = useState("");
  const [composerJobId, setComposerJobId] = useState("");
  const [visitDrafts, setVisitDrafts] = useState<VisitDraft[]>([]);
  const [editVisit, setEditVisit] = useState<ScheduleWorkspaceVisit | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [shiftRemaining, setShiftRemaining] = useState(false);
  const [workingVisitId, setWorkingVisitId] = useState("");
  const [fieldDocsVisit, setFieldDocsVisit] = useState<ScheduleWorkspaceVisit | null>(null);
  const [visitDetail, setVisitDetail] = useState<ScheduleWorkspaceVisit | null>(null);
  const [visitDetailSection, setVisitDetailSection] = useState<"overview" | "files" | "nexcam">("overview");
  const [fieldDocsMedia, setFieldDocsMedia] = useState<FieldDocsMediaRecord[]>([]);
  const [fieldDocsReports, setFieldDocsReports] = useState<FieldDocsReportRecord[]>([]);
  const [fieldDocsStatus, setFieldDocsStatus] = useState("");

  const range = useMemo(() => dateRange(anchorDate, view, scope), [anchorDate, scope, view]);
  const groupedByDay = useMemo(() => byDay(workspace?.visits ?? []), [workspace?.visits]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(dayKey(range.from), index)), [range.from]);
  const hours = useMemo(() => Array.from({ length: 12 }, (_, index) => index + 7), []);

  async function loadWorkspace(): Promise<void> {
    setStatus("Loading schedule...");
    try {
      const params = new URLSearchParams({
        tenantId: props.tenantId,
        from: range.from,
        to: range.to
      });
      if (selectedTeamIds.length) {
        params.set("team", selectedTeamIds.join(","));
      }
      const body = await fetch(`/api/crm/schedule/workspace?${params.toString()}`)
        .then((response) => response.json() as Promise<ScheduleWorkspaceResponse>);
      if (!body.ok || !body.workspace) {
        setWorkspace(null);
        setStatus(body.error ?? "Schedule workspace is unavailable right now.");
        return;
      }
      setWorkspace(body.workspace);
      setStatus(body.workspace.visits.length ? "" : "No visits are sitting in this window yet.");
    } catch {
      setWorkspace(null);
      setStatus("Schedule workspace API unreachable.");
    }
  }

  async function loadJobs(): Promise<void> {
    try {
      const body = await fetch(`/api/crm/jobs?tenantId=${encodeURIComponent(props.tenantId)}`)
        .then((response) => response.json() as Promise<JobsResponse>);
      if (!body.ok) {
        setJobOptions([]);
        return;
      }
      setJobOptions(body.jobs ?? []);
    } catch {
      setJobOptions([]);
    }
  }

  useEffect(() => {
    if (props.initialScope) {
      setScope(props.initialScope);
      if (props.initialScope === "today") {
        setView("day");
      } else if (props.initialScope === "upcoming" && view === "day") {
        setView(defaultView());
      }
    }
  }, [props.initialScope, view]);

  useEffect(() => {
    void loadWorkspace();
    const onMutation = () => void loadWorkspace();
    window.addEventListener("nexops:crm-mutated", onMutation);
    return () => window.removeEventListener("nexops:crm-mutated", onMutation);
  }, [props.tenantId, range.from, range.to, selectedTeamIds.join(",")]);

  useEffect(() => {
    void loadJobs();
  }, [props.tenantId]);

  function openComposer(jobId?: string, seedDate?: string, seedHour?: string): void {
    setComposerStatus("");
    setComposerJobId(jobId ?? workspace?.unscheduledJobs[0]?.jobId ?? jobOptions[0]?.id ?? "");
    setVisitDrafts([emptyVisitDraft(seedDate ?? anchorDate, seedHour ?? "09:00")]);
    setComposerOpen(true);
  }

  function patchVisitDraft(draftId: string, patch: Partial<VisitDraft>): void {
    setVisitDrafts((current) => current.map((draft) => draft.id === draftId ? { ...draft, ...patch } : draft));
  }

  function toggleDraftAssignment(draftId: string, memberId: string): void {
    setVisitDrafts((current) => current.map((draft) => {
      if (draft.id !== draftId) {
        return draft;
      }
      const next = draft.assignedTo.includes(memberId)
        ? draft.assignedTo.filter((value) => value !== memberId)
        : [...draft.assignedTo, memberId];
      return { ...draft, assignedTo: next };
    }));
  }

  async function saveVisitSeries(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!composerJobId) {
      setComposerStatus("Pick a job before adding visits.");
      return;
    }
    if (!visitDrafts.length) {
      setComposerStatus("Add at least one visit.");
      return;
    }
    const invalidDraft = visitDrafts.find((draft) => !draft.date || !draft.startTime || !draft.endTime || toIso(draft.date, draft.endTime) <= toIso(draft.date, draft.startTime));
    if (invalidDraft) {
      setComposerStatus("Each visit needs a date, start time, and end time after the start.");
      return;
    }
    setComposerStatus("Saving visits...");
    try {
      const body = await fetch(`/api/crm/jobs/${encodeURIComponent(composerJobId)}/visits/batch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          visits: visitDrafts.map((draft) => ({
            ...(draft.title.trim() ? { title: draft.title.trim() } : {}),
            start: toIso(draft.date, draft.startTime),
            end: toIso(draft.date, draft.endTime),
            ...(draft.assignedTo.length ? { assignedTo: draft.assignedTo } : {}),
            ...(draft.details.trim() ? { details: draft.details.trim() } : {})
          }))
        })
      }).then((response) => response.json() as Promise<JobMutationResponse>);
      if (!body.ok) {
        setComposerStatus(body.error ?? "Visit batch save failed.");
        return;
      }
      setComposerOpen(false);
      setComposerStatus("");
      props.onCrmMutation?.();
      await Promise.all([loadWorkspace(), loadJobs()]);
    } catch {
      setComposerStatus("Visit batch API unreachable.");
    }
  }

  function openEdit(visit: ScheduleWorkspaceVisit): void {
    const start = new Date(visit.start);
    const end = new Date(visit.end);
    setEditVisit(visit);
    setEditDate(dayKey(visit.start));
    setEditStartTime(`${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`);
    setEditEndTime(`${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`);
    setShiftRemaining(false);
  }

  async function saveMoveVisit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editVisit) {
      return;
    }
    setWorkingVisitId(editVisit.id);
    try {
      const body = await fetch(`/api/crm/jobs/visits/${encodeURIComponent(editVisit.id)}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          start: toIso(editDate, editStartTime),
          end: toIso(editDate, editEndTime),
          shiftRemaining
        })
      }).then((response) => response.json() as Promise<JobMutationResponse>);
      if (!body.ok) {
        setComposerStatus(body.error ?? "Visit move failed.");
        return;
      }
      setEditVisit(null);
      props.onCrmMutation?.();
      await loadWorkspace();
    } catch {
      setComposerStatus("Visit move API unreachable.");
    } finally {
      setWorkingVisitId("");
    }
  }

  async function dropVisitIntoSlot(visit: ScheduleWorkspaceVisit, date: string, hour: number): Promise<void> {
    if (visit.readOnly) {
      return;
    }
    const start = new Date(visit.start);
    const end = new Date(visit.end);
    const durationMs = end.getTime() - start.getTime();
    const movedStart = new Date(`${date}T${String(hour).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}:00`);
    const movedEnd = new Date(movedStart.getTime() + durationMs);
    const applyShift = window.confirm("Shift all remaining visits on this job by the same offset?");
    setWorkingVisitId(visit.id);
    try {
      const body = await fetch(`/api/crm/jobs/visits/${encodeURIComponent(visit.id)}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          start: movedStart.toISOString(),
          end: movedEnd.toISOString(),
          shiftRemaining: applyShift
        })
      }).then((response) => response.json() as Promise<JobMutationResponse>);
      if (!body.ok) {
        setComposerStatus(body.error ?? "Visit move failed.");
        return;
      }
      props.onCrmMutation?.();
      await loadWorkspace();
    } catch {
      setComposerStatus("Visit move API unreachable.");
    } finally {
      setWorkingVisitId("");
    }
  }

  async function completeVisit(visit: ScheduleWorkspaceVisit): Promise<void> {
    if (!visitCanBeCompleted(visit)) {
      return;
    }
    if (!window.confirm(`Mark this visit for ${visit.clientName} complete?`)) {
      return;
    }
    setWorkingVisitId(visit.id);
    setComposerStatus("");
    try {
      const body = await fetch(`/api/crm/jobs/visits/${encodeURIComponent(visit.id)}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: props.tenantId })
      }).then((response) => response.json() as Promise<JobMutationResponse>);
      if (!body.ok) {
        setComposerStatus(body.error ?? "Visit completion failed.");
        return;
      }
      setComposerStatus("Visit completed. The office can now close or invoice the job when all visits are done.");
      props.onCrmMutation?.();
      await Promise.all([loadWorkspace(), loadJobs()]);
    } catch {
      setComposerStatus("Visit completion API unreachable.");
    } finally {
      setWorkingVisitId("");
    }
  }

  async function openFieldDocsRail(visit: ScheduleWorkspaceVisit): Promise<void> {
    setFieldDocsVisit(visit);
    setFieldDocsStatus("Loading NexCam visit rail...");
    try {
      const [mediaBody, reportsBody] = await Promise.all([
        fetch(`/api/fielddocs/media?tenantId=${encodeURIComponent(props.tenantId)}&visitId=${encodeURIComponent(visit.id)}&jobId=${encodeURIComponent(visit.jobId)}&limit=8`)
          .then((response) => response.json() as Promise<FieldDocsMediaListResponse>),
        fetch(`/api/fielddocs/reports?tenantId=${encodeURIComponent(props.tenantId)}&visitId=${encodeURIComponent(visit.id)}&jobId=${encodeURIComponent(visit.jobId)}&limit=6`)
          .then((response) => response.json() as Promise<FieldDocsReportsListResponse>)
      ]);
      const nextMedia = mediaBody.ok ? (mediaBody.media ?? []) : [];
      const nextReports = reportsBody.ok ? (reportsBody.reports ?? []) : [];
      setFieldDocsMedia(nextMedia);
      setFieldDocsReports(nextReports);
      setFieldDocsStatus(
        !mediaBody.ok || !reportsBody.ok
          ? mediaBody.error ?? reportsBody.error ?? "The NexCam visit rail is unavailable right now."
          : `${nextMedia.length} media item${nextMedia.length === 1 ? "" : "s"} and ${nextReports.length} report${nextReports.length === 1 ? "" : "s"} loaded for this visit.`
      );
    } catch {
      setFieldDocsMedia([]);
      setFieldDocsReports([]);
      setFieldDocsStatus("The NexCam visit rail is unavailable right now.");
    }
  }

  function renderVisitCard(visit: ScheduleWorkspaceVisit, compact = false): React.ReactElement {
    return (
      <article
        className={`nexops-schedule-visit nexops-tone-${visitToneClass(visit.statusTone)}${compact ? " compact" : ""}${visit.readOnly ? " read-only" : ""}`}
        key={visit.id}
        draggable={!visit.readOnly && (view === "day" || view === "week")}
        onDragStart={(event) => event.dataTransfer.setData("text/plain", visit.id)}
      >
        <button className="nexops-schedule-visit-main" type="button" onClick={() => {
          setVisitDetailSection("overview");
          setVisitDetail(visit);
          window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        }}>
          <strong>{visit.clientName}</strong>
          <p>{visit.jobTitle}</p>
          <small>{visit.arrivalWindow} • {visit.propertyAddress}</small>
          <div className="nexops-schedule-visit-meta">
            <span>{visit.assignedTeam.map((member) => member.name).join(", ") || "Unassigned"}</span>
            <span>{visit.status}</span>
          </div>
        </button>
        <div className="nexops-schedule-visit-actions">
          <button type="button" onClick={() => void openFieldDocsRail(visit)}>
            <ProductInlineLabel product="nexcam" />
          </button>
          <button type="button" onClick={() => openComposer(visit.jobId, dayKey(visit.start), formatTime(visit.start).includes(":") ? `${String(new Date(visit.start).getHours()).padStart(2, "0")}:${String(new Date(visit.start).getMinutes()).padStart(2, "0")}` : "09:00")}>
            Add Visit
          </button>
          {!visit.readOnly ? <button type="button" onClick={() => openEdit(visit)}>{workingVisitId === visit.id ? "Saving..." : "Edit"}</button> : null}
          {visitCanBeCompleted(visit) ? (
            <button type="button" onClick={() => void completeVisit(visit)} disabled={workingVisitId === visit.id}>
              {workingVisitId === visit.id ? "Completing..." : "Complete visit"}
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  if (visitDetail) {
    const detail = visitDetail;
    return (
      <NexOpsDetailTemplate
        back={<button type="button" onClick={() => setVisitDetail(null)}>← Back to Visits</button>}
        eyebrow="Field visit"
        title={detail.clientName}
        detail={`${detail.arrivalWindow} · ${detail.jobTitle}`}
        status={<><span className={`nexops-status-pill nexops-tone-${visitToneClass(detail.statusTone)}`}>{detail.status}</span><span className="nexops-status-pill">{detail.assignedTeam.map((member) => member.name).join(", ") || "Unassigned"}</span></>}
        actions={<>{!detail.readOnly ? <button className="nexops-primary-inline-button" type="button" onClick={() => { setVisitDetail(null); openEdit(detail); }}>Edit visit</button> : null}<button type="button" onClick={() => props.onOpenJob(detail.jobId)}>Open Job</button></>}
        navigation={<><button type="button" className={visitDetailSection === "overview" ? "active" : ""} aria-current={visitDetailSection === "overview" ? "page" : undefined} onClick={() => setVisitDetailSection("overview")}>Visit</button><button type="button" className={visitDetailSection === "files" ? "active" : ""} aria-current={visitDetailSection === "files" ? "page" : undefined} onClick={() => setVisitDetailSection("files")}>Files</button><button type="button" className={visitDetailSection === "nexcam" ? "active" : ""} aria-current={visitDetailSection === "nexcam" ? "page" : undefined} onClick={() => setVisitDetailSection("nexcam")}>NexCam</button></>}
      >
        <section className="nexops-module-card nexops-visit-detail-card">
          {visitDetailSection === "overview" ? <><p className="eyebrow">Visit context</p><h2>{detail.jobTitle}</h2><dl className="nexops-visit-detail-facts"><div><dt>Client</dt><dd>{detail.clientName}</dd></div><div><dt>Property</dt><dd>{detail.propertyAddress}</dd></div><div><dt>Schedule</dt><dd>{new Date(detail.start).toLocaleString()} – {new Date(detail.end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</dd></div><div><dt>Team</dt><dd>{detail.assignedTeam.map((member) => member.name).join(", ") || "Unassigned"}</dd></div></dl>{detail.details ? <p>{detail.details}</p> : <p className="nexops-empty-copy">No additional visit instructions are recorded.</p>}</> : null}
          {visitDetailSection === "files" ? <NexDocsClientWorkspace tenantId={props.tenantId} clientId={detail.clientId} clientName={detail.clientName} role={props.role} jobId={detail.jobId} visitId={detail.id} contextLabel={`Visit ${detail.id} files`} nexcamCounts={{ media: fieldDocsMedia.length, reports: fieldDocsReports.length, signedDocuments: 0 }} /> : null}
          {visitDetailSection === "nexcam" ? <><p className="eyebrow"><ProductInlineLabel product="nexcam" /></p><h2>Visit media and reports</h2><p>Open the visual documentation rail for this Visit.</p><button type="button" onClick={() => { setVisitDetail(null); void openFieldDocsRail(detail); }}>Open NexCam</button></> : null}
        </section>
      </NexOpsDetailTemplate>
    );
  }

  return (
    <>
      <NexOpsRosterTemplate
        eyebrow="Field schedule"
        title="Visits"
        detail="Place approved work on the board, shift future visits cleanly, and keep unscheduled jobs visible."
        primaryAction={<button className="nexops-primary-inline-button" type="button" onClick={() => openComposer()}>New Visit</button>}
        metrics={(
          <>
            <article><span>Scheduled</span><strong>{workspace?.visits.length ?? 0}</strong><small>In this view</small></article>
            <article><span>Ready to place</span><strong>{workspace?.unscheduledJobs.length ?? 0}</strong><small>Unscheduled jobs</small></article>
            <article><span>Team filter</span><strong>{selectedTeamIds.length || "All"}</strong><small>Active people</small></article>
          </>
        )}
        controls={(
        <div className="nexops-schedule-toolbar">
          <div className="nexops-home-filter-row" role="tablist" aria-label="Schedule views">
            {(["day", "week", "month", "list"] as const).map((candidate) => (
              <button
                key={candidate}
                className={candidate === view ? "active" : ""}
                type="button"
                onClick={() => setView(candidate)}
              >
                {scheduleViewLabel(candidate)}
              </button>
            ))}
          </div>
          <div className="nexops-schedule-toolbar-actions">
            <div className="nexops-home-filter-row" role="tablist" aria-label="Schedule scopes">
              {(["all", "today", "upcoming"] as const).map((candidate) => (
                <button
                  key={candidate}
                  className={candidate === scope ? "active" : ""}
                  type="button"
                  onClick={() => setScope(candidate)}
                >
                  {scheduleScopeLabel(candidate)}
                </button>
              ))}
            </div>
            <input aria-label="Schedule anchor date" type="date" value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} />
            {props.role !== "TECHNICIAN" ? (
              <details className="nexops-schedule-team-filter">
                <summary>Team {selectedTeamIds.length ? `(${selectedTeamIds.length})` : "(all)"}</summary>
                <div className="nexops-schedule-team-options">
                  {workspace?.teamMembers.map((member) => (
                    <label key={member.id}>
                      <input
                        type="checkbox"
                        checked={selectedTeamIds.includes(member.id)}
                        onChange={() => setSelectedTeamIds((current) =>
                          current.includes(member.id)
                            ? current.filter((value) => value !== member.id)
                            : [...current, member.id]
                        )}
                      />
                      <span>{member.name}</span>
                    </label>
                  ))}
                  <button type="button" onClick={() => setSelectedTeamIds([])}>Show All</button>
                </div>
              </details>
            ) : null}
          </div>
        </div>
        )}
      >
        <section className="nexops-schedule-surface">
        {status ? <p className="nexops-module-status">{status}</p> : null}
        {composerStatus && !composerOpen ? <p className="nexops-module-status" role="status">{composerStatus}</p> : null}

        {workspace?.unscheduledJobs.length ? (
          <section className="nexops-schedule-unscheduled">
            <div className="nexops-home-section-head">
              <p className="eyebrow">Unscheduled</p>
              <h2>Ready to Place</h2>
            </div>
            <div className="nexops-schedule-unscheduled-list">
              {workspace.unscheduledJobs.map((job) => (
                <button
                  className="nexops-schedule-unscheduled-row"
                  key={job.jobId}
                  type="button"
                  onClick={() => openComposer(job.jobId)}
                >
                  <div>
                    <strong>{job.clientName}</strong>
                    <p>{job.title}</p>
                    <small>{job.propertyAddress}</small>
                  </div>
                  <div className="nexops-schedule-unscheduled-meta">
                    <span>{job.number ?? "No #"}</span>
                    <small>${job.totalValue.toFixed(0)}</small>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {view === "list" ? (
          <div className="nexops-schedule-list">
            {(workspace?.visits ?? []).map((visit) => renderVisitCard(visit))}
          </div>
        ) : null}

        {view === "month" ? (
          <div className="nexops-schedule-month-grid">
            {monthDays(anchorDate).map((day) => (
              <section className="nexops-schedule-month-cell" key={day}>
                <button className="nexops-schedule-month-day" type="button" onClick={() => openComposer(undefined, day)}>
                  <strong>{new Date(`${day}T12:00:00.000Z`).getUTCDate()}</strong>
                  <span>{formatDateHeading(day)}</span>
                </button>
                <div className="nexops-schedule-month-visits">
                  {(groupedByDay.get(day) ?? []).slice(0, 3).map((visit) => renderVisitCard(visit, true))}
                  {(groupedByDay.get(day)?.length ?? 0) > 3 ? <small>+{(groupedByDay.get(day)?.length ?? 0) - 3} more</small> : null}
                </div>
              </section>
            ))}
          </div>
        ) : null}

        {view === "day" ? (
          <div className="nexops-schedule-day-grid">
            {hours.map((hour) => (
              <section
                className="nexops-schedule-slot"
                key={hour}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const visitId = event.dataTransfer.getData("text/plain");
                  const visit = (workspace?.visits ?? []).find((candidate) => candidate.id === visitId);
                  if (visit) {
                    void dropVisitIntoSlot(visit, anchorDate, hour);
                  }
                }}
              >
                <button className="nexops-schedule-slot-label" type="button" onClick={() => openComposer(undefined, anchorDate, `${String(hour).padStart(2, "0")}:00`)}>
                  {String(hour).padStart(2, "0")}:00
                </button>
                <div className="nexops-schedule-slot-visits">
                  {(workspace?.visits ?? []).filter((visit) => visitStartsInSlot(visit, anchorDate, hour)).map((visit) => renderVisitCard(visit, true))}
                </div>
              </section>
            ))}
          </div>
        ) : null}

        {view === "week" ? (
          <div className="nexops-schedule-week-grid">
            {weekDays.map((day) => (
              <section className="nexops-schedule-week-day" key={day}>
                <header>
                  <strong>{formatDateHeading(day)}</strong>
                  <button type="button" onClick={() => openComposer(undefined, day)}>Add</button>
                </header>
                <div className="nexops-schedule-week-slots">
                  {hours.map((hour) => (
                    <section
                      className="nexops-schedule-week-slot"
                      key={`${day}_${hour}`}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        const visitId = event.dataTransfer.getData("text/plain");
                        const visit = (workspace?.visits ?? []).find((candidate) => candidate.id === visitId);
                        if (visit) {
                          void dropVisitIntoSlot(visit, day, hour);
                        }
                      }}
                    >
                      <button className="nexops-schedule-week-slot-label" type="button" onClick={() => openComposer(undefined, day, `${String(hour).padStart(2, "0")}:00`)}>
                        {String(hour).padStart(2, "0")}:00
                      </button>
                      {(workspace?.visits ?? []).filter((visit) => visitStartsInSlot(visit, day, hour)).map((visit) => renderVisitCard(visit, true))}
                    </section>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : null}
        </section>
      </NexOpsRosterTemplate>

      {composerOpen ? (
        <div className="nexops-overlay-shell" role="presentation">
          <button className="nexops-overlay-backdrop" type="button" aria-label="Close visit composer" onClick={() => setComposerOpen(false)} />
          <section className="nexops-overlay-panel" role="dialog" aria-modal="true" aria-label="Create visits">
            <form className="nexops-overlay-form" onSubmit={(event) => void saveVisitSeries(event)}>
              <div className="nexops-overlay-head">
                <div>
                  <p className="eyebrow">Multi-Visit Planner</p>
                  <h2>Create Visits</h2>
                </div>
                <button type="button" onClick={() => setComposerOpen(false)}>Close</button>
              </div>
              <label className="nexops-field">
                <span>Job</span>
                <select value={composerJobId} onChange={(event) => setComposerJobId(event.target.value)}>
                  <option value="">Choose a Job</option>
                  {jobOptions.map((job) => (
                    <option key={job.id} value={job.id}>
                      {(job.number ? `${job.number} • ` : "") + (job.client?.name ? `${job.client.name} • ` : "") + job.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="nexops-schedule-draft-list">
                {visitDrafts.map((draft, index) => (
                  <section key={draft.id} className="nexops-schedule-draft-card">
                    <div className="nexops-schedule-draft-head">
                      <strong>Visit {index + 1}</strong>
                      <button
                        type="button"
                        onClick={() => setVisitDrafts((current) => current.filter((candidate) => candidate.id !== draft.id))}
                        disabled={visitDrafts.length === 1}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="nexops-field-row">
                      <label className="nexops-field">
                        <span>Title</span>
                        <input value={draft.title} onChange={(event) => patchVisitDraft(draft.id, { title: event.target.value })} placeholder="Optional visit title" />
                      </label>
                      <label className="nexops-field">
                        <span>Date</span>
                        <input type="date" value={draft.date} onChange={(event) => patchVisitDraft(draft.id, { date: event.target.value })} />
                      </label>
                    </div>
                    <div className="nexops-field-row three-up">
                      <label className="nexops-field">
                        <span>Start</span>
                        <input type="time" value={draft.startTime} onChange={(event) => patchVisitDraft(draft.id, { startTime: event.target.value })} />
                      </label>
                      <label className="nexops-field">
                        <span>End</span>
                        <input type="time" value={draft.endTime} onChange={(event) => patchVisitDraft(draft.id, { endTime: event.target.value })} />
                      </label>
                      <label className="nexops-field">
                        <span>Arrival Window</span>
                        <input value={`${draft.startTime} - ${draft.endTime}`} readOnly />
                      </label>
                    </div>
                    <label className="nexops-field">
                      <span>Details</span>
                      <textarea rows={3} value={draft.details} onChange={(event) => patchVisitDraft(draft.id, { details: event.target.value })} placeholder="Gate code, entry notes, or per-visit instructions" />
                    </label>
                    <div className="nexops-schedule-assignment-grid">
                      {workspace?.teamMembers.map((member) => (
                        <label key={`${draft.id}_${member.id}`} className={draft.assignedTo.includes(member.id) ? "active" : ""}>
                          <input type="checkbox" checked={draft.assignedTo.includes(member.id)} onChange={() => toggleDraftAssignment(draft.id, member.id)} />
                          <span>{member.name}</span>
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <div className="nexops-overlay-actions">
                <button type="button" onClick={() => setVisitDrafts((current) => [...current, emptyVisitDraft(anchorDate)])}>Add Another Visit</button>
                <button type="submit">Save Visits</button>
              </div>
              {composerStatus ? <p className="nexops-module-status">{composerStatus}</p> : null}
            </form>
          </section>
        </div>
      ) : null}

      {editVisit ? (
        <div className="nexops-overlay-shell" role="presentation">
          <button className="nexops-overlay-backdrop" type="button" aria-label="Close reschedule panel" onClick={() => setEditVisit(null)} />
          <section className="nexops-overlay-panel compact" role="dialog" aria-modal="true" aria-label="Edit visit">
            <form className="nexops-overlay-form" onSubmit={(event) => void saveMoveVisit(event)}>
              <div className="nexops-overlay-head">
                <div>
                  <p className="eyebrow">Reschedule</p>
                  <h2>{editVisit.clientName}</h2>
                </div>
                <button type="button" onClick={() => setEditVisit(null)}>Close</button>
              </div>
              <div className="nexops-field-row three-up">
                <label className="nexops-field">
                  <span>Date</span>
                  <input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} />
                </label>
                <label className="nexops-field">
                  <span>Start</span>
                  <input type="time" value={editStartTime} onChange={(event) => setEditStartTime(event.target.value)} />
                </label>
                <label className="nexops-field">
                  <span>End</span>
                  <input type="time" value={editEndTime} onChange={(event) => setEditEndTime(event.target.value)} />
                </label>
              </div>
              <label className="nexops-inline-checkbox">
                <input type="checkbox" checked={shiftRemaining} onChange={(event) => setShiftRemaining(event.target.checked)} />
                <span>Shift all remaining visits on this job by the same offset</span>
              </label>
              <div className="nexops-overlay-actions">
                <button type="submit">{workingVisitId === editVisit.id ? "Saving..." : "Save Move"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {fieldDocsVisit ? (
        <div className="nexops-overlay-shell" role="presentation">
          <button className="nexops-overlay-backdrop" type="button" aria-label="Close NexCam visit rail" onClick={() => setFieldDocsVisit(null)} />
          <section className="nexops-overlay-panel" role="dialog" aria-modal="true" aria-label="Visit NexCam rail">
            <div className="nexops-overlay-head">
              <div>
                <p className="eyebrow"><ProductInlineLabel product="nexcam" /></p>
                <h2>{fieldDocsVisit.clientName}</h2>
              </div>
              <button type="button" onClick={() => setFieldDocsVisit(null)}>Close</button>
            </div>
            <p className="nexops-module-status">{fieldDocsStatus || "No NexCam records on this visit yet."}</p>
            <div className="nexops-two-column">
              <section className="nexops-module-page">
                <article className="nexops-module-card wide">
                  <p className="eyebrow">Visit Media</p>
                  <h2>{fieldDocsMedia.length ? `${fieldDocsMedia.length} item${fieldDocsMedia.length === 1 ? "" : "s"}` : "No Media Yet"}</h2>
                  <ul className="nexops-mini-list">
                    {fieldDocsMedia.map((media) => (
                      <li key={media.id}>
                        <span>
                          <strong>{media.aiCaption ?? `Visit ${media.type}`}</strong>
                          <small>{media.exif?.ts ? new Date(media.exif.ts).toLocaleString() : fieldDocsVisit.arrivalWindow}</small>
                        </span>
                        <a className="nexops-link-button" href={`/api/media/${encodeURIComponent(media.id)}?tenantId=${encodeURIComponent(props.tenantId)}`} target="_blank" rel="noreferrer">Open</a>
                      </li>
                    ))}
                    {!fieldDocsMedia.length ? (
                      <li>
                        <span>
                          <strong>No Visit Media Yet</strong>
                          <small>Uploaded visit photos will collect here without changing the schedule flow.</small>
                        </span>
                      </li>
                    ) : null}
                  </ul>
                </article>
              </section>
              <section className="nexops-module-page">
                <article className="nexops-module-card wide">
                  <p className="eyebrow">Visit Reports</p>
                  <h2>{fieldDocsReports.length ? `${fieldDocsReports.length} report${fieldDocsReports.length === 1 ? "" : "s"}` : "No Report Yet"}</h2>
                  <ul className="nexops-mini-list">
                    {fieldDocsReports.map((report) => (
                      <li key={report.id}>
                        <span>
                          <strong>{report.title}</strong>
                          <small>{(report.postedAt ?? report.createdAt) ? new Date(report.postedAt ?? report.createdAt ?? "").toLocaleString() : fieldDocsVisit.arrivalWindow}</small>
                        </span>
                        <a className="nexops-link-button" href={`/api/fielddocs/reports/${encodeURIComponent(report.id)}/pdf?tenantId=${encodeURIComponent(props.tenantId)}`} target="_blank" rel="noreferrer">Open PDF</a>
                      </li>
                    ))}
                    {!fieldDocsReports.length ? (
                      <li>
                        <span>
                          <strong>No Report Yet</strong>
                          <small>Generate the report in NexCam after the visit checklist is complete.</small>
                        </span>
                      </li>
                    ) : null}
                  </ul>
                </article>
              </section>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
