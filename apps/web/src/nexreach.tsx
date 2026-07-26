import React, { useEffect, useMemo, useState } from "react";
import { signOut, type Auth, type User } from "firebase/auth";
import type { TenantBranding } from "@nexteam/core";
import { ProductInlineLabel, SidebarBrandStack, tenantDisplayName } from "./productBranding";

const DEFAULT_TENANT_ID = "aquatrace";

type TenantRole = "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";

interface OperatorContext {
  tenantId: string;
  tenantUserId: string;
  role: TenantRole;
}

interface TenantBrandingResponse {
  ok: boolean;
  branding?: TenantBranding;
}

interface NexReachEligibilityRecord {
  id: string;
  jobId: string;
  clientId: string;
  status: "eligible" | "drafted" | "blocked_consent";
  locality: string;
  serviceType: string;
  closedAt?: string;
  draftIds?: string[];
  blockedReason?: string;
  updatedAt: string;
}

interface NexReachApproval {
  id: string;
  status: string;
}

interface NexReachDraft {
  id: string;
  kind: "article" | "social_post" | "gbp_post";
  title: string;
  body: string;
  shortCaption?: string;
  longCaption?: string;
  status: "approval_pending" | "publish_ready" | "rejected" | "published_deferred" | "draft";
  clientName?: string;
  locality?: string;
  serviceType?: string;
  mediaRefs: string[];
  watermarkLabel?: string;
  selectionNotes?: string[];
  approval?: NexReachApproval | null;
  updatedAt: string;
}

interface NexReachSettings {
  toneNotes: string;
  serviceAreaLine: string;
  licenseLine: string;
  ctaLine: string;
}

interface NexReachShowcase {
  id: string;
  draftId: string;
  title: string;
  writeUp: string;
  locality: string;
  serviceType: string;
  status: "live" | "review_required";
  featuredReviewIds: string[];
  mediaRefs: string[];
}

interface NexReachReview {
  id: string;
  authorName: string;
  rating: number;
  comment: string;
  reviewedAt: string;
}

interface NexReachAudienceMember {
  clientId: string;
  clientName: string;
  locality: string;
  serviceType: string;
  lastClosedJobAt?: string;
  email?: string;
  phone?: string;
  marketingConsent: boolean;
}

interface NexReachApiResponse<T> {
  ok: boolean;
  error?: string;
  drafts?: NexReachDraft[];
  records?: NexReachEligibilityRecord[];
  settings?: NexReachSettings;
  showcases?: NexReachShowcase[];
  reviews?: NexReachReview[];
  audience?: NexReachAudienceMember[];
  showcase?: NexReachShowcase;
  token?: string;
  url?: string;
}

