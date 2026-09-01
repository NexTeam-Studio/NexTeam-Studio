export type NexOpsModule =
  | "home"
  | "clients"
  | "requests"
  | "quotes"
  | "schedule"
  | "jobs"
  | "invoices"
  | "payments"
  | "imports"
  | "approvals"
  | "users"
  | "settings"
  | "patterns"
  | "capture";

export type ClientProfileTab =
  | "overview"
  | "requests"
  | "quotes"
  | "jobs"
  | "invoices"
  | "payments"
  | "properties"
  | "contacts"
  | "notes"
  | "nexdocs"
  | "nexcam"
  | "nexreach"
  | "portal";

export type NexTeamWorkspaceProduct =
  | "nexops"
  | "nexcam"
  | "nexdocs"
  | "nexportal"
  | "nexreach";

export interface NexOpsModuleEntry {
  id: NexOpsModule;
  label: string;
  path: string;
  hidden?: boolean;
}

export interface NexOpsCreateOption {
  id: "client" | "request" | "quote" | "job" | "invoice" | "payment" | "task" | "property" | "contact";
  label: string;
  detail: string;
  workflow:
    | { kind: "client-page" }
    | { kind: "drawer"; surface: "contact" | "property" }
    | { kind: "module"; module: NexOpsModule; intent?: "create" | "task" | "property" | "contact" };
}

export interface NexTeamWorkspaceOption {
  id: NexTeamWorkspaceProduct;
  label: string;
  detail: string;
}

export const NEXOPS_MODULES: NexOpsModuleEntry[] = [
  { id: "home", label: "Home", path: "/nexops" },
  { id: "clients", label: "Clients", path: "/nexops/clients" },
  { id: "requests", label: "Requests", path: "/nexops/requests" },
  { id: "quotes", label: "Quotes", path: "/nexops/quotes" },
  { id: "schedule", label: "Schedule", path: "/nexops/schedule" },
  { id: "jobs", label: "Jobs", path: "/nexops/jobs" },
  { id: "invoices", label: "Invoices", path: "/nexops/invoices" },
  { id: "payments", label: "Payments", path: "/nexops/payments" },
  { id: "imports", label: "Import & Sync", path: "/nexops/imports" },
  { id: "approvals", label: "Approvals", path: "/nexops/approvals" },
  { id: "users", label: "Team & roles", path: "/nexops/users", hidden: true },
  { id: "capture", label: "Capture", path: "/nexops/capture", hidden: true },
  { id: "settings", label: "Settings", path: "/nexops/settings", hidden: true },
  { id: "patterns", label: "Patterns", path: "/nexops/patterns", hidden: true }
];

export const NEXOPS_MOBILE_NAV_GROUPS: Array<{ title: string; items: NexOpsModule[] }> = [
  { title: "Core", items: ["home", "clients", "requests", "quotes", "schedule", "jobs"] },
  { title: "Money", items: ["invoices", "payments"] },
  { title: "Office", items: ["imports", "approvals"] }
];

export const CLIENT_PROFILE_TABS: Array<{ id: ClientProfileTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "requests", label: "Requests" },
  { id: "quotes", label: "Quotes" },
  { id: "jobs", label: "Jobs & Visits" },
  { id: "invoices", label: "Invoices" },
  { id: "payments", label: "Payments" },
  { id: "properties", label: "Properties" },
  { id: "contacts", label: "Contacts" },
  { id: "notes", label: "Notes & Communications" },
  { id: "nexdocs", label: "NexDocs" },
  { id: "nexcam", label: "NexCam" },
  { id: "nexreach", label: "NexReach" },
  { id: "portal", label: "Client Portal Activity" }
];

export const NEXTEAM_WORKSPACE_OPTIONS: NexTeamWorkspaceOption[] = [
  {
    id: "nexops",
    label: "NexOps",
    detail: "Office command center for requests, quotes, jobs, billing, and client history."
  },
  {
    id: "nexcam",
    label: "NexCam",
    detail: "Field capture, photo markup, and media routing without leaving the tenant rail."
  },
  {
    id: "nexdocs",
    label: "NexDocs",
    detail: "Client document libraries, statements, uploads, and portal-visible files."
  },
  {
    id: "nexportal",
    label: "NexPortal",
    detail: "Client-facing portal for approvals, invoices, appointments, and shared files."
  },
  {
    id: "nexreach",
    label: "NexReach",
    detail: "Marketing, reviews, and follow-up campaigns tied back to real client records."
  }
];

