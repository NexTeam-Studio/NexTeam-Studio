import React, { useState } from "react";
import type { Auth, User } from "firebase/auth";
import { ProductInlineLabel, SidebarBrandStack, tenantDisplayName } from "../../../../../shared/branding/ProductBranding";
import { NexSuiteHeader } from "../../../../../shared/ui/NexSuiteHeader";
import "../../../../../shared/ui/nexSuiteHeaderDrawer.css";
import { useNexReach } from "../hooks/useNexReach";
import "../styles/nexreach.css";

export function NexReachPage(props: { auth: Auth | null; user: User }): React.ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    copyText,
    draftCopyText,
    localDateTime,
    approveDraft,
    audience,
    audienceExportHref,
    audienceFilters,
    createShowcase,
    discardDraft,
    draftEdits,
    eligibility,
    generateDrafts,
    issuePortfolioLink,
    operatorContext,
    pendingDrafts,
    portfolioUrl,
    readyDrafts,
    refreshAll,
    refreshAudience,
    reviews,
    saveDraftEdits,
    saveSettingsForm,
    savingSettings,
    selectedReviewIds,
    setAudienceFilters,
    setDraftEdits,
    setSelectedReviewIds,
    setSettings,
    setStatus,
    settings,
    showcases,
    signOutOperator,
    status,
    tenantBranding,
    workingDraftId
  } = useNexReach(props);


  return (
    <main className="nexreach-shell">
      <aside className="nexreach-sidebar">
        <SidebarBrandStack product="nexreach" branding={tenantBranding} tenantId={operatorContext.tenantId} />
        <div className="nexreach-sidebar-copy">
          <p className="nexreach-eyebrow">Marketing engine</p>
          <h1>{tenantDisplayName(tenantBranding, operatorContext.tenantId)}</h1>
          <p>Completed jobs turn into owner-reviewed stories, photo sets, and public proof-of-work.</p>
        </div>
        <div className="nexreach-sidebar-meta">
          <span>{operatorContext.role}</span>
          <span>{props.user.email ?? "Signed in"}</span>
        </div>
        <button className="nexreach-ghost-button" type="button" onClick={() => void signOutOperator()}>Sign out</button>
      </aside>

      <section className="nexreach-main">
        <NexSuiteHeader productName="NexReach" menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((current) => !current)} onSignOut={() => void signOutOperator()} />
        {menuOpen ? <nav className="nexsuite__drawer" aria-label="NexReach navigation"><button type="button" onClick={() => { void refreshAll(); setMenuOpen(false); }}>Refresh</button><button type="button" onClick={() => { void issuePortfolioLink(); setMenuOpen(false); }}>Refresh preview link</button></nav> : null}

        <div className="nexreach-grid">
          <section className="nexreach-card">
            <div className="nexreach-card-header">
              <div>
                <p className="nexreach-eyebrow">Eligibility</p>
                <h3>Closed jobs waiting on content</h3>
              </div>
              <span>{eligibility.length} total</span>
            </div>
            <div className="nexreach-list">
              {eligibility.map((record) => (
                <article className="nexreach-list-item" key={record.id}>
                  <div>
                    <strong>{record.serviceType}</strong>
                    <p>{record.locality}</p>
                    <small>{record.status === "blocked_consent" ? "Consent is off." : `Closed ${localDateTime(record.closedAt)}`}</small>
                  </div>
                  {record.status === "eligible" ? (
                    <button
                      className="nexreach-primary-button"
                      disabled={workingDraftId === record.jobId}
                      type="button"
                      onClick={() => void generateDrafts(record.jobId)}
                    >
                      {workingDraftId === record.jobId ? "Generating..." : "Generate drafts"}
                    </button>
                  ) : (
                    <span className={`nexreach-badge nexreach-badge-${record.status}`}>{record.status.replaceAll("_", " ")}</span>
                  )}
                </article>
              ))}
              {!eligibility.length ? <p className="nexreach-empty">No closed jobs are in the content pool yet.</p> : null}
            </div>
          </section>

          <section className="nexreach-card">
            <div className="nexreach-card-header">
              <div>
                <p className="nexreach-eyebrow">Approval queue</p>
                <h3>Pending drafts</h3>
              </div>
              <span>{pendingDrafts.length} waiting</span>
            </div>
            <div className="nexreach-list">
              {pendingDrafts.map((draft) => {
                const edit = draftEdits[draft.id] ?? {
                  title: draft.title,
                  body: draft.body,
                  shortCaption: draft.shortCaption ?? "",
                  longCaption: draft.longCaption ?? ""
                };
                return (
                  <article className="nexreach-draft-card" key={draft.id}>
                    <div className="nexreach-draft-meta">
                      <div>
                        <strong>{draft.title}</strong>
                        <p>{draft.kind.replaceAll("_", " ")} • {draft.locality ?? "Local service area"}</p>
                      </div>
                      <span className="nexreach-badge nexreach-badge-pending">{draft.approval?.id ?? "Awaiting approval"}</span>
                    </div>
                    <label>
                      Title
                      <input value={edit.title} onChange={(event) => setDraftEdits((current) => ({ ...current, [draft.id]: { ...edit, title: event.target.value } }))} />
                    </label>
                    {draft.kind === "social_post" ? (
                      <>
                        <label>
                          Short caption
                          <textarea rows={3} value={edit.shortCaption} onChange={(event) => setDraftEdits((current) => ({ ...current, [draft.id]: { ...edit, shortCaption: event.target.value } }))} />
                        </label>
                        <label>
                          Long caption
                          <textarea rows={5} value={edit.longCaption} onChange={(event) => setDraftEdits((current) => ({ ...current, [draft.id]: { ...edit, longCaption: event.target.value } }))} />
                        </label>
                      </>
                    ) : null}
                    <label>
                      Body
                      <textarea rows={6} value={edit.body} onChange={(event) => setDraftEdits((current) => ({ ...current, [draft.id]: { ...edit, body: event.target.value } }))} />
                    </label>
                    <div className="nexreach-card-actions">
                      <button className="nexreach-ghost-button" disabled={workingDraftId === draft.id} type="button" onClick={() => void saveDraftEdits(draft.id)}>Save edits</button>
                      <button className="nexreach-ghost-button" disabled={workingDraftId === draft.id} type="button" onClick={() => void discardDraft(draft.id)}>Discard</button>
                      <button className="nexreach-primary-button" disabled={workingDraftId === draft.id} type="button" onClick={() => void approveDraft(draft.id)}>Approve</button>
                    </div>
                  </article>
                );
              })}
              {!pendingDrafts.length ? <p className="nexreach-empty">No drafts are waiting right now.</p> : null}
            </div>
          </section>

          <section className="nexreach-card">
            <div className="nexreach-card-header">
              <div>
                <p className="nexreach-eyebrow">Ready for use</p>
                <h3>Approved drafts</h3>
              </div>
              <span>{readyDrafts.length} approved</span>
            </div>
            <div className="nexreach-list">
              {readyDrafts.map((draft) => (
                <article className="nexreach-draft-card" key={draft.id}>
                  <div className="nexreach-draft-meta">
                    <div>
                      <strong>{draft.title}</strong>
                      <p>{draft.kind.replaceAll("_", " ")} • {draft.locality ?? "Local service area"}</p>
                    </div>
                    <span className="nexreach-badge nexreach-badge-ready">{draft.status.replaceAll("_", " ")}</span>
                  </div>
                  <p>{draft.longCaption ?? draft.body}</p>
                  {draft.selectionNotes?.length ? (
                    <ul className="nexreach-note-list">
                      {draft.selectionNotes.map((note) => <li key={note}>{note}</li>)}
                    </ul>
                  ) : null}
                  <div className="nexreach-review-picker">
                    <p>Select portfolio reviews</p>
                    <div className="nexreach-chip-row">
                      {reviews.map((review) => {
                        const active = (selectedReviewIds[draft.id] ?? []).includes(review.id);
                        return (
                          <button
                            className={`nexreach-chip ${active ? "active" : ""}`}
                            key={review.id}
                            type="button"
                            onClick={() => setSelectedReviewIds((current) => {
                              const next = new Set(current[draft.id] ?? []);
                              if (next.has(review.id)) {
                                next.delete(review.id);
                              } else {
                                next.add(review.id);
                              }
                              return { ...current, [draft.id]: [...next] };
                            })}
                          >
                            {review.authorName} • {review.rating}★
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="nexreach-card-actions">
                    <button className="nexreach-ghost-button" type="button" onClick={() => void copyText(draftCopyText(draft)).then((copied) => setStatus(copied ? "Draft copied to clipboard." : "Clipboard access is unavailable here."))}>Copy text</button>
                    <a className="nexreach-ghost-link" href={`/api/nexreach/drafts/${encodeURIComponent(draft.id)}/bundle.txt?tenantId=${encodeURIComponent(operatorContext.tenantId)}`}>Bundle text</a>
                    <a className="nexreach-ghost-link" href={`/api/nexreach/drafts/${encodeURIComponent(draft.id)}/bundle.html?tenantId=${encodeURIComponent(operatorContext.tenantId)}`}>Bundle with media</a>
                    <button className="nexreach-primary-button" disabled={workingDraftId === draft.id} type="button" onClick={() => void createShowcase(draft.id)}>Create showcase</button>
                  </div>
                </article>
              ))}
              {!readyDrafts.length ? <p className="nexreach-empty">Approved drafts will land here for portfolio and manual posting.</p> : null}
            </div>
          </section>

          <section className="nexreach-card">
            <div className="nexreach-card-header">
              <div>
                <p className="nexreach-eyebrow">Proof preview</p>
                <h3>Portfolio preview rail</h3>
              </div>
              <span>{showcases.length} showcases</span>
            </div>
            {portfolioUrl ? (
              <div className="nexreach-portfolio-link">
                <a href={portfolioUrl} target="_blank" rel="noreferrer">{portfolioUrl}</a>
              </div>
            ) : (
              <p className="nexreach-empty">Generate a fresh token-gated link to review this unpublished portfolio preview.</p>
            )}
            <div className="nexreach-list">
              {showcases.map((showcase) => (
                <article className="nexreach-list-item" key={showcase.id}>
                  <div>
                    <strong>{showcase.title}</strong>
                    <p>{showcase.serviceType} • {showcase.locality}</p>
                    <small>{showcase.featuredReviewIds.length} featured review{showcase.featuredReviewIds.length === 1 ? "" : "s"}</small>
                  </div>
                  <span className={`nexreach-badge nexreach-badge-${showcase.status}`}>{showcase.status.replaceAll("_", " ")}</span>
                </article>
              ))}
              {!showcases.length ? <p className="nexreach-empty">No showcase previews are ready yet.</p> : null}
            </div>
          </section>

          <section className="nexreach-card">
            <div className="nexreach-card-header">
              <div>
                <p className="nexreach-eyebrow">Audience pool</p>
                <h3>Consented clients</h3>
              </div>
              <a className="nexreach-ghost-link" href={audienceExportHref}>Export CSV</a>
            </div>
            <form className="nexreach-filter-row" onSubmit={(event) => {
              event.preventDefault();
              void refreshAudience(audienceFilters);
            }}>
              <input placeholder="Service type" value={audienceFilters.serviceType} onChange={(event) => setAudienceFilters((current) => ({ ...current, serviceType: event.target.value }))} />
              <input placeholder="Locality" value={audienceFilters.locality} onChange={(event) => setAudienceFilters((current) => ({ ...current, locality: event.target.value }))} />
              <input type="date" value={audienceFilters.closedSince} onChange={(event) => setAudienceFilters((current) => ({ ...current, closedSince: event.target.value }))} />
              <button className="nexreach-ghost-button" type="submit">Filter</button>
            </form>
            <div className="nexreach-list">
              {audience.map((member) => (
                <article className="nexreach-list-item" key={member.clientId}>
                  <div>
                    <strong>{member.clientName}</strong>
                    <p>{member.serviceType} • {member.locality}</p>
                    <small>{member.email ?? member.phone ?? "No contact saved"}</small>
                  </div>
                  <span className="nexreach-badge nexreach-badge-ready">{localDateTime(member.lastClosedJobAt)}</span>
                </article>
              ))}
              {!audience.length ? <p className="nexreach-empty">No consented clients match this filter yet.</p> : null}
            </div>
          </section>

          <section className="nexreach-card nexreach-settings-card">
            <div className="nexreach-card-header">
              <div>
                <p className="nexreach-eyebrow">Voice and boilerplate</p>
                <h3>Tenant content settings</h3>
              </div>
            </div>
            <form className="nexreach-settings-form" onSubmit={(event) => void saveSettingsForm(event)}>
              <label>
                Tone notes
                <textarea rows={4} value={settings.toneNotes} onChange={(event) => setSettings((current) => ({ ...current, toneNotes: event.target.value }))} />
              </label>
              <label>
                Service-area line
                <input value={settings.serviceAreaLine} onChange={(event) => setSettings((current) => ({ ...current, serviceAreaLine: event.target.value }))} />
              </label>
              <label>
                License or proof line
                <input value={settings.licenseLine} onChange={(event) => setSettings((current) => ({ ...current, licenseLine: event.target.value }))} />
              </label>
              <label>
                CTA line
                <input value={settings.ctaLine} onChange={(event) => setSettings((current) => ({ ...current, ctaLine: event.target.value }))} />
              </label>
              <div className="nexreach-card-actions">
                <button className="nexreach-primary-button" disabled={savingSettings} type="submit">{savingSettings ? "Saving..." : "Save settings"}</button>
              </div>
            </form>
          </section>
        </div>
      </section>
    </main>
  );
}
