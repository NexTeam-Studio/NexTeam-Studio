import React, { useEffect, useMemo, useState } from "react";
import {
  PaymentScheduleEditor,
  blankPaymentSchedule,
  paymentScheduleFromRecord,
  paymentScheduleToPayload,
  type PaymentScheduleDraft,
  type PaymentScheduleRecord
} from "./nexopsPaymentSchedule";

type JobStatus = "Upcoming" | "Today" | "Late" | "Unscheduled" | "Action Required" | "Requires Invoicing" | "Archived";
type JobAction = "close" | "invoice" | "close_and_invoice" | "dismiss_invoice_reminder";
type JobFilter = "All" | JobStatus;

const JOB_FILTERS: JobFilter[] = ["All", "Upcoming", "Today", "Late", "Unscheduled", "Action Required", "Requires Invoicing", "Archived"];

interface ClientOption {
  id: string;
  name: string;
  company?: string;
  personName?: { firstName?: string; lastName?: string };
  displayNamePreference?: "person" | "company";
  emails: string[];
  phones: string[];
}

interface Address {
  street1: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

interface LineItem {
  id: string;
  code: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface VisitRecord {
  id: string;
  title: string;
  start: string;
  end: string;
  assignedTo: string[];
  status: string;
  completedAt?: string;
}

interface InvoiceReminderRecord {
  id: string;
  dueAt: string;
  status: string;
}

interface JobActionAlertRecord {
  id: string;
  note?: string;
  status: string;
}

interface JobEventRecord {
  id: string;
  type: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

interface InvoiceRecord {
  id: string;
  number?: string;
  title: string;
  status: string;
  totals: { total: number };
}

interface JobSummary {
  id: string;
  tenantId: string;
  number?: string;
  clientId: string;
  propertyId?: string;
  requestId?: string;
  quoteId?: string;
  status: JobStatus;
  title: string;
  startAt?: string;
  endAt?: string;
  lineItems?: LineItem[];
  totals?: { subtotal: number; tax: number; total: number };
  paymentSchedule?: PaymentScheduleRecord;
  createdAt?: string;
  updatedAt?: string;
  client?: { id: string; name: string; company?: string };
  property?: { id: string; label?: string; siteName?: string; address?: Address };
  nextVisit?: VisitRecord;
  visitCount: number;
  completedVisitCount: number;
  pendingInvoiceReminder?: InvoiceReminderRecord;
  pendingActionAlert?: JobActionAlertRecord;
  invoiceCount: number;
}

interface JobDetail extends JobSummary {
  quote?: { id: string; number?: string; title: string };
  request?: { id: string; subject: string };
  visits: VisitRecord[];
  reminders: {
    invoice?: InvoiceReminderRecord;
    visit: Array<{ id: string; channel: string; trigger: string; dueAt: string; status: string }>;
    actionAlert?: JobActionAlertRecord;
  };
  history: JobEventRecord[];
  invoices: InvoiceRecord[];
}

interface JobsResponse {
  ok: boolean;
  jobs?: JobSummary[];
  error?: string;
}

interface JobDetailResponse {
  ok: boolean;
  job?: JobDetail;
  error?: string;
}

interface JobMutationResponse {
  ok: boolean;
  job?: JobDetail;
  visit?: VisitRecord;
  invoice?: InvoiceRecord;
  reminder?: InvoiceReminderRecord;
  error?: string;
}

function clientLabel(client: ClientOption): string {
  const person = [client.personName?.firstName, client.personName?.lastName].filter(Boolean).join(" ").trim();
  if (client.displayNamePreference === "company" && client.company?.trim()) {
    return client.company.trim();
  }
  return person || client.name;
}

function formatDateTime(value?: string): string {
  if (!value) {
    return "Not set";
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

function formatMoney(value?: number): string {
  return typeof value === "number" ? `$${value.toFixed(2)}` : "$0.00";
}

export function NexOpsJobsPage(props: {
  tenantId: string;
  clients: ClientOption[];
  onCrmMutation: () => void;
  onOpenInvoice?: (invoiceId: string) => void;
}): React.ReactElement {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [status, setStatus] = useState("Loading jobs...");
  const [detailStatus, setDetailStatus] = useState("Select a job to review visits and actions.");
  const [createClientId, setCreateClientId] = useState(props.clients[0]?.id ?? "");
  const [createTitle, setCreateTitle] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createPaymentSchedule, setCreatePaymentSchedule] = useState<PaymentScheduleDraft>(() => blankPaymentSchedule());
  const [visitTitle, setVisitTitle] = useState("");
  const [visitStart, setVisitStart] = useState("");
  const [visitEnd, setVisitEnd] = useState("");
  const [actionBusy, setActionBusy] = useState<JobAction | null>(null);
  const [statusFilter, setStatusFilter] = useState<JobFilter>("All");
  const [detailPaymentSchedule, setDetailPaymentSchedule] = useState<PaymentScheduleDraft>(() => blankPaymentSchedule());

  const filteredJobs = useMemo(
    () => jobs.filter((job) => statusFilter === "All" || job.status === statusFilter),
    [jobs, statusFilter]
  );

  const filterCounts = useMemo(
    () => JOB_FILTERS.reduce<Record<JobFilter, number>>((counts, filter) => {
      counts[filter] = filter === "All" ? jobs.length : jobs.filter((job) => job.status === filter).length;
      return counts;
    }, {
      All: 0,
      Upcoming: 0,
      Today: 0,
      Late: 0,
      Unscheduled: 0,
      "Action Required": 0,
      "Requires Invoicing": 0,
      Archived: 0
    }),
    [jobs]
  );

  async function loadJobs(preferredJobId?: string): Promise<void> {
    try {
      const body = await fetch(`/api/crm/jobs?tenantId=${encodeURIComponent(props.tenantId)}`)
        .then((response) => response.json() as Promise<JobsResponse>);
      if (!body.ok) {
        setJobs([]);
        setStatus(body.error ?? "Jobs are unavailable right now.");
        return;
      }
      const nextJobs = body.jobs ?? [];
      setJobs(nextJobs);
      setStatus(nextJobs.length ? `${nextJobs.length} job${nextJobs.length === 1 ? "" : "s"} loaded.` : "No jobs yet.");
      const nextSelected = preferredJobId && nextJobs.some((job) => job.id === preferredJobId)
        ? preferredJobId
        : selectedJobId && nextJobs.some((job) => job.id === selectedJobId)
          ? selectedJobId
          : nextJobs[0]?.id ?? "";
      setSelectedJobId(nextSelected);
    } catch {
      setJobs([]);
      setStatus("Jobs API unreachable.");
    }
  }

  async function loadDetail(jobId: string): Promise<void> {
    if (!jobId) {
      setDetail(null);
      setDetailStatus("Select a job to review visits and actions.");
      return;
    }
    setDetailStatus("Loading job detail...");
    try {
      const body = await fetch(`/api/crm/jobs/${encodeURIComponent(jobId)}?tenantId=${encodeURIComponent(props.tenantId)}`)
        .then((response) => response.json() as Promise<JobDetailResponse>);
      if (!body.ok || !body.job) {
        setDetail(null);
        setDetailStatus(body.error ?? "Job detail is unavailable right now.");
        return;
      }
      setDetail(body.job);
      setDetailStatus(`Viewing ${body.job.title}.`);
      setVisitTitle(body.job.title);
      setDetailPaymentSchedule(paymentScheduleFromRecord(body.job.paymentSchedule));
    } catch {
      setDetail(null);
      setDetailStatus("Job detail API unreachable.");
    }
  }

  useEffect(() => {
    void loadJobs();
    const handleMutation = () => void loadJobs();
    window.addEventListener("nexops:crm-mutated", handleMutation);
    return () => window.removeEventListener("nexops:crm-mutated", handleMutation);
  }, [props.tenantId]);

  useEffect(() => {
    void loadDetail(selectedJobId);
  }, [selectedJobId]);

  useEffect(() => {
    if (!filteredJobs.length) {
      if (selectedJobId) {
        setSelectedJobId("");
      }
      return;
    }
    if (!filteredJobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(filteredJobs[0]?.id ?? "");
    }
  }, [filteredJobs, selectedJobId]);

  async function createJob(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!createClientId || !createTitle.trim()) {
      setStatus("Pick a client and title before creating the job.");
      return;
    }
    setCreateBusy(true);
    try {
      const body = await fetch("/api/crm/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          clientId: createClientId,
          title: createTitle.trim(),
          ...(paymentScheduleToPayload(createPaymentSchedule) ? { paymentSchedule: paymentScheduleToPayload(createPaymentSchedule) } : {})
        })
      }).then((response) => response.json() as Promise<JobMutationResponse>);
      if (!body.ok || !body.job) {
        setStatus(body.error ?? "Job create failed.");
        return;
      }
      setCreateTitle("");
      setCreatePaymentSchedule(blankPaymentSchedule());
      props.onCrmMutation();
      await loadJobs(body.job.id);
      await loadDetail(body.job.id);
      setStatus(`Created ${body.job.title}.`);
    } catch {
      setStatus("Job create failed.");
    } finally {
      setCreateBusy(false);
    }
  }

