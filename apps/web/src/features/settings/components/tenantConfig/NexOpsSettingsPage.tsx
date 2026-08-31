import React, { useEffect, useMemo, useRef, useState } from "react";
import type { CrmSettings } from "@nexteam/core";
import {
  NexOpsCatalogEditorModal,
  blankCatalogItemDraft,
  catalogDraftFromItem,
  catalogItemFromDraft,
  type CatalogItemDraft,
  type ProductServiceCatalogItem
} from "../catalog/NexOpsCatalog";
import { ModuleHeroCard } from "../../../../shared/ui/NexOpsBusinessTemplates";
import { NexOpsNavGlyph } from "../../../nexopsShell/workspaceSupport";
import { RemainingSettingsSections } from "./RemainingSettingsSections";

type SettingsAreaId = "company" | "document-design" | "templates" | "checklists-reports" | "completion-requirements" | "automations" | "requests-booking" | "products-services" | "tax" | "custom-fields" | "team-permissions" | "schedule" | "nexportal" | "payments" | "integrations";

const SETTINGS_AREAS: Array<{ id: SettingsAreaId; label: string; detail: string; icon: string; color: string; path: string }> = [
  { id: "company", label: "Company", detail: "Business identity and regional defaults", icon: "⌂", color: "#0b6771", path: "/nexops/settings/company" },
  { id: "document-design", label: "Document Design", detail: "Quote, job, and invoice PDFs", icon: "▤", color: "#4056a1", path: "/nexops/settings/document-design" },
  { id: "templates", label: "Templates", detail: "Email and text message defaults", icon: "✉", color: "#7a4ca0", path: "/nexops/settings/templates" },
  { id: "checklists-reports", label: "Checklists & Reports", detail: "NexCam capture and report defaults", icon: "✓", color: "#147a58", path: "/nexops/settings/checklists-reports" },
  { id: "completion-requirements", label: "Completion Requirements", detail: "Evidence rules for job closeout", icon: "◆", color: "#8a5b17", path: "/nexops/settings/completion-requirements" },
  { id: "automations", label: "Automations", detail: "Event sequences and follow-up rules", icon: "↻", color: "#9b3f62", path: "/nexops/settings/automations" },
  { id: "requests-booking", label: "Requests & Booking", detail: "Intake forms and booking rules", icon: "⌁", color: "#2e6f95", path: "/nexops/settings/requests-booking" },
  { id: "products-services", label: "Products & Services", detail: "Catalog and property asset types", icon: "▦", color: "#ae5d22", path: "/nexops/settings/products-services" },
  { id: "tax", label: "Tax", detail: "Rates, groups, and calculation", icon: "%", color: "#6c7541", path: "/nexops/settings/tax" },
  { id: "custom-fields", label: "Custom Fields", detail: "Reusable fields across records", icon: "＋", color: "#426a7c", path: "/nexops/settings/custom-fields" },
  { id: "team-permissions", label: "Team & Permissions", detail: "Members, tiers, and access", icon: "♙", color: "#6b4a3b", path: "/nexops/users" },
  { id: "schedule", label: "Schedule", detail: "Calendar and day-sheet defaults", icon: "◫", color: "#486f3a", path: "/nexops/settings/schedule" },
  { id: "nexportal", label: "NexPortal", detail: "Client hub visibility and tips", icon: "◌", color: "#1e6671", path: "/nexops/settings/nexportal" },
  { id: "payments", label: "Payments", detail: "Receipts, ACH, and controls", icon: "$", color: "#a04b41", path: "/nexops/settings/payments" },
  { id: "integrations", label: "Integrations", detail: "Future adapter connections", icon: "↗", color: "#555f76", path: "/nexops/settings/integrations" }
];

function settingsAreaFromPath(pathname: string): SettingsAreaId | null {
  return SETTINGS_AREAS.find((area) => area.path === pathname)?.id ?? null;
}

type TenantRole = "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";

interface TenantUserRecord {
  id: string;
  email?: string;
  displayName: string;
  role: TenantRole;
  active: boolean;
}

interface CommunicationTemplateRecord {
  id: string;
  tenantId: string;
  category: string;
  label: string;
  description?: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  emailSubject?: string;
  emailBody?: string;
  smsBody?: string;
  createdAt: string;
  updatedAt: string;
}

interface DocumentNumberingRule {
  prefix: string;
  separator: string;
  padWidth: number;
  nextValue: number;
}

interface ReviewSequenceStepSetting {
  id: string;
  label: string;
  offsetDays: number;
  channels: "email" | "sms" | "both";
  templateCategory: "review_request_initial" | "review_request_nudge";
}

interface PropertyAssetDefinition {
  kind: string;
  label: string;
  fields: Array<{ key: string; label: string; type: "text" | "number" | "boolean"; required?: boolean }>;
}

interface TenantOperatingProfile {
  company: { legalName?: string; publicName?: string; industry?: string; timezone: string };
  locations: Array<{ id: string; label: string; active: boolean }>;
  businessHours: Array<{ day: string; open?: string; close?: string; closed: boolean }>;
  tax: { enabled: boolean; defaultRate: number; registrationId?: string };
  communicationIdentity: { replyToEmail?: string; replyToName?: string; phone?: string };
  securityAudit: { auditEventsEnabled: boolean; requireApprovalForExternalSend: boolean };
  onboarding: {
    completedSteps: Array<"company-profile" | "module-selection" | "office-defaults" | "launch-review">;
    selectedModules: string[];
    launchReviewedAt?: string;
    checklist: {
      tasks: Array<{
        id: string;
        label: string;
        description: string;
        required: boolean;
        status: "not_started" | "in_progress" | "complete" | "skipped";
        ownerUserId?: string;
        completedAt?: string;
      }>;
      auditHistory: Array<{ id: string; action: string; actorId: string; taskId: string; detail: string; createdAt: string }>;
    };
  };
}

interface CrmSettingsRecord {
  tenantId: string;
  operatingProfile: TenantOperatingProfile;
  documentNumbering: Record<"request" | "quote" | "job" | "invoice" | "receipt", DocumentNumberingRule>;
  quoteDefaults: {
    expiryDays: number;
    autoSaveCardOnDeposit: boolean;
    approvalRules: {
      requireSignature: boolean;
      requireDeposit: boolean;
      requireCardOnFile: boolean;
      depositKind?: "amount" | "percent";
      depositValue?: number;
    };
    terms: string;
  };
  invoiceDefaults: {
    dueDays: number;
    terms: string;
    delivery: {
      emailIncludePdf: boolean;
      emailIncludeSummary: boolean;
      emailIncludePayLink: boolean;
      smsIncludeSummary: boolean;
      smsIncludePayLink: boolean;
      smsIncludeHostedLink: boolean;
    };
    tippingEnabled: boolean;
  };
  portalDefaults: {
    keepBusinessAddressPrivate: boolean;
    hubSessionReverifyDays: number;
  };
  reviewDefaults: {
    enabled: boolean;
    steps: ReviewSequenceStepSetting[];
  };
  propertyAssetDefinitions: PropertyAssetDefinition[];
  catalogItems: ProductServiceCatalogItem[];
  communicationTemplates: CommunicationTemplateRecord[];
  completionRequirements: {
    checklistRequired: boolean;
    photosRequired: boolean;
    reportRequired: boolean;
    signatureRequired: boolean;
  };
  workspaceSettings: CrmSettings["workspaceSettings"];
  documentDesign: { quote: { referToAsEstimate: boolean; showQuantity: boolean; showUnitPrice: boolean; showLineTotal: boolean; showTotalsAndTax: boolean; showSignatureLine: boolean; disclaimer: string; depositLanguage: string; }; job: { showSignatureLine: boolean; disclaimer: string; }; invoice: { showQuantity: boolean; showUnitPrice: boolean; showLineTotal: boolean; showReturnPaymentStub: boolean; showLateStamp: boolean; showAccountBalance: boolean; showPaidDate: boolean; disclaimer: string; }; style: { headerLayout: "basic" | "compact" | "envelope_dual" | "envelope_single"; headerStyle: "modern" | "clean"; logoSize: number; themeColor: "default" | "blue" | "red" | "green" | "orange" | "purple"; footerFontSize: number; showCompanyName: boolean; showCompanyPhone: boolean; showCompanyEmail: boolean; showCompanyWebsite: boolean; showClientPhone: boolean; }; };
  createdAt: string;
  updatedAt: string;
}