function claimString(claims: Record<string, unknown>, key: string): string | null {
  const value = claims[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function claimRole(claims: Record<string, unknown>): TenantRole {
  const explicit = claimString(claims, "tenantRole") ?? claimString(claims, "role");
  const roles = Array.isArray(claims.roles) ? claims.roles.map((role) => String(role).toUpperCase()) : [];
  const candidates = [explicit, ...roles].filter(Boolean).map((role) => String(role).toUpperCase());
  if (candidates.includes("OFFICE_ADMIN") || candidates.includes("OFFICE") || candidates.includes("ADMIN")) {
    return "OFFICE_ADMIN";
  }
  if (candidates.includes("TECHNICIAN") || candidates.includes("TECH")) {
    return "TECHNICIAN";
  }
  return "OWNER";
}

function fallbackOperatorContext(user: User): OperatorContext {
  return { tenantId: DEFAULT_TENANT_ID, tenantUserId: user.uid, role: "OWNER" };
}

async function loadOperatorContext(user: User): Promise<OperatorContext> {
  const token = await user.getIdTokenResult();
  const claims = token.claims as Record<string, unknown>;
  const claimedTenantId = claimString(claims, "tenantId") ?? claimString(claims, "tenant_id");
  const tenantId = claimedTenantId && claimedTenantId !== "nexteam-studio" ? claimedTenantId : DEFAULT_TENANT_ID;
  return {
    tenantId,
    tenantUserId: claimString(claims, "tenantUserId") ?? user.uid,
    role: claimRole(claims)
  };
}

function localDateTime(value?: string): string {
  if (!value) {
    return "Not logged";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
}

function draftCopyText(draft: NexReachDraft): string {
  if (draft.kind === "social_post") {
    return [draft.title, draft.shortCaption ?? "", draft.longCaption ?? draft.body].filter(Boolean).join("\n\n");
  }
  return [draft.title, draft.body].filter(Boolean).join("\n\n");
}

async function copyText(text: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) {
    return false;
  }
  await navigator.clipboard.writeText(text);
  return true;
}

export function NexReachPage(props: { auth: Auth | null; user: User }): React.ReactElement {
  const [operatorContext, setOperatorContext] = useState<OperatorContext>(() => fallbackOperatorContext(props.user));
  const [tenantBranding, setTenantBranding] = useState<TenantBranding | null>(null);
  const [eligibility, setEligibility] = useState<NexReachEligibilityRecord[]>([]);
  const [pendingDrafts, setPendingDrafts] = useState<NexReachDraft[]>([]);
  const [readyDrafts, setReadyDrafts] = useState<NexReachDraft[]>([]);
  const [showcases, setShowcases] = useState<NexReachShowcase[]>([]);
  const [reviews, setReviews] = useState<NexReachReview[]>([]);
  const [audience, setAudience] = useState<NexReachAudienceMember[]>([]);
  const [settings, setSettings] = useState<NexReachSettings>({
    toneNotes: "",
    serviceAreaLine: "",
    licenseLine: "",
    ctaLine: ""
  });
  const [status, setStatus] = useState("Loading NexReach...");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [workingDraftId, setWorkingDraftId] = useState("");
  const [draftEdits, setDraftEdits] = useState<Record<string, { title: string; body: string; shortCaption: string; longCaption: string }>>({});
  const [selectedReviewIds, setSelectedReviewIds] = useState<Record<string, string[]>>({});
  const [audienceFilters, setAudienceFilters] = useState({ serviceType: "", locality: "", closedSince: "" });

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
        if (!cancelled) {
          setTenantBranding(body.ok && body.branding ? body.branding : null);
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

  async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const body = await response.json() as T & { ok?: boolean; error?: string };
    if (!response.ok || body.ok === false) {
      throw new Error(body.error ?? `Request failed for ${url}`);
    }
    return body;
  }

  async function refreshEligibility(): Promise<void> {
    const body = await fetchJson<NexReachApiResponse<NexReachEligibilityRecord[]>>(`/api/nexreach/eligibility?tenantId=${encodeURIComponent(operatorContext.tenantId)}`);
    setEligibility(body.records ?? []);
  }

  async function refreshPendingDrafts(): Promise<void> {
    const body = await fetchJson<NexReachApiResponse<NexReachDraft[]>>(`/api/nexreach/drafts?tenantId=${encodeURIComponent(operatorContext.tenantId)}&status=approval_pending`);
    const drafts = body.drafts ?? [];
    setPendingDrafts(drafts);
    setDraftEdits((current) => {
      const next = { ...current };
      for (const draft of drafts) {
        next[draft.id] ??= {
          title: draft.title,
          body: draft.body,
          shortCaption: draft.shortCaption ?? "",
          longCaption: draft.longCaption ?? ""
        };
      }
      return next;
    });
  }

  async function refreshReadyDrafts(): Promise<void> {
    const body = await fetchJson<NexReachApiResponse<NexReachDraft[]>>(`/api/nexreach/drafts?tenantId=${encodeURIComponent(operatorContext.tenantId)}&status=publish_ready`);
    setReadyDrafts(body.drafts ?? []);
  }

  async function refreshShowcases(): Promise<void> {
    const body = await fetchJson<NexReachApiResponse<NexReachShowcase[]>>(`/api/nexreach/showcases?tenantId=${encodeURIComponent(operatorContext.tenantId)}`);
    setShowcases(body.showcases ?? []);
  }

  async function refreshReviews(): Promise<void> {
    const body = await fetchJson<NexReachApiResponse<NexReachReview[]>>(`/api/nexreach/reviews?tenantId=${encodeURIComponent(operatorContext.tenantId)}`);
    setReviews(body.reviews ?? []);
  }

  async function refreshSettings(): Promise<void> {
    const body = await fetchJson<NexReachApiResponse<NexReachSettings>>(`/api/nexreach/settings?tenantId=${encodeURIComponent(operatorContext.tenantId)}`);
    if (body.settings) {
      setSettings(body.settings);
    }
  }

  async function refreshAudience(nextFilters = audienceFilters): Promise<void> {
    const params = new URLSearchParams({ tenantId: operatorContext.tenantId });
    if (nextFilters.serviceType.trim()) {
      params.set("serviceType", nextFilters.serviceType.trim());
    }
    if (nextFilters.locality.trim()) {
      params.set("locality", nextFilters.locality.trim());
    }
    if (nextFilters.closedSince.trim()) {
      params.set("closedSince", nextFilters.closedSince.trim());
    }
    const body = await fetchJson<NexReachApiResponse<NexReachAudienceMember[]>>(`/api/nexreach/audience?${params.toString()}`);
    setAudience(body.audience ?? []);
  }

  async function refreshAll(): Promise<void> {
    setStatus("Refreshing NexReach...");
    try {
      await Promise.all([
        refreshEligibility(),
        refreshPendingDrafts(),
        refreshReadyDrafts(),
        refreshShowcases(),
        refreshReviews(),
        refreshSettings(),
        refreshAudience()
      ]);
      setStatus("NexReach is live locally.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "NexReach API unreachable.");
    }
  }

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operatorContext.tenantId]);

  const audienceExportHref = useMemo(() => {
    const params = new URLSearchParams({ tenantId: operatorContext.tenantId });
    if (audienceFilters.serviceType.trim()) {
      params.set("serviceType", audienceFilters.serviceType.trim());
    }
    if (audienceFilters.locality.trim()) {
      params.set("locality", audienceFilters.locality.trim());
    }
    if (audienceFilters.closedSince.trim()) {
      params.set("closedSince", audienceFilters.closedSince.trim());
    }
    return `/api/nexreach/audience.csv?${params.toString()}`;
  }, [audienceFilters, operatorContext.tenantId]);

  async function generateDrafts(jobId: string): Promise<void> {
    setWorkingDraftId(jobId);
    setStatus("Generating marketing drafts...");
    try {
      await fetchJson(`/api/nexreach/jobs/${encodeURIComponent(jobId)}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: operatorContext.tenantId })
      });
      await Promise.all([refreshEligibility(), refreshPendingDrafts()]);
      setStatus("Drafts queued for owner approval.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Draft generation failed.");
    } finally {
      setWorkingDraftId("");
    }
  }

  async function saveDraftEdits(draftId: string): Promise<void> {
    const edit = draftEdits[draftId];
    if (!edit) {
      return;
    }
    setWorkingDraftId(draftId);
    setStatus("Saving draft changes...");
    try {
      await fetchJson(`/api/nexreach/drafts/${encodeURIComponent(draftId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: operatorContext.tenantId, ...edit })
      });
      await refreshPendingDrafts();
      setStatus("Draft updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Draft update failed.");
    } finally {
      setWorkingDraftId("");
    }
  }

  async function approveDraft(draftId: string): Promise<void> {
    setWorkingDraftId(draftId);
    setStatus("Approving draft...");
    try {
      await fetchJson(`/api/nexreach/drafts/${encodeURIComponent(draftId)}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: operatorContext.tenantId })
      });
      await Promise.all([refreshPendingDrafts(), refreshReadyDrafts()]);
      setStatus("Draft approved and marked ready for use.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Draft approval failed.");
    } finally {
      setWorkingDraftId("");
    }
  }

  async function discardDraft(draftId: string): Promise<void> {
    setWorkingDraftId(draftId);
    setStatus("Discarding draft...");
    try {
      await fetchJson(`/api/nexreach/drafts/${encodeURIComponent(draftId)}/discard`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: operatorContext.tenantId })
      });
      await refreshPendingDrafts();
      setStatus("Draft discarded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Draft discard failed.");
    } finally {
      setWorkingDraftId("");
    }
  }

  async function createShowcase(draftId: string): Promise<void> {
    setWorkingDraftId(draftId);
    setStatus("Building showcase...");
    try {
      await fetchJson(`/api/nexreach/showcases`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          draftId,
          reviewIds: selectedReviewIds[draftId] ?? []
        })
      });
      await Promise.all([refreshShowcases(), refreshReadyDrafts()]);
      setStatus("Showcase added to the portfolio rail.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Showcase build failed.");
    } finally {
      setWorkingDraftId("");
    }
  }

  async function issuePortfolioLink(): Promise<void> {
    setStatus("Issuing portfolio link...");
    try {
      const body = await fetchJson<NexReachApiResponse<never>>(`/api/nexreach/portfolio-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: operatorContext.tenantId })
      });
      setPortfolioUrl(body.url ?? "");
      setStatus("Portfolio link refreshed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Portfolio link failed.");
    }
  }

  async function saveSettingsForm(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSavingSettings(true);
    setStatus("Saving NexReach settings...");
    try {
      await fetchJson(`/api/nexreach/settings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: operatorContext.tenantId, ...settings })
      });
      await refreshSettings();
      setStatus("NexReach settings saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Settings save failed.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function signOutOperator(): Promise<void> {
    if (props.auth) {
      await signOut(props.auth);
    }
  }

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
        <header className="nexreach-header">
          <div>
            <ProductInlineLabel product="nexreach" className="nexreach-inline-label" />
            <h2>NexReach</h2>
            <p>{status}</p>
          </div>
          <div className="nexreach-header-actions">
            <button className="nexreach-ghost-button" type="button" onClick={() => void refreshAll()}>Refresh</button>
            <button className="nexreach-primary-button" type="button" onClick={() => void issuePortfolioLink()}>Refresh portfolio link</button>
          </div>
        </header>

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
                <p className="nexreach-eyebrow">Public proof</p>
                <h3>Portfolio rail</h3>
              </div>
              <span>{showcases.length} showcases</span>
            </div>
            {portfolioUrl ? (
              <div className="nexreach-portfolio-link">
                <a href={portfolioUrl} target="_blank" rel="noreferrer">{portfolioUrl}</a>
              </div>
            ) : (
              <p className="nexreach-empty">Generate a fresh share link when you want to open the public portfolio.</p>
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
              {!showcases.length ? <p className="nexreach-empty">No live showcases yet.</p> : null}
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
