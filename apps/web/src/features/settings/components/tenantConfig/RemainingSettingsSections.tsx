import React from "react";
import type { CrmSettings } from "@nexteam/core";

type WorkspaceSettings = CrmSettings["workspaceSettings"];

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function Toggle({ checked, children, onChange }: { checked: boolean; children: React.ReactNode; onChange: (checked: boolean) => void }): React.ReactElement {
  return <label className="nexops-check-field inline"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{children}</label>;
}

export function RemainingSettingsSections({
  value,
  onChange,
  onSave,
  saving
}: {
  value: WorkspaceSettings;
  onChange: (next: WorkspaceSettings) => void;
  onSave: () => void;
  saving: boolean;
}): React.ReactElement {
  const update = <K extends keyof WorkspaceSettings>(key: K, next: WorkspaceSettings[K]) => onChange({ ...value, [key]: next });
  return <section className="nexops-two-column" aria-label="Remaining settings sections">
    <article className="nexops-module-card">
      <div className="nexops-page-heading"><div><p className="eyebrow">Company</p><h2>Company Details</h2><p>Identity, regional defaults, and public-address controls.</p></div><button type="button" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save Company"}</button></div>
      <div className="nexops-quote-toggle-grid">
        <label className="nexops-field"><span>Currency</span><input value={value.company.currency} onChange={(event) => update("company", { ...value.company, currency: event.target.value.toUpperCase() })} /></label>
        <label className="nexops-field"><span>Date Format</span><select value={value.company.dateFormat} onChange={(event) => update("company", { ...value.company, dateFormat: event.target.value as WorkspaceSettings["company"]["dateFormat"] })}><option>MM/DD/YYYY</option><option>DD/MM/YYYY</option><option>YYYY-MM-DD</option></select></label>
        <label className="nexops-field"><span>First Weekday</span><select value={value.company.firstWeekday} onChange={(event) => update("company", { ...value.company, firstWeekday: event.target.value as "monday" | "sunday" })}><option value="monday">Monday</option><option value="sunday">Sunday</option></select></label>
        <label className="nexops-field"><span>Brand Color</span><input placeholder="#0B5E63" value={value.company.brandColor ?? ""} onChange={(event) => update("company", { ...value.company, brandColor: event.target.value || undefined })} /></label>
        <label className="nexops-field"><span>Terms URL</span><input placeholder="https://…" value={value.company.termsUrl ?? ""} onChange={(event) => update("company", { ...value.company, termsUrl: event.target.value || undefined })} /></label>
        <label className="nexops-field"><span>Privacy URL</span><input placeholder="https://…" value={value.company.privacyUrl ?? ""} onChange={(event) => update("company", { ...value.company, privacyUrl: event.target.value || undefined })} /></label>
      </div>
      <Toggle checked={value.company.addressPrivate} onChange={(addressPrivate) => update("company", { ...value.company, addressPrivate })}>Keep business address private in NexPortal</Toggle>
      <Toggle checked={value.company.hideAddressFromAiCrawlers} onChange={(hideAddressFromAiCrawlers) => update("company", { ...value.company, hideAddressFromAiCrawlers })}>Exclude business address from AI/crawler-facing output</Toggle>
    </article>

    <article className="nexops-module-card">
      <div className="nexops-page-heading"><div><p className="eyebrow">Checklists &amp; Reports</p><h2>NexCam Defaults</h2><p>Templates, photo attachment, and report PDF rails are already live.</p></div><button type="button" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save Defaults"}</button></div>
      <Toggle checked={value.fieldDocs.gpsDefault} onChange={(gpsDefault) => update("fieldDocs", { ...value.fieldDocs, gpsDefault })}>Capture GPS by default (never client-visible)</Toggle>
      <Toggle checked={value.fieldDocs.timestampDefault} onChange={(timestampDefault) => update("fieldDocs", { ...value.fieldDocs, timestampDefault })}>Capture timestamp by default</Toggle>
      <Toggle checked={value.fieldDocs.aiTaggingDefault} onChange={(aiTaggingDefault) => update("fieldDocs", { ...value.fieldDocs, aiTaggingDefault })}>Run AI tagging by default</Toggle>
      <p className="nexops-form-note">Photo markup always creates a new copy; the original is never overwritten.</p>
    </article>

    <article className="nexops-module-card">
      <div className="nexops-page-heading"><div><p className="eyebrow">Automations</p><h2>Event Sequences</h2><p>Reusable trigger, condition, timing, action, and stop-condition primitives.</p></div><button type="button" onClick={() => update("automations", [...value.automations, { id: newId("automation"), title: "New automation", active: false, trigger: "quote_sent", delayMinutes: 1440, condition: "record remains open", action: "send_message", messageTemplateCategory: "quote_follow_up", stopConditions: ["manual", "exhaustion"] }])}>Add Automation</button></div>
      {value.automations.map((rule, index) => <div className="nexops-quote-template-editor" key={rule.id}><div className="nexops-quote-toggle-grid"><label className="nexops-field"><span>Title</span><input value={rule.title} onChange={(event) => update("automations", value.automations.map((entry, i) => i === index ? { ...entry, title: event.target.value } : entry))} /></label><label className="nexops-field"><span>Event Trigger</span><input value={rule.trigger} onChange={(event) => update("automations", value.automations.map((entry, i) => i === index ? { ...entry, trigger: event.target.value } : entry))} /></label><label className="nexops-field"><span>Delay (minutes)</span><input type="number" min="0" value={rule.delayMinutes} onChange={(event) => update("automations", value.automations.map((entry, i) => i === index ? { ...entry, delayMinutes: Math.max(0, Number(event.target.value) || 0) } : entry))} /></label></div><Toggle checked={rule.active} onChange={(active) => update("automations", value.automations.map((entry, i) => i === index ? { ...entry, active } : entry))}>Active</Toggle></div>)}
      {!value.automations.length ? <p className="nexops-empty-copy">No automation is configured yet.</p> : null}
    </article>

    <article className="nexops-module-card">
      <div className="nexops-page-heading"><div><p className="eyebrow">Requests &amp; Booking</p><h2>Intake and Booking</h2><p>Each public form is tenant-owned and independently configured.</p></div><a className="nexops-link-button" href="/nexops/requests">Open Form Library</a></div>
      <div className="nexops-quote-toggle-grid"><label className="nexops-field"><span>Booking Buffer (minutes)</span><input type="number" min="0" value={value.requestsBooking.bufferMinutes} onChange={(event) => update("requestsBooking", { ...value.requestsBooking, bufferMinutes: Math.max(0, Number(event.target.value) || 0) })} /></label><label className="nexops-field"><span>Service Areas (comma-separated)</span><input value={value.requestsBooking.serviceAreas.join(", ")} onChange={(event) => update("requestsBooking", { ...value.requestsBooking, serviceAreas: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label></div>
      <Toggle checked={value.requestsBooking.requireApproval} onChange={(requireApproval) => update("requestsBooking", { ...value.requestsBooking, requireApproval })}>Require office approval before booking</Toggle>
      <p className="nexops-form-note">The existing Form Library owns individual form fields, public URLs, embed code, and marketing-consent capture. This section owns booking-wide defaults only.</p>
    </article>

    <article className="nexops-module-card">
      <div className="nexops-page-heading"><div><p className="eyebrow">Tax</p><h2>Rates and Groups</h2><p>Rates remain tenant-scoped; inclusive/exclusive calculation is explicit.</p></div><button type="button" onClick={() => update("taxSettings", { ...value.taxSettings, rates: [...value.taxSettings.rates, { id: newId("tax"), name: "New tax rate", rate: 0, isDefault: value.taxSettings.rates.length === 0, active: true }] })}>Add Rate</button></div>
      <label className="nexops-field"><span>Calculation Method</span><select value={value.taxSettings.calculationMethod} onChange={(event) => update("taxSettings", { ...value.taxSettings, calculationMethod: event.target.value as "exclusive" | "inclusive" })}><option value="exclusive">Exclusive</option><option value="inclusive">Inclusive</option></select></label>
      {value.taxSettings.rates.map((rate, index) => <div className="nexops-quote-toggle-grid" key={rate.id}><label className="nexops-field"><span>Name</span><input value={rate.name} onChange={(event) => update("taxSettings", { ...value.taxSettings, rates: value.taxSettings.rates.map((entry, i) => i === index ? { ...entry, name: event.target.value } : entry) })} /></label><label className="nexops-field"><span>Rate (%)</span><input type="number" min="0" max="100" value={rate.rate} onChange={(event) => update("taxSettings", { ...value.taxSettings, rates: value.taxSettings.rates.map((entry, i) => i === index ? { ...entry, rate: Math.max(0, Math.min(100, Number(event.target.value) || 0)) } : entry) })} /></label><Toggle checked={rate.isDefault} onChange={(isDefault) => update("taxSettings", { ...value.taxSettings, rates: value.taxSettings.rates.map((entry) => ({ ...entry, isDefault: entry.id === rate.id ? isDefault : isDefault ? false : entry.isDefault })) })}>Default</Toggle></div>)}
    </article>

    <article className="nexops-module-card">
      <div className="nexops-page-heading"><div><p className="eyebrow">Custom Fields</p><h2>Reusable Record Fields</h2><p>Transferable is included as an explicit low-cost setting.</p></div><button type="button" onClick={() => update("customFields", [...value.customFields, { id: newId("field"), label: "New field", valueType: "text", appliesTo: "client", readOnly: false, sortOrder: value.customFields.length, archived: false, transferable: false, options: [] }])}>Add Field</button></div>
      {value.customFields.map((field, index) => {
        const patchField = (patch: Partial<typeof field>) => update("customFields", value.customFields.map((entry, i) => i === index ? { ...entry, ...patch } : entry));
        return <div className="nexops-quote-template-editor" key={field.id}><div className="nexops-quote-toggle-grid"><label className="nexops-field"><span>Label</span><input value={field.label} onChange={(event) => patchField({ label: event.target.value })} /></label><label className="nexops-field"><span>Applies To</span><select value={field.appliesTo} onChange={(event) => patchField({ appliesTo: event.target.value })}>{[["client", "Client"], ["property", "Property"], ["request", "Request"], ["quote", "Quote"], ["job", "Job"], ["visit", "Visit"], ["invoice", "Invoice"]].map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label><label className="nexops-field"><span>Value Type</span><select value={field.valueType} onChange={(event) => patchField({ valueType: event.target.value as typeof field.valueType })}>{[["text", "Text"], ["true_false", "True / False"], ["area", "Area"], ["numeric", "Numeric"], ["dropdown_link", "Dropdown / Link"]].map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label><label className="nexops-field"><span>Display Order</span><input type="number" min="0" value={field.sortOrder} onChange={(event) => patchField({ sortOrder: Math.max(0, Number(event.target.value) || 0) })} /></label>{field.valueType === "dropdown_link" ? <label className="nexops-field"><span>Options (comma-separated)</span><input value={field.options.join(", ")} onChange={(event) => patchField({ options: event.target.value.split(",").map((option) => option.trim()).filter(Boolean) })} /></label> : null}</div><div className="nexops-settings-toggle-row"><Toggle checked={field.readOnly} onChange={(readOnly) => patchField({ readOnly })}>Read-only</Toggle><Toggle checked={field.archived} onChange={(archived) => patchField({ archived })}>Archived</Toggle><Toggle checked={field.transferable} onChange={(transferable) => patchField({ transferable })}>Transfer across lifecycle</Toggle><button className="nexops-settings-action--danger" type="button" onClick={() => update("customFields", value.customFields.filter((entry) => entry.id !== field.id))}>Remove Field</button></div></div>;
      })}
    </article>

    <article className="nexops-module-card">
      <div className="nexops-page-heading"><div><p className="eyebrow">Schedule</p><h2>Calendar Defaults</h2><p>Day-oriented scheduling, completed-state treatment, and day-sheet controls.</p></div><button type="button" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save Schedule"}</button></div>
      <Toggle checked={value.schedule.showWeekends} onChange={(showWeekends) => update("schedule", { ...value.schedule, showWeekends })}>Show weekends</Toggle><Toggle checked={value.schedule.calendarSyncEnabled} onChange={(calendarSyncEnabled) => update("schedule", { ...value.schedule, calendarSyncEnabled })}>Enable calendar sync when an adapter is configured</Toggle><Toggle checked={value.schedule.daySheet.showPropertyMap} onChange={(showPropertyMap) => update("schedule", { ...value.schedule, daySheet: { ...value.schedule.daySheet, showPropertyMap } })}>Day sheet: property map</Toggle><Toggle checked={value.schedule.daySheet.showNotes} onChange={(showNotes) => update("schedule", { ...value.schedule, daySheet: { ...value.schedule.daySheet, showNotes } })}>Day sheet: notes area</Toggle><Toggle checked={value.schedule.daySheet.showCustomInfo} onChange={(showCustomInfo) => update("schedule", { ...value.schedule, daySheet: { ...value.schedule.daySheet, showCustomInfo } })}>Day sheet: custom info</Toggle>
    </article>

    <article className="nexops-module-card">
      <div className="nexops-page-heading"><div><p className="eyebrow">NexPortal</p><h2>Client-Hub Defaults</h2><p>Documents stay job-scoped by default; a staff upload can explicitly override this.</p></div><button type="button" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save Portal"}</button></div>
      <label className="nexops-field"><span>Default Document Visibility</span><select value={value.portal.defaultDocumentVisibility} onChange={(event) => update("portal", { ...value.portal, defaultDocumentVisibility: event.target.value as "job" | "global" })}><option value="job">Job-scoped</option><option value="global">Global client-visible</option></select></label><Toggle checked={value.portal.tipPromptEnabled} onChange={(tipPromptEnabled) => update("portal", { ...value.portal, tipPromptEnabled })}>Enable optional tip prompt</Toggle><label className="nexops-field"><span>Preset Tip Percentages</span><input value={value.portal.tipPresetPercentages.join(", ")} onChange={(event) => update("portal", { ...value.portal, tipPresetPercentages: event.target.value.split(",").map(Number).filter((entry) => Number.isFinite(entry) && entry >= 0 && entry <= 100).slice(0, 5) || [15, 18, 20] })} /></label><Toggle checked={value.portal.allowCustomTip} onChange={(allowCustomTip) => update("portal", { ...value.portal, allowCustomTip })}>Allow custom tip amount</Toggle>
    </article>

    <article className="nexops-module-card">
      <div className="nexops-page-heading"><div><p className="eyebrow">Payments</p><h2>Payment Preferences</h2><p>Bank-account configuration remains owner-only and uses the existing payment rail.</p></div><button type="button" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save Payments"}</button></div>
      <Toggle checked={value.payments.receiptsEnabled} onChange={(receiptsEnabled) => update("payments", { ...value.payments, receiptsEnabled })}>Send receipts</Toggle><Toggle checked={value.payments.paymentNotificationsEnabled} onChange={(paymentNotificationsEnabled) => update("payments", { ...value.payments, paymentNotificationsEnabled })}>Payment notifications</Toggle><Toggle checked={value.payments.achEnabled} onChange={(achEnabled) => update("payments", { ...value.payments, achEnabled })}>Offer ACH</Toggle><Toggle checked={value.payments.requireTwoFactor} onChange={(requireTwoFactor) => update("payments", { ...value.payments, requireTwoFactor })}>Require two-factor confirmation for payment settings</Toggle><label className="nexops-field"><span>Transaction Limit</span><input type="number" min="0" value={value.payments.transactionLimit ?? ""} onChange={(event) => update("payments", { ...value.payments, transactionLimit: event.target.value ? Math.max(0, Number(event.target.value)) : undefined })} /></label><p className="nexops-form-note">Tip prompt settings are configured under NexPortal to avoid a duplicate money setting.</p>
    </article>

    <article className="nexops-module-card">
      <div className="nexops-page-heading"><div><p className="eyebrow">Integrations</p><h2>Integration Slots</h2><p>The adapter seam exists; no external integration is configured or connected in v1.</p></div></div>
      <p className="nexops-empty-copy">No integrations are connected.</p>
    </article>
  </section>;
}