interface CrmSettingsResponse {
  ok: boolean;
  settings?: CrmSettingsRecord;
  templateDefaults?: CommunicationTemplateRecord[];
  error?: string;
}

interface CrmSettingsMutationResponse {
  ok: boolean;
  settings?: CrmSettingsRecord;
  error?: string;
}

interface NexOpsSettingsPageProps {
  tenantId: string;
  tenantName: string;
  role: TenantRole;
  tenantUsers: TenantUserRecord[];
  onCrmMutation?: () => void;
  catalogFocusNonce?: number;
  settingsRouteNonce?: number;
  onOpenCatalog?: () => void;
}

function templateChannelLabel(template: CommunicationTemplateRecord): string {
  if (template.emailEnabled && template.smsEnabled) {
    return "Email + Text";
  }
  if (template.emailEnabled) {
    return "Email Only";
  }
  if (template.smsEnabled) {
    return "Text Only";
  }
  return "Disabled";
}

function normalizeTemplateDraft(template: CommunicationTemplateRecord): CommunicationTemplateRecord {
  return {
    ...template,
    emailSubject: template.emailSubject ?? "",
    emailBody: template.emailBody ?? "",
    smsBody: template.smsBody ?? ""
  };
}

function defaultReviewStep(offsetDays = 14): ReviewSequenceStepSetting {
  return {
    id: `review_step_${Date.now()}`,
    label: "Review Nudge",
    offsetDays,
    channels: "both",
    templateCategory: "review_request_nudge"
  };
}

function templateMatchesDefault(template: CommunicationTemplateRecord, fallback: CommunicationTemplateRecord | undefined): boolean {
  return Boolean(fallback)
    && template.emailEnabled === fallback.emailEnabled
    && template.smsEnabled === fallback.smsEnabled
    && (template.emailSubject ?? "") === (fallback.emailSubject ?? "")
    && (template.emailBody ?? "") === (fallback.emailBody ?? "")
    && (template.smsBody ?? "") === (fallback.smsBody ?? "");
}

function previewTemplateText(value: string, tenantName: string): string {
  const sample: Record<string, string> = {
    TENANT_NAME: tenantName || "NexTeam", CLIENT_NAME: "Alex Morgan", CLIENT_EMAIL: "alex@example.test", CLIENT_PHONE: "555-0100",
    REQUEST_SUMMARY: "a pool assessment", SERVICE_ADDRESS: "100 Main Street", QUOTE_NUMBER: "Q-1042", QUOTE_TITLE: "Leak assessment",
    QUOTE_TOTAL: "$450.00", PORTAL_URL: "https://portal.example.test/quotes/Q-1042", QUOTE_URL: "https://portal.example.test/quotes/Q-1042",
    JOB_TITLE: "Leak assessment", JOB_DATE: "June 1, 2026", VISIT_WINDOW: "June 1, 2026, 10:00 AM–12:00 PM",
    INVOICE_NUMBER: "INV-1042", BALANCE_DUE: "$450.00", PAYMENT_AMOUNT: "$225.00", PAY_LINK: "https://portal.example.test/pay/INV-1042",
    STATEMENT_LINK: "https://portal.example.test/statements/1042", REVIEW_URL: "https://reviews.example.test/aquatrace",
    REVIEW_OPTOUT_URL: "https://portal.example.test/reviews/stop", DEPOSIT_AMOUNT: "$225.00", PACKAGE_ARTIFACTS: "https://portal.example.test/documents/1042"
  };
  return value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key: string) => sample[key] ?? "");
}

function defaultPropertyAssetDefinition(): PropertyAssetDefinition {
  return { kind: "equipment", label: "Equipment", fields: [{ key: "model", label: "Model", type: "text" }] };
}

