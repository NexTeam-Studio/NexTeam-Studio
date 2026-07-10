import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, type Auth, type User } from "firebase/auth";
import "./styles.css";

interface Source {
  rail: "jobber" | "companycam" | "native" | "gsc" | "gbp" | "email";
  ref: string;
  label: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources: Source[];
}

interface NexiResponse {
  ok: boolean;
  answer?: string;
  sources?: Source[];
  error?: string;
}

interface UploadMediaResponse {
  ok: boolean;
  media?: {
    id: string;
    type: "photo" | "video" | "pdf";
    jobId?: string;
  };
  error?: string;
}

interface ScheduledVisit {
  id: string;
  jobId: string;
  title: string;
  start: string;
  end: string;
  assignedTo: string[];
  status: string;
  source?: "native" | "jobber";
  readOnly?: boolean;
  location?: {
    label: string;
    geo?: { lat: number; lng: number };
    address?: {
      street1: string;
      city: string;
      province: string;
      postalCode: string;
      country: string;
    };
  };
}

interface CalendarResponse {
  ok: boolean;
  visits?: ScheduledVisit[];
  sourceCounts?: { native: number; jobber: number };
  warnings?: string[];
  error?: string;
}

interface ContentDraft {
  id: string;
  kind: "gbp_post" | "social_post" | "article";
  title: string;
  body: string;
  status: "draft" | "approval_pending" | "publish_ready" | "published_deferred" | "rejected";
  createdAt: string;
  mediaRefs: string[];
}

interface ContentQueueResponse {
  ok: boolean;
  drafts?: ContentDraft[];
  error?: string;
}

interface ApprovalQueueItem {
  id: string;
  tenantId: string;
  kind: string;
  preview: {
    title: string;
    body: string;
    mediaRefs?: string[];
  };
  execute: {
    service: string;
    op: string;
    args?: unknown;
  };
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  createdBy: "nexi" | "system" | "user";
  decidedAt?: string;
}

interface ApprovalQueueResponse {
  ok: boolean;
  items?: ApprovalQueueItem[];
  error?: string;
}

interface ApprovalActionResponse {
  ok: boolean;
  item?: ApprovalQueueItem;
  result?: unknown;
  error?: string;
}

interface ReputationReview {
  id: string;
  authorName: string;
  rating: number;
  comment: string;
  reviewedAt: string;
  replyStatus: "none" | "drafted" | "approved" | "published_deferred";
}

interface ReputationProfile {
  id: string;
  locationId: string;
  status: "draft" | "approval_pending" | "publish_ready" | "published_deferred";
}

interface ReputationQueueResponse {
  ok: boolean;
  reviews?: ReputationReview[];
  profiles?: ReputationProfile[];
  pendingReplies?: ReputationReview[];
  error?: string;
  blocker?: string;
  imported?: ReputationReview[];
}

interface PlatformPlan {
  id: "nexi" | "marketing" | "suite";
  name: string;
  monthlyUsd: number;
  modules: string[];
}

interface PlatformTenantRow {
  tenant: {
    id: string;
    name: string;
    plan: "nexi" | "marketing" | "suite";
  };
  plan: PlatformPlan;
  modules: string[];
  subscription?: {
    status: string;
    stripeSubscriptionId?: string;
  } | null;
  adapterStatuses: Array<{
    adapter: string;
    provider: string;
    configured: boolean;
    ok: boolean;
    detail?: string;
  }>;
  cost: {
    estimatedCostUsd: number;
    usageLogCount: number;
  };
}

interface PlatformTenantResponse {
  ok: boolean;
  tenants?: PlatformTenantRow[];
  error?: string;
}

interface PlatformPlansResponse {
  ok: boolean;
  plans?: PlatformPlan[];
  error?: string;
}

interface FirebasePublicConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

interface RuntimeConfigResponse {
  ok: boolean;
  firebase: FirebasePublicConfig;
  firebaseConfigured: boolean;
}

type TenantRole = "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";

interface OperatorContext {
  tenantId: string;
  tenantUserId: string;
  role: TenantRole;
}

interface OperatorUiTheme {
  tenantId: string;
  name: string;
  colors: {
    shellBackground?: string;
    panelBackground?: string;
    headerBackground?: string;
    accent?: string;
    accentText?: string;
    userBubble?: string;
    assistantBubble?: string;
    text?: string;
  };
  density: "comfortable" | "compact";
  updatedAt: string;
}

interface OperatorUiThemeResponse {
  ok: boolean;
  theme?: OperatorUiTheme;
  error?: string;
}

interface VoiceSession {
  id: string;
  tenantId: string;
  tenantUserId?: string;
  state: "listening" | "thinking" | "speaking" | "interrupted" | "ended";
  targetFirstAudioMs: number;
  avatarProviderSlot: "provider_agnostic";
  turnCount: number;
  interruptionCount: number;
  lastFirstAudioLatencyMs?: number;
  lastEstimatedCostUsd?: number;
  lastCharacterCount?: number;
  lastAudioBytes?: number;
}

interface VoiceSessionResponse {
  ok: boolean;
  session?: VoiceSession;
  error?: string;
}

interface BrowserSpeechRecognitionResult {
  0: { transcript: string };
  isFinal?: boolean;
}

interface BrowserSpeechRecognitionEvent {
  resultIndex?: number;
  results: ArrayLike<BrowserSpeechRecognitionResult>;
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;
type VoiceWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

const buildTimeFirebaseConfig: FirebasePublicConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string || ""
};

const DEFAULT_TENANT_ID = "aquatrace";

