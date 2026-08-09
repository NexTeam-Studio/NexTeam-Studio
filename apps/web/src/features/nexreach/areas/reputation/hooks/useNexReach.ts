import { useEffect, useMemo, useState } from "react";
import { signOut, type Auth, type User } from "firebase/auth";
import type { TenantBranding } from "@nexteam/core";
import { fallbackOperatorContext, loadOperatorContext, type ResolvedOperatorContext as OperatorContext } from "../../../../operatorContext/resolveOperatorContext";



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
  status: "preview_ready" | "review_required";
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



interface NexReachApiResponse {
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

export function useNexReach(props: { auth: Auth | null; user: User }) {

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
    const body = await fetchJson<NexReachApiResponse>(`/api/nexreach/eligibility?tenantId=${encodeURIComponent(operatorContext.tenantId)}`);
    setEligibility(body.records ?? []);
  }

  async function refreshPendingDrafts(): Promise<void> {
    const body = await fetchJson<NexReachApiResponse>(`/api/nexreach/drafts?tenantId=${encodeURIComponent(operatorContext.tenantId)}&status=approval_pending`);
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
    const body = await fetchJson<NexReachApiResponse>(`/api/nexreach/drafts?tenantId=${encodeURIComponent(operatorContext.tenantId)}&status=publish_ready`);
    setReadyDrafts(body.drafts ?? []);
  }

  async function refreshShowcases(): Promise<void> {
    const body = await fetchJson<NexReachApiResponse>(`/api/nexreach/showcases?tenantId=${encodeURIComponent(operatorContext.tenantId)}`);
    setShowcases(body.showcases ?? []);
  }

  async function refreshReviews(): Promise<void> {
    const body = await fetchJson<NexReachApiResponse>(`/api/nexreach/reviews?tenantId=${encodeURIComponent(operatorContext.tenantId)}`);
    setReviews(body.reviews ?? []);
  }

  async function refreshSettings(): Promise<void> {
    const body = await fetchJson<NexReachApiResponse>(`/api/nexreach/settings?tenantId=${encodeURIComponent(operatorContext.tenantId)}`);
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
    const body = await fetchJson<NexReachApiResponse>(`/api/nexreach/audience?${params.toString()}`);
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
      setStatus("NexReach is ready locally. Publishing remains disabled.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "NexReach API unreachable.");
    }
  }

  useEffect(() => {
    void refreshAll();
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
      setStatus("Showcase preview added to the unpublished portfolio rail.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Showcase build failed.");
    } finally {
      setWorkingDraftId("");
    }
  }

  async function issuePortfolioLink(): Promise<void> {
    setStatus("Issuing portfolio preview link...");
    try {
      const body = await fetchJson<NexReachApiResponse>(`/api/nexreach/portfolio-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: operatorContext.tenantId })
      });
      setPortfolioUrl(body.url ?? "");
      setStatus("Portfolio preview link refreshed. No publishing was performed.");
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
  return {
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
  };
}
