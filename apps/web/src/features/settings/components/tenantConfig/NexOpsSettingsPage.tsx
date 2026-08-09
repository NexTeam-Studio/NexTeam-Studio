import React, { useEffect, useMemo, useState } from "react";
import {
  NexOpsCatalogEditorModal,
  blankCatalogItemDraft,
  catalogDraftFromItem,
  catalogItemFromDraft,
  type CatalogItemDraft,
  type ProductServiceCatalogItem
} from "../catalog/NexOpsCatalog";

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

interface TenantOperatingProfile {
  company: { legalName?: string; publicName?: string; industry?: string; timezone: string };
  locations: Array<{ id: string; label: string; active: boolean }>;
  businessHours: Array<{ day: string; open?: string; close?: string; closed: boolean }>;
  tax: { enabled: boolean; defaultRate: number; registrationId?: string };
  communicationIdentity: { replyToEmail?: string; replyToName?: string; phone?: string };
  securityAudit: { auditEventsEnabled: boolean; requireApprovalForExternalSend: boolean };
  onboarding: { completedSteps: string[]; launchReviewedAt?: string };
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
  catalogItems: ProductServiceCatalogItem[];
  communicationTemplates: CommunicationTemplateRecord[];
  createdAt: string;
  updatedAt: string;
}

interface CrmSettingsResponse {
  ok: boolean;
  settings?: CrmSettingsRecord;
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

export function NexOpsSettingsPage(props: NexOpsSettingsPageProps): React.ReactElement {
  const [settings, setSettings] = useState<CrmSettingsRecord | null>(null);
  const [statusMessage, setStatusMessage] = useState("Loading settings...");
  const [busy, setBusy] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogEditorOpen, setCatalogEditorOpen] = useState(false);
  const [catalogDraft, setCatalogDraft] = useState<CatalogItemDraft>(blankCatalogItemDraft());
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateDraft, setTemplateDraft] = useState<CommunicationTemplateRecord | null>(null);

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

  return (
    <section className="nexops-module-page tenant-config-page">
      <div className="nexops-page-heading">
        <div>
          <h1>Settings</h1>
          <p>One place for tenant catalog, correspondence templates, and the shared office defaults these screens reuse.</p>
        </div>
      </div>

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
        <article className="nexops-module-card">
          <div className="nexops-page-heading">
            <div>
              <p className="eyebrow">Company Foundation</p>
              <h2>Business Profile and Launch Controls</h2>
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
              <p className="nexops-form-note">{settings.operatingProfile.locations.length} location{settings.operatingProfile.locations.length === 1 ? "" : "s"} and {settings.operatingProfile.onboarding.completedSteps.length} onboarding step{settings.operatingProfile.onboarding.completedSteps.length === 1 ? "" : "s"} are stored in this same tenant settings record.</p>
            </div>
          ) : <p className="nexops-empty-copy">Company settings load with the tenant configuration.</p>}
        </article>

        <article className="nexops-module-card">
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
        </article>

        <article className="nexops-module-card">
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
                    <button type="button" onClick={() => removeReviewStep(step.id)} disabled={settings.reviewDefaults.steps.length <= 1}>Remove Step</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="nexops-empty-copy">Review defaults load with tenant settings.</p>
          )}
        </article>

        <article className="nexops-module-card">
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
        </article>

        <article className="nexops-module-card">
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
                  <small>{templateChannelLabel(template)}</small>
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
                  <button type="button" onClick={() => void saveTemplate()} disabled={busy === "save-template"}>
                    {busy === "save-template" ? "Saving..." : "Save Template"}
                  </button>
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
                <p className="nexops-form-note">Use the existing merge-field pattern such as {"{{CLIENT_NAME}}"}, {"{{QUOTE_NUMBER}}"}, and {"{{JOB_DATE}}"} inside these bodies. Footer branding still comes from the tenant branding resolver.</p>
              </div>
            ) : (
              <p className="nexops-empty-copy">Pick a template category to edit its channels, subject, and message bodies.</p>
            )}
          </div>
        </article>
      </div>

      <article className="nexops-module-card">
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
      </article>

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