  async function scheduleVisit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!detail || !visitStart || !visitEnd) {
      setDetailStatus("Pick a start and end time before booking the visit.");
      return;
    }
    setActionBusy("close");
    try {
      const body = await fetch(`/api/crm/jobs/${encodeURIComponent(detail.id)}/visits`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          title: visitTitle.trim() || detail.title,
          start: new Date(visitStart).toISOString(),
          end: new Date(visitEnd).toISOString()
        })
      }).then((response) => response.json() as Promise<JobMutationResponse>);
      if (!body.ok) {
        setDetailStatus(body.error ?? "Visit booking failed.");
        return;
      }
      props.onCrmMutation();
      await loadJobs(detail.id);
      await loadDetail(detail.id);
      setDetailStatus("Visit booked.");
    } catch {
      setDetailStatus("Visit booking failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function savePaymentSchedule(): Promise<void> {
    if (!detail) {
      return;
    }
    setActionBusy("invoice");
    try {
      const body = await fetch(`/api/crm/jobs/${encodeURIComponent(detail.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          paymentSchedule: paymentScheduleToPayload(detailPaymentSchedule)
        })
      }).then((response) => response.json() as Promise<JobMutationResponse>);
      if (!body.ok || !body.job) {
        setDetailStatus(body.error ?? "Payment schedule update failed.");
        return;
      }
      props.onCrmMutation();
      await loadJobs(detail.id);
      await loadDetail(detail.id);
      setDetailStatus("Payment schedule saved.");
    } catch {
      setDetailStatus("Payment schedule update failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function performAction(action: JobAction): Promise<void> {
    if (!detail) {
      return;
    }
    setActionBusy(action);
    try {
      const body = await fetch(`/api/crm/jobs/${encodeURIComponent(detail.id)}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: props.tenantId, action })
      }).then((response) => response.json() as Promise<JobMutationResponse>);
      if (!body.ok) {
        setDetailStatus(body.error ?? "Job action failed.");
        return;
      }
      props.onCrmMutation();
      await loadJobs(detail.id);
      await loadDetail(detail.id);
      if ((action === "invoice" || action === "close_and_invoice") && body.invoice?.id) {
        props.onOpenInvoice?.(body.invoice.id);
      }
      setDetailStatus(action === "close_and_invoice"
        ? "Job closed and invoice drafted."
        : action === "invoice"
          ? "Invoice drafted."
          : action === "dismiss_invoice_reminder"
            ? "Invoice reminder dismissed."
            : "Job closed.");
    } catch {
      setDetailStatus("Job action failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function completeVisit(visitId: string): Promise<void> {
    if (!detail) {
      return;
    }
    setActionBusy("invoice");
    try {
      const body = await fetch(`/api/crm/jobs/visits/${encodeURIComponent(visitId)}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: props.tenantId })
      }).then((response) => response.json() as Promise<JobMutationResponse>);
      if (!body.ok) {
        setDetailStatus(body.error ?? "Visit completion failed.");
        return;
      }
      props.onCrmMutation();
      await loadJobs(detail.id);
      await loadDetail(detail.id);
      setDetailStatus("Visit completed and lifecycle updated.");
    } catch {
      setDetailStatus("Visit completion failed.");
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <section className="nexops-module-page">
      <header className="nexops-page-heading">
        <div>
          <p className="eyebrow">M3 Job Engine</p>
          <h1>Jobs</h1>
          <p>Derived status, reminder state, visits, and office actions all live on one rail now.</p>
        </div>
        <div className="nexops-status-pill">{status}</div>
      </header>

      <section className="nexops-jobs-layout">
        <article className="nexops-module-card">
          <p className="eyebrow">Manual create</p>
          <h2>New job</h2>
          <form className="nexops-jobs-form" onSubmit={(event) => void createJob(event)}>
            <label>
              Client
              <select value={createClientId} onChange={(event) => setCreateClientId(event.target.value)}>
                <option value="">Choose client</option>
                {props.clients.map((client) => <option key={client.id} value={client.id}>{clientLabel(client)}</option>)}
              </select>
            </label>
            <label>
              Job title
              <input value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} placeholder="Leak detection follow-up" />
            </label>
            <PaymentScheduleEditor
              value={createPaymentSchedule}
              onChange={setCreatePaymentSchedule}
              title="Job payment schedule"
              hint="Use this when the work needs a deposit or milestone billing plan even without a quote."
            />
            <button type="submit" disabled={createBusy || !createClientId || !createTitle.trim()}>
              {createBusy ? "Creating..." : "Create job"}
            </button>
          </form>
        </article>

        <article className="nexops-module-card">
          <div className="nexops-jobs-card-heading">
            <div>
              <p className="eyebrow">Native list</p>
              <h2>Job roster</h2>
            </div>
            <span>{filteredJobs.length} shown / {jobs.length} total</span>
          </div>
          <div className="nexops-jobs-filter-row" aria-label="Job status filters">
            {JOB_FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                className={`nexops-jobs-filter-pill${statusFilter === filter ? " active" : ""}`}
                onClick={() => setStatusFilter(filter)}
              >
                <span>{filter}</span>
                <small>{filterCounts[filter]}</small>
              </button>
            ))}
          </div>
          <div className="nexops-jobs-list">
            {filteredJobs.map((job) => (
              <button
                key={job.id}
                type="button"
                className={`nexops-jobs-list-item${job.id === selectedJobId ? " active" : ""}`}
                onClick={() => setSelectedJobId(job.id)}
              >
                <div>
                  <strong>{job.title}</strong>
                  <span>{job.client?.name ?? job.clientId}</span>
                </div>
                <div>
                  <span className={`nexops-job-status status-${job.status.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{job.status}</span>
                  <small>{job.visitCount} visits</small>
                </div>
              </button>
            ))}
            {!jobs.length ? <p className="nexops-empty-copy">No jobs yet. Requests and approved quotes can start here, and manual jobs can too.</p> : null}
            {jobs.length > 0 && !filteredJobs.length ? <p className="nexops-empty-copy">No jobs match this status right now.</p> : null}
          </div>
        </article>
      </section>

      <section className="nexops-two-column">
        <article className="nexops-module-card">
          <div className="nexops-jobs-card-heading">
            <div>
              <p className="eyebrow">Detail</p>
              <h2>{detail?.title ?? "Select a job"}</h2>
            </div>
            {detail?.number ? <span>{detail.number}</span> : null}
          </div>
          <p>{detailStatus}</p>
          {detail ? (
            <div className="nexops-jobs-detail">
              <div className="nexops-jobs-grid">
                <div className="nexops-jobs-stat"><strong>Status</strong><span>{detail.status}</span></div>
                <div className="nexops-jobs-stat"><strong>Client</strong><span>{detail.client?.name ?? detail.clientId}</span></div>
                <div className="nexops-jobs-stat"><strong>Property</strong><span>{detail.property?.address?.street1 ?? detail.property?.label ?? "Not attached"}</span></div>
                <div className="nexops-jobs-stat"><strong>Total</strong><span>{formatMoney(detail.totals?.total)}</span></div>
              </div>

              <div className="nexops-jobs-actions">
                <button type="button" disabled={actionBusy !== null} onClick={() => void performAction("close")}>Close</button>
                <button type="button" disabled={actionBusy !== null} onClick={() => void performAction("invoice")}>Invoice</button>
                <button type="button" disabled={actionBusy !== null} onClick={() => void performAction("close_and_invoice")}>Close and Invoice</button>
                {detail.reminders.invoice ? (
                  <button type="button" disabled={actionBusy !== null} onClick={() => void performAction("dismiss_invoice_reminder")}>Dismiss Reminder</button>
                ) : null}
              </div>

              <div className="nexops-jobs-section">
                <div className="nexops-jobs-card-heading">
                  <h3>Payment schedule</h3>
                  <button type="button" disabled={actionBusy !== null} onClick={() => void savePaymentSchedule()}>
                    {actionBusy === "invoice" ? "Saving..." : "Save schedule"}
                  </button>
                </div>
                <PaymentScheduleEditor
                  value={detailPaymentSchedule}
                  onChange={setDetailPaymentSchedule}
                  hint="Milestones here feed invoice timing and keep recurring billing reminders on the same plan."
                />
              </div>

              <div className="nexops-jobs-section">
                <div className="nexops-jobs-card-heading">
                  <h3>Visits</h3>
                  <span>{detail.visits.length} total</span>
                </div>
                <form className="nexops-jobs-form inline" onSubmit={(event) => void scheduleVisit(event)}>
                  <input value={visitTitle} onChange={(event) => setVisitTitle(event.target.value)} placeholder="Visit title" />
                  <input type="datetime-local" value={visitStart} onChange={(event) => setVisitStart(event.target.value)} />
                  <input type="datetime-local" value={visitEnd} onChange={(event) => setVisitEnd(event.target.value)} />
                  <button type="submit" disabled={actionBusy !== null}>Book visit</button>
                </form>
                <div className="nexops-jobs-sublist">
                  {detail.visits.map((visit) => (
                    <div key={visit.id} className="nexops-jobs-sublist-item">
                      <div>
                        <strong>{visit.title}</strong>
                        <span>{formatDateTime(visit.start)} to {formatDateTime(visit.end)}</span>
                      </div>
                      <div>
                        <span className={`nexops-job-status status-${visit.status.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{visit.status}</span>
                        {visit.status !== "complete" ? (
                          <button type="button" disabled={actionBusy !== null} onClick={() => void completeVisit(visit.id)}>Complete</button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="nexops-jobs-section">
                <h3>Reminders and alerts</h3>
                <ul className="nexops-jobs-bullets">
                  <li>{detail.reminders.invoice ? `Invoice reminder due ${formatDateTime(detail.reminders.invoice.dueAt)}.` : "No invoice reminder pending."}</li>
                  <li>{detail.reminders.actionAlert?.note ?? "No office review alert pending."}</li>
                  <li>{detail.reminders.visit.length ? `${detail.reminders.visit.length} visit reminder records queued.` : "No visit reminder records pending."}</li>
                </ul>
              </div>

              <div className="nexops-jobs-section">
                <h3>History</h3>
                <div className="nexops-jobs-history">
                  {detail.history.map((entry) => <div key={entry.id}><strong>{entry.type}</strong><span>{formatDateTime(entry.createdAt)}</span></div>)}
                  {!detail.history.length ? <p className="nexops-empty-copy">No lifecycle events yet.</p> : null}
                </div>
              </div>
            </div>
          ) : (
            <p className="nexops-empty-copy">Pick a job from the roster to review visits, reminders, invoices, and history.</p>
          )}
        </article>

        <article className="nexops-module-card">
          <p className="eyebrow">Billing handoff</p>
          <h2>Invoices</h2>
          <div className="nexops-jobs-sublist">
            {(detail?.invoices ?? []).map((invoice) => (
              <div key={invoice.id} className="nexops-jobs-sublist-item">
                <div>
                  <strong>{invoice.number ?? invoice.id}</strong>
                  <span>{invoice.title}</span>
                </div>
                <div>
                  <span className={`nexops-job-status status-${invoice.status.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{invoice.status}</span>
                  <small>{formatMoney(invoice.totals.total)}</small>
                </div>
              </div>
            ))}
            {detail && !detail.invoices.length ? <p className="nexops-empty-copy">No invoices tied to this job yet.</p> : null}
          </div>
        </article>
      </section>
    </section>
  );
}
