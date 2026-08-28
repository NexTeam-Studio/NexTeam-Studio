import React from "react";
import { ProductLogo } from "../../../../../shared/branding/ProductBranding";
import type { NexCamWorkspaceBindings } from "../../capture/hooks/useNexCamWorkspace";

export function NexCamOverviewSurface(props: { workspace: NexCamWorkspaceBindings }): React.ReactElement {
  const {
    activeChecklistSection,
    activeSectionAllowsNa,
    activeSectionIsNa,
    carryforwardFields,
    checklist,
    checklistSections,
    contextIds,
    createChecklist,
    describeFieldValue,
    fieldHasValue,
    latestHistory,
    patchChecklistSection,
    recentChecklists,
    recentMedia,
    refreshChecklists,
    renderChecklistField,
    reports,
    saveChecklist,
    selectedTemplateId,
    setActiveChecklistSection,
    setContextIds,
    setSelectedTemplateId,
    template,
    templates,
    visibleChecklistFields
  } = props.workspace;

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
