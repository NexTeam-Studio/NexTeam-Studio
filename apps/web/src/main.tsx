import React, { Suspense, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { type Address as CrmAddress } from "@nexteam/shared";

import { type Auth, type User } from "firebase/auth";
import "./styles.css";
import "./features/quotes/components/quoteTemplates/quoteTemplates.css";
import "./features/jobs/components/jobCore/jobCore.css";
import "./features/visits/components/visitCore/visitCore.css";
import "./features/invoices/components/invoiceStructure/invoiceStructure.css";
import "./features/invoices/components/paymentRails/paymentRails.css";
import "./features/nexopsShell/documentPrimitives.css";
import "./features/quotes/components/quoteEngine/quoteEngine.css";
import "./features/settings/components/catalog/catalog.css";
import "./features/settings/components/tenantConfig/tenantConfig.css";
import { ProductLogo, SidebarBrandStack, tenantDisplayName } from "./productBranding";
import { NexOpsWorkspace, clientDisplayName, fallbackOperatorContext, loadOperatorContext } from "./features/nexopsShell/NexOpsWorkspace";
import { AppBootstrap } from "./shared/app/AppBootstrap";
import { signOutOperator } from "./shared/auth/authBootstrap";
import { NexiStandaloneChat } from "./features/nexi/areas/chat/components/NexiStandaloneChat";













const NexReachPage = React.lazy(async () => ({ default: (await import("./nexreach")).NexReachPage }));

interface FieldDocsMediaCommentRecord {
  id: string;
  text: string;
  createdAt: string;
  author?: string;
}

interface FieldDocsMediaAnnotationRecord {
  id: string;
  kind: "path";
  color?: string;
  createdAt: string;
  points: Array<{ x: number; y: number }>;
}

interface FieldDocsMediaRecord {
  id: string;
  type: "photo" | "video" | "pdf";
  clientId?: string;
  jobId?: string;
  visitId?: string;
  propertyId?: string;
  captureBatchId?: string;
  storageRef?: string;
  thumbRef?: string;
  aiTags?: string[];
  manualTags?: string[];
  aiCaption?: string;
  exif?: { gps?: { lat: number; lng: number }; ts?: string };
  comments?: FieldDocsMediaCommentRecord[];
  annotations?: FieldDocsMediaAnnotationRecord[];
  capturedBy?: string;
  hiddenFromClient?: boolean;
  trashedAt?: string;
  purgeAfter?: string;
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
  consent: { email: boolean; sms: boolean; marketing?: boolean };
  customFields?: Record<string, string | number | boolean>;
}





















interface CrmClientsResponse {
  ok: boolean;
  clients?: CrmClient[];
  error?: string;
}

















interface FieldDocsTemplateField {
  id: string;
  label: string;
  section: string;
  type: "multi_select" | "count" | "measurement" | "pass_fail" | "free_text" | "photo_attachment";
  memory: "property" | "visit";
  required: boolean;
  photoRequiredDefault?: boolean;
  helpText?: string;
  options?: string[];
  unit?: string;
}

interface FieldDocsTemplateSection {
  id: string;
  title: string;
  allowNa: boolean;
}

interface FieldDocsTemplate {
  id: string;
  slug: string;
  title: string;
  description?: string;
  active: boolean;
  version: number;
  appliesTo: "job" | "visit" | "job_or_visit";
  system?: boolean;
  sections: FieldDocsTemplateSection[];
  itemCount: number;
  propertyPersistentCount: number;
  visitFreshCount: number;
  fieldTypes?: string[];
  fields: FieldDocsTemplateField[];
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
    templateId: string;
    propertyId?: string;
    jobId?: string;
    visitId?: string;
    status: "draft" | "completed";
    sectionStates: Array<{
      section: string;
      status: "active" | "not_applicable";
      updatedAt: string;
      updatedBy?: string;
    }>;
    fields: Array<{
      fieldId: string;
      label: string;
      section: string;
      type: "multi_select" | "count" | "measurement" | "pass_fail" | "free_text" | "photo_attachment";
      memory: "property" | "visit";
      required: boolean;
      photoRequired?: boolean;
      status: "pending" | "pass" | "fail" | "not_applicable";
      note?: string;
      numberValue?: number;
      multiValue?: string[];
      mediaIds?: string[];
      unit?: string;
      options?: string[];
    }>;
  };
  error?: string;
}

interface FieldDocsChecklistListResponse {
  ok: boolean;
  checklists?: NonNullable<FieldDocsChecklistResponse["checklist"]>[];
  error?: string;
}

interface FieldDocsSearchResponse {
  ok: boolean;
  hits?: Array<FieldDocsMediaRecord & {
    score?: number;
    matched?: string[];
  }>;
  error?: string;
}

interface FieldDocsMediaListResponse {
  ok: boolean;
  media?: NonNullable<FieldDocsSearchResponse["hits"]>;
  error?: string;
}



















interface FieldDocsReportResponse {
  ok: boolean;
  report?: {
    id: string;
    title: string;
    pdfRef: string;
    status: string;
    jobId: string;
    propertyId?: string;
    visitId?: string;
    kind?: "field_report" | "ai_recap";
    templateId?: string;
    snippetIds?: string[];
    watermarkEnabled?: boolean;
    createdAt?: string;
    postedAt?: string;
  };
  pdfUrl?: string;
  error?: string;
}

interface FieldDocsReportsListResponse {
  ok: boolean;
  reports?: NonNullable<FieldDocsReportResponse["report"]>[];
  error?: string;
}

interface FieldDocsPropertyHistoryResponse {
  ok: boolean;
  history?: NonNullable<FieldDocsChecklistListResponse["checklists"]>;
  error?: string;
}