function claimString(claims: Record<string, unknown>, key: string): string | undefined {
  const value = claims[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function claimRole(claims: Record<string, unknown>): TenantRole {
  const explicit = claimString(claims, "tenantRole") ?? claimString(claims, "role");
  const roles = Array.isArray(claims.roles) ? claims.roles.map((role) => String(role).toUpperCase()) : [];
  const candidates = [explicit, ...roles].filter(Boolean).map((role) => String(role).toUpperCase());
  if (candidates.includes("OFFICE_ADMIN") || candidates.includes("OFFICE") || candidates.includes("ADMIN")) return "OFFICE_ADMIN";
  if (candidates.includes("TECHNICIAN") || candidates.includes("TECH")) return "TECHNICIAN";
  return "OWNER";
}

function fallbackOperatorContext(user: User): OperatorContext {
  return { tenantId: DEFAULT_TENANT_ID, tenantUserId: user.uid, role: "OWNER" };
}

async function loadOperatorContext(user: User): Promise<OperatorContext> {
  const token = await user.getIdTokenResult();
  const claims = token.claims as Record<string, unknown>;
  const claimedTenantId = claimString(claims, "tenantId") ?? claimString(claims, "tenant_id");
  // This Job Desk build is the Aquatrace operator surface. Platform-level Firebase
  // claims can be "nexteam-studio"; do not let that silently move Aquatrace tools
  // onto the wrong tenant until a real tenant switcher exists.
  const tenantId = claimedTenantId && claimedTenantId !== "nexteam-studio" ? claimedTenantId : DEFAULT_TENANT_ID;
  return {
    tenantId,
    tenantUserId: claimString(claims, "tenantUserId") ?? user.uid,
    role: claimRole(claims)
  };
}

function completeFirebaseConfig(config: FirebasePublicConfig): boolean {
  return Object.values(config).every((value) => value.length > 0);
}

function createFirebaseAuth(config: FirebasePublicConfig): Auth | null {
  if (!completeFirebaseConfig(config)) {
    return null;
  }
  const existingApp = getApps()[0];
  const app = existingApp ?? initializeApp(config);
  return getAuth(app);
}

async function loadFirebaseAuth(): Promise<Auth | null> {
  if (completeFirebaseConfig(buildTimeFirebaseConfig)) {
    return createFirebaseAuth(buildTimeFirebaseConfig);
  }
  const response = await fetch("/api/public/runtime-config");
  const runtime = await response.json() as RuntimeConfigResponse;
  return runtime.ok && runtime.firebaseConfigured ? createFirebaseAuth(runtime.firebase) : null;
}

function sourceThumb(source: Source, tenantId?: string): React.ReactElement | null {
  if (!sourceIsPhoto(source)) {
    return null;
  }
  return <img className="photo-tile-image" src={mediaUrl(source, tenantId)} alt={source.label} loading="lazy" />;
}

function mediaUrl(source: Source, tenantId?: string): string {
  const base = `/api/media/${encodeURIComponent(source.ref)}`;
  return source.rail === "native" && tenantId ? `${base}?tenantId=${encodeURIComponent(tenantId)}` : base;
}

function mediaDownloadUrl(source: Source, tenantId?: string): string {
  const url = mediaUrl(source, tenantId);
  return `${url}${url.includes("?") ? "&" : "?"}download=1`;
}

function sourceIsPhoto(source: Source): boolean {
  const label = source.label.toLowerCase();
  return (source.rail === "companycam" && label.includes("photo"))
    || (source.rail === "native" && /\b(photo|media|before|after|upload)/.test(label));
}

function mediaDownloadName(source: Source): string {
  return `${source.rail}-${source.ref.replace(/[^a-z0-9_-]/gi, "_")}.jpg`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const encoded = result.includes(",") ? result.slice(result.indexOf(",") + 1) : result;
      resolve(encoded);
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function dayRange(day: string, view: "day" | "week" | "map"): { from: string; to: string } {
  const from = new Date(`${day}T00:00:00.000Z`);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + (view === "week" ? 7 : 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

function formatVisitTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function visitStatusLabel(visit: ScheduledVisit): string {
  return visit.source === "jobber" || visit.readOnly ? "Jobber read-only" : visit.status;
}

function SchedulePanel(props: { tenantId: string }): React.ReactElement {
  const [view, setView] = useState<"day" | "week" | "map">("day");
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [visits, setVisits] = useState<ScheduledVisit[]>([]);
  const [status, setStatus] = useState("Loading schedule...");

  useEffect(() => {
    let cancelled = false;
    const range = dayRange(day, view);
    setStatus("Loading schedule...");
    fetch(`/api/scheduling/calendar?tenantId=${encodeURIComponent(props.tenantId)}&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`)
      .then((response) => response.json() as Promise<CalendarResponse>)
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
        if (!(body.visits ?? []).length) {
          setStatus("No native or Jobber visits in this window yet.");
          return;
        }
        const jobberCount = body.sourceCounts?.jobber ?? 0;
        setStatus(jobberCount ? `${jobberCount} Jobber visit${jobberCount === 1 ? "" : "s"} shown read-only.` : "");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("Schedule API unreachable.");
          setVisits([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [day, props.tenantId, view]);

  return (
    <aside className="schedule-card">
      <div className="schedule-heading">
        <div>
          <p className="eyebrow">M3 Scheduling</p>
          <h2>Calendar Board</h2>
        </div>
        <input aria-label="Schedule date" type="date" value={day} onChange={(event) => setDay(event.target.value)} />
      </div>
      <div className="view-tabs" aria-label="Calendar views">
        {(["day", "week", "map"] as const).map((candidate) => (
          <button
            className={candidate === view ? "active" : ""}
            key={candidate}
            type="button"
            onClick={() => setView(candidate)}
          >
            {candidate}
          </button>
        ))}
      </div>
      {status ? <p className="schedule-status">{status}</p> : null}
      <div className={`visit-list ${view}`}>
        {visits.map((visit) => (
          <article className="visit-card" key={visit.id}>
            <div>
              <p className="visit-time">{formatVisitTime(visit.start)} - {formatVisitTime(visit.end)}</p>
              <h3>{visit.title}</h3>
              <p>{visit.location?.label ?? "No location label"} - {visit.assignedTo.join(", ") || "Unassigned"}</p>
            </div>
            <span className="visit-status">{visitStatusLabel(visit)}</span>
            {view === "map" ? (
              <p className="map-line">
                {visit.location?.geo ? `${visit.location.geo.lat.toFixed(4)}, ${visit.location.geo.lng.toFixed(4)}` : "No coordinates yet"}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </aside>
  );
}

function ContentQueuePanel(props: { tenantId: string }): React.ReactElement {
  const [drafts, setDrafts] = useState<ContentDraft[]>([]);
  const [status, setStatus] = useState("Loading content queue...");
  const [workingId, setWorkingId] = useState("");

  async function refresh(): Promise<void> {
    setStatus("Loading content queue...");
    try {
      const body = await fetch(`/api/content/queue?tenantId=${encodeURIComponent(props.tenantId)}`)
        .then((response) => response.json() as Promise<ContentQueueResponse>);
      if (!body.ok) {
        setDrafts([]);
        setStatus(body.error ?? "Content queue unavailable.");
        return;
      }
      const pending = (body.drafts ?? []).filter((draft) => draft.status === "approval_pending");
      setDrafts(pending);
      setStatus(pending.length ? "Publishing stays parked until you approve it." : "No content drafts are waiting right now.");
    } catch {
      setDrafts([]);
      setStatus("Content queue API unreachable.");
    }
  }

  async function decide(draftId: string, action: "approve" | "reject"): Promise<void> {
    setWorkingId(draftId);
    setStatus(action === "approve" ? "Approving draft..." : "Rejecting draft...");
    try {
      const body = await fetch(`/api/content/drafts/${encodeURIComponent(draftId)}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: props.tenantId })
      }).then((response) => response.json() as Promise<{ ok: boolean; error?: string }>);
      setStatus(body.ok ? `Draft ${action === "approve" ? "approved" : "rejected"}.` : body.error ?? "Content decision failed.");
      await refresh();
    } catch {
      setStatus("Content decision request failed.");
    } finally {
      setWorkingId("");
    }
  }

  useEffect(() => {
    void refresh();
  }, [props.tenantId]);

  return (
    <aside className="content-card">
      <div className="schedule-heading">
        <div>
          <p className="eyebrow">M5 Content</p>
          <h2>Content Queue</h2>
        </div>
        <button className="refresh-button" type="button" onClick={() => void refresh()}>Refresh</button>
      </div>
      <p className="schedule-status">{status}</p>
      <div className="content-list">
        {drafts.map((draft) => (
          <article className="content-draft" key={draft.id}>
            <div className="content-draft-head">
              <span>{draft.kind.replace("_", " ")}</span>
              <span>{new Date(draft.createdAt).toLocaleDateString()}</span>
            </div>
            <h3>{draft.title}</h3>
            <p>{draft.body.split(/\n+/)[0]}</p>
            <div className="content-actions">
              <button type="button" disabled={workingId === draft.id} onClick={() => void decide(draft.id, "approve")}>Approve</button>
              <button className="secondary" type="button" disabled={workingId === draft.id} onClick={() => void decide(draft.id, "reject")}>Reject</button>
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}

function canExecuteApproval(item: ApprovalQueueItem): boolean {
  return (item.execute.service === "comms" && item.execute.op === "sendEmail")
    || (item.execute.service === "crm" && item.execute.op === "createClient")
    || (item.execute.service === "intake" && item.execute.op === "provisionTenant");
}

function approvalPrimaryLabel(item: ApprovalQueueItem): string {
  if (item.execute.service === "comms" && item.execute.op === "sendEmail") {
    return "Approve & send";
  }
  if (item.execute.service === "crm" && item.execute.op === "createClient") {
    return "Approve & create";
  }
  if (item.execute.service === "intake" && item.execute.op === "provisionTenant") {
    return "Approve & provision";
  }
  return "Approve";
}

function approvalKindLabel(item: ApprovalQueueItem): string {
  return item.kind.replaceAll("_", " ");
}

function ApprovalQueuePanel(props: { tenantId: string }): React.ReactElement {
  const [items, setItems] = useState<ApprovalQueueItem[]>([]);
  const [status, setStatus] = useState("Loading approvals...");
  const [workingId, setWorkingId] = useState("");

  async function refresh(): Promise<void> {
    setStatus("Loading approvals...");
    try {
      const body = await fetch(`/api/approval-queue?tenantId=${encodeURIComponent(props.tenantId)}`)
        .then((response) => response.json() as Promise<ApprovalQueueResponse>);
      if (!body.ok) {
        setItems([]);
        setStatus(body.error ?? "Approval queue unavailable.");
        return;
      }
      const pending = body.items ?? [];
      setItems(pending);
      setStatus(pending.length ? `${pending.length} approval${pending.length === 1 ? "" : "s"} waiting.` : "No approvals are waiting right now.");
    } catch {
      setItems([]);
      setStatus("Approval queue API unreachable.");
    }
  }

  async function approve(item: ApprovalQueueItem): Promise<void> {
    setWorkingId(item.id);
    setStatus(canExecuteApproval(item) ? "Approving and running..." : "Approving...");
    try {
      const approved = await fetch(`/api/approval-queue/${encodeURIComponent(item.id)}/approve`, {
        method: "POST"
      }).then((response) => response.json() as Promise<ApprovalActionResponse>);
      if (!approved.ok) {
        setStatus(approved.error ?? "Approval failed.");
        return;
      }
      if (canExecuteApproval(item)) {
        const executed = await fetch(`/api/approval-queue/${encodeURIComponent(item.id)}/execute`, {
          method: "POST"
        }).then((response) => response.json() as Promise<ApprovalActionResponse>);
        setStatus(executed.ok ? "Approved and completed." : executed.error ?? "Approved, but running it failed.");
      } else {
        setStatus("Approved.");
      }
      await refresh();
    } catch {
      setStatus("Approval request failed.");
    } finally {
      setWorkingId("");
    }
  }

  async function reject(item: ApprovalQueueItem): Promise<void> {
    setWorkingId(item.id);
    setStatus("Rejecting...");
    try {
      const body = await fetch(`/api/approval-queue/${encodeURIComponent(item.id)}/reject`, {
        method: "POST"
      }).then((response) => response.json() as Promise<ApprovalActionResponse>);
      setStatus(body.ok ? "Rejected." : body.error ?? "Reject failed.");
      await refresh();
    } catch {
      setStatus("Reject request failed.");
    } finally {
      setWorkingId("");
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [props.tenantId]);

  return (
    <aside className="approval-card">
      <div className="schedule-heading">
        <div>
          <p className="eyebrow">ApprovalQueue</p>
          <h2>Approvals</h2>
        </div>
        <button className="refresh-button" type="button" onClick={() => void refresh()}>Refresh</button>
      </div>
      <p className="schedule-status">{status}</p>
      <div className="content-list">
        {items.map((item) => (
          <article className="content-draft approval-item" key={item.id}>
            <div className="content-draft-head">
              <span>{approvalKindLabel(item)}</span>
              <span>{item.createdBy}</span>
            </div>
            <h3>{item.preview.title}</h3>
            <p>{item.preview.body.split(/\n+/).filter(Boolean).slice(0, 3).join(" ")}</p>
            {item.preview.mediaRefs?.length ? (
              <div className="approval-attachments">
                {item.preview.mediaRefs.map((ref) => <span key={ref}>{ref}</span>)}
              </div>
            ) : null}
            <div className="content-actions">
              <button type="button" disabled={workingId === item.id} onClick={() => void approve(item)}>{approvalPrimaryLabel(item)}</button>
              <button className="secondary" type="button" disabled={workingId === item.id} onClick={() => void reject(item)}>Reject</button>
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}

function ReputationPanel(props: { tenantId: string; user: User }): React.ReactElement {
  const [reviews, setReviews] = useState<ReputationReview[]>([]);
  const [profiles, setProfiles] = useState<ReputationProfile[]>([]);
  const [status, setStatus] = useState("Loading review queue...");
  const [working, setWorking] = useState("");

  async function headers(): Promise<HeadersInit> {
    const token = await props.user.getIdToken();
    return { authorization: `Bearer ${token}`, "content-type": "application/json" };
  }

  async function refresh(): Promise<void> {
    setStatus("Loading review queue...");
    try {
      const body = await fetch(`/api/reputation/queue?tenantId=${encodeURIComponent(props.tenantId)}`, {
        headers: await headers()
      }).then((response) => response.json() as Promise<ReputationQueueResponse>);
      if (!body.ok) {
        setReviews([]);
        setProfiles([]);
        setStatus(body.error ?? "Review queue unavailable.");
        return;
      }
      setReviews(body.reviews ?? []);
      setProfiles(body.profiles ?? []);
      setStatus((body.reviews ?? []).length ? "Review replies stay parked until you approve them." : "No reviews are waiting right now.");
    } catch {
      setReviews([]);
      setProfiles([]);
      setStatus("Review queue API unreachable.");
    }
  }

  async function pollReviews(): Promise<void> {
    setWorking("poll");
    setStatus("Checking Google reviews...");
    try {
      const body = await fetch("/api/reputation/gbp/poll", {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ tenantId: props.tenantId })
      }).then((response) => response.json() as Promise<ReputationQueueResponse>);
      if (!body.ok) {
        setStatus(body.error ?? "Review check failed.");
        return;
      }
      const count = body.imported?.length ?? 0;
      setStatus(count ? `Imported ${count} review${count === 1 ? "" : "s"}.` : body.blocker ?? "No new reviews found.");
      await refresh();
    } catch {
      setStatus("Review check request failed.");
    } finally {
      setWorking("");
    }
  }

  async function draftReply(reviewId: string): Promise<void> {
    setWorking(reviewId);
    setStatus("Drafting reply...");
    try {
      const body = await fetch(`/api/reputation/reviews/${encodeURIComponent(reviewId)}/reply/draft`, {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ tenantId: props.tenantId })
      }).then((response) => response.json() as Promise<{ ok: boolean; error?: string }>);
      setStatus(body.ok ? "Reply drafted and parked for approval." : body.error ?? "Reply draft failed.");
      await refresh();
    } catch {
      setStatus("Reply draft request failed.");
    } finally {
      setWorking("");
    }
  }

  useEffect(() => {
    void refresh();
  }, [props.tenantId, props.user]);

  return (
    <aside className="content-card reputation-card">
      <div className="schedule-heading">
        <div>
          <p className="eyebrow">M7 Reputation</p>
          <h2>Reviews</h2>
        </div>
        <button className="refresh-button" type="button" disabled={working === "poll"} onClick={() => void pollReviews()}>
          Check reviews
        </button>
      </div>
      <p className="schedule-status">{status}</p>
      <div className="content-list">
        {reviews.map((review) => (
          <article className="content-draft" key={review.id}>
            <div className="content-draft-head">
              <span>{review.rating}/5 stars</span>
              <span>{new Date(review.reviewedAt).toLocaleDateString()}</span>
            </div>
            <h3>{review.authorName}</h3>
            <p>{review.comment || "No public review text."}</p>
            <p className="review-state">Reply: {review.replyStatus.replace("_", " ")}</p>
            <div className="content-actions">
              <button type="button" disabled={working === review.id || review.replyStatus === "drafted"} onClick={() => void draftReply(review.id)}>
                Draft reply
              </button>
            </div>
          </article>
        ))}
        {profiles.map((profile) => (
          <article className="content-draft" key={profile.id}>
            <div className="content-draft-head">
              <span>Profile update</span>
              <span>{profile.status.replace("_", " ")}</span>
            </div>
            <h3>{profile.locationId}</h3>
            <p>Google Business Profile changes are approval-gated before publishing.</p>
          </article>
        ))}
      </div>
    </aside>
  );
}

function AuthGate(props: { auth: Auth | null; user: User | null; authReady: boolean; onSignedIn: (user: User | null) => void }): React.ReactElement {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!props.auth || working) {
      return;
    }
    setWorking(true);
    setError("");
    try {
      const result = await signInWithEmailAndPassword(props.auth, email.trim(), password);
      props.onSignedIn(result.user);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Firebase sign-in failed.");
    } finally {
      setWorking(false);
    }
  }

  if (!props.authReady) {
    return (
      <main className="shell">
        <section className="auth-card">
          <p className="eyebrow">Nexi access</p>
          <h1>Checking session</h1>
          <p>Loading Firebase operator access.</p>
        </section>
      </main>
    );
  }

  if (!props.auth) {
    return (
      <main className="shell">
        <section className="auth-card">
          <p className="eyebrow">Nexi access</p>
          <h1>Firebase config missing</h1>
          <p>The chat is locked until the Firebase web config is present in staging runtime variables.</p>
        </section>
      </main>
    );
  }

  if (props.user) {
    return window.location.pathname.startsWith("/platform")
      ? <PlatformConsole auth={props.auth} user={props.user} />
      : <Chat auth={props.auth} user={props.user} />;
  }

  return (
    <main className="shell">
      <section className="auth-card">
        <p className="eyebrow">Aquatrace ops</p>
        <h1>Nexi Sign-In</h1>
        <p>Use your Firebase operator account to unlock the Job Desk.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button type="submit" disabled={working || !email.trim() || !password}>
            {working ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </section>
    </main>
  );
}

function PlatformConsole(props: { auth: Auth; user: User }): React.ReactElement {
  const [rows, setRows] = useState<PlatformTenantRow[]>([]);
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [status, setStatus] = useState("Loading platform console...");
  const [workingTenant, setWorkingTenant] = useState("");

  async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
    const token = await props.user.getIdToken();
    return fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      }
    });
  }

  async function refresh(): Promise<void> {
    setStatus("Loading platform console...");
    try {
      const [tenantBody, planBody] = await Promise.all([
        authedFetch("/api/platform/tenants").then((response) => response.json() as Promise<PlatformTenantResponse>),
        authedFetch("/api/platform/plans").then((response) => response.json() as Promise<PlatformPlansResponse>)
      ]);
      if (!tenantBody.ok || !planBody.ok) {
        setStatus(tenantBody.error ?? planBody.error ?? "Platform console unavailable.");
        return;
      }
      setRows(tenantBody.tenants ?? []);
      setPlans(planBody.plans ?? []);
      setStatus("");
    } catch {
      setStatus("Platform console could not reach the server.");
    }
  }

  async function runBackup(tenantId: string): Promise<void> {
    setWorkingTenant(tenantId);
    setStatus(`Running backup for ${tenantId}...`);
    try {
      const body = await authedFetch(`/api/platform/tenants/${encodeURIComponent(tenantId)}/backups/run`, { method: "POST", body: "{}" })
        .then((response) => response.json() as Promise<{ ok: boolean; backup?: { storageRef: string }; error?: string }>);
      setStatus(body.ok ? `Backup saved: ${body.backup?.storageRef ?? "storage file"}` : body.error ?? "Backup failed.");
      await refresh();
    } catch {
      setStatus("Backup request failed.");
    } finally {
      setWorkingTenant("");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <main className="shell platform-shell">
      <section className="platform-hero">
        <div>
          <p className="eyebrow">M13 Platform</p>
          <h1>Tenant Command Center</h1>
          <p className="signed-in">{props.user.email ?? "Platform operator"}</p>
        </div>
        <button className="sign-out" type="button" onClick={() => void signOut(props.auth)}>Sign out</button>
      </section>

      <section className="plan-grid">
        {plans.map((plan) => (
          <article className="plan-card" key={plan.id}>
            <p className="eyebrow">{plan.id}</p>
            <h2>{plan.name}</h2>
            <p className="plan-price">${plan.monthlyUsd}/mo</p>
            <p>{plan.modules.join(", ")}</p>
          </article>
        ))}
      </section>

      {status ? <p className="schedule-status">{status}</p> : null}

      <section className="tenant-table">
        {rows.map((row) => (
          <article className="tenant-row" key={row.tenant.id}>
            <div>
              <p className="eyebrow">{row.tenant.id}</p>
              <h2>{row.tenant.name}</h2>
              <p>{row.plan.name} plan · {row.subscription?.status ?? "no subscription"} · ${row.cost.estimatedCostUsd.toFixed(4)} tracked</p>
            </div>
            <div className="adapter-pills">
              {row.adapterStatuses.map((adapter) => (
                <span className={adapter.ok ? "pill ok" : "pill warn"} key={adapter.adapter}>
                  {adapter.adapter}: {adapter.configured ? adapter.provider : "not set"}
                </span>
              ))}
            </div>
            <div className="tenant-actions">
              <a href={`/api/platform/tenants/${encodeURIComponent(row.tenant.id)}/export`} target="_blank" rel="noreferrer">Export</a>
              <button type="button" disabled={workingTenant === row.tenant.id} onClick={() => void runBackup(row.tenant.id)}>
                {workingTenant === row.tenant.id ? "Backing up..." : "Run backup"}
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function Chat(props: { auth: Auth; user: User }): React.ReactElement {
  const [operatorContext, setOperatorContext] = useState<OperatorContext>(() => fallbackOperatorContext(props.user));
  const [operatorTheme, setOperatorTheme] = useState<OperatorUiTheme | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Nexi Job Desk is ready. Ask about schedule, job details, photos, or the Camp Mikell SiteJobBlueprint.",
      sources: []
    }
  ]);
  const [draft, setDraft] = useState("");
  const [conversationId] = useState(() => `web-${crypto.randomUUID()}`);
  const [working, setWorking] = useState(false);
  const [health, setHealth] = useState<"checking" | "green" | "red">("checking");
  const [activeMedia, setActiveMedia] = useState<Source | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Voice off");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceSessionId, setVoiceSessionId] = useState<string | null>(null);
  const [lastVoiceLatencyMs, setLastVoiceLatencyMs] = useState<number | null>(null);
  const [uploadTarget, setUploadTarget] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const handsFreeRef = useRef(false);
  const voiceSessionRef = useRef<string | null>(null);
  const voiceWindow = window as VoiceWindow;
  const SpeechRecognition = voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
  const speechSupported = Boolean(SpeechRecognition);

  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  useEffect(() => {
    voiceSessionRef.current = voiceSessionId;
  }, [voiceSessionId]);

  useEffect(() => {
    let cancelled = false;
    loadOperatorContext(props.user)
      .then((context) => {
        if (!cancelled) {
          setOperatorContext(context);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOperatorContext(fallbackOperatorContext(props.user));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [props.user]);

  useEffect(() => {
    let cancelled = false;
    props.user.getIdToken()
      .then((idToken) => fetch(`/api/sites/operator-ui?tenantId=${encodeURIComponent(operatorContext.tenantId)}`, {
        headers: { authorization: `Bearer ${idToken}` }
      }))
      .then((response) => response.json() as Promise<OperatorUiThemeResponse>)
      .then((body) => {
        if (!cancelled && body.ok && body.theme) {
          setOperatorTheme(body.theme);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOperatorTheme(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [operatorContext.tenantId, props.user]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((response) => response.json() as Promise<{ ok?: boolean }>)
      .then((body) => {
        if (!cancelled) {
          setHealth(body.ok ? "green" : "red");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHealth("red");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    audioRef.current?.pause();
    ttsAbortRef.current?.abort();
  }, []);

  async function startVoiceSession(): Promise<string | null> {
    if (voiceSessionRef.current) {
      return voiceSessionRef.current;
    }
    try {
      const response = await fetch("/api/voice/session/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          tenantUserId: operatorContext.tenantUserId
        })
      });
      const body = await response.json() as VoiceSessionResponse;
      if (!body.ok || !body.session) {
        throw new Error(body.error ?? "Voice session did not start.");
      }
      setVoiceSessionId(body.session.id);
      voiceSessionRef.current = body.session.id;
      return body.session.id;
    } catch {
      setVoiceStatus("Voice session did not start. Basic voice still works.");
      return null;
    }
  }

  async function updateVoiceSession(path: string, body?: unknown): Promise<void> {
    const sessionId = voiceSessionRef.current;
    if (!sessionId) {
      return;
    }
    await fetch(`/api/voice/session/${encodeURIComponent(sessionId)}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? "{}" : JSON.stringify(body)
    }).catch(() => undefined);
  }

  function stopVoicePlayback(): void {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setSpeaking(false);
  }

  async function interruptVoice(reason = "operator_started_talking"): Promise<void> {
    stopVoicePlayback();
    await updateVoiceSession("/interrupt", { reason });
    setVoiceStatus("Stopped. Listening.");
    if (handsFreeRef.current) {
      startDictation(true);
    }
  }

  async function speakAssistant(text: string): Promise<void> {
    if (!voiceEnabled || !text.trim()) {
      return;
    }
    setSpeaking(true);
    setVoiceStatus("Nexi is speaking");
    const startedAt = performance.now();
    const controller = new AbortController();
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = controller;
    try {
      audioRef.current?.pause();
      recognitionRef.current?.stop();
      const response = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: operatorContext.tenantId, text }),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error("TTS unavailable");
      }
      const audioBlob = await response.blob();
      const firstAudioLatencyMs = Math.round(performance.now() - startedAt);
      setLastVoiceLatencyMs(firstAudioLatencyMs);
      await updateVoiceSession("/turn", {
        firstAudioLatencyMs,
        estimatedCostUsd: Number(response.headers.get("x-voice-estimated-cost-usd") ?? 0),
        characterCount: Number(response.headers.get("x-voice-character-count") ?? 0),
        audioBytes: Number(response.headers.get("x-voice-audio-bytes") ?? audioBlob.size)
      });
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setSpeaking(false);
        ttsAbortRef.current = null;
        if (handsFreeRef.current) {
          void updateVoiceSession("/listen");
          setVoiceStatus("Listening for the next question");
          startDictation(true);
          return;
        }
        setVoiceStatus("Voice ready");
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setSpeaking(false);
        ttsAbortRef.current = null;
        setVoiceStatus("Voice playback failed");
      };
      await audio.play();
    } catch (error) {
      setSpeaking(false);
      ttsAbortRef.current = null;
      setVoiceStatus(error instanceof DOMException && error.name === "AbortError" ? "Stopped." : "Voice playback blocked");
    }
  }

  async function toggleVoice(): Promise<void> {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    setVoiceStatus(next ? "Voice ready" : "Voice off");
    if (!next) {
      stopVoicePlayback();
      recognitionRef.current?.stop();
      setListening(false);
      setHandsFree(false);
      setInterimTranscript("");
      setSpeaking(false);
      return;
    }
    await startVoiceSession();
  }

  async function toggleHandsFree(): Promise<void> {
    if (handsFree) {
      setHandsFree(false);
      handsFreeRef.current = false;
      recognitionRef.current?.stop();
      setListening(false);
      setInterimTranscript("");
      setVoiceStatus("Hands-free paused.");
      return;
    }
    if (!speechSupported) {
      setVoiceStatus("Mic not supported here");
      return;
    }
    setVoiceEnabled(true);
    setHandsFree(true);
    handsFreeRef.current = true;
    await startVoiceSession();
    startDictation(true);
  }

  function startDictation(fullDuplex = false): void {
    if (!SpeechRecognition || listening) {
      setVoiceStatus("Mic not supported here");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = fullDuplex;
    recognition.interimResults = fullDuplex;
    recognition.onresult = (event) => {
      const startIndex = event.resultIndex ?? 0;
      const finalParts: string[] = [];
      const interimParts: string[] = [];
      for (let index = startIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim() ?? "";
        if (!transcript) {
          continue;
        }
        if (result?.isFinal || !fullDuplex) {
          finalParts.push(transcript);
        } else {
          interimParts.push(transcript);
        }
      }
      setInterimTranscript(interimParts.join(" "));
      const transcript = finalParts.join(" ").trim();
      if (!transcript) {
        return;
      }
      if (fullDuplex) {
        recognition.stop();
        setListening(false);
        setInterimTranscript("");
        setVoiceStatus("Heard you. Checking now.");
        void sendTextMessage(transcript);
        return;
      }
      setDraft((current) => [current, transcript].filter(Boolean).join(" ").trim());
      setVoiceStatus("Dictation captured");
    };
    recognition.onerror = () => {
      setListening(false);
      setVoiceStatus("Mic capture failed");
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setListening(true);
    setVoiceStatus("Listening");
    recognition.start();
  }

  async function sendTextMessage(rawText: string): Promise<void> {
    const text = rawText.trim();
    if (!text || working) {
      return;
    }
    setDraft("");
    setWorking(true);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text, sources: [] }]);
    try {
      const idToken = await props.user.getIdToken();
      const response = await fetch("/api/nexi/message", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ tenantId: operatorContext.tenantId, conversationId, message: text })
      });
      const body = await response.json() as NexiResponse;
      const assistantText = body.ok ? body.answer ?? "I do not have an answer yet." : body.error ?? "Nexi could not answer that.";
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: assistantText,
          sources: body.sources ?? []
        }
      ]);
      void speakAssistant(assistantText);
    } catch {
      const fallback = "Nexi could not reach the authenticated Job Desk API.";
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: fallback, sources: [] }
      ]);
      void speakAssistant(fallback);
    } finally {
      setWorking(false);
    }
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await sendTextMessage(draft);
  }

  async function uploadJobDeskFile(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file || uploading) {
      return;
    }
    const linkTarget = uploadTarget.trim().slice(0, 120);
    setUploading(true);
    setUploadStatus(`Uploading ${file.name}...`);
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        text: `Upload ${file.name}${linkTarget ? ` for ${linkTarget}` : ""}`,
        sources: []
      }
    ]);
    try {
      const fileBase64 = await fileToBase64(file);
      const mime = file.type || "application/octet-stream";
      const isImage = mime.startsWith("image/");
      const response = await fetch("/api/fielddocs/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          ...(linkTarget ? { jobId: linkTarget } : {}),
          filename: file.name,
          mime,
          fileBase64,
          tags: ["job-desk-upload", ...(linkTarget ? [`linked:${linkTarget}`] : [])],
          ...(isImage ? { imageBase64: fileBase64, imageMime: mime } : {})
        })
      });
      const body = await response.json() as UploadMediaResponse;
      if (!response.ok || !body.ok || !body.media) {
        throw new Error(body.error ?? "Upload failed");
      }
      const mediaSource: Source = {
        rail: "native",
        ref: body.media.id,
        label: `Uploaded ${body.media.type} ${file.name}`
      };
      const assistantText = linkTarget
        ? `Uploaded ${file.name} and linked it to ${linkTarget}.`
        : `Uploaded ${file.name} to the Job Desk media file.`;
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: assistantText,
          sources: [mediaSource]
        }
      ]);
      setUploadStatus("Upload saved.");
      void speakAssistant(assistantText);
    } catch {
      const failure = "I couldn't upload that file yet. I wrote it down so we can fix the upload path instead of losing it.";
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: failure, sources: [] }]);
      setUploadStatus("Upload failed.");
      void speakAssistant(failure);
    } finally {
      setUploading(false);
    }
  }

  const themeStyle = operatorTheme ? {
    "--jobdesk-shell-background": operatorTheme.colors.shellBackground,
    "--jobdesk-panel-background": operatorTheme.colors.panelBackground,
    "--jobdesk-header-background": operatorTheme.colors.headerBackground,
    "--jobdesk-accent": operatorTheme.colors.accent,
    "--jobdesk-accent-text": operatorTheme.colors.accentText,
    "--jobdesk-user-bubble": operatorTheme.colors.userBubble,
    "--jobdesk-assistant-bubble": operatorTheme.colors.assistantBubble,
    "--jobdesk-text": operatorTheme.colors.text
  } as React.CSSProperties : undefined;

  return (
    <main className={`shell ops-shell density-${operatorTheme?.density ?? "comfortable"}`} style={themeStyle}>
      <div className="ops-grid">
      <section className="phone">
        <header className="topbar">
          <div>
            <p className="eyebrow">Aquatrace ops</p>
            <h1>Nexi Job Desk</h1>
            <p className="signed-in">{props.user.email ?? "Firebase operator"}</p>
          </div>
          <div className="top-actions">
            <span className={`health ${health}`} aria-label={`Health ${health}`} />
            <button className={`voice-toggle ${voiceEnabled ? "on" : ""}`} type="button" onClick={() => void toggleVoice()}>
              {voiceEnabled ? "Voice on" : "Enable voice"}
            </button>
            <button
              className={`voice-toggle ${handsFree ? "on" : ""}`}
              disabled={!speechSupported}
              type="button"
              onClick={() => void toggleHandsFree()}
            >
              {handsFree ? "Hands-free on" : "Hands-free"}
            </button>
            <button className="sign-out" type="button" onClick={() => void signOut(props.auth)}>Sign out</button>
          </div>
        </header>

        <div className="thread" aria-live="polite">
          {messages.map((message) => {
            const photoSources = message.sources.filter(sourceIsPhoto);
            const textSources = message.sources.filter((source) => !sourceIsPhoto(source));
            return (
            <article className={`bubble ${message.role}`} key={message.id}>
              <p>{message.text}</p>
              {photoSources.length > 0 ? (
                <div className="photo-strip" aria-label="Photos from this answer">
                  {photoSources.map((source) => (
                    <figure className="photo-tile" key={`${source.rail}:${source.ref}`}>
                      <button
                        aria-label={`Open full-size ${source.label}`}
                        className="photo-open"
                        type="button"
                        onClick={() => setActiveMedia(source)}
                      >
                        {sourceThumb(source)}
                      </button>
                      <figcaption className="photo-caption">
                        <span>{source.label}</span>
                        <a href={mediaDownloadUrl(source)} download={mediaDownloadName(source)}>
                          Save
                        </a>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : null}
              {textSources.length > 0 ? (
                <div className="sources">
                  {textSources.map((source) => (
                    <span className="source" key={`${source.rail}:${source.ref}`}>
                      <span>{source.label}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          );
          })}
          {working ? <div className="typing">Nexi is checking...</div> : null}
        </div>

        <div className="voice-strip" aria-live="polite">
          <span className={`voice-dot ${listening ? "listening" : speaking ? "speaking" : voiceEnabled ? "ready" : ""}`} />
          <span>{voiceStatus}</span>
          {lastVoiceLatencyMs !== null ? <span className="latency-chip">audio start {(lastVoiceLatencyMs / 1000).toFixed(1)}s</span> : null}
          {interimTranscript ? <span className="interim-text">"{interimTranscript}"</span> : null}
          {speaking ? (
            <button className="voice-action" type="button" onClick={() => void interruptVoice()}>
              Stop Nexi
            </button>
          ) : null}
          {!speechSupported ? <span className="voice-note">Speech input unsupported in this browser</span> : null}
        </div>

        <div className="upload-strip" aria-live="polite">
          <label className={`upload-button ${uploading ? "disabled" : ""}`}>
            <span>{uploading ? "Uploading..." : "Attach photo"}</span>
            <input
              accept="image/*,video/*,application/pdf"
              disabled={uploading}
              type="file"
              onChange={(event) => void uploadJobDeskFile(event)}
            />
          </label>
          <input
            aria-label="Optional job or client link for upload"
            className="upload-target"
            disabled={uploading}
            placeholder="Job/client link"
            value={uploadTarget}
            onChange={(event) => setUploadTarget(event.target.value)}
          />
          {uploadStatus ? <span className="upload-status">{uploadStatus}</span> : null}
        </div>

        <form className="composer" onSubmit={sendMessage}>
          <button
            aria-label="Dictate message"
            className={`mic ${listening ? "active" : ""}`}
            disabled={!speechSupported || working}
            type="button"
            onClick={() => {
              if (speaking) {
                void interruptVoice();
                return;
              }
              startDictation(handsFree);
            }}
          >
            {speaking ? "Stop" : "Mic"}
          </button>
          <input
            aria-label="Message Nexi"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask: What is on today's schedule?"
          />
          <button type="submit" disabled={working || !draft.trim()}>Send</button>
        </form>
      </section>
      <div className="side-panels">
        <SchedulePanel tenantId={operatorContext.tenantId} />
        <ApprovalQueuePanel tenantId={operatorContext.tenantId} />
        <ContentQueuePanel tenantId={operatorContext.tenantId} />
        <ReputationPanel tenantId={operatorContext.tenantId} user={props.user} />
      </div>
      </div>
      {activeMedia ? (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={activeMedia.label} onClick={() => setActiveMedia(null)}>
          <div className="lightbox-card" onClick={(event) => event.stopPropagation()}>
            <img src={mediaUrl(activeMedia)} alt={activeMedia.label} />
            <div className="lightbox-actions">
              <a href={mediaDownloadUrl(activeMedia)} download={mediaDownloadName(activeMedia)}>
                Save full-size
              </a>
              <button type="button" onClick={() => setActiveMedia(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function App(): React.ReactElement {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    loadFirebaseAuth()
      .then((nextAuth) => {
        if (cancelled) {
          return;
        }
        setAuth(nextAuth);
        if (!nextAuth) {
          setAuthReady(true);
          return;
        }
        unsubscribe = onAuthStateChanged(nextAuth, (nextUser) => {
          setUser(nextUser);
          setAuthReady(true);
        });
      })
      .catch(() => {
        if (!cancelled) {
          setAuthReady(true);
        }
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return <AuthGate auth={auth} user={user} authReady={authReady} onSignedIn={setUser} />;
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
