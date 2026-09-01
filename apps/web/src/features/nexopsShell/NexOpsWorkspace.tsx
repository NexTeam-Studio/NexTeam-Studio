import React, { Suspense, useEffect, useState } from "react";
import { type Auth, type User } from "firebase/auth";
import { tenantDisplayName } from "../../shared/branding/ProductBranding";
import { NexSuiteHeader } from "../../shared/ui/NexSuiteHeader";
import { NexSuiteSidebar, type NexSuiteSidebarItem } from "../../shared/ui/NexSuiteSidebar";
import { NexTeamApplicationShell } from "../../shared/ui/NexTeamApplicationShell";
import { NexOpsCreateMenu } from "./components/NexOpsCreateMenu";
import { NexOpsNotificationPanel } from "./components/NexOpsNotificationPanel";
import { NexOpsImportPage } from "./components/NexOpsImportPage";
import { NexOpsLegacyLifecyclePage } from "./components/NexOpsLegacyLifecyclePage";
import { NexOpsModuleSwitcher } from "./components/NexOpsModuleSwitcher";

import { buildClientProfilePath, buildNewClientPath, buildModulePath, buildRequestDetailPath, buildWorkspaceSwitchPath, createMenuPresentation, isDismissKey, NEXOPS_MODULES, parseNexOpsLocation, type ClientProfileTab, type NexOpsCreateOption, type NexOpsModule } from "./domain/nexopsNavigation";
import type { ClientProfileMobileBucket } from "../../features/clients/components/contact/domain/clientProfile";
import { getMobileCreateFabScrollIntent, mobileFabShouldHideOverlays, mobileFabVisibleForViewport, NEXOPS_MOBILE_CREATE_FAB_IDLE_MS, NEXOPS_MOBILE_CREATE_FAB_PULSE_KEY, NexOpsMobileCreateFab, shouldPulseMobileCreateFab } from "./components/NexOpsMobileCreateFab";
import { ContactRoster } from "../clients/components/contact/ContactRoster";
import { ContactEditorSurface } from "../clients/components/contact/ContactEditorSurface";
import { ClientDetailsSurface } from "../clients/components/clientDetails/ClientDetailsSurface";
import { NexOpsCreateClientPanel } from "../clients/components/contact/NexOpsCreateClientPanel";
import "../clients/components/contact/contact.css";
import { signOutOperator } from "../../shared/auth/authBootstrap";
import { ApprovalQueuePanel } from "../approvalQueue/areas/queue/components/ApprovalQueuePanel";
import { loadOperatorContext, type ResolvedOperatorContext } from "../operatorContext/resolveOperatorContext";
import { useNexOpsCaptureController } from "../nexcam/areas/capture/hooks/useNexOpsCaptureController";
import { useNexOpsNotifications } from "./hooks/useNexOpsNotifications";
import { useNexOpsWorkspaceRecords } from "./hooks/useNexOpsWorkspaceRecords";
import { useClientDetailsRails } from "../clients/components/clientDetails/hooks/useClientDetailsRails";
import { useContactWorkspaceModel } from "../clients/components/contact/hooks/useContactWorkspaceModel";
import { NexOpsCaptureModule } from "../nexcam/areas/capture/components/NexOpsCaptureModule";

const NexOpsHomePage = React.lazy(async () => ({ default: (await import("../home/components/operationsHome/NexOpsHomePage")).NexOpsHomePage }));
const NexOpsInvoicesPage = React.lazy(async () => ({ default: (await import("../../features/invoices/components/invoiceStructure/NexOpsInvoicesPage")).NexOpsInvoicesPage }));
const NexOpsJobsPage = React.lazy(async () => ({ default: (await import("../../features/jobs/components/jobCore/NexOpsJobsPage")).NexOpsJobsPage }));
const NexOpsPatternLibraryPage = React.lazy(async () => ({ default: (await import("./components/NexOpsPatternLibraryPage")).NexOpsPatternLibraryPage }));
const NexOpsQuotesPage = React.lazy(async () => ({ default: (await import("../../features/quotes/components/quoteEngine/NexOpsQuotesPage")).NexOpsQuotesPage }));
const NexOpsRequestsPage = React.lazy(async () => ({ default: (await import("../requests/components/requestCore/NexOpsRequestsPage")).NexOpsRequestsPage }));
const NexOpsSchedulePage = React.lazy(async () => ({ default: (await import("../../features/visits/components/visitCore/NexOpsSchedulePage")).NexOpsSchedulePage }));
const NexOpsSettingsPage = React.lazy(async () => ({ default: (await import("../../features/settings/components/tenantConfig/NexOpsSettingsPage")).NexOpsSettingsPage }));
const UsersSurface = React.lazy(async () => ({ default: (await import("../../features/users/components/UsersSurface")).UsersSurface }));