export const NEXOPS_CREATE_OPTIONS: NexOpsCreateOption[] = [
  {
    id: "client",
    label: "Client",
    detail: "Add a parent client record with billing and communication defaults.",
    workflow: { kind: "client-page" }
  },
  {
    id: "request",
    label: "Request",
    detail: "Capture a new service request and route it onto the native intake rail.",
    workflow: { kind: "module", module: "requests", intent: "create" }
  },
  {
    id: "quote",
    label: "Quote",
    detail: "Open the quote composer with delivery, approval, and deposit controls.",
    workflow: { kind: "module", module: "quotes", intent: "create" }
  },
  {
    id: "job",
    label: "Job",
    detail: "Create a manual job without forcing a request or quote first.",
    workflow: { kind: "module", module: "jobs", intent: "create" }
  },
  {
    id: "invoice",
    label: "Invoice",
    detail: "Start an invoice or combine ready work waiting on billing.",
    workflow: { kind: "module", module: "invoices", intent: "create" }
  },
  {
    id: "payment",
    label: "Payment",
    detail: "Open the money rail to collect, review, or reconcile payment activity.",
    workflow: { kind: "module", module: "payments", intent: "create" }
  },
  {
    id: "task",
    label: "Task",
    detail: "Start a follow-up task draft tied to a real operations record.",
    workflow: { kind: "module", module: "requests", intent: "task" }
  },
  {
    id: "property",
    label: "Property",
    detail: "Add a new site or service address under a client record.",
    workflow: { kind: "drawer", surface: "property" }
  },
  {
    id: "contact",
    label: "Contact",
    detail: "Add a client-level or property-level contact without leaving the CRM rail.",
    workflow: { kind: "drawer", surface: "contact" }
  }
];

export function buildModulePath(module: NexOpsModule): string {
  return NEXOPS_MODULES.find((entry) => entry.id === module)?.path ?? "/nexops";
}

export function nexOpsModuleFromPath(pathname: string): NexOpsModule {
  const exact = NEXOPS_MODULES.find((module) => pathname === module.path);
  if (exact) {
    return exact.id;
  }
  const nested = [...NEXOPS_MODULES]
    .sort((left, right) => right.path.length - left.path.length)
    .find((module) => pathname.startsWith(`${module.path}/`));
  return nested?.id ?? "home";
}

export function normalizeClientProfileTab(value: string | undefined): ClientProfileTab {
  const candidate = value?.trim().toLowerCase();
  return CLIENT_PROFILE_TABS.find((tab) => tab.id === candidate)?.id ?? "overview";
}

export function buildClientProfilePath(clientId: string, tab: ClientProfileTab = "overview"): string {
  const encodedClientId = encodeURIComponent(clientId);
  return tab === "overview"
    ? `/nexops/clients/${encodedClientId}`
    : `/nexops/clients/${encodedClientId}/${tab}`;
}

export function buildNewClientPath(): string {
  return "/nexops/clients/new";
}

export function buildRequestDetailPath(requestId: string): string {
  return `/nexops/requests/${encodeURIComponent(requestId)}`;
}

export function buildWorkspaceSwitchPath(
  product: NexTeamWorkspaceProduct,
  tenantId: string,
  selectedClientId?: string | null
): string {
  switch (product) {
    case "nexcam":
      return "/nexcam";
    case "nexdocs":
      return selectedClientId
        ? buildClientProfilePath(selectedClientId, "nexdocs")
        : "/nexops/clients";
    case "nexportal":
      return `/nexportal?tenantId=${encodeURIComponent(tenantId)}`;
    case "nexreach":
      return "/nexreach";
    case "nexops":
    default:
      return "/nexops";
  }
}

export function parseClientProfilePath(pathname: string): { clientId: string; tab: ClientProfileTab } | null {
  if (/^\/nexops\/clients\/new\/?$/i.test(pathname)) {
    return null;
  }
  const match = pathname.match(/^\/nexops\/clients\/([^/]+)(?:\/([^/]+))?\/?$/i);
  if (!match?.[1]) {
    return null;
  }
  return {
    clientId: decodeURIComponent(match[1]),
    tab: normalizeClientProfileTab(match[2])
  };
}

export function parseNexOpsLocation(pathname: string): {
  module: NexOpsModule;
  clientId: string | null;
  clientTab: ClientProfileTab | null;
  clientDraft: "new" | null;
  requestId: string | null;
} {
  const requestMatch = pathname.match(/^\/nexops\/requests\/([^/]+)\/?$/i);
  if (requestMatch?.[1]) {
    return {
      module: "requests",
      clientId: null,
      clientTab: null,
      clientDraft: null,
      requestId: decodeURIComponent(requestMatch[1])
    };
  }
  if (/^\/nexops\/clients\/new\/?$/i.test(pathname)) {
    return {
      module: "clients",
      clientId: null,
      clientTab: null,
      clientDraft: "new",
      requestId: null
    };
  }
  const clientProfile = parseClientProfilePath(pathname);
  return {
    module: nexOpsModuleFromPath(pathname),
    clientId: clientProfile?.clientId ?? null,
    clientTab: clientProfile?.tab ?? null,
    clientDraft: null,
    requestId: null
  };
}

export function createMenuPresentation(viewportWidth: number): "flyout" | "sheet" {
  return viewportWidth <= 960 ? "sheet" : "flyout";
}

export function isDismissKey(key: string): boolean {
  return key === "Escape";
}
