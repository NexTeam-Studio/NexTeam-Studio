import React, { Suspense, useEffect, useState } from "react";
import { type Auth, type User } from "firebase/auth";
import { PlatformMark, ProductLogo, SidebarBrandStack, TenantBrandMark, tenantDisplayName } from "../../shared/branding/ProductBranding";
import { NexOpsSharedMobileBar, NexOpsSharedWebTopbar } from "./components/NexOpsHeader";
import { NexOpsCreateMenu } from "./components/NexOpsCreateMenu";
import { NexOpsNotificationPanel } from "./components/NexOpsNotificationPanel";
import { NexOpsImportPage } from "./components/NexOpsImportPage";
import { NexOpsLegacyLifecyclePage } from "./components/NexOpsLegacyLifecyclePage";
import { NexOpsModuleSwitcher } from "./components/NexOpsModuleSwitcher";

import { buildClientProfilePath, buildNewClientPath, buildModulePath, buildWorkspaceSwitchPath, createMenuPresentation, isDismissKey, NEXOPS_MOBILE_NAV_GROUPS, NEXOPS_MODULES, parseNexOpsLocation, type ClientProfileTab, type NexOpsCreateOption, type NexOpsModule } from "./domain/nexopsNavigation";
import { buildLeadSourceOptions, CLIENT_CUSTOM_FIELD_RESERVED_LABELS, customFieldRecordToDraftRows, customFieldDraftRowsToRecord, PROPERTY_CUSTOM_FIELD_RESERVED_LABELS, primaryClientPhoneValue, type ClientProfileMobileBucket, type CustomFieldDraftRow, validateCustomFieldDraftRows } from "../../features/clients/components/contact/domain/clientProfile";
import { getMobileCreateFabScrollIntent, mobileFabShouldHideOverlays, mobileFabVisibleForViewport, NEXOPS_MOBILE_CREATE_FAB_IDLE_MS, NEXOPS_MOBILE_CREATE_FAB_PULSE_KEY, NEXOPS_SHARED_CREATE_MENU_ID, NexOpsMobileCreateFab, shouldPulseMobileCreateFab } from "./components/NexOpsMobileCreateFab";
import { ContactRoster } from "../clients/components/contact/ContactRoster";
import { ContactEditorSurface } from "../clients/components/contact/ContactEditorSurface";
import { ContactProfileSurface } from "../clients/components/contact/ContactProfileSurface";
import { NexOpsCreateClientPanel } from "../clients/components/contact/NexOpsCreateClientPanel";
import "../clients/components/contact/contact.css";
import { signOutOperator } from "../../shared/auth/authBootstrap";
import { ApprovalQueuePanel } from "../approvalQueue/areas/queue/components/ApprovalQueuePanel";
import { fallbackOperatorContext, loadOperatorContext } from "../operatorContext/resolveOperatorContext";
import { useNexOpsCaptureController } from "../nexcam/areas/capture/hooks/useNexOpsCaptureController";
import { useNexOpsNotifications } from "./hooks/useNexOpsNotifications";

const NexOpsHomePage = React.lazy(async () => ({ default: (await import("../home/components/operationsHome/NexOpsHomePage")).NexOpsHomePage }));
const NexOpsInvoicesPage = React.lazy(async () => ({ default: (await import("../../features/invoices/components/invoiceStructure/NexOpsInvoicesPage")).NexOpsInvoicesPage }));
const NexOpsJobsPage = React.lazy(async () => ({ default: (await import("../../features/jobs/components/jobCore/NexOpsJobsPage")).NexOpsJobsPage }));
const NexOpsPatternLibraryPage = React.lazy(async () => ({ default: (await import("./components/NexOpsPatternLibraryPage")).NexOpsPatternLibraryPage }));
const NexOpsQuotesPage = React.lazy(async () => ({ default: (await import("../../features/quotes/components/quoteEngine/NexOpsQuotesPage")).NexOpsQuotesPage }));
const NexOpsRequestsPage = React.lazy(async () => ({ default: (await import("../requests/components/requestCore/NexOpsRequestsPage")).NexOpsRequestsPage }));
const NexOpsSchedulePage = React.lazy(async () => ({ default: (await import("../../features/visits/components/visitCore/NexOpsSchedulePage")).NexOpsSchedulePage }));
const NexOpsSettingsPage = React.lazy(async () => ({ default: (await import("../../features/settings/components/tenantConfig/NexOpsSettingsPage")).NexOpsSettingsPage }));
const NexOpsCaptureWorkspace = React.lazy(async () => ({ default: (await import("../nexcam/areas/capture/components/NexOpsCaptureWorkspace")).NexOpsCaptureWorkspace }));


import type { ClientPhoneDraft, ClientEmailDraft, ClientFormMode, CrmContact, CrmClient, CrmProperty, CrmJob, CrmQuote, CrmInvoice, CrmRequestSummary, CrmPaymentSummary, CrmReceiptReviewSummary, ClientPortalActivityEntry, ReviewSequenceRecord, CrmClientsResponse, CrmRecordsResponse, CrmRequestsResponse, CrmPaymentsResponse, CrmReceiptReviewsResponse, ClientPortalActivityResponse, ReviewSequenceStatusResponse, SendPortalLinkResponse, CrmClientCreateResponse, FieldDocsMediaListResponse, FieldDocsReportsListResponse, SignedDocumentRecord, SignedDocumentsResponse, TenantUserRecord, OperatorContext, TenantBranding, TenantBrandingResponse, TenantUsersResponse, ScheduleScope, WorkspaceTarget } from "./contracts/workspaceContracts";
import { formatPhoneDisplay, personDisplayName, clientDisplayName, clientContactDisplayName, clientPrimaryAddress, clientStatusLabel, contactSummary, clientHasTextReadyContact, NexOpsNavGlyph, MobileClientSummaryGlyph, MobileClientEditGlyph, blankNewClientDraft, draftFromExistingClient, MOBILE_CLIENT_VIEWPORT_MAX } from "./workspaceSupport";
export type * from "./contracts/workspaceContracts";
export * from "./workspaceSupport";