interface FieldReportTemplate {
  id: string;
  tenantId: string;
  title: string;
  defaultReportTitle: string;
  sections: Array<{ id: string; label: string; defaultText?: string; snippetIds: string[] }>;
  watermarkByDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FieldReportTemplatesResponse {
  ok: boolean;
  templates?: FieldReportTemplate[];
  error?: string;
}

interface FieldDocsBundleRecord {
  id: string;
  tenantId: string;
  jobTypeKey: string;
  label: string;
  checklistTemplateId: string;
  reportTemplateId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FieldDocsBundlesResponse {
  ok: boolean;
  bundles?: FieldDocsBundleRecord[];
  error?: string;
}

interface FieldDocsTextSnippetRecord {
  id: string;
  tenantId: string;
  label: string;
  bodyText: string;
  createdAt: string;
  updatedAt: string;
}

interface FieldDocsTextSnippetsResponse {
  ok: boolean;
  snippets?: FieldDocsTextSnippetRecord[];
  error?: string;
}





type FieldDocsMediaHit = NonNullable<FieldDocsSearchResponse["hits"]>[number];
type FieldDocsMediaAnnotation = NonNullable<FieldDocsMediaHit["annotations"]>[number];

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





type TenantRole = "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";





interface OperatorContext {
  tenantId: string;
  tenantUserId: string;
  role: TenantRole;
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






















































type NexCamModule = "overview" | "templates" | "photos" | "reports";

const NEXCAM_MODULES: Array<{ id: NexCamModule; label: string; path: string }> = [
  { id: "overview", label: "Overview", path: "/nexcam" },
  { id: "templates", label: "Checklist Templates", path: "/nexcam/templates" },
  { id: "photos", label: "Photos & Media", path: "/nexcam/photos" },
  { id: "reports", label: "Reports", path: "/nexcam/reports" }
];

function nexCamModuleFromPath(pathname: string): NexCamModule {
  const exact = NEXCAM_MODULES.find((module) => pathname === module.path);
  if (exact) {
    return exact.id;
  }
  const nested = [...NEXCAM_MODULES]
    .sort((left, right) => right.path.length - left.path.length)
    .find((module) => pathname.startsWith(`${module.path}/`));
  return nested?.id ?? "overview";
}

function NexCamPage(props: { auth: Auth | null; user: User }): React.ReactElement {
  const mediaStageRef = useRef<HTMLDivElement | null>(null);
  const [operatorContext, setOperatorContext] = useState<OperatorContext>(() => fallbackOperatorContext(props.user));
  const [tenantBranding, setTenantBranding] = useState<TenantBranding | null>(null);
  const [activeModule, setActiveModule] = useState<NexCamModule>(() => nexCamModuleFromPath(window.location.pathname));
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [templates, setTemplates] = useState<FieldDocsTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [mediaHits, setMediaHits] = useState<NonNullable<FieldDocsSearchResponse["hits"]>>([]);
  const [recentMedia, setRecentMedia] = useState<NonNullable<FieldDocsMediaListResponse["media"]>>([]);
  const [history, setHistory] = useState<NonNullable<FieldDocsPropertyHistoryResponse["history"]>>([]);
  const [recentChecklists, setRecentChecklists] = useState<NonNullable<FieldDocsChecklistListResponse["checklists"]>>([]);
  const [checklist, setChecklist] = useState<FieldDocsChecklistResponse["checklist"] | null>(null);
  const [report, setReport] = useState<FieldDocsReportResponse["report"] | null>(null);
  const [reports, setReports] = useState<NonNullable<FieldDocsReportsListResponse["reports"]>>([]);
  const [reportTemplates, setReportTemplates] = useState<FieldReportTemplate[]>([]);
  const [bundles, setBundles] = useState<FieldDocsBundleRecord[]>([]);
  const [textSnippets, setTextSnippets] = useState<FieldDocsTextSnippetRecord[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<FieldDocsMediaHit | null>(null);
  const [mediaCommentDraft, setMediaCommentDraft] = useState("");
  const [mediaManualTagsDraft, setMediaManualTagsDraft] = useState("");
  const [mediaHiddenFromClientDraft, setMediaHiddenFromClientDraft] = useState(false);
  const [mediaReviewSaving, setMediaReviewSaving] = useState(false);
  const [mediaAnnotationsDraft, setMediaAnnotationsDraft] = useState<FieldDocsMediaAnnotation[]>([]);
  const [drawingPath, setDrawingPath] = useState<Array<{ x: number; y: number }> | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [reportUrl, setReportUrl] = useState("");
  const [status, setStatus] = useState("Loading NexCam...");
  const [mediaQuery, setMediaQuery] = useState("Deborah Justice");
  const [clientFilterId, setClientFilterId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [includeTrashed, setIncludeTrashed] = useState(false);
  const [reportTitle, setReportTitle] = useState("Field Documentation Report");
  const [reportKind, setReportKind] = useState<"field_report" | "ai_recap">("field_report");
  const [selectedReportTemplateId, setSelectedReportTemplateId] = useState("");
  const [selectedSnippetIds, setSelectedSnippetIds] = useState<string[]>([]);
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [activeChecklistSection, setActiveChecklistSection] = useState("");
  const [contextIds, setContextIds] = useState({
    propertyId: "property_demo_pool",
    jobId: "job_demo_leak_detection",
    visitId: "visit_demo_2026_07_18"
  });
  const [templateDraft, setTemplateDraft] = useState({
    title: "",
    slug: "",
    description: "",
    appliesTo: "visit" as "job" | "visit" | "job_or_visit"
  });
  const [draftSections, setDraftSections] = useState<Array<{ id: string; title: string; allowNa: boolean }>>([
    { id: "overview", title: "Overview", allowNa: false }
  ]);
  const [draftFields, setDraftFields] = useState<FieldDocsTemplateField[]>([]);
  const [draftField, setDraftField] = useState({
    label: "",
    section: "Overview",
    type: "free_text" as FieldDocsTemplateField["type"],
    memory: "visit" as FieldDocsTemplateField["memory"],
    required: true,
    photoRequiredDefault: false,
    helpText: "",
    unit: "",
    optionsText: ""
  });
  const [reportTemplateDraft, setReportTemplateDraft] = useState({
    title: "",
    defaultReportTitle: "",
    watermarkByDefault: false
  });
  const [reportTemplateSections, setReportTemplateSections] = useState<Array<{ id: string; label: string; defaultText: string; snippetIds: string[] }>>([
    { id: "summary", label: "Summary", defaultText: "", snippetIds: [] }
  ]);
  const [snippetDraft, setSnippetDraft] = useState({ label: "", bodyText: "" });
  const [bundleDraft, setBundleDraft] = useState({
    label: "",
    jobTypeKey: "",
    checklistTemplateId: "",
    reportTemplateId: "",
    active: true
  });

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
    let cancelled = false;
    fetch(`/api/crm/clients?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
      .then((response) => response.json() as Promise<CrmClientsResponse>)
      .then((body) => {
        if (!cancelled) {
          setClients(body.ok ? (body.clients ?? []) : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setClients([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [operatorContext.tenantId]);

  useEffect(() => {
    const onPopState = () => setActiveModule(nexCamModuleFromPath(window.location.pathname));
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
      const nextTemplates = body.templates ?? [];
      setTemplates(nextTemplates);
      setSelectedTemplateId((current) => current && nextTemplates.some((template) => template.id === current)
        ? current
        : (nextTemplates[0]?.id ?? ""));
      setStatus(`${body.templates?.length ?? 0} checklist template${body.templates?.length === 1 ? "" : "s"} ready.`);
    } catch {
      setTemplates([]);
      setStatus("Checklist template API unreachable.");
    }
  }

  async function refreshReportTemplates(): Promise<void> {
    try {
      const body = await fetch(`/api/fielddocs/report-templates?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
        .then((response) => response.json() as Promise<FieldReportTemplatesResponse>);
      const nextTemplates = body.ok ? (body.templates ?? []) : [];
      setReportTemplates(nextTemplates);
      setSelectedReportTemplateId((current) => current && nextTemplates.some((template) => template.id === current)
        ? current
        : (nextTemplates[0]?.id ?? ""));
      setWatermarkEnabled((current) => current || Boolean(nextTemplates[0]?.watermarkByDefault));
    } catch {
      setReportTemplates([]);
    }
  }

  async function refreshBundles(): Promise<void> {
    try {
      const body = await fetch(`/api/fielddocs/bundles?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
        .then((response) => response.json() as Promise<FieldDocsBundlesResponse>);
      setBundles(body.ok ? (body.bundles ?? []) : []);
    } catch {
      setBundles([]);
    }
  }

  async function refreshTextSnippets(): Promise<void> {
    try {
      const body = await fetch(`/api/fielddocs/text-snippets?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
        .then((response) => response.json() as Promise<FieldDocsTextSnippetsResponse>);
      setTextSnippets(body.ok ? (body.snippets ?? []) : []);
    } catch {
      setTextSnippets([]);
    }
  }

  async function refreshRecentMedia(): Promise<void> {
    try {
      const params = new URLSearchParams({
        tenantId: operatorContext.tenantId,
        propertyId: contextIds.propertyId,
        jobId: contextIds.jobId,
        visitId: contextIds.visitId,
        limit: "12",
        includeTrashed: String(includeTrashed)
      });
      if (clientFilterId.trim()) params.set("clientId", clientFilterId.trim());
      if (dateFrom) params.set("dateFrom", `${dateFrom}T00:00:00.000Z`);
      if (dateTo) params.set("dateTo", `${dateTo}T23:59:59.999Z`);
      const body = await fetch(`/api/fielddocs/media?${params.toString()}`)
        .then((response) => response.json() as Promise<FieldDocsMediaListResponse>);
      setRecentMedia(body.ok ? (body.media ?? []) : []);
    } catch {
      setRecentMedia([]);
    }
  }

  async function refreshHistory(): Promise<void> {
    if (!contextIds.propertyId.trim()) {
      setHistory([]);
      return;
    }
    try {
      const body = await fetch(`/api/fielddocs/properties/${encodeURIComponent(contextIds.propertyId)}/history?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
        .then((response) => response.json() as Promise<FieldDocsPropertyHistoryResponse>);
      setHistory(body.ok ? (body.history ?? []) : []);
    } catch {
      setHistory([]);
    }
  }

  async function refreshChecklists(): Promise<void> {
    try {
      const params = new URLSearchParams({ tenantId: operatorContext.tenantId });
      if (contextIds.propertyId.trim()) params.set("propertyId", contextIds.propertyId.trim());
      if (contextIds.jobId.trim()) params.set("jobId", contextIds.jobId.trim());
      if (contextIds.visitId.trim()) params.set("visitId", contextIds.visitId.trim());
      const body = await fetch(`/api/fielddocs/checklists?${params.toString()}`)
        .then((response) => response.json() as Promise<FieldDocsChecklistListResponse>);
      setRecentChecklists(body.ok ? (body.checklists ?? []) : []);
    } catch {
      setRecentChecklists([]);
    }
  }

  async function refreshReports(): Promise<void> {
    try {
      const params = new URLSearchParams({
        tenantId: operatorContext.tenantId,
        propertyId: contextIds.propertyId,
        jobId: contextIds.jobId,
        visitId: contextIds.visitId,
        limit: "12"
      });
      if (clientFilterId.trim()) params.set("clientId", clientFilterId.trim());
      if (dateFrom) params.set("dateFrom", `${dateFrom}T00:00:00.000Z`);
      if (dateTo) params.set("dateTo", `${dateTo}T23:59:59.999Z`);
      const body = await fetch(`/api/fielddocs/reports?${params.toString()}`)
        .then((response) => response.json() as Promise<FieldDocsReportsListResponse>);
      const nextReports = body.ok ? (body.reports ?? []) : [];
      setReports(nextReports);
      setReport((current) => current ?? nextReports[0] ?? null);
    } catch {
      setReports([]);
    }
  }

  async function createChecklist(): Promise<void> {
    setStatus("Creating checklist from library...");
    try {
      const body = await fetch("/api/fielddocs/checklists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          templateId: selectedTemplateId || templates[0]?.id,
          propertyId: contextIds.propertyId.trim() || undefined,
          jobId: contextIds.jobId.trim() || undefined,
          visitId: contextIds.visitId.trim() || undefined
        })
      }).then((response) => response.json() as Promise<FieldDocsChecklistResponse>);
      if (!body.ok || !body.checklist) {
        setStatus(body.error ?? "Checklist could not be created.");
        return;
      }
      setChecklist(body.checklist);
      setActiveChecklistSection(body.checklist.fields[0]?.section ?? "");
      await refreshChecklists();
      setStatus(`Checklist ${body.checklist.id} created with ${body.checklist.fields.length} fields.`);
    } catch {
      setStatus("Checklist create request failed.");
    }
  }

  async function saveChecklist(complete = false): Promise<void> {
    if (!checklist) {
      return;
    }
    setStatus(complete ? "Completing checklist..." : "Saving checklist...");
    try {
      const body = await fetch(`/api/fielddocs/checklists/${encodeURIComponent(checklist.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          complete,
          updates: checklist.fields.map((field) => ({
            fieldId: field.fieldId,
            status: field.status,
            photoRequired: field.photoRequired ?? false,
            ...(field.note !== undefined ? { note: field.note } : {}),
            ...(field.numberValue !== undefined ? { numberValue: field.numberValue } : {}),
            ...(field.multiValue !== undefined ? { multiValue: field.multiValue } : {}),
            ...(field.mediaIds !== undefined ? { mediaIds: field.mediaIds } : {})
          })),
          sectionStateUpdates: checklist.sectionStates.map((section) => ({
            section: section.section,
            status: section.status
          }))
        })
      }).then((response) => response.json() as Promise<FieldDocsChecklistResponse>);
      if (!body.ok || !body.checklist) {
        setStatus(body.error ?? "Checklist save failed.");
        return;
      }
      setChecklist(body.checklist);
      await Promise.all([refreshHistory(), refreshReports(), refreshChecklists()]);
      setStatus(complete ? "Checklist completed and property memory updated." : "Checklist draft saved.");
    } catch {
      setStatus("Checklist save request failed.");
    }
  }

  function patchChecklistField(fieldId: string, patch: Partial<NonNullable<FieldDocsChecklistResponse["checklist"]>["fields"][number]>): void {
    setChecklist((current) => current ? {
      ...current,
      fields: current.fields.map((field) => field.fieldId === fieldId ? { ...field, ...patch } : field)
    } : current);
  }

  function patchChecklistSection(sectionName: string, status: "active" | "not_applicable"): void {
    setChecklist((current) => current ? {
      ...current,
      sectionStates: current.sectionStates.map((section) => section.section === sectionName ? {
        ...section,
        status,
        updatedAt: new Date().toISOString()
      } : section)
    } : current);
  }

  async function searchMedia(): Promise<void> {
    setStatus("Searching NexCam media...");
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
    setStatus("Generating NexCam report...");
    try {
      const mediaIds = (recentMedia.length ? recentMedia : mediaHits).map((hit) => hit.id);
      const template = reportTemplates.find((entry) => entry.id === selectedReportTemplateId);
      const body = await fetch("/api/fielddocs/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          propertyId: contextIds.propertyId.trim() || undefined,
          jobId: contextIds.jobId.trim() || undefined,
          visitId: contextIds.visitId.trim() || undefined,
          kind: reportKind,
          title: reportTitle,
          findings: [
            reportKind === "ai_recap"
              ? "AI recap assembled from captured field media, checklist completion, and the current visit context."
              : "Checklist-driven report generated from NexCam.",
            "Report can attach to closeout receipts and approval-gated emails."
          ],
          mediaIds,
          checklistId: checklist?.id,
          ...(template ? { templateId: template.id } : {}),
          ...(selectedSnippetIds.length ? { snippetIds: selectedSnippetIds } : {}),
          watermarkEnabled,
          status: "posted"
        })
      }).then((response) => response.json() as Promise<FieldDocsReportResponse>);
      if (!body.ok || !body.report) {
        setStatus(body.error ?? "Report could not be created.");
        return;
      }
      setReport(body.report);
      setReportUrl(body.pdfUrl ?? "");
      await refreshReports();
      setStatus(`Report ${body.report.id} generated.`);
    } catch {
      setStatus("Report create request failed.");
    }
  }