import type { OperatorContext, TenantBranding, TenantBrandingResponse, ScheduleScope, WorkspaceTarget } from "./contracts/workspaceContracts";
import { formatPhoneDisplay, personDisplayName, clientDisplayName, clientContactDisplayName, clientPrimaryAddress, clientStatusLabel, contactSummary, NexOpsNavGlyph, MobileClientSummaryGlyph, MobileClientEditGlyph, MOBILE_CLIENT_VIEWPORT_MAX } from "./workspaceSupport";
import { resolveClientScopedCreateId } from "./clientCreateHandoff";
export type * from "./contracts/workspaceContracts";
export * from "./workspaceSupport";

export function NexOpsWorkspace(props: { auth: Auth | null; user: User }): React.ReactElement {
  const [accessState, setAccessState] = useState<
    { status: "loading" }
    | { status: "ready"; context: ResolvedOperatorContext }
    | { status: "denied"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadOperatorContext(props.user)
      .then((context) => {
        if (!cancelled) setAccessState({ status: "ready", context });
      })
      .catch((error: unknown) => {
        if (!cancelled) setAccessState({
          status: "denied",
          message: error instanceof Error ? error.message : "Your active NexOps membership could not be verified."
        });
      });
    return () => {
      cancelled = true;
    };
  }, [props.user]);

  if (accessState.status === "loading") {
    return <main className="nexops-app-shell"><section className="nexops-module-card"><p className="eyebrow">NexOps</p><h1>Verifying access</h1><p>Checking your active workspace membership.</p></section></main>;
  }
  if (accessState.status === "denied") {
    return <main className="nexops-app-shell"><section className="nexops-module-card"><p className="eyebrow">NexOps access denied</p><h1>Workspace unavailable</h1><p>{accessState.message}</p><button type="button" onClick={() => void signOutOperator(props.auth)}>Sign out</button><button type="button" onClick={() => void signOutOperator(props.auth, "/nexcommand/sign-in")}>Open NexCommand</button></section></main>;
  }
  return <NexOpsWorkspaceContent {...props} operatorContext={accessState.context} />;
}