export function NexOpsWorkspace(props: { auth: Auth | null; user: User }): React.ReactElement {
  const initialPathState = parseNexOpsLocation(window.location.pathname);
  const [operatorContext, setOperatorContext] = useState<OperatorContext>(() => fallbackOperatorContext(props.user));
  const [tenantBranding, setTenantBranding] = useState<TenantBranding | null>(null);
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [properties, setProperties] = useState<CrmProperty[]>([]);
  const [jobs, setJobs] = useState<CrmJob[]>([]);
  const [quotes, setQuotes] = useState<CrmQuote[]>([]);
  const [invoices, setInvoices] = useState<CrmInvoice[]>([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUserRecord[]>([]);
  const [requests, setRequests] = useState<CrmRequestSummary[]>([]);
  const [payments, setPayments] = useState<CrmPaymentSummary[]>([]);
  const [receiptReviews, setReceiptReviews] = useState<CrmReceiptReviewSummary[]>([]);
  const [clientPortalActivity, setClientPortalActivity] = useState<ClientPortalActivityEntry[]>([]);
  const [clientReviewSequences, setClientReviewSequences] = useState<ReviewSequenceRecord[]>([]);
  const [clientFieldMedia, setClientFieldMedia] = useState<NonNullable<FieldDocsMediaListResponse["media"]>>([]);
  const [clientFieldReports, setClientFieldReports] = useState<NonNullable<FieldDocsReportsListResponse["reports"]>>([]);
  const [clientSignedDocuments, setClientSignedDocuments] = useState<SignedDocumentRecord[]>([]);
  const [clientRailStatus, setClientRailStatus] = useState("Portal activity and review follow-up will load when a client is selected.");
  const [clientRailBusy, setClientRailBusy] = useState("");
  const [lastPortalLink, setLastPortalLink] = useState("");
  const [status, setStatus] = useState("Loading clients...");
  const [query, setQuery] = useState("");
  const [selectedClientId, setSelectedClientId] = useState(initialPathState.clientId ?? "");
  const [activeClientProfileTab, setActiveClientProfileTab] = useState<ClientProfileTab | null>(initialPathState.clientTab);
  const [activeModule, setActiveModule] = useState<NexOpsModule>(initialPathState.module);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [focusedRequestId, setFocusedRequestId] = useState("");
  const [focusedQuoteId, setFocusedQuoteId] = useState("");
  const [focusedJobId, setFocusedJobId] = useState("");
  const [focusedInvoiceId, setFocusedInvoiceId] = useState("");
  const [requestFilterIntent, setRequestFilterIntent] = useState<"all" | "new" | "archived" | "converted_to_quote" | "converted_to_job" | undefined>();
  const [quoteFilterIntent, setQuoteFilterIntent] = useState<"all" | "draft" | "sent" | "change_requested" | "approved" | "approved_pending_conversion" | "expired" | undefined>();
  const [jobFilterIntent, setJobFilterIntent] = useState<"All" | "Upcoming" | "Today" | "Late" | "Unscheduled" | "Action Required" | "Requires Invoicing" | "Archived" | undefined>();
  const [invoiceFilterIntent, setInvoiceFilterIntent] = useState<"all" | "draft" | "awaiting" | "partial_pay" | "paid" | "void" | "bad_debt" | "past_due" | undefined>();
  const [scheduleScopeIntent, setScheduleScopeIntent] = useState<ScheduleScope | undefined>();
  const [moduleSwitcherOpen, setModuleSwitcherOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [mobileCreateFabCollapsed, setMobileCreateFabCollapsed] = useState(false);
  const [mobileCreateFabPulse, setMobileCreateFabPulse] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [creatingClientPage, setCreatingClientPage] = useState(initialPathState.clientDraft === "new");
  const [clientFormMode, setClientFormMode] = useState<ClientFormMode>("create");
  const [createClientSurface, setCreateClientSurface] = useState<"client" | "contact" | "property">("client");
  const [createStatus, setCreateStatus] = useState("");
  const [csvStatus, setCsvStatus] = useState("No CSV selected yet.");
  const [newClient, setNewClient] = useState(() => blankNewClientDraft());
  const [mobileClientViewport, setMobileClientViewport] = useState(() => typeof window !== "undefined" && window.innerWidth <= MOBILE_CLIENT_VIEWPORT_MAX);
  const [mobileClientExpandedBucket, setMobileClientExpandedBucket] = useState<ClientProfileMobileBucket | null>(null);
  const [clientOverviewCustomFieldsDraft, setClientOverviewCustomFieldsDraft] = useState<CustomFieldDraftRow[]>([]);
  const [clientOverviewCustomFieldsOpen, setClientOverviewCustomFieldsOpen] = useState(false);
  const draftDisplayName = [newClient.firstName.trim(), newClient.lastName.trim()].filter(Boolean).join(" ") || newClient.company.trim();
  const newClientHasName = draftDisplayName.length > 0;
  const newClientHasPhone = newClient.phone.trim().length > 0;
  const newClientHasAddress = [
    newClient.street1.trim(),
    newClient.city.trim(),
    newClient.province.trim()
  ].every(Boolean);
  const clientCustomFieldValidation = validateCustomFieldDraftRows(newClient.clientCustomFieldsDraft ?? [], CLIENT_CUSTOM_FIELD_RESERVED_LABELS);
  const propertyCustomFieldValidation = validateCustomFieldDraftRows(newClient.propertyCustomFieldsDraft ?? [], PROPERTY_CUSTOM_FIELD_RESERVED_LABELS);
  const createClientMissingFields = [
    ...(newClientHasName ? [] : ["name"]),
    ...(newClientHasAddress ? [] : ["address"]),
    ...(newClientHasPhone ? [] : ["telephone"])
  ];
  const createClientCanSave = createClientMissingFields.length === 0
    && !clientCustomFieldValidation.hasBlockingIssues
    && !propertyCustomFieldValidation.hasBlockingIssues;
  const leadSourceOptions = buildLeadSourceOptions(clients);
  function emitCrmMutation(): void {
    window.dispatchEvent(new Event("nexops:crm-mutated"));
  }

  const {
    captureInputRef,
    captureBusy,
    captureStatus,
    captureWorkspaceView,
    captureSession,
    captureSessionOrigin,
    captureSessionMode,
    captureInbox,
    captureInboxStatus,
    captureRequestIntent,
    captureClientQuery,
    captureSelectedClientId,
    captureSelectedJobId,
    captureSelectedVisitId,
    captureTargets,
    captureSessionMedia,
    activeCaptureMedia,
    captureAnchorGps,
    captureGpsMoved,
    visibleCaptureVisits,
    setCaptureClientQuery,
    setCaptureSelectedClientId,
    setCaptureSelectedJobId,
    setCaptureSelectedVisitId,
    setCaptureSelectedMediaId,
    setCaptureWorkspaceView,
    setCaptureSessionMode,
    setCaptureStatus,
    setCaptureSession,
    setCaptureSessionOrigin,
    startCaptureSession,
    openCaptureWorkspace,
    finishCaptureSession,
    uploadCapturePhotos,
    routeCaptureToNewRequest,
    markCaptureDecideLater,
    loadCaptureTargets,
    assignCaptureToExistingClient,
    reopenCaptureBatch,
    handleCaptureRequestCreated
  } = useNexOpsCaptureController({
    active: activeModule === "capture",
    tenantId: operatorContext.tenantId,
    tenantUserId: operatorContext.tenantUserId,
    selectedClientId,
    onOpenWorkspace: () => {
      clearWorkspaceTargets();
      clearWorkspaceFilters();
      setMobileNavOpen(false);
      setNotificationsOpen(false);
      setCreateMenuOpen(false);
      setActiveModule("capture");
      window.history.pushState({}, "", "/nexops/capture");
    },
    onOpenRequests: () => {
      clearWorkspaceTargets();
      clearWorkspaceFilters();
      setMobileNavOpen(false);
      setNotificationsOpen(false);
      setActiveModule("requests");
      window.history.pushState({}, "", "/nexops/requests");
    },
    onReturnHome: () => {
      setActiveModule("home");
      window.history.pushState({}, "", "/nexops");
    },
    onEmitMutation: emitCrmMutation,
    onRefreshClientRails: (clientId) => refreshClientRails(clientId),
    onSelectClient: setSelectedClientId
  });

  const {
    notificationsOpen,
    notifications,
    notificationUnreadCount,
    notificationStatus,
    setNotificationsOpen,
    openNotification,
    markAllNotificationsRead
  } = useNexOpsNotifications({
    tenantId: operatorContext.tenantId,
    onOpenTarget: openWorkspaceTarget
  });

  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeModule]);

  useEffect(() => {
    document.body.classList.toggle("nexops-mobile-nav-open", mobileNavOpen);
    return () => document.body.classList.remove("nexops-mobile-nav-open");
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) {
      return undefined;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!createMenuOpen && !notificationsOpen && !moduleSwitcherOpen) {
      return undefined;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (!isDismissKey(event.key)) {
        return;
      }
      setCreateMenuOpen(false);
      setNotificationsOpen(false);
      setModuleSwitcherOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [createMenuOpen, moduleSwitcherOpen, notificationsOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const syncViewport = () => setMobileClientViewport(window.innerWidth <= MOBILE_CLIENT_VIEWPORT_MAX);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !mobileFabVisibleForViewport(window.innerWidth)) {
      return undefined;
    }
    if (!shouldPulseMobileCreateFab(window.localStorage.getItem(NEXOPS_MOBILE_CREATE_FAB_PULSE_KEY))) {
      return undefined;
    }
    setMobileCreateFabPulse(true);
    window.localStorage.setItem(NEXOPS_MOBILE_CREATE_FAB_PULSE_KEY, "seen");
    const timer = window.setTimeout(() => setMobileCreateFabPulse(false), 1600);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    let lastScrollY = window.scrollY;
    let idleTimer = 0;
    const syncFabState = () => {
      if (!mobileFabVisibleForViewport(window.innerWidth)) {
        setMobileCreateFabCollapsed(false);
        lastScrollY = window.scrollY;
        return;
      }
      const nextScrollY = window.scrollY;
      const intent = getMobileCreateFabScrollIntent(lastScrollY, nextScrollY);
      if (intent === "collapse") {
        setMobileCreateFabCollapsed(true);
      } else if (intent === "expand") {
        setMobileCreateFabCollapsed(false);
      }
      lastScrollY = nextScrollY;
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => setMobileCreateFabCollapsed(false), NEXOPS_MOBILE_CREATE_FAB_IDLE_MS);
    };
    window.addEventListener("scroll", syncFabState, { passive: true });
    window.addEventListener("resize", syncFabState);
    return () => {
      window.removeEventListener("scroll", syncFabState);
      window.removeEventListener("resize", syncFabState);
      window.clearTimeout(idleTimer);
    };
  }, []);

  useEffect(() => {
    if (createMenuOpen || mobileNavOpen || notificationsOpen || moduleSwitcherOpen) {
      setMobileCreateFabCollapsed(false);
    }
  }, [createMenuOpen, mobileNavOpen, moduleSwitcherOpen, notificationsOpen]);

  async function refreshRelatedRecords(tenantId = operatorContext.tenantId): Promise<void> {
    try {
      const [propertiesBody, jobsBody, quotesBody, invoicesBody, tenantUsersBody, requestsBody, paymentsBody, receiptReviewsBody] = await Promise.all([
        fetch(`/api/crm/properties?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmRecordsResponse>),
        fetch(`/api/crm/jobs?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmRecordsResponse>),
        fetch(`/api/crm/quotes?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmRecordsResponse>),
        fetch(`/api/crm/invoices?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmRecordsResponse>),
        fetch(`/api/platform/tenants/${encodeURIComponent(tenantId)}/users`).then((response) => response.json() as Promise<TenantUsersResponse>),
        fetch(`/api/crm/requests?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmRequestsResponse>),
        fetch(`/api/crm/payments?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmPaymentsResponse>),
        fetch(`/api/crm/receipt-reviews?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmReceiptReviewsResponse>)
      ]);
      setProperties(propertiesBody.ok ? propertiesBody.properties ?? [] : []);
      setJobs(jobsBody.ok ? jobsBody.jobs ?? [] : []);
      setQuotes(quotesBody.ok ? quotesBody.quotes ?? [] : []);
      setInvoices(invoicesBody.ok ? invoicesBody.invoices ?? [] : []);
      setTenantUsers(tenantUsersBody.ok ? tenantUsersBody.users ?? [] : []);
      setRequests(requestsBody.ok ? requestsBody.requests ?? [] : []);
      setPayments(paymentsBody.ok ? paymentsBody.payments ?? [] : []);
      setReceiptReviews(receiptReviewsBody.ok ? receiptReviewsBody.receiptReviews ?? [] : []);
    } catch {
      setProperties([]);
      setJobs([]);
      setQuotes([]);
      setInvoices([]);
      setTenantUsers([]);
      setRequests([]);
      setPayments([]);
      setReceiptReviews([]);
    }
  }

  async function refresh(): Promise<void> {
    setStatus("Loading clients...");
    try {
      const body = await fetch(`/api/crm/clients?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
        .then((response) => response.json() as Promise<CrmClientsResponse>);
      if (!body.ok) {
        setClients([]);
        setStatus(body.error ?? "Clients are unavailable right now.");
        return;
      }
      const nextClients = body.clients ?? [];
      setClients(nextClients);
      await refreshRelatedRecords(operatorContext.tenantId);
      setSelectedClientId((current) => {
        if (current && nextClients.some((client) => client.id === current)) {
          return current;
        }
        return activeClientProfileTab ? current : nextClients[0]?.id ?? "";
      });
      setStatus(nextClients.length ? `${nextClients.length} native NexOps client${nextClients.length === 1 ? "" : "s"} loaded.` : "No native NexOps clients yet.");
    } catch {
      setClients([]);
      setProperties([]);
      setJobs([]);
      setQuotes([]);
      setInvoices([]);
      setTenantUsers([]);
      setRequests([]);
      setPayments([]);
      setReceiptReviews([]);
      setStatus("Clients API unreachable.");
    }
  }

  async function refreshClientRails(clientId = selectedClientId, tenantId = operatorContext.tenantId): Promise<void> {
    if (!clientId) {
      setClientPortalActivity([]);
      setClientReviewSequences([]);
      setClientFieldMedia([]);
      setClientFieldReports([]);
      setClientSignedDocuments([]);
      setClientRailStatus("Portal activity and review follow-up will load when a client is selected.");
      return;
    }
    setClientRailStatus("Loading portal activity, review follow-up, and NexCam rails...");
    try {
      const [activityBody, reviewBody, mediaBody, reportsBody, signedDocsBody] = await Promise.all([
        fetch(`/api/crm/clients/${encodeURIComponent(clientId)}/portal-activity?tenantId=${encodeURIComponent(tenantId)}`)
          .then((response) => response.json() as Promise<ClientPortalActivityResponse>),
        fetch(`/api/crm/review-sequences?tenantId=${encodeURIComponent(tenantId)}&clientId=${encodeURIComponent(clientId)}`)
          .then((response) => response.json() as Promise<ReviewSequenceStatusResponse>),
        fetch(`/api/fielddocs/media?tenantId=${encodeURIComponent(tenantId)}&clientId=${encodeURIComponent(clientId)}&limit=8`)
          .then((response) => response.json() as Promise<FieldDocsMediaListResponse>),
        fetch(`/api/fielddocs/reports?tenantId=${encodeURIComponent(tenantId)}&clientId=${encodeURIComponent(clientId)}&limit=6`)
          .then((response) => response.json() as Promise<FieldDocsReportsListResponse>),
        fetch(`/api/fielddocs/signed-documents?tenantId=${encodeURIComponent(tenantId)}&clientId=${encodeURIComponent(clientId)}`)
          .then((response) => response.json() as Promise<SignedDocumentsResponse>)
      ]);
      const nextActivity = activityBody.ok ? activityBody.activity ?? [] : [];
      const nextSequences = reviewBody.ok ? reviewBody.sequences ?? [] : [];
      const nextMedia = mediaBody.ok ? mediaBody.media ?? [] : [];
      const nextReports = reportsBody.ok ? reportsBody.reports ?? [] : [];
      const nextSignedDocs = signedDocsBody.ok ? (signedDocsBody.records ?? []) : [];
      setClientPortalActivity(nextActivity);
      setClientReviewSequences(nextSequences);
      setClientFieldMedia(nextMedia);
      setClientFieldReports(nextReports);
      setClientSignedDocuments(nextSignedDocs);
      if (!activityBody.ok || !reviewBody.ok || !mediaBody.ok || !reportsBody.ok || !signedDocsBody.ok) {
        setClientRailStatus(activityBody.error ?? reviewBody.error ?? mediaBody.error ?? reportsBody.error ?? signedDocsBody.error ?? "Client portal rails are unavailable right now.");
        return;
      }
      setClientRailStatus(
        nextSequences.length
          ? `${nextActivity.length} portal event${nextActivity.length === 1 ? "" : "s"}, ${nextSequences.length} review sequence${nextSequences.length === 1 ? "" : "s"}, ${nextMedia.length} media item${nextMedia.length === 1 ? "" : "s"}, ${nextReports.length} report${nextReports.length === 1 ? "" : "s"}, and ${nextSignedDocs.length} signed doc${nextSignedDocs.length === 1 ? "" : "s"} loaded.`
          : nextActivity.length
            ? `${nextActivity.length} portal event${nextActivity.length === 1 ? "" : "s"} loaded. No review follow-up is active for this client. ${nextMedia.length} media item${nextMedia.length === 1 ? "" : "s"}, ${nextReports.length} report${nextReports.length === 1 ? "" : "s"}, and ${nextSignedDocs.length} signed doc${nextSignedDocs.length === 1 ? "" : "s"} are on the rail.`
            : nextMedia.length || nextReports.length || nextSignedDocs.length
              ? `No portal activity or review follow-up is recorded yet. NexCam already has ${nextMedia.length} media item${nextMedia.length === 1 ? "" : "s"}, ${nextReports.length} report${nextReports.length === 1 ? "" : "s"}, and ${nextSignedDocs.length} signed doc${nextSignedDocs.length === 1 ? "" : "s"} for this client.`
              : "No portal activity, review follow-up, or NexCam media is recorded for this client yet."
      );
    } catch {
      setClientPortalActivity([]);
      setClientReviewSequences([]);
      setClientFieldMedia([]);
      setClientFieldReports([]);
      setClientSignedDocuments([]);
      setClientRailStatus("Client portal rails are unavailable right now.");
    }
  }





  useEffect(() => {
    void refreshClientRails(selectedClientId, operatorContext.tenantId);
  }, [selectedClientId, operatorContext.tenantId]);

  async function sendClientPortalLink(clientId: string, propertyId?: string): Promise<void> {
    setClientRailBusy(propertyId ? `portal-link-${propertyId}` : "portal-link");
    setClientRailStatus("Sending portal link...");
    try {
      const body = await fetch(`/api/crm/clients/${encodeURIComponent(clientId)}/portal-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          ...(propertyId ? { propertyId } : {})
        })
      }).then((response) => response.json() as Promise<SendPortalLinkResponse>);
      if (!body.ok || !body.portalLink) {
        setClientRailStatus(body.error ?? "Portal link could not be sent.");
        return;
      }
      setLastPortalLink(body.portalLink);
      setClientRailStatus(`Portal link sent by ${body.delivery ?? "direct"} to ${body.target ?? "the saved client destination"}.`);
      await refreshClientRails(clientId, operatorContext.tenantId);
    } catch {
      setClientRailStatus("Portal link could not be sent.");
    } finally {
      setClientRailBusy("");
    }
  }



  async function sendClientStatement(clientId: string): Promise<void> {
    setClientRailBusy("send-statement");
    setClientRailStatus("Sending client statement...");
    try {
      const body = await fetch(`/api/crm/clients/${encodeURIComponent(clientId)}/statements/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: operatorContext.tenantId })
      }).then((response) => response.json() as Promise<{ ok: boolean; target?: string; error?: string }>);
      if (!body.ok) {
        setClientRailStatus(body.error ?? "Statement send failed.");
        return;
      }
      setClientRailStatus(`Statement sent to ${body.target ?? "the saved client destination"}.`);
      await refreshClientRails(clientId, operatorContext.tenantId);
    } catch {
      setClientRailStatus("Statement send failed.");
    } finally {
      setClientRailBusy("");
    }
  }

  async function deleteClientRecord(clientId: string): Promise<void> {
    const client = clients.find((entry) => entry.id === clientId);
    if (!client) {
      setClientRailStatus("That client is no longer on the rail.");
      return;
    }
    const confirmed = window.confirm(
      `Delete ${clientDisplayName(client)}? This removes the client and any linked properties only when there is no saved request, quote, job, or invoice history.`
    );
    if (!confirmed) {
      return;
    }
    setClientRailBusy("delete-client");
    setClientRailStatus(`Deleting ${clientDisplayName(client)}...`);
    try {
      const response = await fetch(`/api/crm/clients/${encodeURIComponent(clientId)}?tenantId=${encodeURIComponent(operatorContext.tenantId)}`, {
        method: "DELETE"
      });
      const body = await response.json() as { ok: boolean; error?: string; deletedPropertyIds?: string[] };
      if (!response.ok || !body.ok) {
        setClientRailStatus(body.error ?? "Client delete failed.");
        return;
      }
      emitCrmMutation();
      returnToClientRoster();
      await refresh();
      setClientRailStatus(`${clientDisplayName(client)} deleted${body.deletedPropertyIds?.length ? ` with ${body.deletedPropertyIds.length} linked propert${body.deletedPropertyIds.length === 1 ? "y" : "ies"}` : ""}.`);
    } catch {
      setClientRailStatus("Client delete failed.");
    } finally {
      setClientRailBusy("");
    }
  }



  async function saveClientMarketingConsent(clientId: string, marketing: boolean): Promise<void> {
    setClientRailBusy("marketing-consent");
    setClientRailStatus(marketing
      ? "Turning marketing consent on..."
      : "Turning marketing consent off and checking live showcases...");
    try {
      const body = await fetch(`/api/crm/clients/${encodeURIComponent(clientId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          consent: {
            ...(selectedClient?.consent.email !== undefined ? { email: selectedClient.consent.email } : {}),
            ...(selectedClient?.consent.sms !== undefined ? { sms: selectedClient.consent.sms } : {}),
            marketing
          }
        })
      }).then((response) => response.json() as Promise<CrmClientCreateResponse>);
      if (!body.ok || !body.client) {
        setClientRailStatus(body.error ?? "Marketing consent could not be updated.");
        return;
      }
      setClients((current) => current.map((client) => client.id === body.client?.id ? body.client : client));
      setClientRailStatus(marketing
        ? "Marketing consent is on for this client."
        : "Marketing consent is off. Future NexReach generation is blocked and any live showcase is flagged for review.");
    } catch {
      setClientRailStatus("Marketing consent could not be updated.");
    } finally {
      setClientRailBusy("");
    }
  }

  async function saveClientOverviewCustomFields(clientId: string): Promise<void> {
    if (!selectedClient) {
      return;
    }
    if (clientOverviewCustomFieldValidation.hasBlockingIssues) {
      setClientRailStatus("Custom field labels must be unique and cannot reuse built-in labels.");
      return;
    }
    setClientRailBusy("custom-fields");
    setClientRailStatus("Saving custom fields...");
    try {
      const body = await fetch(`/api/crm/clients/${encodeURIComponent(clientId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          customFields: {
            ...(selectedClient.customFields ?? {}),
            ...customFieldDraftRowsToRecord(clientOverviewCustomFieldsDraft, CLIENT_CUSTOM_FIELD_RESERVED_LABELS)
          }
        })
      }).then((response) => response.json() as Promise<CrmClientCreateResponse>);
      if (!body.ok || !body.client) {
        setClientRailStatus(body.error ?? "Custom fields could not be saved.");
        return;
      }
      setClients((current) => current.map((client) => client.id === body.client?.id ? body.client : client));
      setClientOverviewCustomFieldsDraft(
        customFieldRecordToDraftRows(body.client.customFields, CLIENT_CUSTOM_FIELD_RESERVED_LABELS, "client_profile")
      );
      setClientOverviewCustomFieldsOpen(false);
      setClientRailStatus("Custom fields saved.");
    } catch {
      setClientRailStatus("Custom fields could not be saved.");
    } finally {
      setClientRailBusy("");
    }
  }





  function clearWorkspaceTargets(): void {
    setFocusedRequestId("");
    setFocusedQuoteId("");
    setFocusedJobId("");
    setFocusedInvoiceId("");
  }

  function clearWorkspaceFilters(): void {
    setRequestFilterIntent(undefined);
    setQuoteFilterIntent(undefined);
    setJobFilterIntent(undefined);
    setInvoiceFilterIntent(undefined);
    setScheduleScopeIntent(undefined);
  }

  function closeHeaderPanels(): void {
    setMobileNavOpen(false);
    setNotificationsOpen(false);
    setCreateMenuOpen(false);
    setModuleSwitcherOpen(false);
  }

  function toggleCreateMenu(): void {
    setMobileNavOpen(false);
    setNotificationsOpen(false);
    setModuleSwitcherOpen(false);
    setCreateMenuOpen((current) => !current);
  }

  function toggleNotifications(): void {
    setMobileNavOpen(false);
    setCreateMenuOpen(false);
    setModuleSwitcherOpen(false);
    setNotificationsOpen((current) => !current);
  }

  function toggleModuleSwitcher(): void {
    setMobileNavOpen(false);
    setCreateMenuOpen(false);
    setNotificationsOpen(false);
    setModuleSwitcherOpen((current) => !current);
  }

  function setModule(module: NexOpsModule): void {
    const targetPath = buildModulePath(module);
    clearWorkspaceTargets();
    clearWorkspaceFilters();
    closeHeaderPanels();
    setCreatingClientPage(false);
    setActiveModule(module);
    if (module !== "clients") {
      setActiveClientProfileTab(null);
    }
    window.history.pushState({}, "", targetPath);
  }

  function returnToHomeModule(): void {
    clearWorkspaceTargets();
    clearWorkspaceFilters();
    closeHeaderPanels();
    setCreatingClientPage(false);
    setShowCreateClient(false);
    setSelectedClientId("");
    setActiveClientProfileTab(null);
    setActiveModule("home");
    window.history.pushState({}, "", buildModulePath("home"));
  }

  function openClientProfile(clientId: string, tab: ClientProfileTab = "overview"): void {
    clearWorkspaceTargets();
    clearWorkspaceFilters();
    closeHeaderPanels();
    setCreatingClientPage(false);
    setShowCreateClient(false);
    setSelectedClientId(clientId);
    setActiveModule("clients");
    setActiveClientProfileTab(tab);
    window.history.pushState({}, "", buildClientProfilePath(clientId, tab));
  }

  function returnToClientRoster(): void {
    closeHeaderPanels();
    setCreatingClientPage(false);
    setShowCreateClient(false);
    setClientFormMode("create");
    setSelectedClientId("");
    setActiveModule("clients");
    setActiveClientProfileTab(null);
    window.history.pushState({}, "", buildModulePath("clients"));
  }

  function setClientProfileTabRoute(tab: ClientProfileTab): void {
    if (!selectedClientId) {
      return;
    }
    closeHeaderPanels();
    setCreatingClientPage(false);
    setActiveModule("clients");
    setActiveClientProfileTab(tab);
    window.history.pushState({}, "", buildClientProfilePath(selectedClientId, tab));
  }

  function openNewClientWorkspace(): void {
    clearWorkspaceTargets();
    clearWorkspaceFilters();
    closeHeaderPanels();
    setShowCreateClient(false);
    setCreatingClientPage(true);
    setClientFormMode("create");
    setCreateStatus("");
    setNewClient(blankNewClientDraft());
    setSelectedClientId("");
    setActiveModule("clients");
    setActiveClientProfileTab(null);
    window.history.pushState({}, "", buildNewClientPath());
  }

  function openCreateClientDrawer(surface: "client" | "contact" | "property" = "client"): void {
    setCreateClientSurface(surface);
    setClientFormMode("create");
    setCreateStatus("");
    setNewClient(blankNewClientDraft());
    closeHeaderPanels();
    setShowCreateClient(true);
  }

  function openEditClientWorkspace(): void {
    if (!selectedClient) {
      return;
    }
    clearWorkspaceTargets();
    clearWorkspaceFilters();
    closeHeaderPanels();
    setShowCreateClient(false);
    setCreatingClientPage(true);
    setClientFormMode("edit");
    setCreateStatus("");
    setNewClient(draftFromExistingClient(selectedClient, selectedProperties[0] ?? null));
    setActiveModule("clients");
  }

  function closeClientFormWorkspace(): void {
    if (clientFormMode === "edit" && selectedClientId) {
      setClientFormMode("create");
      openClientProfile(selectedClientId, activeClientProfileTab ?? "overview");
      return;
    }
    setClientFormMode("create");
    returnToClientRoster();
  }

  function openWorkspaceProduct(product: "nexops" | "nexcam" | "nexdocs" | "nexportal" | "nexreach"): void {
    if (product === "nexdocs") {
      if (selectedClientId) {
        setClientProfileTabRoute("nexdocs");
        return;
      }
      closeHeaderPanels();
      setClientRailStatus("Open any client to enter NexDocs from the dedicated client profile.");
      setModule("clients");
      return;
    }
    closeHeaderPanels();
    const targetPath = buildWorkspaceSwitchPath(product, operatorContext.tenantId, selectedClientId || undefined);
    if (targetPath.startsWith("/nexops")) {
      window.history.pushState({}, "", targetPath);
      const nextPathState = parseNexOpsLocation(targetPath);
      setActiveModule(nextPathState.module);
      setSelectedClientId(nextPathState.clientId ?? "");
      setActiveClientProfileTab(nextPathState.clientTab);
      return;
    }
    window.location.assign(targetPath);
  }

  function handleCreateSelection(option: NexOpsCreateOption): void {
    if (option.workflow.kind === "client-page") {
      openNewClientWorkspace();
      return;
    }
    if (option.workflow.kind === "drawer") {
      openCreateClientDrawer(option.workflow.surface);
      return;
    }
    closeHeaderPanels();
    setModule(option.workflow.module);
  }

  function openInvoiceWorkspace(invoiceId: string): void {
    clearWorkspaceTargets();
    setFocusedInvoiceId(invoiceId);
    clearWorkspaceFilters();
    closeHeaderPanels();
    setActiveModule("invoices");
    setActiveClientProfileTab(null);
    window.history.pushState({}, "", buildModulePath("invoices"));
  }

  function openWorkspaceTarget(target: WorkspaceTarget): void {
    clearWorkspaceTargets();
    clearWorkspaceFilters();
    closeHeaderPanels();
    setActiveClientProfileTab(null);
    switch (target.module) {
      case "requests":
        if (target.objectId) {
          setFocusedRequestId(target.objectId);
        }
        if (target.filterKey === "status") {
          setRequestFilterIntent(target.filterValue as "all" | "new" | "archived" | "converted_to_quote" | "converted_to_job");
        }
        setActiveModule("requests");
        window.history.pushState({}, "", "/nexops/requests");
        return;
      case "quotes":
        if (target.objectId) {
          setFocusedQuoteId(target.objectId);
        }
        if (target.filterKey === "status") {
          setQuoteFilterIntent(target.filterValue as "all" | "draft" | "sent" | "change_requested" | "approved" | "approved_pending_conversion" | "expired");
        }
        setActiveModule("quotes");
        window.history.pushState({}, "", "/nexops/quotes");
        return;
      case "jobs":
        if (target.objectId) {
          setFocusedJobId(target.objectId);
        }
        if (target.filterKey === "status") {
          setJobFilterIntent(target.filterValue as "All" | "Upcoming" | "Today" | "Late" | "Unscheduled" | "Action Required" | "Requires Invoicing" | "Archived");
        }
        setActiveModule("jobs");
        window.history.pushState({}, "", "/nexops/jobs");
        return;
      case "invoices":
      case "payments":
        if (target.objectId) {
          setFocusedInvoiceId(target.objectId);
        }
        if (target.filterKey === "status") {
          setInvoiceFilterIntent(target.filterValue as "all" | "draft" | "awaiting" | "partial_pay" | "paid" | "void" | "bad_debt" | "past_due");
        }
        setActiveModule(target.module);
        window.history.pushState({}, "", target.module === "payments" ? "/nexops/payments" : "/nexops/invoices");
        return;
      case "capture":
        setCaptureWorkspaceView(target.filterValue === "unassigned" ? "unassigned" : "session");
        setActiveModule("capture");
        window.history.pushState({}, "", "/nexops/capture");
        return;
      case "schedule":
        if (target.filterKey === "scope") {
          setScheduleScopeIntent(target.filterValue as ScheduleScope);
        }
        setActiveModule("schedule");
        window.history.pushState({}, "", "/nexops/schedule");
        return;
      default:
        return;
    }
  }

  async function createClientFromForm(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!createClientCanSave) {
      if (clientCustomFieldValidation.hasBlockingIssues) {
        setCreateStatus("Resolve duplicate or reserved client custom field labels before saving.");
        return;
      }
      if (propertyCustomFieldValidation.hasBlockingIssues) {
        setCreateStatus("Resolve duplicate or reserved property custom field labels before saving.");
        return;
      }
      setCreateStatus(`Add ${createClientMissingFields.join(", ")} before this client can be saved. Email is recommended, but it is optional.`);
      return;
    }
    const editing = clientFormMode === "edit";
    if (editing && !selectedClientId) {
      setCreateStatus("Open a saved client record before trying to edit it.");
      return;
    }
    setCreateStatus(editing ? "Saving client changes..." : "Creating client...");
    const personName = {
      ...(newClient.title && newClient.title !== "No title" ? { title: newClient.title } : {}),
      firstName: newClient.firstName.trim(),
      lastName: newClient.lastName.trim()
    };
    const company = newClient.company.trim();
    const displayName = company && newClient.displayNamePreference === "company"
      ? company
      : personDisplayName(personName) || company;
    if (!displayName) {
      setCreateStatus("Add a client name or company name first.");
      return;
    }
    const phoneValue = newClient.phone.trim();
    const emailValue = newClient.email.trim();
    const additionalPhones = (newClient.additionalPhones ?? [])
      .filter((entry: ClientPhoneDraft) => entry.value.trim())
      .map((entry: ClientPhoneDraft) => ({
        label: entry.label,
        value: entry.value.trim(),
        primary: false,
        receivesMessages: entry.receivesMessages,
        smsCapability: entry.smsCapability,
        smsMode: "one_way" as const
      }));
    const additionalEmails = (newClient.additionalEmails ?? [])
      .filter((entry: ClientEmailDraft) => entry.value.trim())
      .map((entry: ClientEmailDraft) => ({
        label: entry.label,
        value: entry.value.trim(),
        primary: false
      }));
    const allContactPhones = [
      ...(phoneValue ? [{
        label: newClient.phoneLabel,
        value: phoneValue,
        primary: true,
        receivesMessages: newClient.phoneReceivesMessages,
        smsCapability: newClient.smsCapability,
        smsMode: "one_way" as const
      }] : []),
      ...additionalPhones
    ];
    const allContactEmails = [
      ...(emailValue ? [{
        label: newClient.emailLabel,
        value: emailValue,
        primary: true
      }] : []),
      ...additionalEmails
    ];
    const contact: CrmContact = {
      personName,
      ...(company ? { company } : {}),
      ...(newClient.role.trim() ? { role: newClient.role.trim() } : {}),
      correspondenceContact: true,
      billingContact: true,
      phones: allContactPhones,
      emails: allContactEmails,
      channelPreference: allContactEmails.length && newClient.phoneReceivesMessages ? "both" : newClient.phoneReceivesMessages ? "sms" : "email"
    };
    const propertyAddress = newClient.street1.trim() ? {
      street1: newClient.street1.trim(),
      ...(newClient.street2.trim() ? { street2: newClient.street2.trim() } : {}),
      city: newClient.city.trim(),
      province: newClient.province.trim(),
      postalCode: newClient.postalCode.trim(),
      country: "USA"
    } : undefined;
    const separateBillingAddress = newClient.billingStreet1.trim() ? {
      street1: newClient.billingStreet1.trim(),
      ...(newClient.billingStreet2.trim() ? { street2: newClient.billingStreet2.trim() } : {}),
      city: newClient.billingCity.trim(),
      province: newClient.billingProvince.trim(),
      postalCode: newClient.billingPostalCode.trim(),
      country: "USA"
    } : undefined;
    const billingAddress = newClient.billingSameAsPrimaryProperty ? propertyAddress : separateBillingAddress;
    const additionalContacts: CrmContact[] = [];
    if (newClient.additionalContactName.trim() || newClient.additionalContactPhone.trim() || newClient.additionalContactEmail.trim()) {
      additionalContacts.push({
        ...(newClient.additionalContactName.trim() ? { company: newClient.additionalContactName.trim() } : {}),
        role: newClient.additionalContactRole.trim() || "Additional contact",
        correspondenceContact: false,
        billingContact: false,
        phones: newClient.additionalContactPhone.trim() ? [{
          label: "Other",
          value: newClient.additionalContactPhone.trim(),
          primary: false,
          receivesMessages: false,
          smsCapability: "unknown",
          smsMode: "one_way"
        }] : [],
        emails: newClient.additionalContactEmail.trim() ? [{
          label: "Other",
          value: newClient.additionalContactEmail.trim(),
          primary: false
        }] : [],
        channelPreference: "none"
      });
    }
    const clientCustomFields: Record<string, string | number | boolean> = {};
    if (newClient.leadSource.trim()) {
      clientCustomFields.leadSource = newClient.leadSource.trim();
    }
    if (newClient.paymentTerms.trim()) {
      clientCustomFields.paymentTerms = newClient.paymentTerms.trim();
    }
    if (newClient.referredBy.trim()) {
      clientCustomFields.referredBy = newClient.referredBy.trim();
    }
    if (newClient.promoCode.trim()) {
      clientCustomFields.promoCode = newClient.promoCode.trim();
    }
    clientCustomFields.askForReview = newClient.askForReview;
    Object.assign(
      clientCustomFields,
      customFieldDraftRowsToRecord(newClient.clientCustomFieldsDraft ?? [], CLIENT_CUSTOM_FIELD_RESERVED_LABELS)
    );
    const propertyCustomFields: Record<string, string | number | boolean> = {};
    propertyCustomFields.gatedEntry = newClient.propertyGatedEntry;
    if (newClient.propertyClientName.trim()) {
      propertyCustomFields.propertyClientName = newClient.propertyClientName.trim();
    }
    if (newClient.propertyClientPhone.trim()) {
      propertyCustomFields.propertyClientPhone = newClient.propertyClientPhone.trim();
    }
    if (newClient.propertyClientEmail.trim()) {
      propertyCustomFields.propertyClientEmail = newClient.propertyClientEmail.trim();
    }
    Object.assign(
      propertyCustomFields,
      customFieldDraftRowsToRecord(newClient.propertyCustomFieldsDraft ?? [], PROPERTY_CUSTOM_FIELD_RESERVED_LABELS)
    );
    const propertyContacts: CrmContact[] = [];
    if (newClient.propertyClientName.trim() || newClient.propertyClientPhone.trim() || newClient.propertyClientEmail.trim()) {
      propertyContacts.push({
        ...(newClient.propertyClientName.trim() ? { company: newClient.propertyClientName.trim() } : {}),
        role: "Property contact",
        correspondenceContact: false,
        billingContact: false,
        phones: newClient.propertyClientPhone.trim() ? [{
          label: "Other",
          value: newClient.propertyClientPhone.trim(),
          primary: true,
          receivesMessages: false,
          smsCapability: "unknown",
          smsMode: "one_way"
        }] : [],
        emails: newClient.propertyClientEmail.trim() ? [{
          label: "Other",
          value: newClient.propertyClientEmail.trim(),
          primary: true
        }] : [],
        channelPreference: "none"
      });
    }
    try {
      const payload = {
        tenantId: operatorContext.tenantId,
        name: displayName,
        ...(company ? { company } : editing ? { company: null } : {}),
        personName,
        displayNamePreference: company ? newClient.displayNamePreference : "person",
        ...(billingAddress ? { billingAddress } : editing ? { billingAddress: null } : {}),
        billingSameAsPrimaryProperty: newClient.billingSameAsPrimaryProperty,
        contacts: [contact, ...additionalContacts],
        communicationSettings: {
          quotesAndInvoices: contact.channelPreference,
          jobReminders: contact.channelPreference,
          jobClosureFollowUps: "email" as const,
          reviewRequests: contact.channelPreference,
          smsDefaultMode: "one_way" as const
        },
        emails: allContactEmails.map((entry) => entry.value),
        phones: allContactPhones.map((entry) => entry.value),
        consent: { email: Boolean(emailValue), sms: newClient.phoneReceivesMessages, marketing: selectedClient?.consent.marketing ?? false },
        customFields: clientCustomFields,
        ...(propertyAddress ? {
          primaryProperty: {
            siteName: newClient.siteName.trim() || undefined,
            label: newClient.siteName.trim() || propertyAddress.street1,
            address: propertyAddress,
            ...(typeof newClient.propertyGeoLat === "number" && typeof newClient.propertyGeoLng === "number"
              ? { geo: { lat: newClient.propertyGeoLat, lng: newClient.propertyGeoLng } }
              : {}),
            billingAddressSameAsClient: newClient.billingSameAsPrimaryProperty,
            access: {
              gateCode: newClient.propertyGateCodes.trim() || undefined,
              accessNotes: newClient.propertyAccessNotes.trim() || (newClient.propertyGatedEntry ? "Gated entry enabled" : undefined)
            },
            contacts: propertyContacts,
            customFields: propertyCustomFields
          }
        } : {})
      };
      const body = await fetch(editing ? `/api/crm/clients/${encodeURIComponent(selectedClientId)}` : "/api/crm/clients", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }).then((response) => response.json() as Promise<CrmClientCreateResponse>);
      if (!body.ok || !body.client) {
        setCreateStatus(body.error ?? (editing ? "Client could not be updated." : "Client could not be created."));
        return;
      }
      setCreateStatus(`${editing ? "Saved" : "Created"} ${clientDisplayName(body.client)}.`);
      setShowCreateClient(false);
      setCreatingClientPage(false);
      setClientFormMode("create");
      setNewClient(blankNewClientDraft());
      await refresh();
      openClientProfile(body.client.id, "overview");
    } catch {
      setCreateStatus(editing ? "Client update request failed." : "Client create request failed.");
    }
  }

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
        if (!cancelled && body.ok && body.branding) {
          setTenantBranding(body.branding);
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

  useEffect(() => {
    void refresh();
    const onCrmMutation = () => void refresh();
    window.addEventListener("nexops:crm-mutated", onCrmMutation);
    return () => window.removeEventListener("nexops:crm-mutated", onCrmMutation);
  }, [operatorContext.tenantId]);

  useEffect(() => {
    const onPopState = () => {
      const nextLocation = parseNexOpsLocation(window.location.pathname);
      setActiveModule(nextLocation.module);
      setActiveClientProfileTab(nextLocation.clientTab);
      setCreatingClientPage(nextLocation.clientDraft === "new");
      setSelectedClientId(nextLocation.clientId ?? "");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const tenantName = tenantDisplayName(tenantBranding, operatorContext.tenantId);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredClients = clients.filter((client) => {
    if (!normalizedQuery) {
      return true;
    }
    return [
      clientDisplayName(client),
      contactSummary(client),
      clientPrimaryAddress(client),
      ...(client.tags ?? [])
    ].join(" ").toLowerCase().includes(normalizedQuery);
  });
  const selectedClient = selectedClientId
    ? clients.find((client) => client.id === selectedClientId) ?? null
    : filteredClients[0] ?? null;
  const selectedContact = selectedClient?.contacts?.find((contact) => contact.correspondenceContact || contact.billingContact) ?? selectedClient?.contacts?.[0];
  const selectedPhone = selectedContact?.phones?.find((phone) => phone.primary) ?? selectedContact?.phones?.[0];
  const selectedPhoneValue = selectedClient
    ? primaryClientPhoneValue({
      contactPhones: selectedContact?.phones,
      clientPhones: selectedClient.phones
    })
    : "";
  const selectedEmail = selectedContact?.emails?.find((email) => email.primary)?.value ?? selectedContact?.emails?.[0]?.value ?? selectedClient?.emails[0];
  const selectedProperties = selectedClient ? properties.filter((property) => property.clientId === selectedClient.id) : [];
  const selectedRequests = selectedClient ? requests.filter((request) => request.selectedClientId === selectedClient.id) : [];
  const selectedJobs = selectedClient ? jobs.filter((job) => job.clientId === selectedClient.id) : [];
  const selectedQuotes = selectedClient ? quotes.filter((quote) => quote.clientId === selectedClient.id) : [];
  const selectedInvoices = selectedClient ? invoices.filter((invoice) => invoice.clientId === selectedClient.id) : [];
  const selectedPayments = selectedClient ? payments.filter((payment) => payment.clientId === selectedClient.id) : [];
  const selectedReceiptReviewSummaries = selectedClient
    ? receiptReviews.filter((review) => review.clientId === selectedClient.id || selectedInvoices.some((invoice) => invoice.id === review.invoiceId))
    : [];
  const directClientMedia = clientFieldMedia.filter((media) => !media.jobId && !media.visitId);
  const workScopedClientMedia = clientFieldMedia.filter((media) => Boolean(media.jobId || media.visitId));
  const orderedClientFieldMedia = [...directClientMedia, ...workScopedClientMedia];
  const activeCount = clients.filter((client) => clientStatusLabel(client) === "Active").length;
  const leadCount = clients.filter((client) => clientStatusLabel(client) === "Lead").length;
  const textReadyCount = clients.filter((client) => clientHasTextReadyContact(client)).length;
  const clientOverviewCustomFieldValidation = validateCustomFieldDraftRows(clientOverviewCustomFieldsDraft, CLIENT_CUSTOM_FIELD_RESERVED_LABELS);
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

  const moduleTitle = NEXOPS_MODULES.find((module) => module.id === activeModule)?.label ?? "NexOps";

  useEffect(() => {
    setClientOverviewCustomFieldsDraft(
      customFieldRecordToDraftRows(selectedClient?.customFields, CLIENT_CUSTOM_FIELD_RESERVED_LABELS, "client_profile")
    );
    setClientOverviewCustomFieldsOpen(false);
    setMobileClientExpandedBucket(null);
  }, [selectedClient?.id]);

  function renderHome(): React.ReactElement {
    return <NexOpsHomePage tenantId={operatorContext.tenantId} onOpenTarget={openWorkspaceTarget} />;
  }

  function renderClients(options?: { compact?: boolean }): React.ReactElement {
    if (creatingClientPage && !options?.compact) {
      return renderNewClientWorkspace();
    }
    if (activeClientProfileTab && !options?.compact) {
      return <ContactProfileSurface bindings={{
        activeClientProfileTab,
        clientContactDisplayName,
        clientDisplayName,
        clientFieldMedia,
        clientFieldReports,
        clientOverviewCustomFieldValidation,
        clientOverviewCustomFieldsDraft,
        clientOverviewCustomFieldsOpen,
        clientPortalActivity,
        clientPrimaryAddress,
        clientRailBusy,
        clientRailStatus,
        clientReviewSequences,
        clientSignedDocuments,
        clientStatusLabel,
        deleteClientRecord,
        formatPhoneDisplay,
        lastPortalLink,
        mobileClientExpandedBucket,
        mobileClientViewport,
        MobileClientEditGlyph,
        MobileClientSummaryGlyph,
        openCreateClientDrawer,
        openEditClientWorkspace,
        openWorkspaceTarget,
        operatorContext,
        orderedClientFieldMedia,
        personDisplayName,
        returnToClientRoster,
        saveClientMarketingConsent,
        saveClientOverviewCustomFields,
        selectedClient,
        selectedContact,
        selectedEmail,
        selectedInvoices,
        selectedJobs,
        selectedPayments,
        selectedPhone,
        selectedPhoneValue,
        selectedProperties,
        selectedQuotes,
        selectedReceiptReviewSummaries,
        selectedRequests,
        sendClientPortalLink,
        sendClientStatement,
        setClientOverviewCustomFieldsDraft,
        setClientOverviewCustomFieldsOpen,
        setClientProfileTabRoute,
        setMobileClientExpandedBucket,
        setModule,
        toggleCreateMenu
      }} />;
    }

    return <ContactRoster
      status={status}
      activeCount={activeCount}
      leadCount={leadCount}
      textReadyCount={textReadyCount}
      propertyCount={properties.length}
      query={query}
      clients={filteredClients}
      selectedClientId={selectedClientId}
      clientDisplayName={clientDisplayName}
      contactSummary={contactSummary}
      clientPrimaryAddress={clientPrimaryAddress}
      clientStatusLabel={clientStatusLabel}
      onQueryChange={setQuery}
      onOpenClient={openClientProfile}
      onNewClient={openNewClientWorkspace}
      onImport={() => setModule("imports")}
      onRefresh={() => void refresh()}
    />;
  }

  function renderNewClientWorkspace(): React.ReactElement {
    return <ContactEditorSurface
      tenantId={operatorContext.tenantId}
      newClient={newClient}
      setNewClient={setNewClient}
      createStatus={createStatus}
      createClientCanSave={createClientCanSave}
      createClientMissingFields={createClientMissingFields}
      leadSourceOptions={leadSourceOptions}
      mode={clientFormMode}
      mobile={mobileClientViewport}
      onClose={closeClientFormWorkspace}
      onSubmit={createClientFromForm}
    />;
  }


  function renderCaptureWorkspace(): React.ReactElement {
    const filteredClients = clients
      .filter((client) => {
        if (!captureClientQuery.trim()) {
          return true;
        }
        const haystack = [
          clientDisplayName(client),
          ...client.emails,
          ...client.phones,
          clientPrimaryAddress(client)
        ].join(" ").toLowerCase();
        return haystack.includes(captureClientQuery.trim().toLowerCase());
      })
      .slice(0, 8);
    const selectedCaptureClient = clients.find((client) => client.id === captureSelectedClientId);
    const assignedCaptureClient = captureSession?.assignedClientId
      ? clients.find((client) => client.id === captureSession.assignedClientId)
      : undefined;
    return (
      <Suspense fallback={<section className="nexops-module-page"><div className="nexops-module-grid"><article className="nexops-module-card"><p className="eyebrow">Loading</p><h2>Opening capture workspace</h2><p>Pulling the deferred capture rail into the shell now.</p></article></div></section>}>
        <NexOpsCaptureWorkspace
          operatorTenantId={operatorContext.tenantId}
          captureInputRef={captureInputRef}
          captureBusy={captureBusy}
          captureStatus={captureStatus}
          captureWorkspaceView={captureWorkspaceView}
          captureSession={captureSession}
          captureSessionOrigin={captureSessionOrigin}
          captureSessionMode={captureSessionMode}
          captureInbox={captureInbox}
          captureInboxStatus={captureInboxStatus}
          activeCaptureMedia={activeCaptureMedia}
          captureSessionMedia={captureSessionMedia}
          captureAnchorGps={captureAnchorGps}
          captureGpsMoved={captureGpsMoved}
          filteredClients={filteredClients}
          selectedCaptureClient={selectedCaptureClient}
          assignedCaptureClient={assignedCaptureClient}
          captureClientQuery={captureClientQuery}
          setCaptureClientQuery={setCaptureClientQuery}
          captureSelectedClientId={captureSelectedClientId}
          setCaptureSelectedClientId={setCaptureSelectedClientId}
          captureSelectedJobId={captureSelectedJobId}
          setCaptureSelectedJobId={setCaptureSelectedJobId}
          captureSelectedVisitId={captureSelectedVisitId}
          setCaptureSelectedVisitId={setCaptureSelectedVisitId}
          captureTargets={captureTargets}
          visibleCaptureVisits={visibleCaptureVisits}
          onStartCaptureSession={startCaptureSession}
          onOpenCaptureWorkspace={openCaptureWorkspace}
          onFinishCaptureSession={finishCaptureSession}
          onUploadCapturePhotos={uploadCapturePhotos}
          onSetCaptureSelectedMediaId={setCaptureSelectedMediaId}
          onRouteCaptureToNewRequest={routeCaptureToNewRequest}
          onMarkCaptureDecideLater={markCaptureDecideLater}
          onSetCaptureSessionMode={setCaptureSessionMode}
          onSetCaptureStatus={setCaptureStatus}
          onLoadCaptureTargets={loadCaptureTargets}
          onAssignCaptureToExistingClient={assignCaptureToExistingClient}
          onReopenCaptureBatch={reopenCaptureBatch}
          onSetCaptureSession={setCaptureSession}
          onSetCaptureSessionOrigin={setCaptureSessionOrigin}
          clientDisplayName={clientDisplayName}
          clientPrimaryAddress={clientPrimaryAddress}
          contactSummary={contactSummary}
        />
      </Suspense>
    );
  }

  function renderSettings(): React.ReactElement {
    return (
      <NexOpsSettingsPage
        tenantId={operatorContext.tenantId}
        tenantName={tenantName}
        role={operatorContext.role}
        tenantUsers={tenantUsers}
        onCrmMutation={() => window.dispatchEvent(new Event("nexops:crm-mutated"))}
      />
    );
  }
  function renderCreateClientPanel(): React.ReactElement | null {
    if (!showCreateClient) {
      return null;
    }
    return (
      <Suspense fallback={<div className="nexops-drawer-backdrop" role="presentation"><div className="nexops-drawer nexops-client-form"><p className="eyebrow">Loading</p><h2>Opening client setup</h2><p>Pulling the deferred client form into view now.</p></div></div>}>
        <NexOpsCreateClientPanel
          tenantId={operatorContext.tenantId}
          newClient={newClient}
          setNewClient={setNewClient}
          createStatus={createStatus}
          createClientCanSave={createClientCanSave}
          createClientMissingFields={createClientMissingFields}
          leadSourceOptions={leadSourceOptions}
          surface={createClientSurface}
          onClose={() => setShowCreateClient(false)}
          onSubmit={createClientFromForm}
        />
      </Suspense>
    );
  }

  function renderCreateMenu(): React.ReactElement | null {
    if (!createMenuOpen) {
      return null;
    }
    const activeContextLabel = activeClientProfileTab && selectedClient
      ? `Create inside ${clientDisplayName(selectedClient)} without leaving the client workspace.`
      : `Start from the ${moduleTitle} rail and jump straight into the right builder.`;
    return (
      <Suspense fallback={<section className="nexops-create-menu nexops-create-menu-flyout" role="dialog" aria-label="Create a new record"><p className="nexops-module-status">Loading create menu...</p></section>}>
        <NexOpsCreateMenu
          presentation={createMenuPresentation(window.innerWidth)}
          activeContextLabel={activeContextLabel}
          onClose={() => setCreateMenuOpen(false)}
          onSelect={handleCreateSelection}
        />
      </Suspense>
    );
  }

  function renderActiveModule(): React.ReactElement {
    if (activeModule === "home") {
      return renderHome();
    }
    if (activeModule === "clients") {
      return renderClients();
    }
    if (activeModule === "requests") {
      return (
        <NexOpsRequestsPage
          tenantId={operatorContext.tenantId}
          clients={clients}
          properties={properties}
          tenantUsers={tenantUsers}
          focusedRequestId={focusedRequestId}
          initialFilter={requestFilterIntent}
          captureIntent={captureRequestIntent}
          onCaptureRequestCreated={handleCaptureRequestCreated}
          onCrmMutation={emitCrmMutation}
        />
      );
    }
    if (activeModule === "quotes") {
      return (
        <NexOpsQuotesPage
          tenantId={operatorContext.tenantId}
          clients={clients}
          tenantUsers={tenantUsers}
          focusedQuoteId={focusedQuoteId}
          initialFilter={quoteFilterIntent}
          onCrmMutation={() => window.dispatchEvent(new Event("nexops:crm-mutated"))}
        />
      );
    }
    if (activeModule === "jobs") {
      return (
        <NexOpsJobsPage
          tenantId={operatorContext.tenantId}
          role={operatorContext.role}
          clients={clients}
          onCrmMutation={() => window.dispatchEvent(new Event("nexops:crm-mutated"))}
          onOpenInvoice={openInvoiceWorkspace}
          focusedJobId={focusedJobId}
          initialFilter={jobFilterIntent}
        />
      );
    }
    if (activeModule === "invoices" || activeModule === "payments") {
      return (
        <NexOpsInvoicesPage
          tenantId={operatorContext.tenantId}
          clients={clients}
          entryPoint={activeModule}
          focusedInvoiceId={focusedInvoiceId}
          initialFilter={invoiceFilterIntent}
          onCrmMutation={() => window.dispatchEvent(new Event("nexops:crm-mutated"))}
        />
      );
    }
    if (activeModule === "schedule") {
      return (
        <NexOpsSchedulePage
          tenantId={operatorContext.tenantId}
          role={operatorContext.role}
          initialScope={scheduleScopeIntent}
          onOpenJob={(jobId) => openWorkspaceTarget({ module: "jobs", objectId: jobId })}
          onCrmMutation={() => window.dispatchEvent(new Event("nexops:crm-mutated"))}
        />
      );
    }
    if (activeModule === "imports") {
      return <NexOpsImportPage csvStatus={csvStatus} setCsvStatus={setCsvStatus} />;
    }
    if (activeModule === "approvals") {
      return <div className="nexops-embedded-panel"><ApprovalQueuePanel tenantId={operatorContext.tenantId} /></div>;
    }
    if (activeModule === "capture") {
      return renderCaptureWorkspace();
    }
    if (activeModule === "settings") {
      return renderSettings();
    }
    if (activeModule === "patterns") {
      return <NexOpsPatternLibraryPage />;
    }
    return (
      <NexOpsLegacyLifecyclePage
        module={activeModule}
        clients={clients}
        quotes={quotes}
        jobs={jobs}
        invoices={invoices}
        tenantId={operatorContext.tenantId}
      />
    );
  }

  function renderNotificationPanel(): React.ReactElement | null {
    if (!notificationsOpen) {
      return null;
    }
    return (
      <Suspense fallback={<section className="nexops-notification-panel" role="dialog" aria-label="Notifications"><p className="nexops-module-status">Loading notifications...</p></section>}>
        <>
          <button className="nexops-overlay-backdrop" type="button" aria-label="Close notifications" onClick={() => setNotificationsOpen(false)} />
          <NexOpsNotificationPanel
            notificationStatus={notificationStatus}
            notifications={notifications}
            onMarkAllRead={markAllNotificationsRead}
            onOpenNotification={openNotification}
            onClose={() => setNotificationsOpen(false)}
          />
        </>
      </Suspense>
    );
  }

  return (
      <main className="nexops-app" style={style}>
        <aside className="nexops-app-sidebar" aria-label="NexOps navigation">
          <div className="nexops-app-logo">
            <SidebarBrandStack product="nexops" branding={tenantBranding} tenantId={operatorContext.tenantId} />
          </div>
        <button className="nexops-create-button" type="button" aria-controls={NEXOPS_SHARED_CREATE_MENU_ID} aria-expanded={createMenuOpen} onClick={toggleCreateMenu}>Create</button>
        <nav className="nexops-nav">
          {NEXOPS_MODULES.filter((item) => !item.hidden).map((item) => (
            <button className={item.id === activeModule ? "active" : ""} type="button" key={item.id} onClick={() => setModule(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="nexops-web-main">
        <NexOpsSharedMobileBar
          tenantBranding={tenantBranding}
          tenantId={operatorContext.tenantId}
          onBrandClick={returnToHomeModule}
          brandAriaLabel="Return to NexOps home"
          rightControls={(
            <>
              <button
                className="nexops-mobile-icon-button"
                type="button"
                aria-label="Open camera capture"
                onClick={() => {
                  if (captureSession) {
                    openCaptureWorkspace("session");
                    return;
                  }
                  void startCaptureSession();
                }}
              >
                <NexOpsNavGlyph module="capture" />
              </button>
              <button className="nexops-mobile-icon-button nexops-notification-button" type="button" aria-expanded={notificationsOpen} aria-label="Open notifications" onClick={toggleNotifications}>
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                  <path d="M10 3.7a3.1 3.1 0 0 0-3.1 3.1v1.3c0 .8-.3 1.6-.8 2.2l-.9 1v.8h9.6v-.8l-.9-1c-.5-.6-.8-1.4-.8-2.2V6.8A3.1 3.1 0 0 0 10 3.7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M8.3 14.7a1.8 1.8 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                {notificationUnreadCount ? <span className="nexops-notification-badge">{notificationUnreadCount}</span> : null}
              </button>
              <button
                className="nexops-mobile-menu-button"
                type="button"
                aria-expanded={mobileNavOpen}
                aria-controls="nexops-mobile-nav"
                aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
                onClick={() => setMobileNavOpen((current) => !current)}
              >
                <span className="nexops-mobile-menu-glyph" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="nexops-mobile-menu-label">Menu</span>
              </button>
            </>
          )}
        />
        {mobileNavOpen ? (
          <div className="nexops-mobile-nav-layer" role="presentation">
            <button className="nexops-mobile-nav-backdrop" type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />
            <aside className="nexops-mobile-nav-sheet" id="nexops-mobile-nav" role="dialog" aria-modal="true" aria-label="NexOps navigation">
              <div className="nexops-mobile-nav-header">
                <div className="nexops-mobile-brand-stack">
                  <div className="nexops-mobile-brand">
                    <div className="nexops-mobile-brand-lockup">
                      <PlatformMark className="nexops-mobile-platform-mark" alt="NexTeam" />
                      <ProductLogo product="nexops" className="nexops-mobile-product-logo" alt="NexOps" />
                    </div>
                  </div>
                  <TenantBrandMark branding={tenantBranding} tenantId={operatorContext.tenantId} className="nexops-mobile-tenant-mark" />
                </div>
                <button className="nexops-mobile-close-button" type="button" onClick={() => setMobileNavOpen(false)}>Close</button>
              </div>
              <div className="nexops-mobile-nav-quick-actions">
                <button className="nexops-create-button mobile" type="button" onClick={() => {
                  setMobileNavOpen(false);
                  setCreateMenuOpen(true);
                }}>
                  Create
                </button>
                <button type="button" onClick={() => {
                  setMobileNavOpen(false);
                  toggleModuleSwitcher();
                }}>
                  Modules
                </button>
              </div>
              <div className="nexops-mobile-nav-utility-grid" aria-label="Mobile quick tools">
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    if (captureSession) {
                      openCaptureWorkspace("session");
                      return;
                    }
                    void startCaptureSession();
                  }}
                >
                  <NexOpsNavGlyph module="capture" />
                  <span>NexCam</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    toggleNotifications();
                  }}
                >
                  <span className="nexops-mobile-nav-utility-icon nexops-notification-button" aria-hidden="true">
                    <svg viewBox="0 0 20 20" fill="none">
                      <path d="M10 3.7a3.1 3.1 0 0 0-3.1 3.1v1.3c0 .8-.3 1.6-.8 2.2l-.9 1v.8h9.6v-.8l-.9-1c-.5-.6-.8-1.4-.8-2.2V6.8A3.1 3.1 0 0 0 10 3.7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                      <path d="M8.3 14.7a1.8 1.8 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                    {notificationUnreadCount ? <span className="nexops-notification-badge">{notificationUnreadCount}</span> : null}
                  </span>
                  <span>Notifications</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    closeHeaderPanels();
                    setModule("settings");
                  }}
                >
                  <NexOpsNavGlyph module="settings" />
                  <span>Settings</span>
                </button>
                <button type="button" onClick={() => {
                  setMobileNavOpen(false);
                  void signOutOperator(props.auth);
                }}>
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                    <path d="M12 4.5h2a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 14 15.5h-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M9 13.5 12.5 10 9 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M12 10H4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  <span>Sign out</span>
                </button>
              </div>
              {NEXOPS_MOBILE_NAV_GROUPS.map((group) => (
                <section className="nexops-mobile-nav-group" key={group.title} aria-label={group.title}>
                  <p>{group.title}</p>
                  <div className="nexops-mobile-nav-grid">
                    {group.items.map((moduleId) => {
                      const module = NEXOPS_MODULES.find((entry) => entry.id === moduleId);
                      if (!module || module.hidden) {
                        return null;
                      }
                      return (
                        <button className={module.id === activeModule ? "active" : ""} type="button" key={module.id} onClick={() => setModule(module.id)}>
                          <NexOpsNavGlyph module={module.id} />
                          <span>{module.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
              <div className="nexops-mobile-nav-footer">
                <div>
                  <strong>{props.user.email ?? "Operator"}</strong>
                  <span>Signed in for this tenant</span>
                </div>
              </div>
            </aside>
          </div>
        ) : null}
        <NexOpsSharedWebTopbar
          tenantName={tenantName}
          moduleTitle={moduleTitle}
          moduleSwitcherOpen={moduleSwitcherOpen}
          onToggleModuleSwitcher={toggleModuleSwitcher}
          accountTools={(
            <>
              <button
                className="nexops-web-icon-button"
                type="button"
                aria-label="Open camera capture"
                onClick={() => {
                  if (captureSession) {
                    openCaptureWorkspace("session");
                    return;
                  }
                  void startCaptureSession();
                }}
              >
                <NexOpsNavGlyph module="capture" />
              </button>
              <button className="nexops-web-icon-button nexops-notification-button" type="button" aria-expanded={notificationsOpen} aria-label="Open notifications" onClick={toggleNotifications}>
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                  <path d="M10 3.7a3.1 3.1 0 0 0-3.1 3.1v1.3c0 .8-.3 1.6-.8 2.2l-.9 1v.8h9.6v-.8l-.9-1c-.5-.6-.8-1.4-.8-2.2V6.8A3.1 3.1 0 0 0 10 3.7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M8.3 14.7a1.8 1.8 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                {notificationUnreadCount ? <span className="nexops-notification-badge">{notificationUnreadCount}</span> : null}
              </button>
              <button className="nexops-web-icon-button" type="button" aria-label="Open settings" onClick={() => {
                closeHeaderPanels();
                setModule("settings");
              }}>
                <NexOpsNavGlyph module="settings" />
              </button>
              <span>{props.user.email ?? "Operator"}</span>
              <button type="button" onClick={() => void signOutOperator(props.auth)}>Sign out</button>
            </>
          )}
        />
        <NexOpsMobileCreateFab
          collapsed={mobileCreateFabCollapsed}
          expanded={createMenuOpen}
          hidden={mobileFabShouldHideOverlays({ mobileNavOpen, notificationsOpen, moduleSwitcherOpen })}
          pulse={mobileCreateFabPulse}
          onClick={toggleCreateMenu}
        />
        <NexOpsModuleSwitcher
          open={moduleSwitcherOpen}
          onClose={() => setModuleSwitcherOpen(false)}
          onOpenProduct={openWorkspaceProduct}
        />
        {renderCreateMenu()}
        {renderNotificationPanel()}

        <Suspense fallback={<div className="nexops-embedded-panel"><section className="nexops-module-card"><p className="eyebrow">Loading</p><h2>Opening this workspace</h2><p>Pulling the next screen into the shell now.</p></section></div>}>
          {renderActiveModule()}
        </Suspense>
      </section>
      {renderCreateClientPanel()}
    </main>
  );
}