  async function saveTemplate(): Promise<void> {
    if (!templateDraft.title.trim() || !templateDraft.slug.trim() || !draftFields.length) {
      setStatus("Template title, slug, and at least one field are required.");
      return;
    }
    setStatus("Saving checklist template...");
    try {
      const body = await fetch("/api/fielddocs/checklists/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          title: templateDraft.title.trim(),
          slug: templateDraft.slug.trim(),
          description: templateDraft.description.trim() || undefined,
          appliesTo: templateDraft.appliesTo,
          active: true,
          version: 1,
          sections: draftSections
            .filter((section) => draftFields.some((field) => field.section === section.title))
            .map((section) => ({
              id: section.id,
              title: section.title,
              allowNa: section.allowNa
            })),
          fields: draftFields
        })
      }).then((response) => response.json() as Promise<{ ok: boolean; error?: string }>);
      if (!body.ok) {
        setStatus(body.error ?? "Template save failed.");
        return;
      }
      setDraftFields([]);
      setTemplateDraft({ title: "", slug: "", description: "", appliesTo: "visit" });
      setDraftSections([{ id: "overview", title: "Overview", allowNa: false }]);
      setDraftField({
        label: "",
        section: "Overview",
        type: "free_text",
        memory: "visit",
        required: true,
        photoRequiredDefault: false,
        helpText: "",
        unit: "",
        optionsText: ""
      });
      await refreshTemplates();
      setStatus("Template saved to the NexCam library.");
    } catch {
      setStatus("Template save request failed.");
    }
  }

  function addDraftField(): void {
    if (!draftField.label.trim() || !draftField.section.trim()) {
      setStatus("Each field needs a label and section.");
      return;
    }
    const sectionTitle = draftField.section.trim();
    setDraftFields((current) => [
      ...current,
      {
        id: `field_${crypto.randomUUID()}`,
        label: draftField.label.trim(),
        section: sectionTitle,
        type: draftField.type,
        memory: draftField.memory,
        required: draftField.required,
        photoRequiredDefault: draftField.photoRequiredDefault,
        ...(draftField.helpText.trim() ? { helpText: draftField.helpText.trim() } : {}),
        ...(draftField.unit.trim() ? { unit: draftField.unit.trim() } : {}),
        ...(draftField.optionsText.trim() ? { options: draftField.optionsText.split(",").map((option) => option.trim()).filter(Boolean) } : {})
      }
    ]);
    setDraftSections((current) => current.some((section) => section.title === sectionTitle)
      ? current
      : [...current, {
          id: sectionTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
          title: sectionTitle,
          allowNa: false
        }]
    );
    setDraftField({
      label: "",
      section: sectionTitle,
      type: "free_text",
      memory: "visit",
      required: true,
      photoRequiredDefault: false,
      helpText: "",
      unit: "",
      optionsText: ""
    });
    setStatus("Field added to the draft template.");
  }

  function removeDraftField(fieldId: string): void {
    setDraftFields((current) => current.filter((field) => field.id !== fieldId));
  }

  function toggleDraftSectionAllowNa(sectionId: string): void {
    setDraftSections((current) => current.map((section) => section.id === sectionId ? {
      ...section,
      allowNa: !section.allowNa
    } : section));
  }

  function removeDraftSection(sectionId: string): void {
    const section = draftSections.find((entry) => entry.id === sectionId);
    if (!section) {
      return;
    }
    setDraftSections((current) => current.filter((entry) => entry.id !== sectionId));
    setDraftFields((current) => current.filter((field) => field.section !== section.title));
  }

  async function saveReportTemplate(): Promise<void> {
    if (!reportTemplateDraft.title.trim() || !reportTemplateDraft.defaultReportTitle.trim() || !reportTemplateSections.length) {
      setStatus("Report templates need a title, default report title, and at least one section.");
      return;
    }
    setStatus("Saving report template...");
    try {
      const body = await fetch("/api/fielddocs/report-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          title: reportTemplateDraft.title.trim(),
          defaultReportTitle: reportTemplateDraft.defaultReportTitle.trim(),
          sections: reportTemplateSections.map((section) => ({
            id: section.id,
            label: section.label,
            ...(section.defaultText.trim() ? { defaultText: section.defaultText.trim() } : {}),
            snippetIds: section.snippetIds
          })),
          watermarkByDefault: reportTemplateDraft.watermarkByDefault
        })
      }).then((response) => response.json() as Promise<{ ok: boolean; error?: string }>);
      if (!body.ok) {
        setStatus(body.error ?? "Report template save failed.");
        return;
      }
      setReportTemplateDraft({ title: "", defaultReportTitle: "", watermarkByDefault: false });
      setReportTemplateSections([{ id: "summary", label: "Summary", defaultText: "", snippetIds: [] }]);
      await refreshReportTemplates();
      setStatus("Report template saved.");
    } catch {
      setStatus("Report template save failed.");
    }
  }

  async function saveTextSnippet(): Promise<void> {
    if (!snippetDraft.label.trim() || !snippetDraft.bodyText.trim()) {
      setStatus("Snippets need both a label and body text.");
      return;
    }
    setStatus("Saving reusable text snippet...");
    try {
      const body = await fetch("/api/fielddocs/text-snippets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          label: snippetDraft.label.trim(),
          bodyText: snippetDraft.bodyText.trim()
        })
      }).then((response) => response.json() as Promise<{ ok: boolean; error?: string }>);
      if (!body.ok) {
        setStatus(body.error ?? "Text snippet save failed.");
        return;
      }
      setSnippetDraft({ label: "", bodyText: "" });
      await refreshTextSnippets();
      setStatus("Reusable text snippet saved.");
    } catch {
      setStatus("Text snippet save failed.");
    }
  }

  async function saveBundle(): Promise<void> {
    if (!bundleDraft.label.trim() || !bundleDraft.jobTypeKey.trim() || !bundleDraft.checklistTemplateId || !bundleDraft.reportTemplateId) {
      setStatus("Bundles need a label, job-type key, checklist template, and report template.");
      return;
    }
    setStatus("Saving job-type bundle...");
    try {
      const body = await fetch("/api/fielddocs/bundles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          label: bundleDraft.label.trim(),
          jobTypeKey: bundleDraft.jobTypeKey.trim(),
          checklistTemplateId: bundleDraft.checklistTemplateId,
          reportTemplateId: bundleDraft.reportTemplateId,
          active: bundleDraft.active
        })
      }).then((response) => response.json() as Promise<{ ok: boolean; error?: string }>);
      if (!body.ok) {
        setStatus(body.error ?? "Bundle save failed.");
        return;
      }
      setBundleDraft({
        label: "",
        jobTypeKey: "",
        checklistTemplateId: templates[0]?.id ?? "",
        reportTemplateId: reportTemplates[0]?.id ?? "",
        active: true
      });
      await refreshBundles();
      setStatus("Job-type bundle saved.");
    } catch {
      setStatus("Bundle save failed.");
    }
  }

  function toggleSnippetSelection(snippetId: string): void {
    setSelectedSnippetIds((current) => current.includes(snippetId)
      ? current.filter((entry) => entry !== snippetId)
      : [...current, snippetId]
    );
  }

  function setModule(module: NexCamModule): void {
    const target = NEXCAM_MODULES.find((entry) => entry.id === module) ?? NEXCAM_MODULES[0];
    setActiveModule(module);
    window.history.pushState({}, "", target.path);
  }

  useEffect(() => {
    void refreshTemplates();
    void refreshReportTemplates();
    void refreshBundles();
    void refreshTextSnippets();
  }, [operatorContext.tenantId]);

  useEffect(() => {
    setBundleDraft((current) => ({
      ...current,
      checklistTemplateId: current.checklistTemplateId || templates[0]?.id || "",
      reportTemplateId: current.reportTemplateId || reportTemplates[0]?.id || ""
    }));
  }, [reportTemplates, templates]);

  useEffect(() => {
    void Promise.all([refreshRecentMedia(), refreshHistory(), refreshReports(), refreshChecklists()]);
  }, [operatorContext.tenantId, contextIds.propertyId, contextIds.jobId, contextIds.visitId, clientFilterId, dateFrom, dateTo, includeTrashed]);

  useEffect(() => {
    if (!checklist) {
      setActiveChecklistSection("");
      return;
    }
    const firstSection = checklist.fields[0]?.section ?? "";
    const hasCurrentSection = checklist.fields.some((field) => field.section === activeChecklistSection);
    if (!hasCurrentSection) {
      setActiveChecklistSection(firstSection);
    }
  }, [checklist, activeChecklistSection]);

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
  const template = templates.find((item) => item.id === selectedTemplateId) ?? templates[0];
  const checklistTemplate = checklist
    ? templates.find((item) => item.id === checklist.templateId) ?? template
    : template;
  const activeSectionRecord = checklist?.sectionStates.find((section) => section.section === activeChecklistSection);
  const activeSectionTemplate = checklistTemplate?.sections.find((section) => section.title === activeChecklistSection);
  const activeSectionAllowsNa = activeSectionTemplate?.allowNa === true;
  const activeSectionIsNa = activeSectionRecord?.status === "not_applicable";

  function renderChecklistField(field: NonNullable<FieldDocsChecklistResponse["checklist"]>["fields"][number]): React.ReactElement {
    return (
      <article className="nexops-module-card" key={field.fieldId}>
        <p className="eyebrow">{field.section} · {field.memory === "property" ? "Property field" : "Visit field"}</p>
        <h2>{field.label}</h2>
        <p className="nexcam-field-note">
          {field.required ? "Required" : "Optional"}
          {field.photoRequired ? " - photo required on this checklist" : ""}
        </p>
        {field.type === "pass_fail" ? (
          <>
            <label className="nexops-field">
              <span>Status</span>
              <select value={field.status} onChange={(event) => patchChecklistField(field.fieldId, { status: event.target.value as typeof field.status })}>
                <option value="pending">Pending</option>
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
                <option value="not_applicable">Not applicable</option>
              </select>
            </label>
            <label className="nexops-field">
              <span>Notes</span>
              <textarea rows={3} value={field.note ?? ""} onChange={(event) => patchChecklistField(field.fieldId, { note: event.target.value })} />
            </label>
          </>
        ) : null}
        {field.type === "free_text" ? (
          <label className="nexops-field">
            <span>Notes</span>
            <textarea rows={3} value={field.note ?? ""} onChange={(event) => patchChecklistField(field.fieldId, { note: event.target.value })} />
          </label>
        ) : null}
        {(field.type === "count" || field.type === "measurement") ? (
          <label className="nexops-field">
            <span>{field.unit ? `Value (${field.unit})` : "Value"}</span>
            <input
              type="number"
              value={field.numberValue ?? ""}
              onChange={(event) => patchChecklistField(field.fieldId, { numberValue: event.target.value === "" ? undefined : Number(event.target.value) })}
            />
          </label>
        ) : null}
        {field.type === "multi_select" ? (
          <div className="nexops-field">
            <span>Choices</span>
            <div className="nexops-request-toggle-row">
              {(field.options ?? []).map((option) => {
                const selected = field.multiValue?.includes(option) ?? false;
                return (
                  <button
                    type="button"
                    className={selected ? "active" : ""}
                    key={option}
                    onClick={() => patchChecklistField(field.fieldId, {
                      multiValue: selected
                        ? (field.multiValue ?? []).filter((candidate) => candidate !== option)
                        : [...(field.multiValue ?? []), option]
                    })}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {field.type === "photo_attachment" ? (
          <label className="nexops-field">
            <span>Attached media IDs (comma separated)</span>
            <textarea
              rows={2}
              value={(field.mediaIds ?? []).join(", ")}
              onChange={(event) => patchChecklistField(field.fieldId, {
                mediaIds: event.target.value.split(",").map((item) => item.trim()).filter(Boolean)
              })}
            />
          </label>
        ) : null}
        <label className="nexops-check-field inline">
          <input
            type="checkbox"
            checked={field.photoRequired ?? false}
            onChange={(event) => patchChecklistField(field.fieldId, { photoRequired: event.target.checked })}
          />
          Photo required on this checklist instance
        </label>
      </article>
    );
  }

  const checklistSections = checklist
    ? Array.from(new Set(checklist.fields.map((field) => field.section)))
    : [];
  const visibleChecklistFields = checklist
    ? checklist.fields.filter((field) => field.section === (activeChecklistSection || checklistSections[0] || field.section))
    : [];
  const latestHistory = history[0];
  const carryforwardFields = latestHistory?.fields.filter((field) => field.memory === "property") ?? [];

  function fieldHasValue(field: NonNullable<FieldDocsChecklistResponse["checklist"]>["fields"][number]): boolean {
    return field.status !== "pending"
      || (field.note ?? "").trim().length > 0
      || field.numberValue !== undefined
      || (field.multiValue?.length ?? 0) > 0
      || (field.mediaIds?.length ?? 0) > 0;
  }

  function describeFieldValue(field: NonNullable<FieldDocsChecklistResponse["checklist"]>["fields"][number]): string {
    if (field.type === "multi_select") {
      return field.multiValue?.length ? field.multiValue.join(", ") : "Blank";
    }
    if (field.type === "count" || field.type === "measurement") {
      return field.numberValue !== undefined
        ? `${field.numberValue}${field.unit ? ` ${field.unit}` : ""}`
        : "Blank";
    }
    if (field.type === "photo_attachment") {
      return `${field.mediaIds?.length ?? 0} attached`;
    }
    if ((field.note ?? "").trim()) {
      return field.note ?? "";
    }
    if (field.status !== "pending") {
      return field.status.replaceAll("_", " ");
    }
    return "Blank";
  }

  function syncMediaRecord(nextMedia: FieldDocsMediaHit): void {
    setSelectedMedia(nextMedia);
    setMediaAnnotationsDraft(nextMedia.annotations ?? []);
    setCaptureSession((current) => current && current.media.some((item) => item.id === nextMedia.id)
      ? {
          ...current,
          media: current.media.map((item) => item.id === nextMedia.id ? { ...item, ...nextMedia } : item)
        }
      : current);
    setRecentMedia((current) => current.map((item) => item.id === nextMedia.id ? nextMedia : item));
    setMediaHits((current) => current.map((item) => item.id === nextMedia.id ? nextMedia : item));
  }

  function openMediaReview(hit: FieldDocsMediaHit): void {
    setSelectedMedia(hit);
    setMediaCommentDraft("");
    setMediaManualTagsDraft((hit.manualTags ?? []).join(", "));
    setMediaHiddenFromClientDraft(hit.hiddenFromClient === true);
    setMediaAnnotationsDraft(hit.annotations ?? []);
    setDrawingPath(null);
    setDrawMode(false);
  }

  function closeMediaReview(): void {
    setSelectedMedia(null);
    setMediaCommentDraft("");
    setMediaManualTagsDraft("");
    setMediaHiddenFromClientDraft(false);
    setMediaAnnotationsDraft([]);
    setDrawingPath(null);
    setDrawMode(false);
  }

  function mediaPoint(event: React.PointerEvent<HTMLDivElement>): { x: number; y: number } | null {
    const bounds = mediaStageRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      return null;
    }
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
    };
  }

  function beginMediaDraw(event: React.PointerEvent<HTMLDivElement>): void {
    if (!drawMode || !selectedMedia || selectedMedia.type !== "photo") {
      return;
    }
    const point = mediaPoint(event);
    if (!point) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrawingPath([point]);
  }

  function updateMediaDraw(event: React.PointerEvent<HTMLDivElement>): void {
    if (!drawMode || !drawingPath) {
      return;
    }
    const point = mediaPoint(event);
    if (!point) {
      return;
    }
    setDrawingPath((current) => current ? [...current, point] : current);
  }

  function finishMediaDraw(event: React.PointerEvent<HTMLDivElement>): void {
    if (!drawMode || !drawingPath) {
      return;
    }
    const point = mediaPoint(event);
    const points = point ? [...drawingPath, point] : drawingPath;
    if (points.length >= 2) {
      setMediaAnnotationsDraft((current) => [
        ...current,
        {
          id: `annotation_${crypto.randomUUID()}`,
          kind: "path",
          color: "#106060",
          createdAt: new Date().toISOString(),
          points
        }
      ]);
      setStatus("Markup added. Save media review to keep it.");
    }
    setDrawingPath(null);
  }

  function removeLastMarkup(): void {
    setMediaAnnotationsDraft((current) => current.slice(0, -1));
    setStatus("Last markup removed. Save media review to keep the change.");
  }

  function annotationPolyline(points: Array<{ x: number; y: number }>): string {
    return points.map((point) => `${(point.x * 100).toFixed(2)},${(point.y * 100).toFixed(2)}`).join(" ");
  }

  async function saveMediaReview(): Promise<void> {
    if (!selectedMedia || mediaReviewSaving) {
      return;
    }
    setMediaReviewSaving(true);
    setStatus("Saving photo review...");
    try {
      const response = await fetch(`/api/fielddocs/media/${encodeURIComponent(selectedMedia.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          ...(mediaCommentDraft.trim() ? { comment: mediaCommentDraft.trim() } : {}),
          manualTags: mediaManualTagsDraft.split(",").map((tag) => tag.trim()).filter(Boolean),
          hiddenFromClient: mediaHiddenFromClientDraft,
          annotations: mediaAnnotationsDraft
        })
      });
      const body = await response.json() as { ok: boolean; media?: FieldDocsMediaHit; error?: string };
      if (!response.ok || !body.ok || !body.media) {
        throw new Error(body.error ?? "Photo review save failed.");
      }
      syncMediaRecord(body.media);
      setMediaCommentDraft("");
      setDrawingPath(null);
      setDrawMode(false);
      setStatus("Photo review saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Photo review save failed.");
    } finally {
      setMediaReviewSaving(false);
    }
  }

  async function setMediaTrashState(trashed: boolean): Promise<void> {
    if (!selectedMedia || mediaReviewSaving) {
      return;
    }
    setMediaReviewSaving(true);
    setStatus(trashed ? "Moving photo to tenant trash..." : "Restoring photo from tenant trash...");
    try {
      const response = await fetch(`/api/fielddocs/media/${encodeURIComponent(selectedMedia.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          trashedAt: trashed ? new Date().toISOString() : null,
          purgeAfter: trashed ? new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString() : null
        })
      });
      const body = await response.json() as { ok: boolean; media?: FieldDocsMediaHit; error?: string };
      if (!response.ok || !body.ok || !body.media) {
        throw new Error(body.error ?? "Photo trash update failed.");
      }
      syncMediaRecord(body.media);
      await refreshRecentMedia();
      setStatus(trashed ? "Photo moved to tenant trash. It will purge after 30 days unless restored." : "Photo restored from tenant trash.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Photo trash update failed.");
    } finally {
      setMediaReviewSaving(false);
    }
  }

  function mediaContextLabel(hit: NonNullable<FieldDocsSearchResponse["hits"]>[number]): string {
    if (hit.visitId) return `Visit ${hit.visitId}`;
    if (hit.jobId) return `Job ${hit.jobId}`;
    if (hit.propertyId) return `Property ${hit.propertyId}`;
    return "Unassigned review queue";
  }

  function formatFieldType(field: FieldDocsTemplateField): string {
    return field.type.replaceAll("_", " ");
  }

  function renderMediaCard(hit: FieldDocsMediaHit, eyebrow: string): React.ReactElement {
    const timestamp = hit.exif?.ts ? hit.exif.ts.slice(0, 16).replace("T", " ") : "No capture time";
    const gps = hit.exif?.gps ? `${hit.exif.gps.lat.toFixed(4)}, ${hit.exif.gps.lng.toFixed(4)}` : "No GPS on file";
    const allTags = Array.from(new Set([...(hit.aiTags ?? []), ...(hit.manualTags ?? [])]));
    return (
      <article className="nexops-module-card" key={`${eyebrow}-${hit.id}`}>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{hit.aiCaption || hit.storageRef}</h2>
        <p>{allTags.length ? allTags.join(", ") : "AI tags still pending or not available."}</p>
        <small>{mediaContextLabel(hit)}</small>
        <small>{timestamp}</small>
        <small>{gps}</small>
        <small>
          {hit.manualTags?.length ? `Manual tags: ${hit.manualTags.join(", ")}` : "No manual tags yet"}
          {hit.hiddenFromClient ? " - hidden from client" : ""}
          {hit.trashedAt ? " - in tenant trash" : ""}
        </small>
        <small>{(hit.comments?.length ?? 0)} comment{(hit.comments?.length ?? 0) === 1 ? "" : "s"} · {(hit.annotations?.length ?? 0)} markup path{(hit.annotations?.length ?? 0) === 1 ? "" : "s"}</small>
        <div className="nexops-inline-actions">
          {hit.type === "photo" ? (
            <button className="nexops-link-button" type="button" onClick={() => openMediaReview(hit)}>Review photo</button>
          ) : null}
          <a className="nexops-link-button" href={`/api/media/${encodeURIComponent(hit.id)}?tenantId=${encodeURIComponent(operatorContext.tenantId)}`} target="_blank" rel="noreferrer">Open file</a>
        </div>
      </article>
    );
  }

  function renderOverview(): React.ReactElement {
    const filledCount = checklist ? checklist.fields.filter((field) => fieldHasValue(field)).length : 0;
    const activeSection = activeChecklistSection || checklistSections[0] || "No section yet";
    return (
      <section className="nexops-dashboard">
        <div className="nexops-page-heading">
          <div>
            <ProductLogo product="nexcam" className="nexcam-heading-logo" alt="NexCam" />
            <p>Template-driven field capture, visit media, property carryforward, and closeout-ready reports.</p>
          </div>
          <div className="nexops-inline-actions">
            <button className="nexops-link-button" type="button" onClick={() => void refreshChecklists()}>Refresh context</button>
            <button type="button" onClick={() => void createChecklist()}>Start checklist</button>
          </div>
        </div>
        <div className="nexops-workflow-strip">
          {[
            ["Templates", String(templates.length), "Reusable library, not a one-off checklist."],
            ["Carryforward", String(carryforwardFields.length), "Property memory pulled from the latest completed visit."],
            ["Recent media", String(recentMedia.length), "Visit-scoped photos, PDFs, and uploads."],
            ["Reports", String(reports.length), "PDF exports ready for the receipt rail."]
          ].map(([title, value, detail]) => (
            <article key={title}>
              <span>{title}</span>
              <strong>{value}</strong>
              <p>{detail}</p>
            </article>
          ))}
        </div>
        <div className="nexops-two-column">
          <section className="nexops-module-page">
            <article className="nexops-module-card wide nexcam-context-card">
              <p className="eyebrow">Visit context</p>
              <h2>Start from a real property, job, and visit rail</h2>
              <div className="nexops-request-builder-grid">
                <label className="nexops-field">
                  <span>Property ID</span>
                  <input value={contextIds.propertyId} onChange={(event) => setContextIds((current) => ({ ...current, propertyId: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Job ID</span>
                  <input value={contextIds.jobId} onChange={(event) => setContextIds((current) => ({ ...current, jobId: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Visit ID</span>
                  <input value={contextIds.visitId} onChange={(event) => setContextIds((current) => ({ ...current, visitId: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Template</span>
                  <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
                    {templates.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
                  </select>
                </label>
              </div>
              {template ? (
                <div className="nexops-request-summary-grid">
                  <article>
                    <h3>{template.title}</h3>
                    <p>{template.itemCount} fields across {template.sections.length} sections.</p>
                    <small>{template.appliesTo.replaceAll("_", " ")} rail</small>
                  </article>
                  <article>
                    <h3>{template.propertyPersistentCount} property fields</h3>
                    <p>{template.visitFreshCount} visit-fresh fields start blank every time.</p>
                    <small>{template.fieldTypes?.join(", ") ?? "Field types ready"}</small>
                  </article>
                </div>
              ) : null}
            </article>
            {checklist ? (
              <article className="nexops-module-card wide nexcam-checklist-shell">
                <p className="eyebrow">Active checklist</p>
                <h2>{checklist.title}</h2>
                <p>{filledCount} of {checklist.fields.length} fields have data. Current section: {activeSection}.</p>
                <div className="nexcam-section-pills">
                  {checklistSections.map((section) => {
                    const sectionCount = checklist.fields.filter((field) => field.section === section).length;
                    const sectionFilled = checklist.fields.filter((field) => field.section === section && fieldHasValue(field)).length;
                    return (
                      <button
                        type="button"
                        key={section}
                        className={section === activeSection ? "active" : ""}
                        onClick={() => setActiveChecklistSection(section)}
                      >
                        {section} ({sectionFilled}/{sectionCount}){checklist.sectionStates.find((entry) => entry.section === section)?.status === "not_applicable" ? " - N/A" : ""}
                      </button>
                    );
                  })}
                </div>
                {activeSectionAllowsNa ? (
                  <div className="nexops-inline-actions">
                    <button
                      className={activeSectionIsNa ? "" : "nexops-link-button"}
                      type="button"
                      onClick={() => patchChecklistSection(activeSection, activeSectionIsNa ? "active" : "not_applicable")}
                    >
                      {activeSectionIsNa ? "Section marked N/A - restore section" : "Mark this section N/A"}
                    </button>
                    <small>{activeSectionIsNa ? "This section will not block completion or show as incomplete in the report." : "Use this only when the full section does not apply on this checklist."}</small>
                  </div>
                ) : null}
                {activeSectionIsNa ? (
                  <p className="nexops-form-note">This live checklist section is currently marked not applicable.</p>
                ) : null}
                <div className="nexcam-media-grid">
                  {visibleChecklistFields.map((field) => renderChecklistField(field))}
                </div>
                <div className="nexops-inline-actions">
                  <button className="nexops-link-button" type="button" onClick={() => void saveChecklist(false)}>Save draft</button>
                  <button type="button" onClick={() => void saveChecklist(true)}>Complete checklist</button>
                </div>
              </article>
            ) : (
              <article className="nexops-module-card wide">
                <p className="eyebrow">No checklist open</p>
                <h2>Pick a template, then start the visit checklist</h2>
                <p>NexCam now reads from the real template library and stores property-memory fields back on the property rail.</p>
              </article>
            )}
          </section>
          <section className="nexops-module-page">
            <article className="nexops-module-card wide">
              <p className="eyebrow">Property carryforward</p>
              <h2>{latestHistory ? `Latest completed checklist ${latestHistory.id}` : "Nothing completed for this property yet"}</h2>
              <p>{latestHistory ? "These are the property-persistent values ready to prefill the next visit on this exact property." : "Complete one visit checklist for this property to see carryforward values here."}</p>
              {carryforwardFields.length ? (
                <ul className="nexcam-history-values">
                  {carryforwardFields.map((field) => (
                    <li key={field.fieldId}>
                      <strong>{field.label}</strong>
                      <span>{describeFieldValue(field)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
            <ul className="nexops-mini-list">
              {recentChecklists.slice(0, 4).map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.title}</strong>
                  <span>{entry.visitId ?? entry.jobId ?? entry.propertyId ?? "Current context"} - {entry.status}</span>
                </li>
              ))}
              {!recentChecklists.length ? (
                <li>
                  <strong>No checklists in this context yet</strong>
                  <span>Create one from the selected template to start the history rail.</span>
                </li>
              ) : null}
            </ul>
          </section>
        </div>
      </section>
    );
  }







  function renderTemplatesPanel(): React.ReactElement {
    return (
      <section className="nexops-module-page">
        <div className="nexops-page-heading">
          <div>
            <h1>Checklist Templates</h1>
            <p>Generalized library with explicit property-field vs visit-field storage rails.</p>
          </div>
          <div className="nexops-inline-actions">
            <button className="nexops-link-button" type="button" onClick={() => void refreshTemplates()}>Refresh</button>
            <button type="button" onClick={() => void createChecklist()}>Create visit checklist</button>
          </div>
        </div>
        <div className="nexops-two-column">
          <section className="nexops-module-page">
            <article className="nexops-module-card wide">
              <p className="eyebrow">Library</p>
              <h2>{template?.title ?? "No templates found"}</h2>
              <p>{template?.description ?? "Create reusable NexCam templates, then launch visit checklists from them."}</p>
              {template ? (
                <div className="nexops-request-summary-grid">
                  <article>
                    <h3>{template.propertyPersistentCount} property fields</h3>
                    <p>Carry forward on the next visit for this exact property.</p>
                    <small>{template.sections.join(", ")}</small>
                  </article>
                  <article>
                    <h3>{template.visitFreshCount} visit fields</h3>
                    <p>Always blank when a new visit checklist starts.</p>
                    <small>{template.fieldTypes?.join(", ") ?? "Mixed field types"}</small>
                  </article>
                </div>
              ) : null}
            </article>
            <ul className="nexops-record-list">
              {templates.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.itemCount} fields - {item.appliesTo.replaceAll("_", " ")} - {item.system ? "Seeded template" : "Owner template"}</small>
                  </div>
                  <mark>{item.sections.length} sections</mark>
                  <button className="nexops-link-button" type="button" onClick={() => setSelectedTemplateId(item.id)}>Use</button>
                </li>
              ))}
            </ul>
          </section>
          <section className="nexops-module-page">
            <article className="nexops-module-card wide nexops-request-builder-card">
              <p className="eyebrow">New reusable template</p>
              <div className="nexops-request-builder-grid">
                <label className="nexops-field">
                  <span>Title</span>
                  <input value={templateDraft.title} onChange={(event) => setTemplateDraft((current) => ({ ...current, title: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Slug</span>
                  <input value={templateDraft.slug} onChange={(event) => setTemplateDraft((current) => ({ ...current, slug: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Applies to</span>
                  <select value={templateDraft.appliesTo} onChange={(event) => setTemplateDraft((current) => ({ ...current, appliesTo: event.target.value as typeof current.appliesTo }))}>
                    <option value="visit">Visit</option>
                    <option value="job">Job</option>
                    <option value="job_or_visit">Job or visit</option>
                  </select>
                </label>
                <label className="nexops-field">
                  <span>Description</span>
                  <input value={templateDraft.description} onChange={(event) => setTemplateDraft((current) => ({ ...current, description: event.target.value }))} />
                </label>
              </div>
              <div className="nexops-request-builder-grid">
                <label className="nexops-field">
                  <span>Field label</span>
                  <input value={draftField.label} onChange={(event) => setDraftField((current) => ({ ...current, label: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Section</span>
                  <input value={draftField.section} onChange={(event) => setDraftField((current) => ({ ...current, section: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Field type</span>
                  <select value={draftField.type} onChange={(event) => setDraftField((current) => ({ ...current, type: event.target.value as typeof current.type }))}>
                    <option value="free_text">Free text</option>
                    <option value="pass_fail">Pass / fail</option>
                    <option value="count">Count</option>
                    <option value="measurement">Measurement</option>
                    <option value="multi_select">Multi-select</option>
                    <option value="photo_attachment">Photo attachment</option>
                  </select>
                </label>
                <label className="nexops-field">
                  <span>Memory rail</span>
                  <select value={draftField.memory} onChange={(event) => setDraftField((current) => ({ ...current, memory: event.target.value as typeof current.memory }))}>
                    <option value="visit">Visit field</option>
                    <option value="property">Property field</option>
                  </select>
                </label>
                <label className="nexops-field">
                  <span>Help text</span>
                  <input value={draftField.helpText} onChange={(event) => setDraftField((current) => ({ ...current, helpText: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Unit (optional)</span>
                  <input value={draftField.unit} onChange={(event) => setDraftField((current) => ({ ...current, unit: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Options (comma separated)</span>
                  <input value={draftField.optionsText} onChange={(event) => setDraftField((current) => ({ ...current, optionsText: event.target.value }))} />
                </label>
                <label className="nexops-field nexcam-checkbox-field">
                  <span>Required</span>
                  <input type="checkbox" checked={draftField.required} onChange={(event) => setDraftField((current) => ({ ...current, required: event.target.checked }))} />
                </label>
                <label className="nexops-field nexcam-checkbox-field">
                  <span>Photo required by default</span>
                  <input type="checkbox" checked={draftField.photoRequiredDefault} onChange={(event) => setDraftField((current) => ({ ...current, photoRequiredDefault: event.target.checked }))} />
                </label>
              </div>
              <article className="nexops-module-card wide">
                <p className="eyebrow">Sections</p>
                <ul className="nexops-mini-list nexcam-template-draft-fields">
                  {draftSections.map((section) => (
                    <li key={section.id}>
                      <span>
                        <strong>{section.title}</strong>
                        <small>{section.allowNa ? "Can be marked N/A on live checklists" : "Always active on live checklists"}</small>
                      </span>
                      <span className="nexops-inline-actions">
                        <button className="nexops-link-button" type="button" onClick={() => toggleDraftSectionAllowNa(section.id)}>
                          {section.allowNa ? "Disable N/A" : "Allow N/A"}
                        </button>
                        {draftSections.length > 1 ? (
                          <button className="nexops-link-button" type="button" onClick={() => removeDraftSection(section.id)}>Remove</button>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
              <div className="nexops-inline-actions">
                <button className="nexops-link-button" type="button" onClick={addDraftField}>Add field</button>
                <button type="button" onClick={() => void saveTemplate()}>Save template</button>
              </div>
              <ul className="nexops-mini-list nexcam-template-draft-fields">
                {draftFields.map((field) => (
                  <li key={field.id}>
                    <strong>{field.label}</strong>
                    <span>{field.section} - {formatFieldType(field)} - {field.memory}{field.required ? " - required" : ""}{field.photoRequiredDefault ? " - photo required" : ""}</span>
                    <button className="nexops-link-button" type="button" onClick={() => removeDraftField(field.id)}>Remove</button>
                  </li>
                ))}
                {!draftFields.length ? (
                  <li>
                    <strong>No draft fields yet</strong>
                    <span>Add the property-field and visit-field mix first, then save the reusable template.</span>
                  </li>
                ) : null}
              </ul>
            </article>
            <article className="nexops-module-card wide nexops-request-builder-card">
              <p className="eyebrow">Report templates</p>
              <div className="nexops-request-builder-grid">
                <label className="nexops-field">
                  <span>Title</span>
                  <input value={reportTemplateDraft.title} onChange={(event) => setReportTemplateDraft((current) => ({ ...current, title: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Default report title</span>
                  <input value={reportTemplateDraft.defaultReportTitle} onChange={(event) => setReportTemplateDraft((current) => ({ ...current, defaultReportTitle: event.target.value }))} />
                </label>
                <label className="nexops-field nexcam-checkbox-field">
                  <span>Watermark on by default</span>
                  <input type="checkbox" checked={reportTemplateDraft.watermarkByDefault} onChange={(event) => setReportTemplateDraft((current) => ({ ...current, watermarkByDefault: event.target.checked }))} />
                </label>
              </div>
              <ul className="nexops-mini-list nexcam-template-draft-fields">
                {reportTemplateSections.map((section, index) => (
                  <li key={section.id}>
                    <div className="nexops-request-builder-grid">
                      <label className="nexops-field">
                        <span>Section label</span>
                        <input value={section.label} onChange={(event) => setReportTemplateSections((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, label: event.target.value } : entry))} />
                      </label>
                      <label className="nexops-field">
                        <span>Default text</span>
                        <textarea rows={3} value={section.defaultText} onChange={(event) => setReportTemplateSections((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, defaultText: event.target.value } : entry))} />
                      </label>
                    </div>
                    <div className="nexops-inline-actions">
                      {textSnippets.map((snippet) => {
                        const selected = section.snippetIds.includes(snippet.id);
                        return (
                          <button
                            key={`${section.id}-${snippet.id}`}
                            className={selected ? "active" : "nexops-link-button"}
                            type="button"
                            onClick={() => setReportTemplateSections((current) => current.map((entry, entryIndex) => entryIndex === index ? {
                              ...entry,
                              snippetIds: selected
                                ? entry.snippetIds.filter((id) => id !== snippet.id)
                                : [...entry.snippetIds, snippet.id]
                            } : entry))}
                          >
                            {snippet.label}
                          </button>
                        );
                      })}
                      <button className="nexops-link-button" type="button" onClick={() => setReportTemplateSections((current) => current.length === 1 ? current : current.filter((_, entryIndex) => entryIndex !== index))}>Remove section</button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="nexops-inline-actions">
                <button className="nexops-link-button" type="button" onClick={() => setReportTemplateSections((current) => [...current, { id: `section_${crypto.randomUUID()}`, label: "New section", defaultText: "", snippetIds: [] }])}>Add report section</button>
                <button type="button" onClick={() => void saveReportTemplate()}>Save report template</button>
              </div>
              <ul className="nexops-record-list">
                {reportTemplates.map((entry) => (
                  <li key={entry.id}>
                    <div>
                      <strong>{entry.title}</strong>
                      <small>{entry.sections.length} sections - default title: {entry.defaultReportTitle}</small>
                    </div>
                    <mark>{entry.watermarkByDefault ? "Watermark on" : "Watermark optional"}</mark>
                    <button className="nexops-link-button" type="button" onClick={() => {
                      setSelectedReportTemplateId(entry.id);
                      setReportTitle(entry.defaultReportTitle);
                      setWatermarkEnabled(entry.watermarkByDefault);
                    }}>Use</button>
                  </li>
                ))}
              </ul>
            </article>
            <article className="nexops-module-card wide nexops-request-builder-card">
              <p className="eyebrow">Text snippets</p>
              <div className="nexops-request-builder-grid">
                <label className="nexops-field">
                  <span>Label</span>
                  <input value={snippetDraft.label} onChange={(event) => setSnippetDraft((current) => ({ ...current, label: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Snippet text</span>
                  <textarea rows={3} value={snippetDraft.bodyText} onChange={(event) => setSnippetDraft((current) => ({ ...current, bodyText: event.target.value }))} />
                </label>
              </div>
              <div className="nexops-inline-actions">
                <button type="button" onClick={() => void saveTextSnippet()}>Save snippet</button>
              </div>
              <ul className="nexops-record-list">
                {textSnippets.map((snippet) => (
                  <li key={snippet.id}>
                    <div>
                      <strong>{snippet.label}</strong>
                      <small>{snippet.bodyText}</small>
                    </div>
                    <mark>Reusable</mark>
                    <button className="nexops-link-button" type="button" onClick={() => toggleSnippetSelection(snippet.id)}>
                      {selectedSnippetIds.includes(snippet.id) ? "Selected" : "Select"}
                    </button>
                  </li>
                ))}
              </ul>
            </article>
            <article className="nexops-module-card wide nexops-request-builder-card">
              <p className="eyebrow">Job-type bundles</p>
              <div className="nexops-request-builder-grid">
                <label className="nexops-field">
                  <span>Bundle label</span>
                  <input value={bundleDraft.label} onChange={(event) => setBundleDraft((current) => ({ ...current, label: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Job type key</span>
                  <input value={bundleDraft.jobTypeKey} onChange={(event) => setBundleDraft((current) => ({ ...current, jobTypeKey: event.target.value }))} placeholder="pool_leak_detection" />
                </label>
                <label className="nexops-field">
                  <span>Checklist template</span>
                  <select value={bundleDraft.checklistTemplateId} onChange={(event) => setBundleDraft((current) => ({ ...current, checklistTemplateId: event.target.value }))}>
                    <option value="">Choose checklist</option>
                    {templates.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
                  </select>
                </label>
                <label className="nexops-field">
                  <span>Report template</span>
                  <select value={bundleDraft.reportTemplateId} onChange={(event) => setBundleDraft((current) => ({ ...current, reportTemplateId: event.target.value }))}>
                    <option value="">Choose report template</option>
                    {reportTemplates.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
                  </select>
                </label>
                <label className="nexops-field nexcam-checkbox-field">
                  <span>Active</span>
                  <input type="checkbox" checked={bundleDraft.active} onChange={(event) => setBundleDraft((current) => ({ ...current, active: event.target.checked }))} />
                </label>
              </div>
              <div className="nexops-inline-actions">
                <button type="button" onClick={() => void saveBundle()}>Save bundle</button>
              </div>
              <ul className="nexops-record-list">
                {bundles.map((bundle) => (
                  <li key={bundle.id}>
                    <div>
                      <strong>{bundle.label}</strong>
                      <small>{bundle.jobTypeKey} - checklist {bundle.checklistTemplateId} - report {bundle.reportTemplateId}</small>
                    </div>
                    <mark>{bundle.active ? "Active" : "Inactive"}</mark>
                    <span />
                  </li>
                ))}
              </ul>
            </article>
          </section>
        </div>
      </section>
    );
  }

  function renderPhotosPanel(): React.ReactElement {
    return (
      <section className="nexops-module-page">
        <div className="nexops-page-heading">
          <div>
            <h1>Photos & Media</h1>
            <p>Visit-scoped uploads, AI tags, and generic content search over the native media rail.</p>
          </div>
          <div className="nexops-inline-actions">
            <input value={mediaQuery} onChange={(event) => setMediaQuery(event.target.value)} placeholder="Deborah Justice" />
            <button className="nexops-link-button" type="button" onClick={() => void refreshRecentMedia()}>Refresh recent</button>
            <button type="button" onClick={() => void searchMedia()}>Search media</button>
          </div>
        </div>
        <article className="nexops-module-card wide">
          <p className="eyebrow">Staff filters</p>
          <div className="nexops-request-builder-grid">
            <label className="nexops-field">
              <span>Client</span>
              <select value={clientFilterId} onChange={(event) => setClientFilterId(event.target.value)}>
                <option value="">All clients</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{clientDisplayName(client)}</option>
                ))}
              </select>
            </label>
            <label className="nexops-field">
              <span>From</span>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label className="nexops-field">
              <span>To</span>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <label className="nexops-check-field inline">
              <input type="checkbox" checked={includeTrashed} onChange={(event) => setIncludeTrashed(event.target.checked)} />
              Include tenant trash
            </label>
          </div>
        </article>
        <div className="nexops-two-column">
          <section className="nexops-module-page">
            <article className="nexops-module-card wide">
              <p className="eyebrow">Recent visit media</p>
              <h2>{recentMedia.length ? `${recentMedia.length} items in this context` : "No media in this context yet"}</h2>
              <p>Media stays grouped by property, job, and dated visit so one job never becomes a flat pile.</p>
            </article>
            <div className="nexcam-media-grid">
              {recentMedia.map((hit) => renderMediaCard(hit, `Recent ${hit.type}`))}
            </div>
          </section>
          <section className="nexops-module-page">
            <article className="nexops-module-card wide">
              <p className="eyebrow">Generic content search</p>
              <h2>{mediaHits.length ? `${mediaHits.length} match${mediaHits.length === 1 ? "" : "es"} for "${mediaQuery}"` : "Search by content, tag, or context"}</h2>
              <p>Search reads the same AI caption, AI tags, and manual tags Nexi can query conversationally later.</p>
            </article>
            <div className="nexcam-media-grid">
              {mediaHits.map((hit) => renderMediaCard(hit, "Search match"))}
              {!mediaHits.length && !recentMedia.length ? (
                <article className="nexops-module-card">
                  <p className="eyebrow">Unresolved queue</p>
                  <h2>No media loaded in this view yet</h2>
                  <p>Search a real client or visit after uploads populate the native media repository.</p>
                </article>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    );
  }

  function renderReportsPanel(): React.ReactElement {
    return (
      <section className="nexops-module-page">
        <div className="nexops-page-heading">
          <div>
            <h1>Reports</h1>
            <p>Checklist to branded PDF, ready for closeout receipt attachments.</p>
          </div>
          <div className="nexops-inline-actions">
            <button className="nexops-link-button" type="button" onClick={() => void refreshReports()}>Refresh reports</button>
            <button type="button" onClick={() => void createReport()}>Generate report</button>
          </div>
        </div>
        <article className="nexops-module-card wide">
          <p className="eyebrow">Staff filters</p>
          <div className="nexops-request-builder-grid">
            <label className="nexops-field">
              <span>Client</span>
              <select value={clientFilterId} onChange={(event) => setClientFilterId(event.target.value)}>
                <option value="">All clients</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{clientDisplayName(client)}</option>
                ))}
              </select>
            </label>
            <label className="nexops-field">
              <span>From</span>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label className="nexops-field">
              <span>To</span>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <label className="nexops-field">
              <span>Report type</span>
              <select value={reportKind} onChange={(event) => setReportKind(event.target.value as "field_report" | "ai_recap")}>
                <option value="field_report">Field report</option>
                <option value="ai_recap">AI recap</option>
              </select>
            </label>
            <label className="nexops-field">
              <span>Report template</span>
              <select
                value={selectedReportTemplateId}
                onChange={(event) => {
                  const nextTemplateId = event.target.value;
                  const nextTemplate = reportTemplates.find((entry) => entry.id === nextTemplateId);
                  setSelectedReportTemplateId(nextTemplateId);
                  if (nextTemplate) {
                    setReportTitle(nextTemplate.defaultReportTitle);
                    setWatermarkEnabled(nextTemplate.watermarkByDefault);
                  }
                }}
              >
                <option value="">No template</option>
                {reportTemplates.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
              </select>
            </label>
          </div>
        </article>
        <div className="nexops-two-column">
          <section className="nexops-module-page">
            <article className="nexops-module-card wide">
              <p className="eyebrow">Generate</p>
              <h2>{report?.title ?? "Create the visit report from the completed checklist"}</h2>
              <label className="nexops-field">
                <span>Report title</span>
                <input value={reportTitle} onChange={(event) => setReportTitle(event.target.value)} />
              </label>
              <div className="nexops-inline-actions">
                {textSnippets.map((snippet) => (
                  <button
                    key={snippet.id}
                    type="button"
                    className={selectedSnippetIds.includes(snippet.id) ? "active" : "nexops-link-button"}
                    onClick={() => toggleSnippetSelection(snippet.id)}
                  >
                    {snippet.label}
                  </button>
                ))}
              </div>
              <label className="nexops-check-field inline">
                <input type="checkbox" checked={watermarkEnabled} onChange={(event) => setWatermarkEnabled(event.target.checked)} />
                Add tenant watermark on export
              </label>
              <p>{report ? `${report.status} report ${report.id} ready for the closeout receipt rail.` : "Use the current context and checklist to generate the report PDF."}</p>
              <div className="nexops-inline-actions">
                {reportUrl ? <a className="nexops-link-button" href={reportUrl} target="_blank" rel="noreferrer">Open latest PDF</a> : null}
              </div>
            </article>
          </section>
          <section className="nexops-module-page">
            <article className="nexops-module-card wide">
              <p className="eyebrow">Recent reports</p>
              <ul className="nexops-record-list">
                {reports.map((entry) => (
                  <li key={entry.id}>
                    <div>
                      <strong>{entry.title}</strong>
                      <small>{entry.visitId ? `Visit ${entry.visitId}` : `Job ${entry.jobId}`} - {entry.kind === "ai_recap" ? "AI recap" : "Field report"}</small>
                    </div>
                    <mark>{entry.status}</mark>
                    <a className="nexops-link-button" href={`/api/fielddocs/reports/${encodeURIComponent(entry.id)}/pdf?tenantId=${encodeURIComponent(operatorContext.tenantId)}`} target="_blank" rel="noreferrer">PDF</a>
                  </li>
                ))}
                {!reports.length ? (
                  <li>
                    <div>
                      <strong>No reports in this context yet</strong>
                      <small>Complete a checklist, then generate the branded PDF here.</small>
                    </div>
                    <mark>pending</mark>
                    <span />
                  </li>
                ) : null}
              </ul>
            </article>
          </section>
        </div>
      </section>
    );
  }

  function renderActiveModule(): React.ReactElement {
    if (activeModule === "templates") return renderTemplatesPanel();
    if (activeModule === "photos") return renderPhotosPanel();
    if (activeModule === "reports") return renderReportsPanel();
    return renderOverview();
  }

  const tenantName = tenantDisplayName(tenantBranding, operatorContext.tenantId);

  return (
    <main className="nexops-app nexcam-app" style={style}>
      <aside className="nexops-app-sidebar" aria-label="NexCam navigation">
        <div className="nexops-app-logo">
          <SidebarBrandStack product="nexcam" branding={tenantBranding} tenantId={operatorContext.tenantId} />
        </div>
        <button className="nexops-create-button" type="button" onClick={() => void createChecklist()}>Start Checklist</button>
        <nav className="nexops-nav">
          {NEXCAM_MODULES.map((item) => (
            <button className={item.id === activeModule ? "active" : ""} type="button" key={item.id} onClick={() => setModule(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="nexops-web-main">
        <header className="nexops-web-topbar">
          <div className="nexops-web-brand">
            <ProductLogo product="nexcam" className="nexops-header-product-logo" alt="NexCam" />
            <div className="nexops-web-brand-copy">
              <strong>NexCam</strong>
              <span>{tenantName}</span>
            </div>
          </div>
          <div className="nexops-web-tools">
            <span>{status}</span>
            <span>{props.user.email ?? "Operator"}</span>
            <button type="button" onClick={() => void signOutOperator(props.auth)}>Sign out</button>
          </div>
        </header>
        {renderActiveModule()}
      </section>
      {selectedMedia ? (
        <>
          <button className="nexops-overlay-backdrop" type="button" aria-label="Close NexCam photo review" onClick={closeMediaReview} />
          <section className="nexops-overlay-panel nexcam-review-panel" role="dialog" aria-modal="true" aria-label="NexCam photo review">
            <div className="nexops-overlay-head">
              <div>
                <p className="eyebrow">Photo review</p>
                <h2>{selectedMedia.aiCaption || selectedMedia.id}</h2>
                <small>{mediaContextLabel(selectedMedia)}</small>
              </div>
              <button type="button" className="nexops-link-button" onClick={closeMediaReview}>Close</button>
            </div>
            <div className="nexcam-review-layout">
              <div className="nexcam-review-stage-card">
                <div className="nexops-inline-actions">
                  <button type="button" className={drawMode ? "active" : ""} onClick={() => setDrawMode((current) => !current)}>
                    {drawMode ? "Stop drawing" : "Draw markup"}
                  </button>
                  <button type="button" className="nexops-link-button" onClick={removeLastMarkup} disabled={!mediaAnnotationsDraft.length}>
                    Remove last markup
                  </button>
                  <a className="nexops-link-button" href={`/api/media/${encodeURIComponent(selectedMedia.id)}?tenantId=${encodeURIComponent(operatorContext.tenantId)}`} target="_blank" rel="noreferrer">Open original</a>
                </div>
                <div
                  ref={mediaStageRef}
                  className={`nexcam-review-stage${drawMode ? " draw-mode" : ""}`}
                  onPointerDown={beginMediaDraw}
                  onPointerMove={updateMediaDraw}
                  onPointerUp={finishMediaDraw}
                  onPointerLeave={finishMediaDraw}
                >
                  <img
                    className="nexcam-review-image"
                    src={`/api/media/${encodeURIComponent(selectedMedia.id)}?tenantId=${encodeURIComponent(operatorContext.tenantId)}`}
                    alt={selectedMedia.aiCaption || selectedMedia.id}
                  />
                  <svg className="nexcam-review-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    {mediaAnnotationsDraft.map((annotation) => (
                      <polyline
                        key={annotation.id}
                        points={annotationPolyline(annotation.points)}
                        fill="none"
                        stroke={annotation.color ?? "#106060"}
                        strokeWidth={1.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                    {drawingPath?.length ? (
                      <polyline
                        points={annotationPolyline(drawingPath)}
                        fill="none"
                        stroke="#28d7ff"
                        strokeWidth={1.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray="2 2"
                      />
                    ) : null}
                  </svg>
                </div>
                <small>{selectedMedia.exif?.ts ? `Captured ${new Date(selectedMedia.exif.ts).toLocaleString()}` : "No capture timestamp"} · {selectedMedia.exif?.gps ? `${selectedMedia.exif.gps.lat.toFixed(4)}, ${selectedMedia.exif.gps.lng.toFixed(4)}` : "No GPS on file"}</small>
              </div>
              <div className="nexcam-review-sidebar">
                <article className="nexops-module-card wide">
                  <p className="eyebrow">Tags</p>
                  <h3>{selectedMedia.aiTags.length ? selectedMedia.aiTags.join(", ") : "No AI tags yet"}</h3>
                  <small>Search and Nexi read this same tag/caption rail.</small>
                  <label className="nexops-field">
                    <span>Manual tags</span>
                    <input value={mediaManualTagsDraft} onChange={(event) => setMediaManualTagsDraft(event.target.value)} placeholder="pool, leak, equipment pad" />
                  </label>
                  <label className="nexops-check-field inline">
                    <input type="checkbox" checked={mediaHiddenFromClientDraft} onChange={(event) => setMediaHiddenFromClientDraft(event.target.checked)} />
                    Hide this single photo from the client
                  </label>
                  <div className="nexops-inline-actions">
                    <button type="button" className="nexops-link-button" onClick={() => void setMediaTrashState(!selectedMedia.trashedAt)} disabled={mediaReviewSaving}>
                      {selectedMedia.trashedAt ? "Restore from trash" : "Move to tenant trash"}
                    </button>
                  </div>
                  {selectedMedia.purgeAfter ? <small>Trash purges after {new Date(selectedMedia.purgeAfter).toLocaleDateString()} unless restored.</small> : null}
                </article>
                <article className="nexops-module-card wide">
                  <p className="eyebrow">Comments</p>
                  <ul className="nexops-mini-list nexcam-comment-list">
                    {(selectedMedia.comments ?? []).map((entry) => (
                      <li key={entry.id}>
                        <strong>{entry.author ?? "Field note"}</strong>
                        <span>{entry.text}</span>
                        <small>{new Date(entry.createdAt).toLocaleString()}</small>
                      </li>
                    ))}
                    {!(selectedMedia.comments ?? []).length ? (
                      <li>
                        <strong>No comments yet</strong>
                        <span>Add a job-specific note without editing the AI caption.</span>
                      </li>
                    ) : null}
                  </ul>
                  <label className="nexops-field">
                    <span>Add comment</span>
                    <textarea rows={4} value={mediaCommentDraft} onChange={(event) => setMediaCommentDraft(event.target.value)} />
                  </label>
                  <div className="nexops-inline-actions">
                    <button type="button" onClick={() => void saveMediaReview()} disabled={mediaReviewSaving}>
                      {mediaReviewSaving ? "Saving..." : "Save review"}
                    </button>
                  </div>
                </article>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}

function PlatformConsole(props: { auth: Auth | null; user: User }): React.ReactElement {
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
        <button className="sign-out" type="button" onClick={() => void signOutOperator(props.auth)}>Sign out</button>
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

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <AppBootstrap
      renderAuthenticated={({ auth, user }) => {
        if (window.location.pathname.startsWith("/platform")) return <PlatformConsole auth={auth} user={user} />;
        if (window.location.pathname.startsWith("/nexcam")) return <NexCamPage auth={auth} user={user} />;
        if (window.location.pathname.startsWith("/nexreach")) {
          return <Suspense fallback={<main className="shell"><section className="auth-card"><h1>Loading NexReach</h1></section></main>}><NexReachPage auth={auth} user={user} /></Suspense>;
        }
        if (window.location.pathname.startsWith("/nexops")) return <NexOpsWorkspace auth={auth} user={user} />;
        return <NexiStandaloneChat auth={auth} user={user} />;
      }}
    />
  );
}

