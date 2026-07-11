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

type ContactChannel = "email" | "sms" | "both" | "none";
type SmsCapability = "mobile" | "landline" | "fax" | "invalid" | "unknown";

interface CrmPhone {
  label: "Main" | "Work" | "Mobile" | "Home" | "Fax" | "Other";
  value: string;
  primary?: boolean;
  receivesMessages?: boolean;
  smsCapability?: SmsCapability;
  smsMode?: "one_way" | "two_way";
}

interface CrmEmail {
  label: "Main" | "Work" | "Personal" | "Other";
  value: string;
  primary?: boolean;
}

interface CrmContact {
  personName?: { title?: string; firstName?: string; lastName?: string };
  company?: string;
  role?: string;
  billingContact?: boolean;
  correspondenceContact?: boolean;
  phones?: CrmPhone[];
  emails?: CrmEmail[];
  channelPreference?: ContactChannel;
}

interface CrmAddress {
  street1: string;
  street2?: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

interface CrmClient {
  id: string;
  tenantId: string;
  name: string;
  company?: string;
  personName?: { title?: string; firstName?: string; lastName?: string };
  displayNamePreference?: "person" | "company";
  billingAddress?: CrmAddress;
  billingSameAsPrimaryProperty?: boolean;
  contacts?: CrmContact[];
  communicationSettings?: {
    quotesAndInvoices: ContactChannel;
    jobReminders: ContactChannel;
    jobClosureFollowUps: ContactChannel;
    reviewRequests: ContactChannel;
    smsDefaultMode: "one_way" | "two_way";
  };
  emails: string[];
  phones: string[];
  tags?: string[];
  consent: { email: boolean; sms: boolean };
  customFields?: Record<string, string | number | boolean>;
}

interface CrmProperty {
  id: string;
  tenantId: string;
  clientId: string;
  parentSiteId?: string;
  siteName?: string;
  label?: string;
  address: CrmAddress;
  billingAddressSameAsClient?: boolean;
  access?: {
    gateCode?: string;
    accessNotes?: string;
  };
  contacts?: CrmContact[];
  assets?: Array<{ id: string; kind: string; label: string; fields: Record<string, string | number | boolean> }>;
  customFields?: Record<string, string | number | boolean>;
  externalIds?: { jobber?: string };
}

interface CrmJob {
  id: string;
  tenantId: string;
  clientId: string;
  propertyId?: string;
  status: "lead" | "quoted" | "scheduled" | "in_progress" | "complete" | "invoiced" | "paid";
  title: string;
  startAt?: string;
  endAt?: string;
  lineItems?: Array<{ id: string; code: string; name: string; quantity: number; unitPrice: number; total: number }>;
  totals?: { subtotal: number; tax: number; total: number };
  externalIds?: { jobber?: string };
}

interface CrmQuote {
  id: string;
  tenantId: string;
  clientId: string;
  jobId?: string;
  status: string;
  title: string;
  totals: { subtotal: number; tax: number; total: number };
}

interface CrmInvoice {
  id: string;
  tenantId: string;
  clientId: string;
  jobId?: string;
  quoteId?: string;
  status: string;
  title: string;
  totals: { subtotal: number; tax: number; total: number };
}

interface CrmClientsResponse {
  ok: boolean;
  clients?: CrmClient[];
  error?: string;
}

interface CrmRecordsResponse {
  ok: boolean;
  properties?: CrmProperty[];
  jobs?: CrmJob[];
  quotes?: CrmQuote[];
  invoices?: CrmInvoice[];
  error?: string;
}

interface CrmClientCreateResponse {
  ok: boolean;
  client?: CrmClient;
  property?: CrmProperty;
  error?: string;
}

interface JobberSyncResponse {
  ok: boolean;
  mode?: "dry-run" | "write";
  counts?: { clients: number; properties: number; jobs: number };
  externalIdsPreserved?: { clients: number; properties: number; jobs: number };
  nativeWriteCounts?: { clients: number; properties: number; jobs: number };
  sampledAt?: string;
  error?: string;
}

interface FieldDocsTemplateItem {
  label: string;
  section: string;
  memory: "property" | "visit";
  required?: boolean;
}

interface FieldDocsTemplate {
  id: string;
  title: string;
  sections: string[];
  itemCount: number;
  propertyPersistentCount: number;
  visitFreshCount: number;
  items: FieldDocsTemplateItem[];
}

interface FieldDocsTemplatesResponse {
  ok: boolean;
  templates?: FieldDocsTemplate[];
  error?: string;
}

interface FieldDocsChecklistResponse {
  ok: boolean;
  checklist?: {
    id: string;
    title: string;
    items: Array<{ id: string; label: string; section?: string; memory?: "property" | "visit"; status: string }>;
  };
  error?: string;
}

interface FieldDocsSearchResponse {
  ok: boolean;
  hits?: Array<{
    id: string;
    type: "photo" | "video" | "pdf";
    jobId?: string;
    storageRef: string;
    thumbRef?: string;
    aiTags: string[];
    aiCaption?: string;
  }>;
  error?: string;
}

interface FieldDocsReportResponse {
  ok: boolean;
  report?: { id: string; title: string; pdfRef: string; status: string };
  pdfUrl?: string;
  error?: string;
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
  updatedBy?: string;
  updatedAt: string;
}

interface OperatorUiThemeResponse {
  ok: boolean;
  theme?: OperatorUiTheme;
  error?: string;
}

interface TenantBranding {
  tenantId: string;
  displayName: string;
  logo?: {
    storageRef?: string;
    mediaId?: string;
    url?: string;
    mimeType?: "image/png" | "image/jpeg" | "image/webp";
    alt?: string;
    updatedAt?: string;
  };
  colors: {
    primary?: string;
    secondary?: string;
    accent?: string;
    accentText?: string;
    background?: string;
    surface?: string;
    text?: string;
    mutedText?: string;
    userBubble?: string;
    assistantBubble?: string;
  };
  fontFamily?: string;
  source: "default" | "manual" | "extracted";
  updatedBy: string;
  updatedAt: string;
}

interface TenantBrandingResponse {
  ok: boolean;
  branding?: TenantBranding;
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
const AQUATRACE_LOGO_FALLBACK = "/tenants/aquatrace/aquatrace-banner-logo.png";
const NEXTEAM_ICON_SRC = "/assets/brand/nexteam-icon.png";
const NEXTEAM_WORDMARK_SRC = "/assets/brand/nexteam-wordmark.png";

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
  if (/\b(pdf|document|report)\b/.test(label)) {
    return false;
  }
  return (source.rail === "companycam" && label.includes("photo"))
    || (source.rail === "native" && /\b(photo|media|before|after|upload)/.test(label));
}

function mediaDownloadName(source: Source): string {
  return `${source.rail}-${source.ref.replace(/[^a-z0-9_-]/gi, "_")}.jpg`;
}

function tenantLogoSrc(branding: TenantBranding | null, tenantId: string): string | null {
  if (branding?.logo?.url) {
    return branding.logo.url;
  }
  if (branding?.logo?.mediaId) {
    return `/api/media/${encodeURIComponent(branding.logo.mediaId)}?tenantId=${encodeURIComponent(tenantId)}`;
  }
  if (tenantId === DEFAULT_TENANT_ID) {
    return AQUATRACE_LOGO_FALLBACK;
  }
  return null;
}

function TenantBrandMark(props: { branding: TenantBranding | null; tenantId: string }): React.ReactElement {
  const displayName = props.branding?.displayName ?? (props.tenantId === DEFAULT_TENANT_ID ? "Aquatrace" : props.tenantId);
  const logoSrc = tenantLogoSrc(props.branding, props.tenantId);
  if (logoSrc) {
    return <img alt={props.branding?.logo?.alt ?? `${displayName} logo`} className="tenant-logo" src={logoSrc} />;
  }
  return <div className="tenant-wordmark" aria-label={`${displayName} logo placeholder`}>{displayName}</div>;
}

function NexTeamLockup(props: { className?: string; compact?: boolean }): React.ReactElement {
  return (
    <div className={`nexteam-lockup ${props.compact ? "compact" : ""} ${props.className ?? ""}`.trim()} aria-label="NexTeam Studio">
      <img className="nexteam-lockup-icon" src={NEXTEAM_ICON_SRC} alt="" aria-hidden="true" />
      {!props.compact ? <img className="nexteam-lockup-wordmark" src={NEXTEAM_WORDMARK_SRC} alt="NexTeam Studio" /> : null}
    </div>
  );
}

function isOwnerCustomizedOperatorTheme(theme: OperatorUiTheme | null): theme is OperatorUiTheme {
  return Boolean(theme && theme.updatedBy && theme.updatedBy !== "system");
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

function personDisplayName(person?: { firstName?: string; lastName?: string }): string {
  return [person?.firstName, person?.lastName].filter(Boolean).join(" ").trim();
}

function clientDisplayName(client: CrmClient): string {
  const personName = personDisplayName(client.personName);
  if (client.company && client.displayNamePreference !== "person") {
    return client.company;
  }
  return personName || client.name;
}

function formatAddress(address?: CrmAddress): string {
  if (!address) {
    return "";
  }
  return [
    address.street1,
    address.street2,
    [address.city, address.province, address.postalCode].filter(Boolean).join(", ")
  ].filter(Boolean).join(", ");
}

function clientPrimaryAddress(client: CrmClient): string {
  const billingAddress = formatAddress(client.billingAddress);
  if (billingAddress) {
    return billingAddress;
  }
  return client.billingSameAsPrimaryProperty === false ? "Separate billing address" : "No address on native record yet";
}

function clientStatusLabel(client: CrmClient): string {
  return client.tags?.some((tag) => tag.toLowerCase() === "lead") ? "Lead" : "Active";
}

function channelLabel(channel: ContactChannel | undefined): string {
  if (channel === "both") {
    return "Email + one-way text";
  }
  if (channel === "sms") {
    return "One-way text";
  }
  if (channel === "none") {
    return "Off";
  }
  return "Email";
}

function smsEligibilityLabel(phone: CrmPhone): string {
  if (!phone.receivesMessages) {
    return "Text off";
  }
  if (phone.smsCapability === "mobile") {
    return phone.smsMode === "two_way" ? "Text on, two-way" : "Text on, one-way";
  }
  if (phone.smsCapability === "landline" || phone.smsCapability === "fax" || phone.smsCapability === "invalid") {
    return "Needs prompt before text";
  }
  return "Text on, confirm mobile";
}

function contactSummary(client: CrmClient): string {
  const primaryContact = client.contacts?.find((contact) => contact.correspondenceContact || contact.billingContact) ?? client.contacts?.[0];
  const name = personDisplayName(primaryContact?.personName) || primaryContact?.company || personDisplayName(client.personName);
  const email = primaryContact?.emails?.find((entry) => entry.primary)?.value ?? primaryContact?.emails?.[0]?.value ?? client.emails[0];
  const phone = primaryContact?.phones?.find((entry) => entry.primary)?.value ?? primaryContact?.phones?.[0]?.value ?? client.phones[0];
  return [name, email, phone].filter(Boolean).join(" / ") || "No contact details yet";
}

function preferredChannelForClient(client: CrmClient): ContactChannel {
  const primaryContact = client.contacts?.find((contact) => contact.correspondenceContact || contact.billingContact) ?? client.contacts?.[0];
  return primaryContact?.channelPreference ?? (client.consent.email && client.consent.sms ? "both" : client.consent.sms ? "sms" : "email");
}

function NexOpsCrmPanel(props: { tenantId: string }): React.ReactElement {
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [status, setStatus] = useState("Loading NexOps clients...");

  async function refresh(): Promise<void> {
    setStatus("Loading NexOps clients...");
    try {
      const body = await fetch(`/api/crm/clients?tenantId=${encodeURIComponent(props.tenantId)}`)
        .then((response) => response.json() as Promise<CrmClientsResponse>);
      if (!body.ok) {
        setClients([]);
        setStatus(body.error ?? "NexOps CRM unavailable.");
        return;
      }
      const nextClients = body.clients ?? [];
      setClients(nextClients);
      setStatus(nextClients.length ? `${nextClients.length} client${nextClients.length === 1 ? "" : "s"} visible.` : "No native NexOps clients yet.");
    } catch {
      setClients([]);
      setStatus("NexOps CRM API unreachable.");
    }
  }

  useEffect(() => {
    void refresh();
    const onCrmMutation = () => void refresh();
    window.addEventListener("nexops:crm-mutated", onCrmMutation);
    return () => window.removeEventListener("nexops:crm-mutated", onCrmMutation);
  }, [props.tenantId]);

  const richRecords = clients.filter((client) => (client.contacts?.length ?? 0) > 0 || client.displayNamePreference || client.communicationSettings);
  const previewClients = clients.slice(0, 6);
  const selectedClient = previewClients[0];
  const totalContacts = clients.reduce((count, client) => count + (client.contacts?.length ?? 0), 0);
  const textReadyCount = clients.filter((client) => {
    const contact = client.contacts?.find((entry) => entry.correspondenceContact) ?? client.contacts?.[0];
    const phone = contact?.phones?.find((entry) => entry.receivesMessages) ?? contact?.phones?.[0];
    return phone?.receivesMessages && phone.smsCapability === "mobile";
  }).length;

  return (
    <aside className="nexops-card nexops-crm-workspace">
      <div className="nexops-topline">
        <div>
          <p className="eyebrow">NexOps</p>
          <h2>Clients</h2>
          <p>{status}</p>
        </div>
        <div className="nexops-actions" aria-label="Client actions">
          <button type="button">New client</button>
          <button type="button">CSV import</button>
          <button type="button">Jobber sync</button>
          <button type="button" onClick={() => void refresh()}>Refresh</button>
        </div>
      </div>

      <div className="nexops-metrics" aria-label="Client snapshot">
        <article>
          <span>Clients</span>
          <strong>{clients.length}</strong>
          <small>{richRecords.length} NexOps-ready</small>
        </article>
        <article>
          <span>Contacts</span>
          <strong>{totalContacts}</strong>
          <small>Parent correspondence</small>
        </article>
        <article>
          <span>Text-ready</span>
          <strong>{textReadyCount}</strong>
          <small>One-way unless upgraded</small>
        </article>
      </div>

      <div className="nexops-board">
        <section className="nexops-list-pane" aria-label="Client list">
          <div className="nexops-search-row">
            <input aria-label="Search clients" placeholder="Search clients, sites, phone, email" />
            <button type="button">Filter</button>
          </div>
          <div className="nexops-tabs" aria-label="Client filters">
            <button type="button" className="active">All</button>
            <button type="button">Needs review</button>
            <button type="button">Text setup</button>
          </div>
          <div className="nexops-client-list">
            {previewClients.map((client) => {
              const primaryContact = client.contacts?.find((contact) => contact.correspondenceContact || contact.billingContact) ?? client.contacts?.[0];
              const primaryPhone = primaryContact?.phones?.find((phone) => phone.primary) ?? primaryContact?.phones?.[0];
              return (
                <article className="nexops-client-row" key={client.id}>
                  <div>
                    <h3>{clientDisplayName(client)}</h3>
                    <p>{contactSummary(client)}</p>
                  </div>
                  <span>{primaryPhone ? smsEligibilityLabel(primaryPhone) : client.consent.sms ? "Confirm mobile" : "Email only"}</span>
                </article>
              );
            })}
            {!previewClients.length ? (
              <article className="nexops-empty-list">
                <h3>No native clients loaded yet</h3>
                <p>Import by CSV for any tenant, or sync Aquatrace from Jobber read-only API when staging is ready.</p>
              </article>
            ) : null}
          </div>
        </section>

        <section className="nexops-detail-pane" aria-label="Client detail preview">
          <div className="nexops-detail-header">
            <div>
              <p className="eyebrow">{selectedClient ? "Client record" : "CRM workspace"}</p>
              <h3>{selectedClient ? clientDisplayName(selectedClient) : "Client detail will open here"}</h3>
              <p>{selectedClient ? contactSummary(selectedClient) : "Built around parent client, sites, contacts, work, billing, and files."}</p>
            </div>
            <button type="button">Edit</button>
          </div>

          <div className="nexops-detail-sections">
            <article>
              <h4>Primary contact</h4>
              <p>{selectedClient ? channelLabel(preferredChannelForClient(selectedClient)) : "Email, text, or both per client. SMS prompts when number type is unknown."}</p>
            </article>
            <article>
              <h4>Properties & sites</h4>
              <p>{selectedClient ? "Site hierarchy ready for parent client -> site -> address." : "Supports named site/facility plus address. Billing can stay on parent client."}</p>
            </article>
            <article>
              <h4>Work overview</h4>
              <p>Requests, quotes, jobs, invoices, and visit history will roll up here.</p>
            </article>
            <article>
              <h4>Billing</h4>
              <p>Parent billing contact by default, separate billing address when unchecked.</p>
            </article>
            <article>
              <h4>Files & media</h4>
              <p>NexShot photos, PDFs, reports, and uploads attach to client/site/job.</p>
            </article>
            <article>
              <h4>Import status</h4>
              <p>{clients.length ? `${clients.length} native records loaded.` : "CSV and Jobber API import are next receipt paths."}</p>
            </article>
          </div>
        </section>
      </div>
    </aside>
  );
}

type NexOpsModule = "home" | "clients" | "requests" | "quotes" | "schedule" | "jobs" | "invoices" | "payments" | "imports" | "approvals" | "settings";

const NEXOPS_MODULES: Array<{ id: NexOpsModule; label: string; path: string }> = [
  { id: "home", label: "Home", path: "/nexops" },
  { id: "clients", label: "Clients", path: "/nexops/clients" },
  { id: "requests", label: "Requests", path: "/nexops/requests" },
  { id: "quotes", label: "Quotes", path: "/nexops/quotes" },
  { id: "schedule", label: "Schedule", path: "/nexops/schedule" },
  { id: "jobs", label: "Jobs", path: "/nexops/jobs" },
  { id: "invoices", label: "Invoices", path: "/nexops/invoices" },
  { id: "payments", label: "Payments", path: "/nexops/payments" },
  { id: "imports", label: "Import & Sync", path: "/nexops/imports" },
  { id: "approvals", label: "Approvals", path: "/nexops/approvals" },
  { id: "settings", label: "Settings", path: "/nexops/settings" }
];

function nexOpsModuleFromPath(pathname: string): NexOpsModule {
  const match = NEXOPS_MODULES.find((module) => pathname === module.path || pathname.startsWith(`${module.path}/`));
  return match?.id ?? "home";
}

function parseCsvPreview(text: string): { rows: number; columns: string[] } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = lines[0] ?? "";
  return {
    rows: Math.max(0, lines.length - 1),
    columns: header ? header.split(",").map((column) => column.trim()).filter(Boolean) : []
  };
}

function NexOpsClientsPage(props: { auth: Auth; user: User }): React.ReactElement {
  const [operatorContext, setOperatorContext] = useState<OperatorContext>(() => fallbackOperatorContext(props.user));
  const [tenantBranding, setTenantBranding] = useState<TenantBranding | null>(null);
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [properties, setProperties] = useState<CrmProperty[]>([]);
  const [jobs, setJobs] = useState<CrmJob[]>([]);
  const [quotes, setQuotes] = useState<CrmQuote[]>([]);
  const [invoices, setInvoices] = useState<CrmInvoice[]>([]);
  const [status, setStatus] = useState("Loading clients...");
  const [query, setQuery] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [activeModule, setActiveModule] = useState<NexOpsModule>(() => nexOpsModuleFromPath(window.location.pathname));
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [createStatus, setCreateStatus] = useState("");
  const [csvStatus, setCsvStatus] = useState("No CSV selected yet.");
  const [jobberSyncStatus, setJobberSyncStatus] = useState("Run a dry-run first to confirm real Jobber counts before writing native NexOps records.");
  const [newClient, setNewClient] = useState({
    title: "No title",
    firstName: "",
    lastName: "",
    company: "",
    role: "",
    displayNamePreference: "person" as "person" | "company",
    phone: "",
    phoneLabel: "Main" as CrmPhone["label"],
    phoneReceivesMessages: false,
    smsCapability: "unknown" as SmsCapability,
    email: "",
    emailLabel: "Main" as CrmEmail["label"],
    paymentTerms: "",
    askForReview: true,
    clientCustomFieldName: "",
    clientCustomFieldValue: "",
    additionalContactName: "",
    additionalContactRole: "",
    additionalContactPhone: "",
    additionalContactEmail: "",
    siteName: "",
    street1: "",
    street2: "",
    city: "",
    province: "",
    postalCode: "",
    billingSameAsPrimaryProperty: true,
    billingStreet1: "",
    billingStreet2: "",
    billingCity: "",
    billingProvince: "",
    billingPostalCode: "",
    leadSource: "",
    propertyGatedEntry: false,
    propertyGateCodes: "",
    propertyClientName: "",
    propertyClientPhone: "",
    propertyClientEmail: "",
    companyCamProject: "",
    propertyCustomFieldName: "",
    propertyCustomFieldValue: ""
  });

  async function refreshRelatedRecords(tenantId = operatorContext.tenantId): Promise<void> {
    try {
      const [propertiesBody, jobsBody, quotesBody, invoicesBody] = await Promise.all([
        fetch(`/api/crm/properties?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmRecordsResponse>),
        fetch(`/api/crm/jobs?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmRecordsResponse>),
        fetch(`/api/crm/quotes?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmRecordsResponse>),
        fetch(`/api/crm/invoices?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmRecordsResponse>)
      ]);
      setProperties(propertiesBody.ok ? propertiesBody.properties ?? [] : []);
      setJobs(jobsBody.ok ? jobsBody.jobs ?? [] : []);
      setQuotes(quotesBody.ok ? quotesBody.quotes ?? [] : []);
      setInvoices(invoicesBody.ok ? invoicesBody.invoices ?? [] : []);
    } catch {
      setProperties([]);
      setJobs([]);
      setQuotes([]);
      setInvoices([]);
    }
  }

  async function refresh(): Promise<void> {
    setStatus("Loading clients...");
    try {
      const body = await fetch(`/api/crm/clients?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
        .then((response) => response.json() as Promise<CrmClientsResponse>);
      if (!body.ok) {
        setClients([]);
        setStatus(body.error ?? "Clients are unavailable right now.");
        return;
      }
      const nextClients = body.clients ?? [];
      setClients(nextClients);
      await refreshRelatedRecords(operatorContext.tenantId);
      setSelectedClientId((current) => {
        if (current && nextClients.some((client) => client.id === current)) {
          return current;
        }
        return nextClients[0]?.id ?? "";
      });
      setStatus(nextClients.length ? `${nextClients.length} native NexOps client${nextClients.length === 1 ? "" : "s"} loaded.` : "No native NexOps clients yet.");
    } catch {
      setClients([]);
      setProperties([]);
      setJobs([]);
      setQuotes([]);
      setInvoices([]);
      setStatus("Clients API unreachable.");
    }
  }

  function setModule(module: NexOpsModule): void {
    const target = NEXOPS_MODULES.find((entry) => entry.id === module) ?? NEXOPS_MODULES[0];
    setActiveModule(module);
    window.history.pushState({}, "", target.path);
  }

  async function createClientFromForm(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setCreateStatus("Creating client...");
    const personName = {
      ...(newClient.title && newClient.title !== "No title" ? { title: newClient.title } : {}),
      firstName: newClient.firstName.trim(),
      lastName: newClient.lastName.trim()
    };
    const company = newClient.company.trim();
    const displayName = company && newClient.displayNamePreference === "company"
      ? company
      : personDisplayName(personName) || company;
    if (!displayName) {
      setCreateStatus("Add a client name or company name first.");
      return;
    }
    const phoneValue = newClient.phone.trim();
    const emailValue = newClient.email.trim();
    const contact: CrmContact = {
      personName,
      ...(company ? { company } : {}),
      ...(newClient.role.trim() ? { role: newClient.role.trim() } : {}),
      correspondenceContact: true,
      billingContact: true,
      phones: phoneValue ? [{
        label: newClient.phoneLabel,
        value: phoneValue,
        primary: true,
        receivesMessages: newClient.phoneReceivesMessages,
        smsCapability: newClient.smsCapability,
        smsMode: "one_way"
      }] : [],
      emails: emailValue ? [{
        label: newClient.emailLabel,
        value: emailValue,
        primary: true
      }] : [],
      channelPreference: emailValue && newClient.phoneReceivesMessages ? "both" : newClient.phoneReceivesMessages ? "sms" : "email"
    };
    const propertyAddress = newClient.street1.trim() ? {
      street1: newClient.street1.trim(),
      ...(newClient.street2.trim() ? { street2: newClient.street2.trim() } : {}),
      city: newClient.city.trim(),
      province: newClient.province.trim(),
      postalCode: newClient.postalCode.trim(),
      country: "USA"
    } : undefined;
    const separateBillingAddress = newClient.billingStreet1.trim() ? {
      street1: newClient.billingStreet1.trim(),
      ...(newClient.billingStreet2.trim() ? { street2: newClient.billingStreet2.trim() } : {}),
      city: newClient.billingCity.trim(),
      province: newClient.billingProvince.trim(),
      postalCode: newClient.billingPostalCode.trim(),
      country: "USA"
    } : undefined;
    const billingAddress = newClient.billingSameAsPrimaryProperty ? propertyAddress : separateBillingAddress;
    const additionalContacts: CrmContact[] = [];
    if (newClient.additionalContactName.trim() || newClient.additionalContactPhone.trim() || newClient.additionalContactEmail.trim()) {
      additionalContacts.push({
        ...(newClient.additionalContactName.trim() ? { company: newClient.additionalContactName.trim() } : {}),
        role: newClient.additionalContactRole.trim() || "Additional contact",
        correspondenceContact: false,
        billingContact: false,
        phones: newClient.additionalContactPhone.trim() ? [{
          label: "Other",
          value: newClient.additionalContactPhone.trim(),
          primary: false,
          receivesMessages: false,
          smsCapability: "unknown",
          smsMode: "one_way"
        }] : [],
        emails: newClient.additionalContactEmail.trim() ? [{
          label: "Other",
          value: newClient.additionalContactEmail.trim(),
          primary: false
        }] : [],
        channelPreference: "none"
      });
    }
    const clientCustomFields: Record<string, string | number | boolean> = {};
    if (newClient.leadSource.trim()) {
      clientCustomFields.leadSource = newClient.leadSource.trim();
    }
    if (newClient.paymentTerms.trim()) {
      clientCustomFields.paymentTerms = newClient.paymentTerms.trim();
    }
    clientCustomFields.askForReview = newClient.askForReview;
    if (newClient.clientCustomFieldName.trim() && newClient.clientCustomFieldValue.trim()) {
      clientCustomFields[newClient.clientCustomFieldName.trim()] = newClient.clientCustomFieldValue.trim();
    }
    const propertyCustomFields: Record<string, string | number | boolean> = {};
    propertyCustomFields.gatedEntry = newClient.propertyGatedEntry;
    if (newClient.propertyClientName.trim()) {
      propertyCustomFields.propertyClientName = newClient.propertyClientName.trim();
    }
    if (newClient.propertyClientPhone.trim()) {
      propertyCustomFields.propertyClientPhone = newClient.propertyClientPhone.trim();
    }
    if (newClient.propertyClientEmail.trim()) {
      propertyCustomFields.propertyClientEmail = newClient.propertyClientEmail.trim();
    }
    if (newClient.companyCamProject.trim()) {
      propertyCustomFields.companyCamProject = newClient.companyCamProject.trim();
    }
    if (newClient.propertyCustomFieldName.trim() && newClient.propertyCustomFieldValue.trim()) {
      propertyCustomFields[newClient.propertyCustomFieldName.trim()] = newClient.propertyCustomFieldValue.trim();
    }
    const propertyContacts: CrmContact[] = [];
    if (newClient.propertyClientName.trim() || newClient.propertyClientPhone.trim() || newClient.propertyClientEmail.trim()) {
      propertyContacts.push({
        ...(newClient.propertyClientName.trim() ? { company: newClient.propertyClientName.trim() } : {}),
        role: "Property contact",
        correspondenceContact: false,
        billingContact: false,
        phones: newClient.propertyClientPhone.trim() ? [{
          label: "Other",
          value: newClient.propertyClientPhone.trim(),
          primary: true,
          receivesMessages: false,
          smsCapability: "unknown",
          smsMode: "one_way"
        }] : [],
        emails: newClient.propertyClientEmail.trim() ? [{
          label: "Other",
          value: newClient.propertyClientEmail.trim(),
          primary: true
        }] : [],
        channelPreference: "none"
      });
    }
    try {
      const body = await fetch("/api/crm/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          name: displayName,
          ...(company ? { company } : {}),
          personName,
          displayNamePreference: company ? newClient.displayNamePreference : "person",
          ...(billingAddress ? { billingAddress } : {}),
          billingSameAsPrimaryProperty: newClient.billingSameAsPrimaryProperty,
          contacts: [contact, ...additionalContacts],
          communicationSettings: {
            quotesAndInvoices: contact.channelPreference,
            jobReminders: contact.channelPreference,
            jobClosureFollowUps: "email",
            reviewRequests: contact.channelPreference,
            smsDefaultMode: "one_way"
          },
          emails: emailValue ? [emailValue] : [],
          phones: phoneValue ? [phoneValue] : [],
          consent: { email: Boolean(emailValue), sms: newClient.phoneReceivesMessages },
          customFields: clientCustomFields,
          ...(propertyAddress ? {
            primaryProperty: {
              siteName: newClient.siteName.trim() || undefined,
              label: newClient.siteName.trim() || propertyAddress.street1,
              address: propertyAddress,
              billingAddressSameAsClient: newClient.billingSameAsPrimaryProperty,
              access: {
                gateCode: newClient.propertyGateCodes.trim() || undefined,
                accessNotes: newClient.propertyGatedEntry ? "Gated entry enabled" : undefined
              },
              contacts: propertyContacts,
              customFields: propertyCustomFields
            }
          } : {})
        })
      }).then((response) => response.json() as Promise<CrmClientCreateResponse>);
      if (!body.ok || !body.client) {
        setCreateStatus(body.error ?? "Client could not be created.");
        return;
      }
      setCreateStatus(`Created ${clientDisplayName(body.client)}.`);
      setShowCreateClient(false);
      setNewClient({
        title: "No title",
        firstName: "",
        lastName: "",
        company: "",
        role: "",
        displayNamePreference: "person",
        phone: "",
        phoneLabel: "Main",
        phoneReceivesMessages: false,
        smsCapability: "unknown",
        email: "",
        emailLabel: "Main",
        paymentTerms: "",
        askForReview: true,
        clientCustomFieldName: "",
        clientCustomFieldValue: "",
        additionalContactName: "",
        additionalContactRole: "",
        additionalContactPhone: "",
        additionalContactEmail: "",
        siteName: "",
        street1: "",
        street2: "",
        city: "",
        province: "",
        postalCode: "",
        billingSameAsPrimaryProperty: true,
        billingStreet1: "",
        billingStreet2: "",
        billingCity: "",
        billingProvince: "",
        billingPostalCode: "",
        leadSource: "",
        propertyGatedEntry: false,
        propertyGateCodes: "",
        propertyClientName: "",
        propertyClientPhone: "",
        propertyClientEmail: "",
        companyCamProject: "",
        propertyCustomFieldName: "",
        propertyCustomFieldValue: ""
      });
      await refresh();
    } catch {
      setCreateStatus("Client create request failed.");
    }
  }

  async function runJobberSync(mode: "dry-run" | "write"): Promise<void> {
    setJobberSyncStatus(mode === "dry-run" ? "Checking Jobber read-only counts..." : "Syncing Jobber into native NexOps records...");
    try {
      const body = await fetch("/api/crm/jobber-sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: operatorContext.tenantId, mode })
      }).then((response) => response.json() as Promise<JobberSyncResponse>);
      if (!body.ok) {
        setJobberSyncStatus(body.error ?? "Jobber sync failed.");
        return;
      }
      const counts = body.counts ?? { clients: 0, properties: 0, jobs: 0 };
      const writes = body.nativeWriteCounts ?? { clients: 0, properties: 0, jobs: 0 };
      setJobberSyncStatus(mode === "dry-run"
        ? `Dry-run found ${counts.clients} clients, ${counts.properties} properties, and ${counts.jobs} jobs. No Jobber writes.`
        : `Synced ${writes.clients} clients, ${writes.properties} properties, and ${writes.jobs} jobs into native NexOps. Jobber stayed read-only.`);
      if (mode === "write") {
        await refresh();
        window.dispatchEvent(new Event("nexops:crm-mutated"));
      }
    } catch {
      setJobberSyncStatus("Jobber sync request failed.");
    }
  }

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
    fetch(`/api/public/tenant-branding?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
      .then((response) => response.json() as Promise<TenantBrandingResponse>)
      .then((body) => {
        if (!cancelled && body.ok && body.branding) {
          setTenantBranding(body.branding);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTenantBranding(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [operatorContext.tenantId]);

  useEffect(() => {
    void refresh();
    const onCrmMutation = () => void refresh();
    window.addEventListener("nexops:crm-mutated", onCrmMutation);
    return () => window.removeEventListener("nexops:crm-mutated", onCrmMutation);
  }, [operatorContext.tenantId]);

  useEffect(() => {
    const onPopState = () => setActiveModule(nexOpsModuleFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const tenantName = tenantBranding?.displayName ?? (operatorContext.tenantId === DEFAULT_TENANT_ID ? "Aquatrace" : operatorContext.tenantId);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredClients = clients.filter((client) => {
    if (!normalizedQuery) {
      return true;
    }
    return [
      clientDisplayName(client),
      contactSummary(client),
      clientPrimaryAddress(client),
      ...(client.tags ?? [])
    ].join(" ").toLowerCase().includes(normalizedQuery);
  });
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? filteredClients[0];
  const selectedContact = selectedClient?.contacts?.find((contact) => contact.correspondenceContact || contact.billingContact) ?? selectedClient?.contacts?.[0];
  const selectedPhone = selectedContact?.phones?.find((phone) => phone.primary) ?? selectedContact?.phones?.[0];
  const selectedEmail = selectedContact?.emails?.find((email) => email.primary)?.value ?? selectedContact?.emails?.[0]?.value ?? selectedClient?.emails[0];
  const selectedProperties = selectedClient ? properties.filter((property) => property.clientId === selectedClient.id) : [];
  const selectedJobs = selectedClient ? jobs.filter((job) => job.clientId === selectedClient.id) : [];
  const selectedQuotes = selectedClient ? quotes.filter((quote) => quote.clientId === selectedClient.id) : [];
  const selectedInvoices = selectedClient ? invoices.filter((invoice) => invoice.clientId === selectedClient.id) : [];
  const activeCount = clients.filter((client) => clientStatusLabel(client) === "Active").length;
  const leadCount = clients.filter((client) => clientStatusLabel(client) === "Lead").length;
  const textReadyCount = clients.filter((client) => {
    const contact = client.contacts?.find((entry) => entry.correspondenceContact) ?? client.contacts?.[0];
    const phone = contact?.phones?.find((entry) => entry.receivesMessages) ?? contact?.phones?.[0];
    return phone?.receivesMessages && phone.smsCapability === "mobile";
  }).length;
  const style = {
    "--nexops-brand-primary": "#0c1118",
    "--nexops-brand-accent": "#A8E600",
    "--nexops-brand-gradient": "linear-gradient(135deg, #D4FF20 0%, #25D238 100%)",
    "--nexops-brand-background": "#f5f7f1",
    "--nexops-brand-surface": "#ffffff",
    "--nexops-brand-text": "#101822",
    "--nexops-brand-muted": "#68717c",
    "--nexops-font-family": "Montserrat, Aptos, Segoe UI, Helvetica Neue, sans-serif"
  } as React.CSSProperties;

  const moduleTitle = NEXOPS_MODULES.find((module) => module.id === activeModule)?.label ?? "NexOps";

  function renderHome(): React.ReactElement {
    return (
      <section className="nexops-dashboard">
        <div className="nexops-page-heading">
          <div>
            <h1>Today in NexOps</h1>
            <p>One hosted business engine for clients, quotes, jobs, money, and closeout.</p>
          </div>
          <button type="button" onClick={() => setShowCreateClient(true)}>New Client</button>
        </div>
        <div className="nexops-workflow-strip">
          {[
            ["Requests", String(leadCount), "Lead/request intake scaffolded"],
            ["Quotes", String(quotes.length), "Draft/send/approve rail scaffolded"],
            ["Jobs", String(jobs.length), "Native + Jobber-imported job rollup"],
            ["Invoices", String(invoices.length), "Stripe test rail exists"],
            ["Approvals", "Live", "Unified queue visible"]
          ].map(([title, value, detail]) => (
            <article key={title}>
              <span>{title}</span>
              <strong>{value}</strong>
              <p>{detail}</p>
            </article>
          ))}
        </div>
        <div className="nexops-two-column">
          {renderClients({ compact: true })}
          <section className="nexops-module-card">
            <p className="eyebrow">Build map</p>
            <h2>Phase 1 scaffold</h2>
            <ul className="nexops-checklist">
              <li>CRM foundation: active</li>
              <li>CSV import: preview scaffold</li>
              <li>Jobber sync: read-only pull into native NexOps records</li>
              <li>Quotes/invoices/payments: backend rail present, UI scaffolded</li>
              <li>NexPortal/closeout/reviews: ready for next build pieces</li>
            </ul>
          </section>
        </div>
      </section>
    );
  }

  function renderClients(options?: { compact?: boolean }): React.ReactElement {
    return (
      <section className="nexops-clients-workspace">
        <div className="nexops-clients-heading">
          <div>
            <h1>Clients</h1>
            <p>{status}</p>
          </div>
          <div className="nexops-client-actions">
            <button type="button" onClick={() => setShowCreateClient(true)}>New Client</button>
            <button type="button" onClick={() => setModule("imports")}>Import CSV</button>
            <button type="button" onClick={() => setModule("imports")}>Sync Jobber</button>
            <button type="button" onClick={() => void refresh()}>Refresh</button>
          </div>
        </div>

        <div className="nexops-client-stats" aria-label="Client metrics">
          <article>
            <span>Active clients</span>
            <strong>{activeCount}</strong>
            <small>Native NexOps</small>
          </article>
          <article>
            <span>Leads</span>
            <strong>{leadCount}</strong>
            <small>Ready for follow-up</small>
          </article>
          <article>
            <span>Text-ready</span>
            <strong>{textReadyCount}</strong>
            <small>Mobile confirmed</small>
          </article>
          <article>
            <span>Sites</span>
            <strong>{properties.length}</strong>
            <small>Multi-site hierarchy</small>
          </article>
        </div>

        <div className="nexops-client-controls">
          <button type="button">Filter by tag +</button>
          <button type="button">Status | Leads and Active</button>
          <label>
            <span className="sr-only">Search clients</span>
            <input value={query} placeholder="Search clients..." onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>

        <div className={options?.compact ? "nexops-client-layout compact" : "nexops-client-layout"}>
          <section className="nexops-client-table-card" aria-label="Client list">
            <div className="nexops-client-table">
              <div className="nexops-client-table-head">
                <span>Name</span>
                <span>Address</span>
                <span>Tags</span>
                <span>Status</span>
                <span>Last Activity</span>
              </div>
              {filteredClients.map((client) => (
                <button
                  className={`nexops-client-table-row ${selectedClient?.id === client.id ? "selected" : ""}`}
                  key={client.id}
                  type="button"
                  onClick={() => setSelectedClientId(client.id)}
                >
                  <span>
                    <strong>{clientDisplayName(client)}</strong>
                    <small>{contactSummary(client)}</small>
                  </span>
                  <span>{clientPrimaryAddress(client)}</span>
                  <span>{client.tags?.length ? client.tags.join(", ") : "No tags"}</span>
                  <span><mark>{clientStatusLabel(client)}</mark></span>
                  <span>Native record</span>
                </button>
              ))}
              {!filteredClients.length ? (
                <div className="nexops-client-empty">
                  <h2>No clients match this view yet</h2>
                  <p>Create one, import a CSV, or run the Aquatrace Jobber sync once staging is ready.</p>
                </div>
              ) : null}
            </div>
          </section>

          {!options?.compact ? renderClientDetail() : null}
        </div>
      </section>
    );
  }

  function renderClientDetail(): React.ReactElement {
    return (
      <aside className="nexops-client-detail-card" aria-label="Client detail">
        {selectedClient ? (
          <>
            <div className="nexops-client-detail-heading">
              <p>{clientStatusLabel(selectedClient)}</p>
              <h2>{clientDisplayName(selectedClient)}</h2>
              <span>{selectedClient.id}</span>
            </div>
            <dl>
              <div>
                <dt>Main phone</dt>
                <dd>{selectedPhone?.value ?? selectedClient.phones[0] ?? "Not saved yet"}</dd>
              </div>
              <div>
                <dt>Main email</dt>
                <dd>{selectedEmail ?? "Not saved yet"}</dd>
              </div>
              <div>
                <dt>Messages</dt>
                <dd>{selectedPhone ? smsEligibilityLabel(selectedPhone) : "Prompt before text"}</dd>
              </div>
              <div>
                <dt>Billing</dt>
                <dd>{selectedClient.billingSameAsPrimaryProperty === false ? "Separate billing address" : "Billing stays on parent client"}</dd>
              </div>
            </dl>
            <section>
              <h3>Properties</h3>
              {selectedProperties.length ? (
                <ul className="nexops-mini-list">
                  {selectedProperties.map((property) => (
                    <li key={property.id}>
                      <strong>{property.siteName || property.label || property.address.street1}</strong>
                      <span>{formatAddress(property.address)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{clientPrimaryAddress(selectedClient)}</p>
              )}
            </section>
            <section>
              <h3>Work overview</h3>
              <p>{selectedJobs.length} jobs, {selectedQuotes.length} quotes, {selectedInvoices.length} invoices attached to this client.</p>
              {selectedJobs.length ? (
                <ul className="nexops-mini-list">
                  {selectedJobs.slice(0, 4).map((job) => (
                    <li key={job.id}>
                      <strong>{job.title}</strong>
                      <span>{job.status.replace("_", " ")}{job.startAt ? ` - ${new Date(job.startAt).toLocaleDateString()}` : ""}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          </>
        ) : (
          <div className="nexops-client-empty">
            <h2>Select a client</h2>
            <p>The detail card will show contacts, billing, sites, work, and files.</p>
          </div>
        )}
      </aside>
    );
  }

  function renderLifecycle(module: NexOpsModule): React.ReactElement {
    const money = (value?: number) => `$${(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    const clientName = (clientId: string) => clientDisplayName(clients.find((client) => client.id === clientId) ?? {
      id: clientId,
      tenantId: operatorContext.tenantId,
      name: clientId,
      emails: [],
      phones: [],
      consent: { email: false, sms: false }
    });
    const labels: Record<string, { title: string; subtitle: string; primaryAction: string; items: string[]; records: Array<{ id: string; title: string; detail: string; status: string; amount?: string }> }> = {
      requests: {
        title: "Requests",
        subtitle: "Lead and client request intake",
        primaryAction: "New request",
        items: ["Manual request creation", "Embeddable form target", "Convert request to quote/job"],
        records: clients
          .filter((client) => clientStatusLabel(client).toLowerCase().includes("lead"))
          .map((client) => ({
            id: client.id,
            title: clientDisplayName(client),
            detail: clientPrimaryAddress(client) || contactSummary(client),
            status: "Lead"
          }))
      },
      quotes: {
        title: "Quotes",
        subtitle: "Catalog, templates, approval links, and expiry",
        primaryAction: "Draft quote",
        items: ["Draft quote from catalog", "Send by email/text/both through ApprovalQueue", "Client approval through NexPortal"],
        records: quotes.map((quote) => ({
          id: quote.id,
          title: quote.title,
          detail: clientName(quote.clientId),
          status: quote.status,
          amount: money(quote.totals.total)
        }))
      },
      jobs: {
        title: "Jobs",
        subtitle: "Approved work, visits, closeout, and field handoff",
        primaryAction: "New job",
        items: ["Quote-to-job conversion", "Assigned visits", "NexShot report rollup"],
        records: jobs.map((job) => ({
          id: job.id,
          title: job.title,
          detail: `${clientName(job.clientId)}${job.startAt ? ` - ${new Date(job.startAt).toLocaleString()}` : ""}`,
          status: job.status.replace("_", " "),
          amount: money(job.totals?.total)
        }))
      },
      invoices: {
        title: "Invoices",
        subtitle: "Billing, PDF invoices, checkout, and receipts",
        primaryAction: "Create invoice",
        items: ["Invoice from signed quote", "Stripe test checkout", "Attach NexShot report PDF on receipt"],
        records: invoices.map((invoice) => ({
          id: invoice.id,
          title: invoice.title,
          detail: clientName(invoice.clientId),
          status: invoice.status,
          amount: money(invoice.totals.total)
        }))
      },
      payments: {
        title: "Payments",
        subtitle: "Payment state, deposits, balances, and methods",
        primaryAction: "Record payment",
        items: ["Stripe test-mode receipts", "Deposit/payment schedule scaffold", "No live charges without approval"],
        records: invoices
          .filter((invoice) => invoice.status === "paid" || invoice.status === "partially_paid")
          .map((invoice) => ({
            id: invoice.id,
            title: invoice.title,
            detail: clientName(invoice.clientId),
            status: invoice.status,
            amount: money(invoice.totals.total)
          }))
      }
    };
    const page = labels[module] ?? {
      title: "NexOps",
      subtitle: "Module scaffold",
      primaryAction: "Create",
      items: [],
      records: []
    };
    return (
      <section className="nexops-module-page">
        <div className="nexops-page-heading">
          <div>
            <h1>{page.title}</h1>
            <p>{page.subtitle}</p>
          </div>
          <button type="button">{page.primaryAction}</button>
        </div>
        <div className="nexops-module-grid nexops-module-grid-wide">
          <article className="nexops-module-card">
            <p className="eyebrow">Live native records</p>
            <h2>{page.records.length} visible</h2>
            {page.records.length ? (
              <ul className="nexops-record-list">
                {page.records.slice(0, 12).map((record) => (
                  <li key={record.id}>
                    <span>
                      <strong>{record.title}</strong>
                      <small>{record.detail}</small>
                    </span>
                    <mark>{record.status}</mark>
                    {record.amount ? <b>{record.amount}</b> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No native {page.title.toLowerCase()} are loaded yet. Use create/import/sync, then refresh this page.</p>
            )}
          </article>
          <article className="nexops-module-card">
            <p className="eyebrow">Next build receipts</p>
            <h2>What lands here</h2>
            <ul className="nexops-checklist">
              {page.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </article>
        </div>
      </section>
    );
  }

  function renderImports(): React.ReactElement {
    return (
      <section className="nexops-module-page">
        <div className="nexops-page-heading">
          <div>
            <h1>Import & Sync</h1>
            <p>CSV for every tenant. Jobber read-only sync for Aquatrace.</p>
          </div>
        </div>
        <div className="nexops-module-grid">
          <article className="nexops-module-card">
            <p className="eyebrow">CSV import</p>
            <h2>Preview before write</h2>
            <p>{csvStatus}</p>
            <input
              aria-label="CSV import file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  setCsvStatus("No CSV selected yet.");
                  return;
                }
                file.text()
                  .then((text) => {
                    const preview = parseCsvPreview(text);
                    setCsvStatus(`${preview.rows} row${preview.rows === 1 ? "" : "s"} detected. Columns: ${preview.columns.join(", ") || "none"}. Commit endpoint remains approval-gated.`);
                  })
                  .catch(() => setCsvStatus("Could not read that CSV file."));
              }}
            />
          </article>
          <article className="nexops-module-card">
            <p className="eyebrow">Aquatrace Jobber sync</p>
            <h2>Read-only API lane</h2>
            <p>{jobberSyncStatus}</p>
            <div className="nexops-inline-actions">
              <button type="button" onClick={() => void runJobberSync("dry-run")}>Dry-run Jobber</button>
              <button type="button" onClick={() => void runJobberSync("write")}>Sync into NexOps</button>
            </div>
            <small>Jobber stays read-only. Native NexOps records are upserted by Jobber external IDs.</small>
          </article>
        </div>
      </section>
    );
  }

  function renderSettings(): React.ReactElement {
    return (
      <section className="nexops-module-page">
        <div className="nexops-page-heading">
          <div>
            <h1>Settings</h1>
            <p>Tenant branding, users, communication defaults, and white-label provisions.</p>
          </div>
        </div>
        <div className="nexops-module-grid">
          <article className="nexops-module-card">
            <p className="eyebrow">Tenant brand</p>
            <h2>{tenantName}</h2>
            <p>Logo/text fallback, colors, font family, and updatedBy live in tenant branding.</p>
          </article>
          <article className="nexops-module-card">
            <p className="eyebrow">Access</p>
            <h2>{operatorContext.role}</h2>
            <p>OWNER and OFFICE_ADMIN see full CRM. TECHNICIAN views only assigned jobs/properties for sensitive fields.</p>
          </article>
        </div>
      </section>
    );
  }

  function renderCreateClientPanel(): React.ReactElement | null {
    if (!showCreateClient) {
      return null;
    }
    const smsPrompt = newClient.phoneReceivesMessages && newClient.smsCapability !== "mobile"
      ? "This number has not been confirmed as mobile. NexOps will treat texts as one-way and should prompt before sending."
      : "Texts stay one-way unless an upgraded two-way SMS tier is enabled.";
    return (
      <div className="nexops-drawer-backdrop" role="presentation">
        <form className="nexops-drawer nexops-client-form" onSubmit={(event) => void createClientFromForm(event)}>
          <div className="nexops-drawer-heading nexops-client-form-hero">
            <div className="nexops-client-form-hero-copy">
              <NexTeamLockup className="nexops-client-form-brand" />
              <p className="eyebrow">NexOps CRM</p>
              <h2>New client</h2>
              <p>Capture the parent relationship first, then add service sites, local property contacts, and communication rules without mixing billing or field access.</p>
            </div>
            <div className="nexops-client-form-hero-actions">
              <span>Proof screen: final NexTeam design system</span>
              <button type="button" onClick={() => setShowCreateClient(false)}>Close</button>
            </div>
            <ul className="nexops-form-principles" aria-label="Client setup rules">
              <li>Parent client owns billing</li>
              <li>Company display is optional</li>
              <li>Texts stay one-way unless upgraded</li>
            </ul>
          </div>
          <section className="nexops-form-section">
            <div className="nexops-section-copy">
              <h3>Primary contact details</h3>
              <p>Use first and last name by default. If a company is added, NexOps can display the company while keeping the person on file.</p>
            </div>
            <div className="nexops-section-fields">
              <div className="nexops-field-row title-row">
                <label className="nexops-field"><span>Title</span><select value={newClient.title} onChange={(event) => setNewClient({ ...newClient, title: event.target.value })}>
                  {["No title", "Mr.", "Mrs.", "Ms.", "Dr.", "Other"].map((label) => <option key={label}>{label}</option>)}
                </select></label>
                <label className="nexops-field"><span>First name</span><input value={newClient.firstName} onChange={(event) => setNewClient({ ...newClient, firstName: event.target.value })} /></label>
                <label className="nexops-field"><span>Last name</span><input value={newClient.lastName} onChange={(event) => setNewClient({ ...newClient, lastName: event.target.value })} /></label>
              </div>
              <div className="nexops-field-row">
                <label className="nexops-field"><span>Company name</span><input value={newClient.company} onChange={(event) => setNewClient({ ...newClient, company: event.target.value, displayNamePreference: event.target.value ? "company" : "person" })} /></label>
                <label className="nexops-field"><span>Display as</span><select value={newClient.displayNamePreference} onChange={(event) => setNewClient({ ...newClient, displayNamePreference: event.target.value as "person" | "company" })}>
                  <option value="person">First name Last name</option>
                  <option value="company" disabled={!newClient.company}>Company name</option>
                </select></label>
              </div>
              <label className="nexops-field"><span>Role</span><input value={newClient.role} onChange={(event) => setNewClient({ ...newClient, role: event.target.value })} /></label>
              <h4>Communication</h4>
              <div className="nexops-field-row">
                <label className="nexops-field"><span>Phone number</span><input value={newClient.phone} onChange={(event) => setNewClient({ ...newClient, phone: event.target.value })} /></label>
                <label className="nexops-field compact"><span>Phone label</span><select value={newClient.phoneLabel} onChange={(event) => setNewClient({ ...newClient, phoneLabel: event.target.value as CrmPhone["label"] })}>
                  {(["Main", "Work", "Mobile", "Home", "Fax", "Other"] as CrmPhone["label"][]).map((label) => <option key={label}>{label}</option>)}
                </select></label>
              </div>
              <label className="nexops-check-field"><input type="checkbox" checked={newClient.phoneReceivesMessages} onChange={(event) => setNewClient({ ...newClient, phoneReceivesMessages: event.target.checked })} /> Allow one-way texts to this number</label>
              {newClient.phoneReceivesMessages ? (
                <label className="nexops-field"><span>SMS check</span><select value={newClient.smsCapability} onChange={(event) => setNewClient({ ...newClient, smsCapability: event.target.value as SmsCapability })}>
                  <option value="unknown">Unknown - prompt before sending</option>
                  <option value="mobile">Mobile - can receive texts</option>
                  <option value="landline">Landline - prompt</option>
                  <option value="fax">Fax - text off unless changed</option>
                  <option value="invalid">Invalid - text off</option>
                </select></label>
              ) : null}
              <p className="nexops-form-note">{smsPrompt}</p>
              <div className="nexops-field-row">
                <label className="nexops-field"><span>Email</span><input type="email" value={newClient.email} onChange={(event) => setNewClient({ ...newClient, email: event.target.value })} /></label>
                <label className="nexops-field compact"><span>Email label</span><select value={newClient.emailLabel} onChange={(event) => setNewClient({ ...newClient, emailLabel: event.target.value as CrmEmail["label"] })}>
                  {(["Main", "Work", "Personal", "Other"] as CrmEmail["label"][]).map((label) => <option key={label}>{label}</option>)}
                </select></label>
              </div>
              <button className="nexops-link-button" type="button">Communication settings</button>
              <h4>Lead information</h4>
              <label className="nexops-field"><span>Lead source</span><input value={newClient.leadSource} onChange={(event) => setNewClient({ ...newClient, leadSource: event.target.value })} /></label>
              <div className="nexops-field-row">
                <label className="nexops-field"><span>Payment terms</span><input value={newClient.paymentTerms} onChange={(event) => setNewClient({ ...newClient, paymentTerms: event.target.value })} /></label>
                <label className="nexops-check-field inline"><input type="checkbox" checked={newClient.askForReview} onChange={(event) => setNewClient({ ...newClient, askForReview: event.target.checked })} /> Ask for a review</label>
              </div>
              <details className="nexops-extra-panel" open>
                <summary>Additional client details</summary>
                <div className="nexops-extra-panel-body">
                  <p>Create custom fields to track additional client-level details.</p>
                  <button type="button">Add Custom Field</button>
                  <div className="nexops-field-row">
                    <label className="nexops-field"><span>Custom field name</span><input value={newClient.clientCustomFieldName} onChange={(event) => setNewClient({ ...newClient, clientCustomFieldName: event.target.value })} /></label>
                    <label className="nexops-field"><span>Custom field value</span><input value={newClient.clientCustomFieldValue} onChange={(event) => setNewClient({ ...newClient, clientCustomFieldValue: event.target.value })} /></label>
                  </div>
                </div>
              </details>
              <details className="nexops-extra-panel" open>
                <summary>Additional contacts</summary>
                <div className="nexops-extra-panel-body">
                  <p>For contacts with access to all properties, like spouse/family for residential or property managers for commercial.</p>
                  <button type="button">Add Contact</button>
                  <div className="nexops-field-row">
                    <label className="nexops-field"><span>Contact name</span><input value={newClient.additionalContactName} onChange={(event) => setNewClient({ ...newClient, additionalContactName: event.target.value })} /></label>
                    <label className="nexops-field"><span>Role</span><input value={newClient.additionalContactRole} onChange={(event) => setNewClient({ ...newClient, additionalContactRole: event.target.value })} /></label>
                  </div>
                  <div className="nexops-field-row">
                    <label className="nexops-field"><span>Phone</span><input value={newClient.additionalContactPhone} onChange={(event) => setNewClient({ ...newClient, additionalContactPhone: event.target.value })} /></label>
                    <label className="nexops-field"><span>Email</span><input type="email" value={newClient.additionalContactEmail} onChange={(event) => setNewClient({ ...newClient, additionalContactEmail: event.target.value })} /></label>
                  </div>
                </div>
              </details>
            </div>
          </section>
          <section className="nexops-form-section">
            <div className="nexops-section-copy">
              <h3>Property address</h3>
              <p>Enter the primary service address, billing address, or site name. Multi-site clients keep billing and correspondence on the parent client.</p>
              <button type="button">Add Another Address</button>
            </div>
            <div className="nexops-section-fields">
              <label className="nexops-field"><span>Site name</span><input value={newClient.siteName} onChange={(event) => setNewClient({ ...newClient, siteName: event.target.value })} placeholder="Optional, e.g. Mulberry Farms" /></label>
              <label className="nexops-field"><span>Street 1</span><input value={newClient.street1} onChange={(event) => setNewClient({ ...newClient, street1: event.target.value })} /></label>
              <label className="nexops-field"><span>Street 2</span><input value={newClient.street2} onChange={(event) => setNewClient({ ...newClient, street2: event.target.value })} /></label>
              <div className="nexops-field-row">
                <label className="nexops-field"><span>City</span><input value={newClient.city} onChange={(event) => setNewClient({ ...newClient, city: event.target.value })} /></label>
                <label className="nexops-field compact"><span>State</span><input value={newClient.province} onChange={(event) => setNewClient({ ...newClient, province: event.target.value })} /></label>
              </div>
              <div className="nexops-field-row">
                <label className="nexops-field compact"><span>ZIP code</span><input value={newClient.postalCode} onChange={(event) => setNewClient({ ...newClient, postalCode: event.target.value })} /></label>
                <label className="nexops-field"><span>Country</span><select value="USA" onChange={() => undefined}><option value="USA">United States</option></select></label>
              </div>
              <label className="nexops-field"><span>Tax rate</span><select value="none" onChange={() => undefined}><option value="none">No tax rate created</option></select></label>
              <label className="nexops-check-field"><input type="checkbox" checked={newClient.billingSameAsPrimaryProperty} onChange={(event) => setNewClient({ ...newClient, billingSameAsPrimaryProperty: event.target.checked })} /> Billing address is the same as property address</label>
              {!newClient.billingSameAsPrimaryProperty ? (
                <div className="nexops-subsection">
                  <h4>Billing address</h4>
                  <label className="nexops-field"><span>Billing street 1</span><input value={newClient.billingStreet1} onChange={(event) => setNewClient({ ...newClient, billingStreet1: event.target.value })} /></label>
                  <label className="nexops-field"><span>Billing street 2</span><input value={newClient.billingStreet2} onChange={(event) => setNewClient({ ...newClient, billingStreet2: event.target.value })} /></label>
                  <div className="nexops-field-row">
                    <label className="nexops-field"><span>Billing city</span><input value={newClient.billingCity} onChange={(event) => setNewClient({ ...newClient, billingCity: event.target.value })} /></label>
                    <label className="nexops-field compact"><span>Billing state</span><input value={newClient.billingProvince} onChange={(event) => setNewClient({ ...newClient, billingProvince: event.target.value })} /></label>
                  </div>
                  <label className="nexops-field compact"><span>Billing ZIP</span><input value={newClient.billingPostalCode} onChange={(event) => setNewClient({ ...newClient, billingPostalCode: event.target.value })} /></label>
                </div>
              ) : null}
              <details className="nexops-extra-panel" open>
                <summary>Property details</summary>
                <div className="nexops-extra-panel-body">
                  <p>Create custom fields to track additional property details.</p>
                  <button type="button">Add Custom Field</button>
                  <label className="nexops-check-field inline"><input type="checkbox" checked={newClient.propertyGatedEntry} onChange={(event) => setNewClient({ ...newClient, propertyGatedEntry: event.target.checked })} /> Gated entry</label>
                  <label className="nexops-field"><span>Gate entry code(s)</span><input value={newClient.propertyGateCodes} onChange={(event) => setNewClient({ ...newClient, propertyGateCodes: event.target.value })} /></label>
                  <label className="nexops-field"><span>Property client name</span><input value={newClient.propertyClientName} onChange={(event) => setNewClient({ ...newClient, propertyClientName: event.target.value })} /></label>
                  <label className="nexops-field"><span>Property client telephone number</span><input value={newClient.propertyClientPhone} onChange={(event) => setNewClient({ ...newClient, propertyClientPhone: event.target.value })} /></label>
                  <label className="nexops-field"><span>Property client email address</span><input type="email" value={newClient.propertyClientEmail} onChange={(event) => setNewClient({ ...newClient, propertyClientEmail: event.target.value })} /></label>
                  <label className="nexops-field"><span>CompanyCam project</span><input value={newClient.companyCamProject} onChange={(event) => setNewClient({ ...newClient, companyCamProject: event.target.value })} /></label>
                  <div className="nexops-field-row">
                    <label className="nexops-field"><span>Custom field name</span><input value={newClient.propertyCustomFieldName} onChange={(event) => setNewClient({ ...newClient, propertyCustomFieldName: event.target.value })} /></label>
                    <label className="nexops-field"><span>Custom field value</span><input value={newClient.propertyCustomFieldValue} onChange={(event) => setNewClient({ ...newClient, propertyCustomFieldValue: event.target.value })} /></label>
                  </div>
                </div>
              </details>
              <details className="nexops-extra-panel" open>
                <summary>Property contacts</summary>
                <div className="nexops-extra-panel-body single-row">
                  <p>For contacts with access limited to this property. These contacts do not receive parent-client correspondence by default.</p>
                  <button type="button">Add Contact</button>
                </div>
              </details>
            </div>
          </section>
          <div className="nexops-drawer-actions">
            <span>{createStatus}</span>
            <button type="button" onClick={() => setShowCreateClient(false)}>Cancel</button>
            <button type="submit">Save client</button>
          </div>
        </form>
      </div>
    );
  }

  function renderActiveModule(): React.ReactElement {
    if (activeModule === "home") {
      return renderHome();
    }
    if (activeModule === "clients") {
      return renderClients();
    }
    if (activeModule === "schedule") {
      return <div className="nexops-embedded-panel"><SchedulePanel tenantId={operatorContext.tenantId} /></div>;
    }
    if (activeModule === "imports") {
      return renderImports();
    }
    if (activeModule === "approvals") {
      return <div className="nexops-embedded-panel"><ApprovalQueuePanel tenantId={operatorContext.tenantId} /></div>;
    }
    if (activeModule === "settings") {
      return renderSettings();
    }
    return renderLifecycle(activeModule);
  }

  return (
    <main className="nexops-app" style={style}>
      <aside className="nexops-app-sidebar" aria-label="NexOps navigation">
        <div className="nexops-app-logo">
          <NexTeamLockup className="nexops-sidebar-lockup" />
          <span>NexOps</span>
          <small>{tenantName}</small>
        </div>
        <button className="nexops-create-button" type="button" onClick={() => setShowCreateClient(true)}>Create</button>
        <nav className="nexops-nav">
          {NEXOPS_MODULES.map((item) => (
            <button className={item.id === activeModule ? "active" : ""} type="button" key={item.id} onClick={() => setModule(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="nexops-web-main">
        <header className="nexops-web-topbar">
          <p>{tenantName}</p>
          <div className="nexops-web-tools">
            <label>
              <span className="sr-only">Global search</span>
              <input placeholder="Search NexOps..." />
            </label>
            <span>{moduleTitle}</span>
            <span>{props.user.email ?? "Operator"}</span>
            <button type="button" onClick={() => void signOut(props.auth)}>Sign out</button>
          </div>
        </header>

        {renderActiveModule()}
      </section>
      {renderCreateClientPanel()}
    </main>
  );
}

type NexShotModule = "overview" | "templates" | "photos" | "reports";

const NEXSHOT_MODULES: Array<{ id: NexShotModule; label: string; path: string }> = [
  { id: "overview", label: "Overview", path: "/nexshot" },
  { id: "templates", label: "Checklist Templates", path: "/nexshot/templates" },
  { id: "photos", label: "Photos & Media", path: "/nexshot/photos" },
  { id: "reports", label: "Reports", path: "/nexshot/reports" }
];

function nexShotModuleFromPath(pathname: string): NexShotModule {
  const match = NEXSHOT_MODULES.find((module) => pathname === module.path || pathname.startsWith(`${module.path}/`));
  return match?.id ?? "overview";
}

function NexShotPage(props: { auth: Auth; user: User }): React.ReactElement {
  const [operatorContext, setOperatorContext] = useState<OperatorContext>(() => fallbackOperatorContext(props.user));
  const [tenantBranding, setTenantBranding] = useState<TenantBranding | null>(null);
  const [activeModule, setActiveModule] = useState<NexShotModule>(() => nexShotModuleFromPath(window.location.pathname));
  const [templates, setTemplates] = useState<FieldDocsTemplate[]>([]);
  const [mediaHits, setMediaHits] = useState<NonNullable<FieldDocsSearchResponse["hits"]>>([]);
  const [checklist, setChecklist] = useState<FieldDocsChecklistResponse["checklist"] | null>(null);
  const [report, setReport] = useState<FieldDocsReportResponse["report"] | null>(null);
  const [reportUrl, setReportUrl] = useState("");
  const [status, setStatus] = useState("Loading NexShot...");
  const [mediaQuery, setMediaQuery] = useState("Deborah Justice");
  const [reportTitle, setReportTitle] = useState("Aquatrace Leak Detection Report");

  useEffect(() => {
    let cancelled = false;
    loadOperatorContext(props.user)
      .then((context) => {
        if (!cancelled) setOperatorContext(context);
      })
      .catch(() => {
        if (!cancelled) setOperatorContext(fallbackOperatorContext(props.user));
      });
    return () => {
      cancelled = true;
    };
  }, [props.user]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/tenant-branding?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
      .then((response) => response.json() as Promise<TenantBrandingResponse>)
      .then((body) => {
        if (!cancelled && body.ok && body.branding) setTenantBranding(body.branding);
      })
      .catch(() => {
        if (!cancelled) setTenantBranding(null);
      });
    return () => {
      cancelled = true;
    };
  }, [operatorContext.tenantId]);

  useEffect(() => {
    const onPopState = () => setActiveModule(nexShotModuleFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  async function refreshTemplates(): Promise<void> {
    setStatus("Loading checklist templates...");
    try {
      const body = await fetch(`/api/fielddocs/checklists/templates?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
        .then((response) => response.json() as Promise<FieldDocsTemplatesResponse>);
      if (!body.ok) {
        setTemplates([]);
        setStatus(body.error ?? "Checklist templates are unavailable.");
        return;
      }
      setTemplates(body.templates ?? []);
      setStatus(`${body.templates?.length ?? 0} checklist template${body.templates?.length === 1 ? "" : "s"} ready.`);
    } catch {
      setTemplates([]);
      setStatus("Checklist template API unreachable.");
    }
  }

  async function createChecklist(): Promise<void> {
    setStatus("Creating leak detection checklist...");
    try {
      const body = await fetch("/api/fielddocs/checklists/leak-detection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: operatorContext.tenantId, jobId: "job_demo_leak_detection" })
      }).then((response) => response.json() as Promise<FieldDocsChecklistResponse>);
      if (!body.ok || !body.checklist) {
        setStatus(body.error ?? "Checklist could not be created.");
        return;
      }
      setChecklist(body.checklist);
      setStatus(`Checklist ${body.checklist.id} created with ${body.checklist.items.length} items.`);
    } catch {
      setStatus("Checklist create request failed.");
    }
  }

  async function searchMedia(): Promise<void> {
    setStatus("Searching NexShot media...");
    try {
      const body = await fetch(`/api/fielddocs/search?tenantId=${encodeURIComponent(operatorContext.tenantId)}&q=${encodeURIComponent(mediaQuery)}&limit=12`)
        .then((response) => response.json() as Promise<FieldDocsSearchResponse>);
      if (!body.ok) {
        setMediaHits([]);
        setStatus(body.error ?? "Media search failed.");
        return;
      }
      setMediaHits(body.hits ?? []);
      setStatus(`${body.hits?.length ?? 0} media item${body.hits?.length === 1 ? "" : "s"} found for "${mediaQuery}".`);
    } catch {
      setMediaHits([]);
      setStatus("Media search API unreachable.");
    }
  }

  async function createReport(): Promise<void> {
    setStatus("Generating NexShot report...");
    try {
      const body = await fetch("/api/fielddocs/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          jobId: "job_demo_leak_detection",
          title: reportTitle,
          findings: [
            "Checklist-driven report generated from NexShot.",
            "Report can attach to closeout receipts and approval-gated emails."
          ],
          mediaIds: mediaHits.map((hit) => hit.id),
          checklistId: checklist?.id,
          status: "posted"
        })
      }).then((response) => response.json() as Promise<FieldDocsReportResponse>);
      if (!body.ok || !body.report) {
        setStatus(body.error ?? "Report could not be created.");
        return;
      }
      setReport(body.report);
      setReportUrl(body.pdfUrl ?? "");
      setStatus(`Report ${body.report.id} generated.`);
    } catch {
      setStatus("Report create request failed.");
    }
  }

  function setModule(module: NexShotModule): void {
    const target = NEXSHOT_MODULES.find((entry) => entry.id === module) ?? NEXSHOT_MODULES[0];
    setActiveModule(module);
    window.history.pushState({}, "", target.path);
  }

  useEffect(() => {
    void refreshTemplates();
  }, [operatorContext.tenantId]);

  const style = {
    "--nexops-brand-primary": "#0c1118",
    "--nexops-brand-accent": "#A8E600",
    "--nexops-brand-gradient": "linear-gradient(135deg, #D4FF20 0%, #25D238 100%)",
    "--nexops-brand-background": "#f5f7f1",
    "--nexops-brand-surface": "#ffffff",
    "--nexops-brand-text": "#101822",
    "--nexops-brand-muted": "#68717c",
    "--nexops-font-family": "Montserrat, Aptos, Segoe UI, Helvetica Neue, sans-serif"
  } as React.CSSProperties;
  const template = templates[0];
  const propertyItems = template?.items.filter((item) => item.memory === "property") ?? [];
  const visitItems = template?.items.filter((item) => item.memory === "visit") ?? [];

  function renderOverview(): React.ReactElement {
    return (
      <section className="nexops-dashboard">
        <div className="nexops-page-heading">
          <div>
            <h1>NexShot Field Docs</h1>
            <p>Checklist templates, visit media, and branded reports connected back to NexOps.</p>
          </div>
          <button type="button" onClick={() => void createChecklist()}>Start Checklist</button>
        </div>
        <div className="nexops-workflow-strip">
          {[
            ["Templates", String(templates.length), "Property-persistent fields marked"],
            ["Media hits", String(mediaHits.length), "Searchable photos/PDFs"],
            ["Checklist", checklist ? "Ready" : "Not started", "Visit-fresh execution"],
            ["Report", report ? "Generated" : "Not generated", "PDF export + email attachment rail"]
          ].map(([title, value, detail]) => (
            <article key={title}>
              <span>{title}</span>
              <strong>{value}</strong>
              <p>{detail}</p>
            </article>
          ))}
        </div>
        <div className="nexops-two-column">
          {renderTemplates()}
          {renderPhotos()}
        </div>
      </section>
    );
  }

  function renderTemplates(): React.ReactElement {
    return (
      <section className="nexops-module-page">
        <div className="nexops-page-heading">
          <div>
            <h1>Checklist Templates</h1>
            <p>{status}</p>
          </div>
          <div className="nexops-inline-actions">
            <button type="button" onClick={() => void refreshTemplates()}>Refresh</button>
            <button type="button" onClick={() => void createChecklist()}>Create visit checklist</button>
          </div>
        </div>
        <div className="nexshot-template-grid">
          {templates.map((item) => (
            <article className="nexops-module-card wide" key={item.id}>
              <p className="eyebrow">Owner-editable template</p>
              <h2>{item.title}</h2>
              <p>{item.itemCount} fields across {item.sections.length} sections. {item.propertyPersistentCount} property-persistent, {item.visitFreshCount} visit-fresh.</p>
              <div className="nexshot-item-columns">
                <div>
                  <h3>Property-persistent</h3>
                  <ul className="nexshot-item-list">
                    {propertyItems.slice(0, 10).map((field) => <li key={`${field.section}-${field.label}`}>{field.section}: {field.label}</li>)}
                  </ul>
                </div>
                <div>
                  <h3>Visit-fresh</h3>
                  <ul className="nexshot-item-list">
                    {visitItems.slice(0, 10).map((field) => <li key={`${field.section}-${field.label}`}>{field.section}: {field.label}</li>)}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  function renderPhotos(): React.ReactElement {
    return (
      <section className="nexops-module-page">
        <div className="nexops-page-heading">
          <div>
            <h1>Photos & Media</h1>
            <p>Search native NexShot media by client/job/visit terms.</p>
          </div>
          <div className="nexops-inline-actions">
            <input value={mediaQuery} onChange={(event) => setMediaQuery(event.target.value)} placeholder="Deborah Justice" />
            <button type="button" onClick={() => void searchMedia()}>Search media</button>
          </div>
        </div>
        <div className="nexshot-media-grid">
          {mediaHits.map((hit) => (
            <article className="nexops-module-card" key={hit.id}>
              <p className="eyebrow">{hit.type}</p>
              <h2>{hit.aiCaption || hit.storageRef}</h2>
              <p>{hit.aiTags.length ? hit.aiTags.join(", ") : "No tags yet"}</p>
              <small>{hit.jobId ? `Job ${hit.jobId}` : "Unassigned review queue"}</small>
            </article>
          ))}
          {!mediaHits.length ? (
            <article className="nexops-module-card">
              <p className="eyebrow">Unresolved queue</p>
              <h2>No media loaded in this view yet</h2>
              <p>Search a real client/job after native or CompanyCam import populates the media repository.</p>
            </article>
          ) : null}
        </div>
      </section>
    );
  }

  function renderReports(): React.ReactElement {
    return (
      <section className="nexops-module-page">
        <div className="nexops-page-heading">
          <div>
            <h1>Reports</h1>
            <p>Checklist to branded PDF, ready for closeout receipt attachments.</p>
          </div>
          <div className="nexops-inline-actions">
            <input value={reportTitle} onChange={(event) => setReportTitle(event.target.value)} />
            <button type="button" onClick={() => void createReport()}>Generate report</button>
          </div>
        </div>
        <article className="nexops-module-card wide">
          <p className="eyebrow">Latest report</p>
          <h2>{report?.title ?? "No report generated in this session yet"}</h2>
          <p>{report ? `${report.status} report ${report.id}` : "Create a checklist, search media, then generate a report."}</p>
          {reportUrl ? <a href={reportUrl} target="_blank" rel="noreferrer">Open PDF</a> : null}
        </article>
      </section>
    );
  }

  function renderActiveModule(): React.ReactElement {
    if (activeModule === "templates") return renderTemplates();
    if (activeModule === "photos") return renderPhotos();
    if (activeModule === "reports") return renderReports();
    return renderOverview();
  }

  return (
    <main className="nexops-app nexshot-app" style={style}>
      <aside className="nexops-app-sidebar" aria-label="NexShot navigation">
        <div className="nexops-app-logo">
          <NexTeamLockup className="nexops-sidebar-lockup" />
          <span>NexShot</span>
          <small>{tenantBranding?.displayName ?? (operatorContext.tenantId === DEFAULT_TENANT_ID ? "Aquatrace" : operatorContext.tenantId)}</small>
        </div>
        <button className="nexops-create-button" type="button" onClick={() => void createChecklist()}>Start Checklist</button>
        <nav className="nexops-nav">
          {NEXSHOT_MODULES.map((item) => (
            <button className={item.id === activeModule ? "active" : ""} type="button" key={item.id} onClick={() => setModule(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="nexops-web-main">
        <header className="nexops-web-topbar">
          <p>{tenantBranding?.displayName ?? "Aquatrace"}</p>
          <div className="nexops-web-tools">
            <span>{status}</span>
            <span>{props.user.email ?? "Operator"}</span>
            <button type="button" onClick={() => void signOut(props.auth)}>Sign out</button>
          </div>
        </header>
        {renderActiveModule()}
      </section>
    </main>
  );
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
      const body = await fetch(`/api/approval-queue?tenantId=${encodeURIComponent(props.tenantId)}&includeHistory=true`)
        .then((response) => response.json() as Promise<ApprovalQueueResponse>);
      if (!body.ok) {
        setItems([]);
        setStatus(body.error ?? "Approval queue unavailable.");
        return;
      }
      const nextItems = body.items ?? [];
      const pending = nextItems.filter((item) => item.status === "pending");
      const history = nextItems.filter((item) => item.status !== "pending");
      setItems(nextItems);
      setStatus(`${pending.length} pending. ${history.length} historical.`);
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
        if (executed.ok && item.execute.service === "crm" && item.execute.op === "createClient") {
          window.dispatchEvent(new CustomEvent("nexops:crm-mutated"));
        }
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

  const pendingItems = items.filter((item) => item.status === "pending");
  const historicalItems = items.filter((item) => item.status !== "pending");

  function renderApprovalItem(item: ApprovalQueueItem): React.ReactElement {
    const isPending = item.status === "pending";
    return (
      <article className="content-draft approval-item" key={item.id}>
        <div className="content-draft-head">
          <span>{approvalKindLabel(item)}</span>
          <span>{isPending ? item.createdBy : item.status}</span>
        </div>
        <h3>{item.preview.title}</h3>
        <p>{item.preview.body.split(/\n+/).filter(Boolean).slice(0, 3).join(" ")}</p>
        {item.preview.mediaRefs?.length ? (
          <div className="approval-attachments">
            {item.preview.mediaRefs.map((ref) => <span key={ref}>{ref}</span>)}
          </div>
        ) : null}
        {item.decidedAt ? <p className="approval-decided">Decided {new Date(item.decidedAt).toLocaleString()}</p> : null}
        {isPending ? (
          <div className="content-actions">
            <button type="button" disabled={workingId === item.id} onClick={() => void approve(item)}>{approvalPrimaryLabel(item)}</button>
            <button className="secondary" type="button" disabled={workingId === item.id} onClick={() => void reject(item)}>Reject</button>
          </div>
        ) : null}
      </article>
    );
  }

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
      <h3 className="queue-section-heading">Pending</h3>
      <div className="content-list">
        {pendingItems.length ? pendingItems.map(renderApprovalItem) : <p className="empty-state">No approvals are waiting right now.</p>}
      </div>
      <h3 className="queue-section-heading">Approved / Rejected History</h3>
      <div className="content-list">
        {historicalItems.length ? historicalItems.map(renderApprovalItem) : <p className="empty-state">No approval history yet.</p>}
      </div>
    </aside>
  );
}

function reputationUserMessage(error?: string): string {
  const message = error ?? "";
  if (/not allowed for this tenant|missing a tenant|missing a tenant role|role cannot perform|sign in is required/i.test(message)) {
    return "Reviews are not connected for this sign-in yet. I need this user set up as an Aquatrace owner or office admin, then your Google Business Profile connected, before I can pull reviews.";
  }
  if (/GBP OAuth|location identifiers|not configured|credential/i.test(message)) {
    return "Google reviews are not connected yet. Once your Google Business Profile is connected, this panel will show reviews and draft replies for approval.";
  }
  return message || "Review queue unavailable.";
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
        setStatus(reputationUserMessage(body.error));
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
        setStatus(reputationUserMessage(body.error));
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
    if (window.location.pathname.startsWith("/platform")) {
      return <PlatformConsole auth={props.auth} user={props.user} />;
    }
    if (window.location.pathname.startsWith("/nexshot")) {
      return <NexShotPage auth={props.auth} user={props.user} />;
    }
    if (window.location.pathname.startsWith("/nexops")) {
      return <NexOpsClientsPage auth={props.auth} user={props.user} />;
    }
    return <Chat auth={props.auth} user={props.user} />;
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
  const [tenantBranding, setTenantBranding] = useState<TenantBranding | null>(null);
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
    fetch(`/api/public/tenant-branding?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
      .then((response) => response.json() as Promise<TenantBrandingResponse>)
      .then((body) => {
        if (!cancelled && body.ok && body.branding) {
          setTenantBranding(body.branding);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTenantBranding(null);
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

  const brandColors = tenantBranding?.colors;
  const customOperatorTheme = isOwnerCustomizedOperatorTheme(operatorTheme) ? operatorTheme : null;
  const themeStyle = {
    "--jobdesk-shell-background": customOperatorTheme?.colors.shellBackground ?? brandColors?.background,
    "--jobdesk-panel-background": customOperatorTheme?.colors.panelBackground ?? brandColors?.surface,
    "--jobdesk-header-background": customOperatorTheme?.colors.headerBackground ?? brandColors?.primary,
    "--jobdesk-accent": customOperatorTheme?.colors.accent ?? brandColors?.accent,
    "--jobdesk-accent-text": customOperatorTheme?.colors.accentText ?? brandColors?.accentText,
    "--jobdesk-user-bubble": customOperatorTheme?.colors.userBubble ?? brandColors?.userBubble,
    "--jobdesk-assistant-bubble": customOperatorTheme?.colors.assistantBubble ?? brandColors?.assistantBubble,
    "--jobdesk-text": customOperatorTheme?.colors.text ?? brandColors?.text,
    "--jobdesk-muted-text": brandColors?.mutedText,
    "--jobdesk-font-family": tenantBranding?.fontFamily
  } as React.CSSProperties;

  return (
    <main className={`shell ops-shell density-${customOperatorTheme?.density ?? "comfortable"}`} style={themeStyle}>
      <div className="ops-grid">
      <section className="phone">
        <header className="topbar">
          <div className="brand-stack">
            <TenantBrandMark branding={tenantBranding} tenantId={operatorContext.tenantId} />
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
            <span>{uploading ? "Uploading..." : "📎 Attach file"}</span>
            <input
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
        <NexOpsCrmPanel tenantId={operatorContext.tenantId} />
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
