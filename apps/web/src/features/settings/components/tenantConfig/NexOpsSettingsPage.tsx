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

interface CrmSettingsRecord {
  tenantId: string;
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
    return "Email + text";
  }
  if (template.emailEnabled) {
    return "Email only";
  }
  if (template.smsEnabled) {
    return "Text only";
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
    label: "Review nudge",
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
          <h3>Viewer role</h3>
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
              <p className="eyebrow">Client hub</p>
              <h2>Portal and billing defaults</h2>
            </div>
            <button type="button" onClick={() => void saveOperationalDefaults()} disabled={busy === "save-defaults" || !settings}>
              {busy === "save-defaults" ? "Saving..." : "Save defaults"}
            </button>
          </div>
          {settings ? (
            <div className="nexops-quote-template-editor">
              <div className="nexops-density-inline-facts">
                <article>
                  <h3>Tipping</h3>
                  <p>{settings.invoiceDefaults.tippingEnabled ? "Enabled" : "Off"}</p>
                  <small>Aquatrace stays off by default until a tenant turns it on here.</small>
                </article>
                <article>
                  <h3>Business address</h3>
                  <p>{settings.portalDefaults.keepBusinessAddressPrivate ? "Hidden in hub" : "Visible in hub"}</p>
                  <small>Client-facing portal resolves this from shared tenant branding settings.</small>
                </article>
                <article>
                  <h3>Reverify window</h3>
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
                Enable client-facing tip prompt on invoice payment and receipts
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
                Keep the tenant business address private inside NexPortal
              </label>
              <label className="nexops-field">
                <span>Client hub reverify window (days)</span>
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
              <p className="eyebrow">Review follow-up</p>
              <h2>Sequence defaults</h2>
            </div>
            <div className="nexops-inline-actions">
              <button type="button" onClick={() => addReviewStep()} disabled={!settings}>Add step</button>
              <button type="button" onClick={() => void saveOperationalDefaults()} disabled={busy === "save-defaults" || !settings}>
                {busy === "save-defaults" ? "Saving..." : "Save defaults"}
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
                Enable post-closeout review follow-up by default
              </label>
              <p className="nexops-form-note">Current seeded Aquatrace cadence stays 1 / 4 / 10 days until Chris confirms a different default. Channels and spacing can still be tuned here per tenant.</p>
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
                    <span>Step label</span>
                    <input value={step.label} onChange={(event) => patchReviewStep(step.id, (current) => ({ ...current, label: event.target.value }))} />
                  </label>
                  <label className="nexops-field">
                    <span>Days after closeout</span>
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
                    <span>Template category</span>
                    <select value={step.templateCategory} onChange={(event) => patchReviewStep(step.id, (current) => ({ ...current, templateCategory: event.target.value as ReviewSequenceStepSetting["templateCategory"] }))}>
                      <option value="review_request_initial">Initial review request</option>
                      <option value="review_request_nudge">Review nudge</option>
                    </select>
                  </label>
                  <div className="nexops-inline-actions">
                    <button type="button" onClick={() => removeReviewStep(step.id)} disabled={settings.reviewDefaults.steps.length <= 1}>Remove step</button>
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
              <h2>Global catalog</h2>
            </div>
            <div className="nexops-inline-actions">
              <input placeholder="Search catalog" value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} />
              <button type="button" onClick={() => {
                setCatalogDraft(blankCatalogItemDraft());
                setCatalogEditorOpen(true);
              }}>Add item</button>
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
              <h2>Outbound template manager</h2>
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
                    {busy === "save-template" ? "Saving..." : "Save template"}
                  </button>
                </div>
                <div className="nexops-quote-toggle-grid">
                  <label className="nexops-check-field inline">
                    <input type="checkbox" checked={templateDraft.emailEnabled} onChange={(event) => setTemplateDraft({ ...templateDraft, emailEnabled: event.target.checked })} />
                    Email enabled
                  </label>
                  <label className="nexops-check-field inline">
                    <input type="checkbox" checked={templateDraft.smsEnabled} onChange={(event) => setTemplateDraft({ ...templateDraft, smsEnabled: event.target.checked })} />
                    Text enabled
                  </label>
                </div>
                <label className="nexops-field">
                  <span>Email subject</span>
                  <input value={templateDraft.emailSubject ?? ""} onChange={(event) => setTemplateDraft({ ...templateDraft, emailSubject: event.target.value })} disabled={!templateDraft.emailEnabled} />
                </label>
                <label className="nexops-field">
                  <span>Email body</span>
                  <textarea rows={6} value={templateDraft.emailBody ?? ""} onChange={(event) => setTemplateDraft({ ...templateDraft, emailBody: event.target.value })} disabled={!templateDraft.emailEnabled} />
                </label>
                <label className="nexops-field">
                  <span>Text body</span>
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
            <p className="eyebrow">Tenant users</p>
            <h2>Salesperson and routing options</h2>
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
        title={catalogDraft.id ? "Edit catalog item" : "Add catalog item"}
        saveLabel={catalogDraft.id ? "Save item" : "Create item"}
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
