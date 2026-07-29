import React, { Suspense, useEffect, useState } from "react";
import { type Auth, type User } from "firebase/auth";
import { PlatformMark, ProductLogo, SidebarBrandStack, TenantBrandMark, hasTenantLogo, tenantDisplayName } from "../../shared/branding/ProductBranding";
import { NexOpsSharedMobileBar, NexOpsSharedWebTopbar } from "./components/NexOpsHeader";
import { NexTeamApplicationShell } from "../../shared/ui/NexTeamApplicationShell";
import { NexOpsCreateMenu } from "./components/NexOpsCreateMenu";
import { NexOpsNotificationPanel } from "./components/NexOpsNotificationPanel";
import { NexOpsImportPage } from "./components/NexOpsImportPage";
import { NexOpsLegacyLifecyclePage } from "./components/NexOpsLegacyLifecyclePage";
import { NexOpsModuleSwitcher } from "./components/NexOpsModuleSwitcher";

import { buildClientProfilePath, buildNewClientPath, buildModulePath, buildWorkspaceSwitchPath, createMenuPresentation, isDismissKey, NEXOPS_MOBILE_NAV_GROUPS, NEXOPS_MODULES, parseNexOpsLocation, type ClientProfileTab, type NexOpsCreateOption, type NexOpsModule } from "./domain/nexopsNavigation";
import type { ClientProfileMobileBucket } from "../../features/clients/components/contact/domain/clientProfile";
import { getMobileCreateFabScrollIntent, mobileFabShouldHideOverlays, mobileFabVisibleForViewport, NEXOPS_MOBILE_CREATE_FAB_IDLE_MS, NEXOPS_MOBILE_CREATE_FAB_PULSE_KEY, NEXOPS_SHARED_CREATE_MENU_ID, NexOpsMobileCreateFab, shouldPulseMobileCreateFab } from "./components/NexOpsMobileCreateFab";
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
  const [catalogFocusNonce, setCatalogFocusNonce] = useState(() => window.location.pathname === "/nexops/settings/products-services" ? 1 : 0);
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
  const [createClientContextId, setCreateClientContextId] = useState("");
  const [resumeQuoteAfterClientCreate, setResumeQuoteAfterClientCreate] = useState(false);
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
    setCreateClientContextId("");
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
    contactForm.closeDrawer();
    setSelectedClientId("");
    setActiveClientProfileTab(null);
    setActiveModule("home");
    window.history.pushState({}, "", buildModulePath("home"));
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

  function renderHome(): React.ReactElement {
    return <NexOpsHomePage tenantId={operatorContext.tenantId} onOpenTarget={openWorkspaceTarget} />;
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
      return <Suspense fallback={<div className="nexops-embedded-panel"><section className="nexops-module-card"><p className="eyebrow">Loading</p><h2>Opening your team</h2><p>Preparing your people workspace.</p></section></div>}><UsersSurface initialView="team" tenantId={operatorContext.tenantId} getAccessToken={() => props.user.getIdToken()} signedInUser={{ id: operatorContext.tenantUserId, name: profileFullName, email: props.user.email ?? "", initials: profileInitials, avatarUrl: props.user.photoURL ?? undefined, role: operatorContext.role === "OWNER" ? "Owner" : operatorContext.role === "OFFICE_ADMIN" ? "Office Admin" : "Technician" }} /></Suspense>;
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

  function renderWebTopbar(): React.ReactElement {
    return (
      <NexOpsSharedWebTopbar
        tenantBranding={tenantBranding}
        tenantId={operatorContext.tenantId}
        moduleTitle={moduleTitle}
        moduleSwitcherOpen={moduleSwitcherOpen}
        onToggleModuleSwitcher={toggleModuleSwitcher}
        accountTools={(
          <>
            <button className="nexops-web-icon-button" type="button" aria-label="Open camera capture" onClick={() => {
              if (captureSession) {
                openCaptureWorkspace("session");
                return;
              }
              void startCaptureSession();
            }}>
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
    );
  }

  return (
      <NexTeamApplicationShell className="nexops-app" navigationLabel="NexOps navigation" header={renderWebTopbar()} navigation={<div className="nexops-app-sidebar">
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
        <button className="nexops-sidebar-sign-out" type="button" onClick={() => void signOutOperator(props.auth)}>Sign out</button>
        </div>}>

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
                <div className="nexops-mobile-nav-product-lockup">
                  <PlatformMark className="nexops-mobile-platform-mark" alt="NexTeam" />
                  <ProductLogo product="nexops" className="nexops-mobile-product-logo" alt="NexOps" />
                 </div>
                 <div className="nexops-mobile-nav-tenant-slot">
                   <TenantBrandMark branding={tenantBranding} tenantId={operatorContext.tenantId} className="nexops-mobile-tenant-mark" />
                 </div>
                <button className="nexops-mobile-close-button" type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}>
                  <span aria-hidden="true">×</span>
                </button>
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
                <button className="nexops-mobile-profile-button" type="button" onClick={() => setModule("users")} aria-label={`Open ${profileName}'s profile`}>
                  <span className="nexops-mobile-profile-avatar" aria-hidden="true">{profileInitials}</span>
                  <span className="nexops-mobile-profile-copy">
                    <strong>{profileName}</strong>
                    <span>View profile</span>
                  </span>
                </button>
                <button className="nexops-mobile-footer-sign-out" type="button" onClick={() => void signOutOperator(props.auth)}>
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                    <path d="M12 4.5h2a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 14 15.5h-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M9 13.5 12.5 10 9 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M12 10H4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  <span>Sign out</span>
                </button>
              </div>
            </aside>
          </div>
        ) : null}
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
