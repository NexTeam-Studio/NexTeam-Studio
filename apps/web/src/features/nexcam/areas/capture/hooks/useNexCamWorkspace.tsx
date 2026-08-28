import React, { useEffect, useRef, useState } from "react";
import type { Address as CrmAddress } from "@nexteam/shared";
import type { Auth, User } from "firebase/auth";
import { fallbackOperatorContext, loadOperatorContext } from "../../../../operatorContext/resolveOperatorContext";

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





export const NEXCAM_MODULES: Array<{ id: NexCamModule; label: string; path: string }> = [
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

function initialNexCamContextIds(): { propertyId: string; jobId: string; visitId: string } {
  const query = new URLSearchParams(window.location.search);
  return {
    propertyId: query.get("propertyId")?.trim() || "property_demo_pool",
    jobId: query.get("jobId")?.trim() || "job_demo_leak_detection",
    visitId: query.get("visitId")?.trim() || "visit_demo_2026_07_18"
  };
}

export function useNexCamWorkspace(props: { auth: Auth | null; user: User }) {

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
  const [contextIds, setContextIds] = useState(initialNexCamContextIds);
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
    window.history.pushState({}, "", `${target.path}${window.location.search}`);
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
  return {
    activeChecklistSection,
    activeModule,
    activeSectionAllowsNa,
    activeSectionIsNa,
    addDraftField,
    annotationPolyline,
    beginMediaDraw,
    bundleDraft,
    bundles,
    carryforwardFields,
    checklist,
    checklistSections,
    clientFilterId,
    clients,
    closeMediaReview,
    contextIds,
    createChecklist,
    createReport,
    dateFrom,
    dateTo,
    describeFieldValue,
    draftField,
    draftFields,
    draftSections,
    drawMode,
    drawingPath,
    fieldHasValue,
    finishMediaDraw,
    formatFieldType,
    includeTrashed,
    latestHistory,
    mediaAnnotationsDraft,
    mediaCommentDraft,
    mediaContextLabel,
    mediaHiddenFromClientDraft,
    mediaHits,
    mediaManualTagsDraft,
    mediaQuery,
    mediaReviewSaving,
    mediaStageRef,
    operatorContext,
    patchChecklistSection,
    recentChecklists,
    recentMedia,
    refreshChecklists,
    refreshRecentMedia,
    refreshReports,
    refreshTemplates,
    removeDraftField,
    removeDraftSection,
    removeLastMarkup,
    renderChecklistField,
    renderMediaCard,
    report,
    reportKind,
    reportTemplateDraft,
    reportTemplateSections,
    reportTemplates,
    reportTitle,
    reportUrl,
    reports,
    saveBundle,
    saveChecklist,
    saveMediaReview,
    saveReportTemplate,
    saveTemplate,
    saveTextSnippet,
    searchMedia,
    selectedMedia,
    selectedReportTemplateId,
    selectedSnippetIds,
    selectedTemplateId,
    setActiveChecklistSection,
    setBundleDraft,
    setClientFilterId,
    setContextIds,
    setDateFrom,
    setDateTo,
    setDraftField,
    setDrawMode,
    setIncludeTrashed,
    setMediaCommentDraft,
    setMediaHiddenFromClientDraft,
    setMediaManualTagsDraft,
    setMediaQuery,
    setMediaTrashState,
    setModule,
    setReportKind,
    setReportTemplateDraft,
    setReportTemplateSections,
    setReportTitle,
    setSelectedReportTemplateId,
    setSelectedTemplateId,
    setSnippetDraft,
    setTemplateDraft,
    setWatermarkEnabled,
    snippetDraft,
    status,
    style,
    template,
    templateDraft,
    templates,
    tenantBranding,
    textSnippets,
    toggleDraftSectionAllowNa,
    toggleSnippetSelection,
    updateMediaDraw,
    visibleChecklistFields,
    watermarkEnabled
  };
}



export type NexCamWorkspaceBindings = ReturnType<typeof useNexCamWorkspace>;
