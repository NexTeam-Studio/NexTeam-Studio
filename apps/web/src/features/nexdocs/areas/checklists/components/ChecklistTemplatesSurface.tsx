import React from "react";
import type { NexCamWorkspaceBindings } from "../../../../nexcam/areas/capture/hooks/useNexCamWorkspace";

export function ChecklistTemplatesSurface(props: { workspace: NexCamWorkspaceBindings }): React.ReactElement {
  const {
    addDraftField,
    bundleDraft,
    bundles,
    createChecklist,
    draftField,
    draftFields,
    draftSections,
    formatFieldType,
    refreshTemplates,
    removeDraftField,
    removeDraftSection,
    reportTemplateDraft,
    reportTemplateSections,
    reportTemplates,
    saveBundle,
    saveReportTemplate,
    saveTemplate,
    saveTextSnippet,
    selectedSnippetIds,
    setBundleDraft,
    setDraftField,
    setReportTemplateDraft,
    setReportTemplateSections,
    setReportTitle,
    setSelectedReportTemplateId,
    setSelectedTemplateId,
    setSnippetDraft,
    setTemplateDraft,
    setWatermarkEnabled,
    snippetDraft,
    template,
    templateDraft,
    templates,
    textSnippets,
    toggleDraftSectionAllowNa,
    toggleSnippetSelection
  } = props.workspace;

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
                    <small>{[...new Set(template.fields.map((field) => field.type))].join(", ") || "Mixed field types"}</small>
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