function NexOpsWorkspaceContent(props: { auth: Auth | null; user: User; operatorContext: ResolvedOperatorContext }): React.ReactElement {
  const profileName = operatorProfileName(props.user);
  const profileFullName = operatorProfileFullName(props.user);
  const profileInitials = operatorProfileInitials(profileName);
  const initialPathState = parseNexOpsLocation(window.location.pathname);
  const operatorContext: OperatorContext = props.operatorContext;
  const [tenantBranding, setTenantBranding] = useState<TenantBranding | null>(null);
  const [query, setQuery] = useState("");
  const [selectedClientId, setSelectedClientId] = useState(initialPathState.clientId ?? "");
  const [activeClientProfileTab, setActiveClientProfileTab] = useState<ClientProfileTab | null>(initialPathState.clientTab);
  const {
    clients,
    properties,
    jobs,
    quotes,
    invoices,
    tenantUsers,
    requests,
    payments,
    receiptReviews,
    status,
    setClients,
    refresh
  } = useNexOpsWorkspaceRecords({
    tenantId: operatorContext.tenantId,
    activeClientProfileTab,
    setSelectedClientId
  });
  const [activeModule, setActiveModule] = useState<NexOpsModule>(initialPathState.module);
  const [catalogFocusNonce, setCatalogFocusNonce] = useState(0);
  const [settingsRouteNonce, setSettingsRouteNonce] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [focusedRequestId, setFocusedRequestId] = useState(initialPathState.requestId ?? "");
  const [focusedQuoteId, setFocusedQuoteId] = useState("");
  const [focusedJobId, setFocusedJobId] = useState("");
  const [focusedInvoiceId, setFocusedInvoiceId] = useState("");
  const [requestFilterIntent, setRequestFilterIntent] = useState<"all" | "new" | "archived" | "converted_to_quote" | "converted_to_job" | undefined>();
  const [quoteFilterIntent, setQuoteFilterIntent] = useState<"all" | "draft" | "sent" | "change_requested" | "approved" | "approved_pending_conversion" | "expired" | undefined>();
  const [jobFilterIntent, setJobFilterIntent] = useState<"All" | "Upcoming" | "Today" | "Late" | "Unscheduled" | "Action Required" | "Requires Invoicing" | "Archived" | undefined>();
  const [invoiceFilterIntent, setInvoiceFilterIntent] = useState<"all" | "draft" | "awaiting" | "partial_pay" | "paid" | "void" | "bad_debt" | "past_due" | undefined>();
  const [scheduleScopeIntent, setScheduleScopeIntent] = useState<ScheduleScope | undefined>();
  const [scheduleJobIntent, setScheduleJobIntent] = useState("");
  const [moduleSwitcherOpen, setModuleSwitcherOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createClientContextId, setCreateClientContextId] = useState("");
  const [resumeQuoteAfterClientCreate, setResumeQuoteAfterClientCreate] = useState(false);
  const [inlineQuoteClientCreateOpen, setInlineQuoteClientCreateOpen] = useState(false);
  const [inlineQuoteCreatedClientId, setInlineQuoteCreatedClientId] = useState("");
  const [mobileCreateFabCollapsed, setMobileCreateFabCollapsed] = useState(false);
  const [mobileCreateFabPulse, setMobileCreateFabPulse] = useState(false);
  const [creatingClientPage, setCreatingClientPage] = useState(initialPathState.clientDraft === "new");
  const [csvStatus, setCsvStatus] = useState("No CSV selected yet.");
  const [mobileClientViewport, setMobileClientViewport] = useState(() => typeof window !== "undefined" && window.innerWidth <= MOBILE_CLIENT_VIEWPORT_MAX);
  const [mobileClientExpandedBucket, setMobileClientExpandedBucket] = useState<ClientProfileMobileBucket | null>(null);
  function emitCrmMutation(): void {
    window.dispatchEvent(new Event("nexops:crm-mutated"));
  }

  const {
    clientPortalActivity,
    clientReviewSequences,
    clientFieldReports,
    clientSignedDocuments,
    orderedClientFieldMedia,
    clientRailStatus,
    clientRailBusy,
    lastPortalLink,
    clientOverviewCustomFieldsDraft,
    setClientOverviewCustomFieldsDraft,
    clientOverviewCustomFieldsOpen,
    setClientOverviewCustomFieldsOpen,
    clientOverviewCustomFieldValidation,
    refreshClientRails,
    sendClientPortalLink,
    sendClientStatement,
    deleteClientRecord,
    saveClientMarketingConsent,
    saveClientOverviewCustomFields
  } = useClientDetailsRails({
    tenantId: operatorContext.tenantId,
    selectedClientId,
    clients,
    setClients,
    onReturnToRoster: returnToClientRoster,
    onRefreshAll: refresh,
    onMutation: emitCrmMutation
  });

  const captureController = useNexOpsCaptureController({
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
    captureSession,
    captureRequestIntent,
    setCaptureWorkspaceView,
    startCaptureSession,
    openCaptureWorkspace,
    handleCaptureRequestCreated
  } = captureController;

  const {
    notificationsOpen,
    notifications,
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

  function setModule(module: NexOpsModule): void {
    const targetPath = buildModulePath(module);
    clearWorkspaceTargets();
    clearWorkspaceFilters();
    closeHeaderPanels();
    setCreateClientContextId("");
    setCreatingClientPage(false);
    setActiveModule(module);
    if (module !== "clients") {
      setActiveClientProfileTab(null);
    }
    window.history.pushState({}, "", targetPath);
    if (module === "settings") {
      setSettingsRouteNonce((current) => current + 1);
    }
  }

  function openClientProfile(clientId: string, tab: ClientProfileTab = "overview"): void {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    clearWorkspaceTargets();
    clearWorkspaceFilters();
    closeHeaderPanels();
    setCreatingClientPage(false);
    contactForm.closeDrawer();
    setSelectedClientId(clientId);
    setActiveModule("clients");
    setActiveClientProfileTab(tab);
    window.history.pushState({}, "", buildClientProfilePath(clientId, tab));
  }

  function returnToClientRoster(): void {
    closeHeaderPanels();
    setCreatingClientPage(false);
    contactForm.closeDrawer();
    contactForm.resetForm();
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
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    clearWorkspaceTargets();
    clearWorkspaceFilters();
    closeHeaderPanels();
    setCreatingClientPage(true);
    contactForm.openCreate("client");
    setSelectedClientId("");
    setActiveModule("clients");
    setActiveClientProfileTab(null);
    window.history.pushState({}, "", buildNewClientPath());
  }

  function openCreateClientDrawer(surface: "client" | "contact" | "property" = "client"): void {
    closeHeaderPanels();
    contactForm.openCreate(surface, true);
  }

  function closeCreateClientDrawer(): void {
    setResumeQuoteAfterClientCreate(false);
    contactForm.closeDrawer();
  }

  function openEditClientWorkspace(): void {
    if (!selectedClient) {
      return;
    }
    clearWorkspaceTargets();
    clearWorkspaceFilters();
    closeHeaderPanels();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    if (!contactForm.openEdit()) {
      return;
    }
    setCreatingClientPage(true);
    setActiveModule("clients");
  }

  function closeClientFormWorkspace(): void {
    if (contactForm.clientFormMode === "edit" && selectedClientId) {
      contactForm.resetForm();
      openClientProfile(selectedClientId, activeClientProfileTab ?? "overview");
      return;
    }
    contactForm.resetForm();
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
      if (selectedClient && activeClientProfileTab && (option.workflow.surface === "contact" || option.workflow.surface === "property")) {
        openEditClientWorkspace();
        return;
      }
      openCreateClientDrawer(option.workflow.surface);
      return;
    }
    closeHeaderPanels();
    setModule(option.workflow.module);
    if (selectedClient && (option.workflow.module === "requests" || option.workflow.module === "quotes" || option.workflow.module === "jobs" || option.workflow.module === "invoices" || option.workflow.module === "payments")) {
      setCreateClientContextId(resolveClientScopedCreateId(selectedClient.id, clients.map((client) => client.id)));
    }
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
        window.history.pushState({}, "", target.objectId ? buildRequestDetailPath(target.objectId) : "/nexops/requests");
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
    const onPopState = () => {
      const nextLocation = parseNexOpsLocation(window.location.pathname);
      if (nextLocation.clientId) {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
      setActiveModule(nextLocation.module);
      setActiveClientProfileTab(nextLocation.clientTab);
      setCreatingClientPage(nextLocation.clientDraft === "new");
      setSelectedClientId(nextLocation.clientId ?? "");
      setFocusedRequestId(nextLocation.requestId ?? "");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const tenantName = tenantDisplayName(tenantBranding, operatorContext.tenantId);
  const {
    activeCount,
    contactForm,
    filteredClients,
    leadCount,
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
    textReadyCount
  } = useContactWorkspaceModel({
    tenantId: operatorContext.tenantId,
    clients,
    properties,
    jobs,
    quotes,
    invoices,
    payments,
    receiptReviews,
    requests,
    query,
    selectedClientId,
    refresh,
    onSaved: (clientId) => {
      if (inlineQuoteClientCreateOpen) {
        setInlineQuoteClientCreateOpen(false);
        setInlineQuoteCreatedClientId(clientId);
        return;
      }
      if (resumeQuoteAfterClientCreate) {
        setResumeQuoteAfterClientCreate(false);
        setCreateClientContextId(clientId);
        setCreatingClientPage(false);
        setActiveClientProfileTab(null);
        setActiveModule("quotes");
        window.history.pushState({}, "", buildModulePath("quotes"));
        return;
      }
      setCreatingClientPage(false);
      openClientProfile(clientId, "overview");
    },
    setClientOverviewCustomFieldsDraft,
    setClientOverviewCustomFieldsOpen,
    setMobileClientExpandedBucket
  });
  const {
    showCreateClient,
    clientFormMode,
    createClientSurface,
    createStatus,
    newClient,
    setNewClient,
    createClientCanSave,
    createClientMissingFields,
    leadSourceOptions,
    submit: createClientFromForm
  } = contactForm;
  const moduleTitle = NEXOPS_MODULES.find((module) => module.id === activeModule)?.label ?? "NexOps";

  function renderHome(): React.ReactElement {
    return <NexOpsHomePage tenantId={operatorContext.tenantId} operatorName={profileName} onOpenTarget={openWorkspaceTarget} />;
  }

  function renderClients(options?: { compact?: boolean }): React.ReactElement {
    if (creatingClientPage && !options?.compact) {
      return renderNewClientWorkspace();
    }
    if (activeClientProfileTab && !options?.compact) {
      return <ClientDetailsSurface bindings={{
        activeClientProfileTab,
        clientContactDisplayName,
        clientDisplayName,
        clientFieldMedia: orderedClientFieldMedia,
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
    return <NexOpsCaptureModule
      tenantId={operatorContext.tenantId}
      clients={clients}
      controller={captureController}
      clientDisplayName={clientDisplayName}
      clientPrimaryAddress={clientPrimaryAddress}
      contactSummary={contactSummary}
    />;
  }

  function renderSettings(): React.ReactElement {
    return (
      <NexOpsSettingsPage
        tenantId={operatorContext.tenantId}
        tenantName={tenantName}
        role={operatorContext.role}
        tenantUsers={tenantUsers}
        catalogFocusNonce={catalogFocusNonce}
        settingsRouteNonce={settingsRouteNonce}
        onOpenCatalog={() => {
          window.history.pushState({}, "", "/nexops/settings/products-services");
          setCatalogFocusNonce((current) => current + 1);
        }}
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
          onClose={closeCreateClientDrawer}
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
          onOpenRequest={(requestId) => {
            clearWorkspaceTargets();
            setFocusedRequestId(requestId);
            window.history.pushState({}, "", buildRequestDetailPath(requestId));
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
          }}
          onReturnToRequestRoster={() => {
            setFocusedRequestId("");
            window.history.pushState({}, "", buildModulePath("requests"));
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
          }}
          onScheduleAssessment={(jobId) => {
            clearWorkspaceTargets();
            setScheduleJobIntent(jobId);
            setActiveModule("schedule");
            window.history.pushState({}, "", "/nexops/schedule");
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
          }}
          initialClientId={createClientContextId || undefined}
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
          properties={properties}
          tenantUsers={tenantUsers}
          focusedQuoteId={focusedQuoteId}
          initialClientId={createClientContextId || undefined}
          initialFilter={quoteFilterIntent}
          inlineClientCreateForm={inlineQuoteClientCreateOpen ? <NexOpsCreateClientPanel
            tenantId={operatorContext.tenantId}
            newClient={newClient}
            setNewClient={setNewClient}
            createStatus={createStatus}
            createClientCanSave={createClientCanSave}
            createClientMissingFields={createClientMissingFields}
            leadSourceOptions={leadSourceOptions}
            layout="page"
            mobile={mobileClientViewport}
            onClose={() => {
              contactForm.resetForm();
              setInlineQuoteClientCreateOpen(false);
            }}
            onSubmit={createClientFromForm}
          /> : null}
          onOpenInlineClientCreate={() => {
            contactForm.openCreate("client");
            setInlineQuoteClientCreateOpen(true);
          }}
          inlineCreatedClientId={inlineQuoteCreatedClientId || undefined}
          onInlineCreatedClientHandled={() => setInlineQuoteCreatedClientId("")}
          onCreateClientRequested={() => {
            setResumeQuoteAfterClientCreate(true);
            openCreateClientDrawer("client");
          }}
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
          tenantUsers={tenantUsers}
          properties={properties}
          onCrmMutation={() => window.dispatchEvent(new Event("nexops:crm-mutated"))}
          onOpenInvoice={openInvoiceWorkspace}
          focusedJobId={focusedJobId}
          initialClientId={createClientContextId || undefined}
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
          initialClientId={createClientContextId || undefined}
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
          initialJobId={scheduleJobIntent || undefined}
          onInitialJobHandled={() => setScheduleJobIntent("")}
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
    if (activeModule === "users") {
      return <Suspense fallback={<div className="nexops-embedded-panel"><section className="nexops-module-card"><p className="eyebrow">Loading</p><h2>Opening your profile</h2><p>Preparing your people workspace.</p></section></div>}><UsersSurface initialView="own-profile" tenantId={operatorContext.tenantId} getAccessToken={() => props.user.getIdToken()} signedInUser={{ id: operatorContext.tenantUserId, name: profileFullName, email: props.user.email ?? "", initials: profileInitials, avatarUrl: props.user.photoURL ?? undefined, role: operatorContext.role === "OWNER" ? "Owner" : operatorContext.role === "OFFICE_ADMIN" ? "Office Admin" : "Technician" }} /></Suspense>;
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

  const sidebarModuleItem = (id: NexOpsModule): NexSuiteSidebarItem => {
    const entry = NEXOPS_MODULES.find((item) => item.id === id);
    return { id, label: entry?.label ?? id, icon: <NexOpsNavGlyph module={id} />, active: id === activeModule, onSelect: () => setModule(id) };
  };

  const nexOpsSidebarItems: NexSuiteSidebarItem[] = [
    sidebarModuleItem("home"),
    sidebarModuleItem("clients"),
    sidebarModuleItem("requests"),
    sidebarModuleItem("quotes"),
    sidebarModuleItem("jobs"),
    sidebarModuleItem("schedule"),
    { id: "capture", label: "NexCam", icon: <NexOpsNavGlyph module="capture" />, active: activeModule === "capture", onSelect: () => { if (captureSession) { openCaptureWorkspace("session"); return; } void startCaptureSession(); } },
    { id: "billing", label: "Billing", icon: <NexOpsNavGlyph module="invoices" />, children: [sidebarModuleItem("invoices"), sidebarModuleItem("payments")] },
    sidebarModuleItem("approvals"),
    { id: "admin-tools", label: "Admin / Tools", icon: "⌘", children: [sidebarModuleItem("imports")] },
    { id: "settings", label: "Settings", icon: <NexOpsNavGlyph module="settings" />, active: activeModule === "settings", onSelect: () => { closeHeaderPanels(); setModule("settings"); } }
  ];

  const nexOpsDesktopSidebarHeader = <NexSuiteHeader product="nexops" presentation="sidebar" menuOpen={false} onToggleMenu={() => undefined} onSignOut={() => void signOutOperator(props.auth)} />;

  return (
      <NexTeamApplicationShell className="nexops-app" navigationLabel="NexOps navigation" navigation={<NexSuiteSidebar items={nexOpsSidebarItems} header={nexOpsDesktopSidebarHeader} />}>

      <section className="nexops-web-main">
        <NexSuiteHeader product="nexops" menuOpen={mobileNavOpen} onToggleMenu={() => setMobileNavOpen((current) => !current)} onSignOut={() => void signOutOperator(props.auth)} />
        {mobileNavOpen ? <NexSuiteSidebar id="nexops-mobile-nav" items={nexOpsSidebarItems} open onClose={() => setMobileNavOpen(false)} onSelect={() => setMobileNavOpen(false)} /> : null}
        <NexOpsMobileCreateFab
          collapsed={mobileCreateFabCollapsed}
          expanded={createMenuOpen}
          hidden={mobileFabShouldHideOverlays({ mobileNavOpen, notificationsOpen, moduleSwitcherOpen }) || creatingClientPage || showCreateClient}
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
      </NexTeamApplicationShell>
  );
}

function operatorProfileName(user: User): string {
  return operatorProfileFullName(user).split(/\s+/)[0] || "Operator";
}

function operatorProfileFullName(user: User): string {
  const displayName = user.displayName?.trim();
  if (displayName) {
    return displayName;
  }
  const emailName = user.email?.split("@", 1)[0]?.replace(/[._-]+/g, " ").trim();
  return emailName ? emailName.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Operator";
}

function operatorProfileInitials(name: string): string {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return initials || "O";
}