export function NexOpsSettingsPage(props: NexOpsSettingsPageProps): React.ReactElement {
  const [settings, setSettings] = useState<CrmSettingsRecord | null>(null);
  const [statusMessage, setStatusMessage] = useState("Loading settings...");
  const [busy, setBusy] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogEditorOpen, setCatalogEditorOpen] = useState(false);
  const [catalogDraft, setCatalogDraft] = useState<CatalogItemDraft>(blankCatalogItemDraft());
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateDraft, setTemplateDraft] = useState<CommunicationTemplateRecord | null>(null);
  const [documentTab, setDocumentTab] = useState<"quote" | "job" | "invoice" | "style">("quote");
  const [templateDefaults, setTemplateDefaults] = useState<CommunicationTemplateRecord[]>([]);
  const [templatePreviewChannel, setTemplatePreviewChannel] = useState<"email" | "sms">("email");
  const catalogSectionRef = useRef<HTMLElement | null>(null);
  const [activeSettingsArea, setActiveSettingsArea] = useState<SettingsAreaId | null>(() => settingsAreaFromPath(window.location.pathname));

  const selectedTemplate = useMemo(
    () => settings?.communicationTemplates.find((template) => template.id === selectedTemplateId) ?? settings?.communicationTemplates[0] ?? null,
    [selectedTemplateId, settings]
  );

  const visibleCatalog = useMemo(() => {
    const needle = catalogSearch.trim().toLowerCase();
    return (settings?.catalogItems ?? [])
      .filter((item) => {
        if (!needle) {
          return true;
        }
        return [item.code, item.name, item.description, item.tag].join(" ").toLowerCase().includes(needle);
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [catalogSearch, settings]);

  useEffect(() => {
    void refresh();
  }, [props.tenantId]);

  useEffect(() => {
    if (!props.catalogFocusNonce) return;
    setActiveSettingsArea("products-services");
    catalogSectionRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    catalogSectionRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [props.catalogFocusNonce]);

  useEffect(() => {
    setActiveSettingsArea(settingsAreaFromPath(window.location.pathname));
  }, [props.settingsRouteNonce]);

  useEffect(() => {
    const onPopState = () => setActiveSettingsArea(settingsAreaFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function openSettingsArea(area: SettingsAreaId): void {
    const target = SETTINGS_AREAS.find((candidate) => candidate.id === area);
    if (!target) return;
    if (area === "team-permissions") {
      window.location.assign(target.path);
      return;
    }
    window.history.pushState({}, "", target.path);
    setActiveSettingsArea(area);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  useEffect(() => {
    if (!selectedTemplate) {
      setTemplateDraft(null);
      return;
    }
    setTemplateDraft(normalizeTemplateDraft(selectedTemplate));
  }, [selectedTemplate]);

  async function refresh(): Promise<void> {
    try {
      const body = await fetch(`/api/crm/settings?tenantId=${encodeURIComponent(props.tenantId)}`)
        .then((response) => response.json() as Promise<CrmSettingsResponse>);
      if (!body.ok || !body.settings) {
        setSettings(null);
        setStatusMessage(body.error ?? "Settings are unavailable right now.");
        return;
      }
      setSettings(body.settings);
      setTemplateDefaults(body.templateDefaults ?? []);
      setSelectedTemplateId((current) => current && body.settings?.communicationTemplates.some((template) => template.id === current)
        ? current
        : body.settings.communicationTemplates[0]?.id ?? "");
      setStatusMessage("Settings loaded.");
    } catch {
      setSettings(null);
      setStatusMessage("Settings API unreachable.");
    }
  }

  async function saveCatalogItem(): Promise<void> {
    if (!settings || !catalogDraft.name.trim()) {
      setStatusMessage("Catalog items need a name before they can be saved.");
      return;
    }
    const existing = settings.catalogItems.find((item) => item.id === catalogDraft.id);
    const nextItem = catalogItemFromDraft(props.tenantId, catalogDraft, existing);
    const nextCatalog = existing
      ? settings.catalogItems.map((item) => item.id === existing.id ? nextItem : item)
      : [...settings.catalogItems, nextItem];
    setBusy("save-catalog");
    setStatusMessage(existing ? "Saving catalog item..." : "Creating catalog item...");
    try {
      const body = await fetch("/api/crm/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          catalogItems: nextCatalog
        })
      }).then((response) => response.json() as Promise<CrmSettingsMutationResponse>);
      if (!body.ok || !body.settings) {
        setStatusMessage(body.error ?? "Catalog item could not be saved.");
        return;
      }
      setSettings(body.settings);
      setCatalogEditorOpen(false);
      setCatalogDraft(blankCatalogItemDraft());
      setStatusMessage(`${nextItem.name} saved to Products & Services.`);
      props.onCrmMutation?.();
    } catch {
      setStatusMessage("Catalog save failed.");
    } finally {
      setBusy("");
    }
  }

  async function saveTemplate(): Promise<void> {
    if (!settings || !templateDraft) {
      return;
    }
    setBusy("save-template");
    setStatusMessage("Saving correspondence template...");
    const normalized = normalizeTemplateDraft(templateDraft);
    const nextTemplates = settings.communicationTemplates.map((template) => template.id === normalized.id ? {
      ...template,
      ...normalized,
      updatedAt: new Date().toISOString()
    } : template);
    try {
      const body = await fetch("/api/crm/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          communicationTemplates: nextTemplates
        })
      }).then((response) => response.json() as Promise<CrmSettingsMutationResponse>);
      if (!body.ok || !body.settings) {
        setStatusMessage(body.error ?? "Template save failed.");
        return;
      }
      setSettings(body.settings);
      setStatusMessage(`${normalized.label} saved.`);
      props.onCrmMutation?.();
    } catch {
      setStatusMessage("Template save failed.");
    } finally {
      setBusy("");
    }
  }

  async function saveOperationalDefaults(): Promise<void> {
    if (!settings) {
      return;
    }
    setBusy("save-defaults");
    setStatusMessage("Saving portal, billing, and review defaults...");
    try {
      const body = await fetch("/api/crm/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          operatingProfile: settings.operatingProfile,
          invoiceDefaults: {
            tippingEnabled: settings.invoiceDefaults.tippingEnabled
          },
          portalDefaults: settings.portalDefaults,
          reviewDefaults: settings.reviewDefaults
        })
      }).then((response) => response.json() as Promise<CrmSettingsMutationResponse>);
      if (!body.ok || !body.settings) {
        setStatusMessage(body.error ?? "Default settings could not be saved.");
        return;
      }
      setSettings(body.settings);
      setStatusMessage("Portal, billing, and review defaults saved.");
      props.onCrmMutation?.();
    } catch {
      setStatusMessage("Default settings could not be saved.");
    } finally {
      setBusy("");
    }
  }

  async function saveWorkspaceSettings(): Promise<void> {
    if (!settings) return;
    setBusy("save-workspace-settings");
    setStatusMessage("Saving workspace settings...");
    try {
      const body = await fetch("/api/crm/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: props.tenantId, workspaceSettings: settings.workspaceSettings })
      }).then((response) => response.json() as Promise<CrmSettingsMutationResponse>);
      if (!body.ok || !body.settings) { setStatusMessage(body.error ?? "Workspace settings could not be saved."); return; }
      setSettings(body.settings);
      setStatusMessage("Workspace settings saved.");
      props.onCrmMutation?.();
    } catch { setStatusMessage("Workspace settings save failed."); } finally { setBusy(""); }
  }

  async function saveDocumentDesign(): Promise<void> {
    if (!settings) return;
    setBusy("save-document-design");
    try {
      const body = await fetch("/api/crm/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenantId: props.tenantId, documentDesign: settings.documentDesign }) }).then((response) => response.json() as Promise<CrmSettingsMutationResponse>);
      if (!body.ok || !body.settings) { setStatusMessage(body.error ?? "Document design could not be saved."); return; }
      setSettings(body.settings); setStatusMessage("Document design saved."); props.onCrmMutation?.();
    } catch { setStatusMessage("Document design save failed."); } finally { setBusy(""); }
  }

  async function saveCompletionRequirements(): Promise<void> {
    if (!settings) return;
    setBusy("save-completion-requirements");
    try {
      const body = await fetch("/api/crm/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenantId: props.tenantId, completionRequirements: settings.completionRequirements }) }).then((response) => response.json() as Promise<CrmSettingsMutationResponse>);
      if (!body.ok || !body.settings) { setStatusMessage(body.error ?? "Completion requirements could not be saved."); return; }
      setSettings(body.settings); setStatusMessage("Completion requirements saved."); props.onCrmMutation?.();
    } catch { setStatusMessage("Completion requirements save failed."); } finally { setBusy(""); }
  }

  async function resetTemplate(): Promise<void> {
    if (!templateDraft) return;
    setBusy("reset-template");
    setStatusMessage("Restoring the tenant default...");
    try {
      const body = await fetch(`/api/crm/settings/templates/${encodeURIComponent(templateDraft.category)}/reset`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: props.tenantId })
      }).then((response) => response.json() as Promise<CrmSettingsMutationResponse>);
      if (!body.ok || !body.settings) {
        setStatusMessage(body.error ?? "Template could not be reset.");
        return;
      }
      setSettings(body.settings);
      setStatusMessage(`${templateDraft.label} restored to its default.`);
      props.onCrmMutation?.();
    } catch {
      setStatusMessage("Template reset failed.");
    } finally {
      setBusy("");
    }
  }

  async function savePropertyAssetDefinitions(): Promise<void> {
    if (!settings) return;
    setBusy("save-property-assets");
    setStatusMessage("Saving property asset types...");
    try {
      const body = await fetch("/api/crm/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: props.tenantId, propertyAssetDefinitions: settings.propertyAssetDefinitions })
      }).then((response) => response.json() as Promise<CrmSettingsMutationResponse>);
      if (!body.ok || !body.settings) {
        setStatusMessage(body.error ?? "Property asset types could not be saved.");
        return;
      }
      setSettings(body.settings);
      setStatusMessage("Property asset types saved.");
      props.onCrmMutation?.();
    } catch {
      setStatusMessage("Property asset type save failed.");
    } finally {
      setBusy("");
    }
  }


  function patchReviewStep(stepId: string, updater: (step: ReviewSequenceStepSetting) => ReviewSequenceStepSetting): void {
    setSettings((current) => current ? {
      ...current,
      reviewDefaults: {
        ...current.reviewDefaults,
        steps: current.reviewDefaults.steps.map((step) => step.id === stepId ? updater(step) : step)
      }
    } : current);
  }

  function addReviewStep(): void {
    setSettings((current) => {
      if (!current) {
        return current;
      }
      const lastOffset = current.reviewDefaults.steps.at(-1)?.offsetDays ?? 10;
      return {
        ...current,
        reviewDefaults: {
          ...current.reviewDefaults,
          steps: [...current.reviewDefaults.steps, defaultReviewStep(lastOffset + 3)]
        }
      };
    });
  }

  function removeReviewStep(stepId: string): void {
    setSettings((current) => current ? {
      ...current,
      reviewDefaults: {
        ...current.reviewDefaults,
        steps: current.reviewDefaults.steps.filter((step) => step.id !== stepId)
      }
    } : current);
  }

  const activeUsers = props.tenantUsers.filter((user) => user.active);
  const selectedSettingsArea = SETTINGS_AREAS.find((area) => area.id === activeSettingsArea) ?? null;
  if (!selectedSettingsArea) {
    return (
      <section className="nexops-module-page tenant-config-page nexops-settings-landing">
        <ModuleHeroCard
          title="Settings"
          detail="Configure the business rules, documents, team access, and client experience your office uses every day."
          icon={<NexOpsNavGlyph module="settings" />}
          primaryAction={<button className="nexops-hero-primary-button" type="button" onClick={() => openSettingsArea("company")}>Open Company Settings</button>}
          className="module-hero-card--quote"
        />
        <nav className="nexops-settings-navigation-grid" aria-label="Settings areas">
          {SETTINGS_AREAS.map((area) => (
            <button
              className="nexops-settings-navigation-card"
              type="button"
              key={area.id}
              style={{ "--nexops-settings-tile-color": area.color } as React.CSSProperties}
              onClick={() => openSettingsArea(area.id)}
            >
              <span className="nexops-settings-navigation-card__icon" aria-hidden="true">{area.icon}</span>
              <strong>{area.label}</strong>
              <small>{area.detail}</small>
            </button>
          ))}
        </nav>
      </section>
    );
  }
  return (
    <section className="nexops-module-page tenant-config-page">
      <ModuleHeroCard
        title={selectedSettingsArea.label}
        detail={selectedSettingsArea.detail}
        icon={<NexOpsNavGlyph module="settings" />}
        primaryAction={<button className="nexops-hero-primary-button" type="button" onClick={() => { window.history.pushState({}, "", "/nexops/settings"); setActiveSettingsArea(null); window.scrollTo({ top: 0, left: 0, behavior: "auto" }); }}>All Settings</button>}
        className="module-hero-card--quote"
      />

      <div className="nexops-density-inline-facts">
        <article>
          <h3>Tenant</h3>
          <p>{props.tenantName}</p>
          <small>{props.tenantId}</small>
        </article>
        <article>
          <h3>Viewer Role</h3>
          <p>{props.role}</p>
          <small>Catalog and template edits stay owner/admin scoped.</small>
        </article>
        <article>
          <h3>Team</h3>
          <p>{activeUsers.length} active</p>
          <small>{props.tenantUsers.length} total tenant users</small>
        </article>
        <article>
          <h3>Status</h3>
          <p>{statusMessage}</p>
          <small>Changes here feed pickers, sends, and downstream records.</small>
        </article>
      </div>

      <div className="nexops-two-column">
        {activeSettingsArea === "products-services" ? <article className="nexops-module-card" ref={catalogSectionRef} id="products-services">
          <div className="nexops-page-heading">
            <div><p className="eyebrow">Properties</p><h2>Asset Types</h2></div>
            <div className="nexops-inline-actions">
              <button type="button" onClick={() => setSettings((current) => current ? { ...current, propertyAssetDefinitions: [...current.propertyAssetDefinitions, defaultPropertyAssetDefinition()] } : current)} disabled={!settings}>Add Asset Type</button>
              <button type="button" onClick={() => void savePropertyAssetDefinitions()} disabled={!settings || busy === "save-property-assets"}>{busy === "save-property-assets" ? "Saving..." : "Save Asset Types"}</button>
            </div>
          </div>
          <p className="nexops-form-note">These tenant-specific types control the fields staff can save on each service property.</p>
          {(settings?.propertyAssetDefinitions ?? []).map((definition, definitionIndex) => (
            <div className="nexops-quote-template-editor" key={`${definition.kind}-${definitionIndex}`}>
              <div className="nexops-quote-toggle-grid">
                <label className="nexops-field"><span>Type Key</span><input value={definition.kind} onChange={(event) => setSettings((current) => current ? { ...current, propertyAssetDefinitions: current.propertyAssetDefinitions.map((item, index) => index === definitionIndex ? { ...item, kind: event.target.value } : item) } : current)} /></label>
                <label className="nexops-field"><span>Display Name</span><input value={definition.label} onChange={(event) => setSettings((current) => current ? { ...current, propertyAssetDefinitions: current.propertyAssetDefinitions.map((item, index) => index === definitionIndex ? { ...item, label: event.target.value } : item) } : current)} /></label>
              </div>
              {definition.fields.map((field, fieldIndex) => <div className="nexops-quote-toggle-grid" key={`${field.key}-${fieldIndex}`}>
                <label className="nexops-field"><span>Field Key</span><input value={field.key} onChange={(event) => setSettings((current) => current ? { ...current, propertyAssetDefinitions: current.propertyAssetDefinitions.map((item, index) => index === definitionIndex ? { ...item, fields: item.fields.map((entry, nestedIndex) => nestedIndex === fieldIndex ? { ...entry, key: event.target.value } : entry) } : item) } : current)} /></label>
                <label className="nexops-field"><span>Field Label</span><input value={field.label} onChange={(event) => setSettings((current) => current ? { ...current, propertyAssetDefinitions: current.propertyAssetDefinitions.map((item, index) => index === definitionIndex ? { ...item, fields: item.fields.map((entry, nestedIndex) => nestedIndex === fieldIndex ? { ...entry, label: event.target.value } : entry) } : item) } : current)} /></label>
                <label className="nexops-field"><span>Field Type</span><select value={field.type} onChange={(event) => setSettings((current) => current ? { ...current, propertyAssetDefinitions: current.propertyAssetDefinitions.map((item, index) => index === definitionIndex ? { ...item, fields: item.fields.map((entry, nestedIndex) => nestedIndex === fieldIndex ? { ...entry, type: event.target.value as PropertyAssetDefinition["fields"][number]["type"] } : entry) } : item) } : current)}><option value="text">Text</option><option value="number">Number</option><option value="boolean">Yes / No</option></select></label>
                <label className="nexops-check-field inline"><input type="checkbox" checked={field.required === true} onChange={(event) => setSettings((current) => current ? { ...current, propertyAssetDefinitions: current.propertyAssetDefinitions.map((item, index) => index === definitionIndex ? { ...item, fields: item.fields.map((entry, nestedIndex) => nestedIndex === fieldIndex ? { ...entry, required: event.target.checked } : entry) } : item) } : current)} /> Required</label>
              </div>)}
              <div className="nexops-inline-actions"><button type="button" onClick={() => setSettings((current) => current ? { ...current, propertyAssetDefinitions: current.propertyAssetDefinitions.map((item, index) => index === definitionIndex ? { ...item, fields: [...item.fields, { key: "serial", label: "Serial Number", type: "text" }] } : item) } : current)}>Add Field</button><button className="nexops-settings-action--danger" type="button" onClick={() => setSettings((current) => current ? { ...current, propertyAssetDefinitions: current.propertyAssetDefinitions.filter((_, index) => index !== definitionIndex) } : current)}>Remove Type</button></div>
            </div>
          ))}
          {!settings?.propertyAssetDefinitions.length ? <p className="nexops-empty-copy">No property asset types are configured yet.</p> : null}
        </article> : null}

        {activeSettingsArea === "company" ? <article className="nexops-module-card">
          <div className="nexops-page-heading">
            <div>
              <p className="eyebrow">Company Foundation</p>
              <h2>Business Profile</h2>
            </div>
            <button type="button" onClick={() => void saveOperationalDefaults()} disabled={busy === "save-defaults" || !settings}>
              {busy === "save-defaults" ? "Saving..." : "Save Company Settings"}
            </button>
          </div>
          {settings ? (
            <div className="nexops-quote-template-editor">
              <label className="nexops-field">
                <span>Public Business Name</span>
                <input value={settings.operatingProfile.company.publicName ?? ""} onChange={(event) => setSettings({
                  ...settings,
                  operatingProfile: { ...settings.operatingProfile, company: { ...settings.operatingProfile.company, publicName: event.target.value } }
                })} />
              </label>
              <label className="nexops-field">
                <span>Industry</span>
                <input value={settings.operatingProfile.company.industry ?? ""} onChange={(event) => setSettings({
                  ...settings,
                  operatingProfile: { ...settings.operatingProfile, company: { ...settings.operatingProfile.company, industry: event.target.value } }
                })} />
              </label>
              <label className="nexops-field">
                <span>Time Zone</span>
                <input value={settings.operatingProfile.company.timezone} onChange={(event) => setSettings({
                  ...settings,
                  operatingProfile: { ...settings.operatingProfile, company: { ...settings.operatingProfile.company, timezone: event.target.value } }
                })} />
              </label>
              <label className="nexops-field">
                <span>Reply-To Email</span>
                <input type="email" value={settings.operatingProfile.communicationIdentity.replyToEmail ?? ""} onChange={(event) => setSettings({
                  ...settings,
                  operatingProfile: { ...settings.operatingProfile, communicationIdentity: { ...settings.operatingProfile.communicationIdentity, replyToEmail: event.target.value } }
                })} />
              </label>
              <label className="nexops-field">
                <span>Default Tax Rate (%)</span>
                <input type="number" min={0} max={100} step="0.01" value={settings.operatingProfile.tax.defaultRate} onChange={(event) => setSettings({
                  ...settings,
                  operatingProfile: { ...settings.operatingProfile, tax: { ...settings.operatingProfile.tax, defaultRate: Math.max(0, Math.min(100, Number(event.target.value) || 0)) } }
                })} />
              </label>
              <label className="nexops-check-field inline">
                <input type="checkbox" checked={settings.operatingProfile.tax.enabled} onChange={(event) => setSettings({
                  ...settings,
                  operatingProfile: { ...settings.operatingProfile, tax: { ...settings.operatingProfile.tax, enabled: event.target.checked } }
                })} />
                Apply Tax Defaults to New Records
              </label>
              <label className="nexops-check-field inline">
                <input type="checkbox" checked={settings.operatingProfile.securityAudit.requireApprovalForExternalSend} onChange={(event) => setSettings({
                  ...settings,
                  operatingProfile: { ...settings.operatingProfile, securityAudit: { ...settings.operatingProfile.securityAudit, requireApprovalForExternalSend: event.target.checked } }
                })} />
                Require Approval Before External Sends
              </label>
              <div className="nexops-mini-list">
                <div className="nexops-quote-section-head">
                  <div><h3>Locations</h3><span>These locations use the shared tenant settings record.</span></div>
                  <button type="button" onClick={() => setSettings({
                    ...settings,
                    operatingProfile: {
                      ...settings.operatingProfile,
                      locations: [...settings.operatingProfile.locations, { id: `location_${Date.now()}`, label: "New Location", active: true }]
                    }
                  })}>Add Location</button>
                </div>
                {settings.operatingProfile.locations.map((location) => (
                  <div className="nexops-quote-toggle-grid" key={location.id}>
                    <label className="nexops-field"><span>Location Name</span><input value={location.label} onChange={(event) => setSettings({
                      ...settings,
                      operatingProfile: { ...settings.operatingProfile, locations: settings.operatingProfile.locations.map((entry) => entry.id === location.id ? { ...entry, label: event.target.value } : entry) }
                    })} /></label>
                    <label className="nexops-check-field inline"><input type="checkbox" checked={location.active} onChange={(event) => setSettings({
                      ...settings,
                      operatingProfile: { ...settings.operatingProfile, locations: settings.operatingProfile.locations.map((entry) => entry.id === location.id ? { ...entry, active: event.target.checked } : entry) }
                    })} />Active</label>
                  </div>
                ))}
              </div>
              <div className="nexops-mini-list">
                <h3>Business Hours</h3>
                {settings.operatingProfile.businessHours.map((hours) => (
                  <div className="nexops-quote-toggle-grid" key={hours.day}>
                    <strong>{hours.day}</strong>
                    <label className="nexops-check-field inline"><input type="checkbox" checked={hours.closed} onChange={(event) => setSettings({
                      ...settings,
                      operatingProfile: { ...settings.operatingProfile, businessHours: settings.operatingProfile.businessHours.map((entry) => entry.day === hours.day ? { ...entry, closed: event.target.checked } : entry) }
                    })} />Closed</label>
                    <label className="nexops-field"><span>Open</span><input type="time" disabled={hours.closed} value={hours.open ?? ""} onChange={(event) => setSettings({
                      ...settings,
                      operatingProfile: { ...settings.operatingProfile, businessHours: settings.operatingProfile.businessHours.map((entry) => entry.day === hours.day ? { ...entry, open: event.target.value } : entry) }
                    })} /></label>
                    <label className="nexops-field"><span>Close</span><input type="time" disabled={hours.closed} value={hours.close ?? ""} onChange={(event) => setSettings({
                      ...settings,
                      operatingProfile: { ...settings.operatingProfile, businessHours: settings.operatingProfile.businessHours.map((entry) => entry.day === hours.day ? { ...entry, close: event.target.value } : entry) }
                    })} /></label>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="nexops-empty-copy">Company settings load with the tenant configuration.</p>}
        </article> : null}

        {activeSettingsArea === "nexportal" ? <article className="nexops-module-card">
          <div className="nexops-page-heading">
            <div>
              <p className="eyebrow">Client Hub</p>
              <h2>Portal and Billing Defaults</h2>
            </div>
            <button type="button" onClick={() => void saveOperationalDefaults()} disabled={busy === "save-defaults" || !settings}>
              {busy === "save-defaults" ? "Saving..." : "Save Defaults"}
            </button>
          </div>
          {settings ? (
            <div className="nexops-quote-template-editor">
              <div className="nexops-density-inline-facts">
                <article>
                  <h3>Tipping</h3>
                  <p>{settings.invoiceDefaults.tippingEnabled ? "Enabled" : "Off"}</p>
                  <small>This integration stays off until the tenant turns it on here.</small>
                </article>
                <article>
                  <h3>Business Address</h3>
                  <p>{settings.portalDefaults.keepBusinessAddressPrivate ? "Hidden in Hub" : "Visible in Hub"}</p>
                  <small>Client-facing portal resolves this from shared tenant branding settings.</small>
                </article>
                <article>
                  <h3>Reverify Window</h3>
                  <p>{settings.portalDefaults.hubSessionReverifyDays} days</p>
                  <small>After this many idle days, the client must open a fresh link or pass last-4 phone verification.</small>
                </article>
              </div>
              <label className="nexops-check-field inline">
                <input
                  type="checkbox"
                  checked={settings.invoiceDefaults.tippingEnabled}
                  onChange={(event) => setSettings({
                    ...settings,
                    invoiceDefaults: {
                      ...settings.invoiceDefaults,
                      tippingEnabled: event.target.checked
                    }
                  })}
                />
                Enable Client-Facing Tip Prompt on Invoice Payment and Receipts
              </label>
              <label className="nexops-check-field inline">
                <input
                  type="checkbox"
                  checked={settings.portalDefaults.keepBusinessAddressPrivate}
                  onChange={(event) => setSettings({
                    ...settings,
                    portalDefaults: {
                      ...settings.portalDefaults,
                      keepBusinessAddressPrivate: event.target.checked
                    }
                  })}
                />
                Keep the Tenant Business Address Private Inside NexPortal
              </label>
              <label className="nexops-field">
                <span>Client Hub Reverify Window (Days)</span>
                <input
                  type="number"
                  min={1}
                  value={settings.portalDefaults.hubSessionReverifyDays}
                  onChange={(event) => setSettings({
                    ...settings,
                    portalDefaults: {
                      ...settings.portalDefaults,
                      hubSessionReverifyDays: Math.max(1, Number(event.target.value) || 1)
                    }
                  })}
                />
              </label>
            </div>
          ) : (
            <p className="nexops-empty-copy">Portal defaults load with tenant settings.</p>
          )}
        </article> : null}

        {activeSettingsArea === "automations" ? <article className="nexops-module-card">
          <div className="nexops-page-heading">
            <div>
              <p className="eyebrow">Review Follow-Up</p>
              <h2>Sequence Defaults</h2>
            </div>
            <div className="nexops-inline-actions">
              <button type="button" onClick={() => addReviewStep()} disabled={!settings}>Add Step</button>
              <button type="button" onClick={() => void saveOperationalDefaults()} disabled={busy === "save-defaults" || !settings}>
                {busy === "save-defaults" ? "Saving..." : "Save Defaults"}
              </button>
            </div>
          </div>
          {settings ? (
            <div className="nexops-quote-template-editor">
              <label className="nexops-check-field inline">
                <input
                  type="checkbox"
                  checked={settings.reviewDefaults.enabled}
                  onChange={(event) => setSettings({
                    ...settings,
                    reviewDefaults: {
                      ...settings.reviewDefaults,
                      enabled: event.target.checked
                    }
                  })}
                />
                Enable Post-Closeout Review Follow-Up by Default
              </label>
              <p className="nexops-form-note">The seeded cadence is 1 / 4 / 10 days. Channels and spacing can be tuned here per tenant.</p>
              <div className="nexops-mini-list">
                {settings.reviewDefaults.steps
                  .slice()
                  .sort((left, right) => left.offsetDays - right.offsetDays)
                  .map((step) => (
                    <div key={step.id} className="nexops-quote-detail-line">
                      <span>
                        <strong>{step.label}</strong>
                        <small>{step.templateCategory} via {step.channels}</small>
                      </span>
                      <small>+{step.offsetDays} day{step.offsetDays === 1 ? "" : "s"}</small>
                    </div>
                  ))}
              </div>
              {settings.reviewDefaults.steps.map((step) => (
                <div key={`editor-${step.id}`} className="nexops-quote-toggle-grid">
                  <label className="nexops-field">
                    <span>Step Label</span>
                    <input value={step.label} onChange={(event) => patchReviewStep(step.id, (current) => ({ ...current, label: event.target.value }))} />
                  </label>
                  <label className="nexops-field">
                    <span>Days After Closeout</span>
                    <input
                      type="number"
                      min={0}
                      value={step.offsetDays}
                      onChange={(event) => patchReviewStep(step.id, (current) => ({ ...current, offsetDays: Math.max(0, Number(event.target.value) || 0) }))}
                    />
                  </label>
                  <label className="nexops-field">
                    <span>Channel</span>
                    <select value={step.channels} onChange={(event) => patchReviewStep(step.id, (current) => ({ ...current, channels: event.target.value as ReviewSequenceStepSetting["channels"] }))}>
                      <option value="email">Email</option>
                      <option value="sms">Text</option>
                      <option value="both">Email + text</option>
                    </select>
                  </label>
                  <label className="nexops-field">
                    <span>Template Category</span>
                    <select value={step.templateCategory} onChange={(event) => patchReviewStep(step.id, (current) => ({ ...current, templateCategory: event.target.value as ReviewSequenceStepSetting["templateCategory"] }))}>
                      <option value="review_request_initial">Initial Review Request</option>
                      <option value="review_request_nudge">Review Nudge</option>
                    </select>
                  </label>
                  <div className="nexops-inline-actions">
                    <button className="nexops-settings-action--danger" type="button" onClick={() => removeReviewStep(step.id)} disabled={settings.reviewDefaults.steps.length <= 1}>Remove Step</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="nexops-empty-copy">Review defaults load with tenant settings.</p>
          )}
        </article> : null}

        {activeSettingsArea === "products-services" ? <article className="nexops-module-card">
          <div className="nexops-page-heading">
            <div>
              <p className="eyebrow">Products &amp; Services</p>
              <h2>Global Catalog</h2>
            </div>
            <div className="nexops-inline-actions">
              <input placeholder="Search Catalog" value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} />
              <button type="button" onClick={() => {
                setCatalogDraft(blankCatalogItemDraft());
                setCatalogEditorOpen(true);
              }}>Add Item</button>
            </div>
          </div>
          <div className="nexops-mini-list">
            {visibleCatalog.map((item) => (
              <button
                className="nexops-catalog-settings-row"
                type="button"
                key={item.id}
                onClick={() => {
                  setCatalogDraft(catalogDraftFromItem(item));
                  setCatalogEditorOpen(true);
                }}
              >
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.code} · {item.tag} · {item.visible ? "Visible" : "Hidden"}</small>
                  <small>{item.description ?? "No saved description yet."}</small>
                </span>
                <mark>${item.price.toFixed(2)}</mark>
              </button>
            ))}
            {!visibleCatalog.length ? <p className="nexops-empty-copy">No catalog items match this search yet.</p> : null}
          </div>
        </article> : null}

        {activeSettingsArea === "templates" ? <article className="nexops-module-card">
          <div className="nexops-page-heading">
            <div>
              <p className="eyebrow">Email and Text Templates</p>
              <h2>Outbound Template Manager</h2>
            </div>
          </div>
          <div className="nexops-settings-template-layout">
            <div className="nexops-settings-template-list">
              {(settings?.communicationTemplates ?? []).map((template) => (
                <button
                  className={`nexops-quote-template-chip${template.id === selectedTemplate?.id ? " active" : ""}`}
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedTemplateId(template.id)}
                >
                  <strong>{template.label}</strong>
                  <small>{templateChannelLabel(template)} · {templateMatchesDefault(template, templateDefaults.find((fallback) => fallback.category === template.category)) ? "Default" : "Customized"}</small>
                </button>
              ))}
            </div>
            {templateDraft ? (
              <div className="nexops-quote-template-editor">
                <div className="nexops-quote-section-head">
                  <div>
                    <h3>{templateDraft.label}</h3>
                    <span>{templateDraft.description ?? templateDraft.category}</span>
                  </div>
                  <div className="nexops-inline-actions">
                    <button type="button" onClick={() => void resetTemplate()} disabled={busy === "reset-template"}>
                      {busy === "reset-template" ? "Restoring..." : "Reset to Default"}
                    </button>
                    <button type="button" onClick={() => void saveTemplate()} disabled={busy === "save-template"}>
                      {busy === "save-template" ? "Saving..." : "Save Template"}
                    </button>
                  </div>
                </div>
                <div className="nexops-quote-toggle-grid">
                  <label className="nexops-check-field inline">
                    <input type="checkbox" checked={templateDraft.emailEnabled} onChange={(event) => setTemplateDraft({ ...templateDraft, emailEnabled: event.target.checked })} />
                    Email Enabled
                  </label>
                  <label className="nexops-check-field inline">
                    <input type="checkbox" checked={templateDraft.smsEnabled} onChange={(event) => setTemplateDraft({ ...templateDraft, smsEnabled: event.target.checked })} />
                    Text Enabled
                  </label>
                </div>
                <label className="nexops-field">
                  <span>Email Subject</span>
                  <input value={templateDraft.emailSubject ?? ""} onChange={(event) => setTemplateDraft({ ...templateDraft, emailSubject: event.target.value })} disabled={!templateDraft.emailEnabled} />
                </label>
                <label className="nexops-field">
                  <span>Email Body</span>
                  <textarea rows={6} value={templateDraft.emailBody ?? ""} onChange={(event) => setTemplateDraft({ ...templateDraft, emailBody: event.target.value })} disabled={!templateDraft.emailEnabled} />
                </label>
                <label className="nexops-field">
                  <span>Text Body</span>
                  <textarea rows={4} value={templateDraft.smsBody ?? ""} onChange={(event) => setTemplateDraft({ ...templateDraft, smsBody: event.target.value })} disabled={!templateDraft.smsEnabled} />
                </label>
                <p className="nexops-form-note">Use {"{{CLIENT_NAME}}"}, {"{{QUOTE_NUMBER}}"}, {"{{PORTAL_URL}}"}, and {"{{JOB_DATE}}"}. Footer branding is rendered server-side by the tenant branding resolver; Resend only transports the completed message.</p>
                <div className="nexops-quote-template-editor" aria-label="Template live preview">
                  <div className="nexops-quote-section-head">
                    <div><h3>Live Preview</h3><span>Sample merge data; the send screen remains editable for this one delivery.</span></div>
                    <select aria-label="Preview channel" value={templatePreviewChannel} onChange={(event) => setTemplatePreviewChannel(event.target.value as "email" | "sms")}>
                      <option value="email">Email</option><option value="sms">SMS</option>
                    </select>
                  </div>
                  {templatePreviewChannel === "email" ? <><strong>{previewTemplateText(templateDraft.emailSubject ?? "", props.tenantName)}</strong><p className="nexops-form-note">{previewTemplateText(templateDraft.emailBody ?? "", props.tenantName)}</p></> : <><small>{(templateDraft.smsBody ?? "").length} characters {((templateDraft.smsBody ?? "").length > 320 ? "· over 320-character guide" : (templateDraft.smsBody ?? "").length > 160 ? "· over 160-character guide" : "· within 160-character guide")}</small><p className="nexops-form-note">{previewTemplateText(templateDraft.smsBody ?? "", props.tenantName)}</p></>}
                </div>
              </div>
            ) : (
              <p className="nexops-empty-copy">Pick a template category to edit its channels, subject, and message bodies.</p>
            )}
          </div>
        </article> : null}
      </div>

      {settings ? <RemainingSettingsSections
        value={settings.workspaceSettings}
        onChange={(workspaceSettings) => setSettings((current) => current ? { ...current, workspaceSettings } : current)}
        onSave={() => void saveWorkspaceSettings()}
        saving={busy === "save-workspace-settings"}
        activeSection={activeSettingsArea}
      /> : null}

      {activeSettingsArea === "document-design" ? <article className="nexops-module-card">
        <div className="nexops-page-heading"><div><p className="eyebrow">Client documents</p><h2>Document Design</h2><p>PDF layout and wording. Email and SMS delivery copy remains in Templates.</p></div><button type="button" onClick={() => void saveDocumentDesign()} disabled={!settings || busy === "save-document-design"}>{busy === "save-document-design" ? "Saving..." : "Save Document Design"}</button></div>
        {settings ? <DocumentDesignEditor settings={settings} setSettings={setSettings} tab={documentTab} setTab={setDocumentTab} /> : null}
      </article> : null}

      {activeSettingsArea === "completion-requirements" ? <article className="nexops-module-card" id="completion-requirements">
        <div className="nexops-page-heading"><div><p className="eyebrow">Job closeout</p><h2>Completion Requirements</h2><p>Tenant-wide evidence rules for the Close Job action. Missing evidence is a soft stop with a logged assigned-owner override.</p></div><button type="button" onClick={() => void saveCompletionRequirements()} disabled={!settings || busy === "save-completion-requirements"}>{busy === "save-completion-requirements" ? "Saving..." : "Save Requirements"}</button></div>
        {settings ? <div className="nexops-quote-toggle-grid">
          {([ ["checklistRequired", "Checklist required"], ["photosRequired", "Photos required"], ["reportRequired", "Report required"], ["signatureRequired", "Signature required"] ] as const).map(([key, label]) => <label className="nexops-check-field inline" key={key}><input type="checkbox" checked={settings.completionRequirements[key]} onChange={(event) => setSettings((current) => current ? { ...current, completionRequirements: { ...current.completionRequirements, [key]: event.target.checked } } : current)} />{label}</label>)}
        </div> : null}
      </article> : null}

      {activeSettingsArea === "team-permissions" ? <article className="nexops-module-card">
        <div className="nexops-page-heading">
          <div>
            <p className="eyebrow">Tenant Users</p>
            <h2>Salesperson and Routing Options</h2>
          </div>
        </div>
        <div className="nexops-mini-list">
          {props.tenantUsers.map((user) => (
            <div className="nexops-quote-detail-line" key={user.id}>
              <span>
                <strong>{user.displayName}</strong>
                <small>{user.email ?? "No email stored"}</small>
              </span>
              <mark>{user.role}{user.active ? " · Active" : " · Inactive"}</mark>
            </div>
          ))}
        </div>
      </article> : null}

      <NexOpsCatalogEditorModal
        open={catalogEditorOpen}
        title={catalogDraft.id ? "Edit Catalog Item" : "Add Catalog Item"}
        saveLabel={catalogDraft.id ? "Save Item" : "Create Item"}
        busy={busy === "save-catalog"}
        draft={catalogDraft}
        onDraftChange={setCatalogDraft}
        onClose={() => {
          setCatalogEditorOpen(false);
          setCatalogDraft(blankCatalogItemDraft());
        }}
        onSave={() => void saveCatalogItem()}
      />
    </section>
  );
}

function DocumentDesignEditor({ settings, setSettings, tab, setTab }: { settings: CrmSettingsRecord; setSettings: React.Dispatch<React.SetStateAction<CrmSettingsRecord | null>>; tab: "quote" | "job" | "invoice" | "style"; setTab: (tab: "quote" | "job" | "invoice" | "style") => void }): React.ReactElement {
  const save = (documentDesign: CrmSettingsRecord["documentDesign"]) => setSettings({ ...settings, documentDesign });
  const reset = { quote: "This quote is valid for the next 30 days, after which values may be subject to change.", deposit: "A deposit of {{DEPOSIT_AMOUNT}} will be required to begin.", job: "We can be called for touch-ups and small changes for the next 3 days. After that all work is final.", invoice: "Thank you for your business. Please contact us with any questions regarding this invoice." };
  const check = (checked: boolean, label: string, change: (value: boolean) => void) => <label className="nexops-check-field inline"><input type="checkbox" checked={checked} onChange={(event) => change(event.target.checked)} />{label}</label>;
  return <div className="nexops-quote-template-editor">
    <div className="nexops-settings-template-list">{(["quote", "job", "invoice", "style"] as const).map((item) => <button key={item} type="button" className={"nexops-quote-template-chip" + (item === tab ? " active" : "")} onClick={() => setTab(item)}>{item === "quote" ? "Quotes" : item === "job" ? "Jobs" : item === "invoice" ? "Invoices" : "Style"}</button>)}</div>
    {tab === "quote" ? <><div className="nexops-quote-toggle-grid">{check(settings.documentDesign.quote.referToAsEstimate, "Refer to Quote as Estimate", (value) => save({ ...settings.documentDesign, quote: { ...settings.documentDesign.quote, referToAsEstimate: value } }))}{check(settings.documentDesign.quote.showQuantity, "Show QTY", (value) => save({ ...settings.documentDesign, quote: { ...settings.documentDesign.quote, showQuantity: value } }))}{check(settings.documentDesign.quote.showUnitPrice, "Show unit price", (value) => save({ ...settings.documentDesign, quote: { ...settings.documentDesign.quote, showUnitPrice: value } }))}{check(settings.documentDesign.quote.showLineTotal, "Show total cost", (value) => save({ ...settings.documentDesign, quote: { ...settings.documentDesign.quote, showLineTotal: value } }))}{check(settings.documentDesign.quote.showTotalsAndTax, "Show totals and tax", (value) => save({ ...settings.documentDesign, quote: { ...settings.documentDesign.quote, showTotalsAndTax: value } }))}{check(settings.documentDesign.quote.showSignatureLine, "Show client signature", (value) => save({ ...settings.documentDesign, quote: { ...settings.documentDesign.quote, showSignatureLine: value } }))}</div><label className="nexops-field"><span>Contract / disclaimer</span><textarea value={settings.documentDesign.quote.disclaimer} onChange={(e) => save({ ...settings.documentDesign, quote: { ...settings.documentDesign.quote, disclaimer: e.target.value } })} /></label><button type="button" onClick={() => save({ ...settings.documentDesign, quote: { ...settings.documentDesign.quote, disclaimer: reset.quote } })}>Reset to Default</button><label className="nexops-field"><span>Deposit language</span><textarea value={settings.documentDesign.quote.depositLanguage} onChange={(e) => save({ ...settings.documentDesign, quote: { ...settings.documentDesign.quote, depositLanguage: e.target.value } })} /></label><button type="button" onClick={() => save({ ...settings.documentDesign, quote: { ...settings.documentDesign.quote, depositLanguage: reset.deposit } })}>Reset to Default</button><p className="nexops-form-note">Live document preview: deposit text appears only for a quote requesting a deposit; {"{{DEPOSIT_AMOUNT}}"} is resolved by Templates.</p></> : null}
    {tab === "job" ? <>{check(settings.documentDesign.job.showSignatureLine, "Include client signature line", (value) => save({ ...settings.documentDesign, job: { ...settings.documentDesign.job, showSignatureLine: value } }))}<label className="nexops-field"><span>Contract / disclaimer</span><textarea value={settings.documentDesign.job.disclaimer} onChange={(e) => save({ ...settings.documentDesign, job: { ...settings.documentDesign.job, disclaimer: e.target.value } })} /></label><button type="button" onClick={() => save({ ...settings.documentDesign, job: { ...settings.documentDesign.job, disclaimer: reset.job } })}>Reset to Default</button></> : null}
    {tab === "invoice" ? <><div className="nexops-quote-toggle-grid">{(["showQuantity", "showUnitPrice", "showLineTotal", "showReturnPaymentStub", "showLateStamp", "showAccountBalance", "showPaidDate"] as const).map((key) => check(settings.documentDesign.invoice[key], key.replace(/([A-Z])/g, " $1"), (value) => save({ ...settings.documentDesign, invoice: { ...settings.documentDesign.invoice, [key]: value } })))}</div><label className="nexops-field"><span>Contract / disclaimer</span><textarea value={settings.documentDesign.invoice.disclaimer} onChange={(e) => save({ ...settings.documentDesign, invoice: { ...settings.documentDesign.invoice, disclaimer: e.target.value } })} /></label><button type="button" onClick={() => save({ ...settings.documentDesign, invoice: { ...settings.documentDesign.invoice, disclaimer: reset.invoice } })}>Reset to Default</button></> : null}
    {tab === "style" ? <div className="nexops-quote-toggle-grid"><label className="nexops-field"><span>Header layout</span><select value={settings.documentDesign.style.headerLayout} onChange={(e) => save({ ...settings.documentDesign, style: { ...settings.documentDesign.style, headerLayout: e.target.value as CrmSettingsRecord["documentDesign"]["style"]["headerLayout"] } })}><option value="basic">Basic</option><option value="compact">Compact</option><option value="envelope_dual">#10 Envelope Dual Window</option><option value="envelope_single">#10 Envelope Single Window</option></select></label><label className="nexops-field"><span>Header style</span><select value={settings.documentDesign.style.headerStyle} onChange={(e) => save({ ...settings.documentDesign, style: { ...settings.documentDesign.style, headerStyle: e.target.value as "modern" | "clean" } })}><option value="modern">Modern</option><option value="clean">Clean</option></select></label><label className="nexops-field"><span>Logo size</span><input type="number" min=".5" max="2" step=".1" value={settings.documentDesign.style.logoSize} onChange={(e) => save({ ...settings.documentDesign, style: { ...settings.documentDesign.style, logoSize: Number(e.target.value) } })} /></label><label className="nexops-field"><span>Theme color</span><select value={settings.documentDesign.style.themeColor} onChange={(e) => save({ ...settings.documentDesign, style: { ...settings.documentDesign.style, themeColor: e.target.value as CrmSettingsRecord["documentDesign"]["style"]["themeColor"] } })}>{["default", "blue", "red", "green", "orange", "purple"].map((color) => <option key={color}>{color}</option>)}</select></label><label className="nexops-field"><span>Footer font size</span><input type="number" min="6" max="10" value={settings.documentDesign.style.footerFontSize} onChange={(e) => save({ ...settings.documentDesign, style: { ...settings.documentDesign.style, footerFontSize: Number(e.target.value) } })} /></label></div> : null}
    <LivePdfPreview tenantId={settings.tenantId} kind={tab === "style" ? "quote" : tab} design={settings.documentDesign} />
  </div>;
}

function LivePdfPreview({ tenantId, kind, design }: { tenantId: string; kind: "quote" | "job" | "invoice"; design: CrmSettingsRecord["documentDesign"] }): React.ReactElement {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<"loading" | "error">("loading");
  useEffect(() => {
    setState("loading");
    const timer = window.setTimeout(() => {
      void fetch("/api/crm/settings/document-design-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId, kind, documentDesign: design })
      })
        .then(async (response) => {
          if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) throw new Error("Preview was not a PDF.");
          return response.blob();
        })
        .then((blob) => setUrl((old) => { if (old) URL.revokeObjectURL(old); setState("loading"); return URL.createObjectURL(blob); }))
        .catch(() => { setUrl(""); setState("error"); });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [tenantId, kind, design]);
  return <section className="nexops-quote-template-editor"><h3>Live PDF Preview</h3>{url ? <iframe className="nexops-pdf-preview-frame" title={kind + " PDF preview"} src={url} /> : <div className="nexops-pdf-preview-status" role="status"><strong>{state === "error" ? "Preview unavailable" : "Refreshing your live preview"}</strong><span>{state === "error" ? "Check your connection, then adjust a setting to retry." : "Using representative document data and your current unsaved settings."}</span></div>}</section>;
}
