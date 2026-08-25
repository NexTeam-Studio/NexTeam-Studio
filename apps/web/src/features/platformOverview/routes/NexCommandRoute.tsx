import React, { useEffect, useMemo, useState } from "react";
import { useAuthSession } from "../../../shared/auth/AuthSessionProvider";
import { PlatformMark } from "../../../shared/branding/ProductBranding";
import { NexCommandHeader } from "../../../shared/ui/NexCommandHeader";
import { NexTeamApplicationShell } from "../../../shared/ui/NexTeamApplicationShell";
import { TenantOverviewPanel } from "../../tenantOverview/components/TenantOverviewPanel";
import { useTenantOverview } from "../../tenantOverview/hooks/useTenantOverview";
import { PlatformProspectIntakePanel } from "../components/PlatformProspectIntakePanel";
import { PlatformSupportPanel } from "../components/PlatformSupportPanel";
import { PlatformLifecycleRecordsPanel } from "../components/PlatformLifecycleRecordsPanel";
import { PlatformSubscriptionCatalogPanel } from "../components/PlatformSubscriptionCatalogPanel";
import { PlatformMigrationsPanel } from "../components/PlatformMigrationsPanel";
import { PlatformSettingsPanel } from "../components/PlatformSettingsPanel";
import { NexCommandTenantProfilePanel } from "../components/NexCommandTenantProfilePanel";
import { PlatformTenantOnboardingPanel } from "../components/PlatformTenantOnboardingPanel";
import { nexCommandNavigation, type NexCommandArea } from "../components/NexCommandSidebar";
import { NexSuiteSidebar, type NexSuiteSidebarItem } from "../../../shared/ui/NexSuiteSidebar";
import { TemplatesRoster } from "../components/TemplatesRoster";
import { usePlatformPlans } from "../hooks/usePlatformPlans";
import { usePathname } from "../../../shared/router/usePathname";
import "../../tenantOverview/styles/tenantOverview.css";
import "../styles/nexCommand.css";

type Area = NexCommandArea;

const moduleDirectory = [
  ["NexOps", "Business operations workspace", "/nexops"], ["Nexi", "Tool-backed operating assistant", "/nexi"], ["Tenant onboarding", "Prospect, onboarding plan, subscription, and activation workflow", "/nexcommand?area=onboarding"], ["Settings", "Tenant configuration controls", "/platform/settings"], ["Authentication", "Platform and tenant access boundaries", "/nexcommand?area=security"], ["Integrations", "Configured provider health and quick access", "/nexcommand?area=integrations"], ["Global Control", "Build and verification coordination", "/nexcommand?area=system"], ["Code & System", "Build identity and diagnostic foundation", "/nexcommand?area=system"]
];

const providers = [
  ["Railway", "Staging deployment and runtime", "Staging", "https://railway.app"], ["Firebase", "Authentication and durable data", "Staging", "https://console.firebase.google.com"], ["Google Cloud", "Project and Firestore administration", "Staging", "https://console.cloud.google.com"], ["Stripe", "Subscription and payment provider", "Staging · Test Mode", "https://dashboard.stripe.com/test"], ["GitHub", "Source and review", "Shared", "https://github.com"], ["OpenAI", "Codex development tools", "Shared", "https://platform.openai.com"], ["Anthropic", "Configured AI provider", "Staging", "https://console.anthropic.com"], ["ElevenLabs", "Configured voice provider", "Staging", "https://elevenlabs.io"], ["InMotion", "Marketing-site hosting", "Production website only", "https://www.inmotionhosting.com"], ["Namecheap", "Domain administration", "Production domain only", "https://www.namecheap.com"]
];

function safeOperatorMessage(value: string): string { return value && !value.startsWith("Loading") ? "Data query needs attention. NexTeam has logged the issue." : ""; }

function areaFromLocation(): Area {
  const requested = new URLSearchParams(window.location.search).get("area");
  return nexCommandNavigation.some(([area]) => area === requested) ? requested as Area : "dashboard";
}

function liveStatusTone(state: string): "green" | "yellow" | "red" { return state === "COMPLETE" || state === "SUCCEEDED" || state === "IDLE" ? "green" : state === "FAILED" || state === "STALLED" || state === "BLOCKED" ? "red" : "yellow"; }

export function NexCommandRoute(): React.ReactElement {
  const { signOut, user } = useAuthSession();
  const pathname = usePathname();
  const [area, setArea] = useState<Area>(areaFromLocation);
  const [open, setOpen] = useState(false);
  const [liveState, setLiveState] = useState("COMPLETE");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(new URLSearchParams(window.location.search).get("tenant"));
  const { status: planStatus } = usePlatformPlans(user);
  const { rows, refresh: refreshTenantRoster, runBackup, runLifecycle, status: tenantStatus, workingTenant } = useTenantOverview(user);
  const issue = safeOperatorMessage(planStatus || tenantStatus);
  const summary = useMemo(() => ({ tenants: rows.length, active: rows.filter((row) => row.subscription?.status === "active").length }), [rows]);
  useEffect(() => { if (!user) return; const refresh = async () => { try { const token = await user.getIdToken(); const body = await fetch("/api/platform/admin/live-build-status", { headers: { authorization: `Bearer ${token}` } }).then((response) => response.json() as Promise<LiveBuildStatus>); setLiveState(body.controlState); } catch { setLiveState("FAILED"); } }; void refresh(); const timer = window.setInterval(() => void refresh(), 30_000); return () => window.clearInterval(timer); }, [user]);

  function selectArea(next: Area): void {
    window.history.pushState({}, "", `${pathname.startsWith("/platform") ? "/platform" : "/nexcommand"}?area=${next}`);
    setSelectedTenantId(null);
    setArea(next);
  }
  const nexCommandSidebarItems: NexSuiteSidebarItem[] = nexCommandNavigation.map(([key, label, icon]) => ({ id: key, label, icon, active: key === area, trailing: key === "live-status" ? <b className={`nexsuite-sidebar__status nexsuite-sidebar__status--${liveStatusTone(liveState)}`} aria-label={`Live build status: ${liveState}`} /> : undefined, onSelect: () => selectArea(key) }));

  return <NexTeamApplicationShell
    className="nexcommand"
    navigationLabel="NexCommand navigation"
    mobileNavigationMode="drawer"
    header={<NexCommandHeader menuOpen={open} onToggleMenu={() => setOpen((value) => !value)} onSignOut={() => void signOut()} />}
    navigation={<NexSuiteSidebar items={nexCommandSidebarItems} open={open} onClose={() => setOpen(false)} onSelect={() => setOpen(false)} />}
  ><section className="nexcommand__workspace"><section className="nexcommand__heading"><div><p className="ui-eyebrow">NexTeam internal operations</p><h1>{selectedTenantId ? "Tenant details" : nexCommandNavigation.find(([key]) => key === area)?.[1]}</h1><p>{user?.email ?? "Authorized NexTeam operator"}</p></div><span className="nexcommand__health">Staging connected</span></section>{issue ? <p className="nexcommand__notice">{issue}</p> : null}{selectedTenantId ? <NexCommandTenantProfilePanel user={user} tenantId={selectedTenantId} onBack={() => { void refreshTenantRoster(); window.history.pushState({}, "", "/nexcommand?area=tenants"); setArea("tenants"); setSelectedTenantId(null); }} /> : <NexCommandArea area={area} rows={rows} workingTenant={workingTenant} onRunBackup={runBackup} onRunLifecycle={runLifecycle} user={user} summary={summary} onViewTenant={(tenantId) => { window.history.pushState({}, "", `/nexcommand?area=tenants&tenant=${encodeURIComponent(tenantId)}`); setSelectedTenantId(tenantId); }} />}</section></NexTeamApplicationShell>;
}

function NexCommandArea(props: { area: Area; rows: ReturnType<typeof useTenantOverview>["rows"]; workingTenant: string; onRunBackup: ReturnType<typeof useTenantOverview>["runBackup"]; onRunLifecycle: ReturnType<typeof useTenantOverview>["runLifecycle"]; user: ReturnType<typeof useAuthSession>["user"]; summary: { tenants: number; active: number }; onViewTenant: (tenantId: string) => void }): React.ReactElement {
  if (props.area === "dashboard") return <><section className="nexcommand__metrics"><Metric label="Active tenants" value={String(props.summary.active)} /><Metric label="Tenant records" value={String(props.summary.tenants)} /><Metric label="Pilot package" value="$0.00" /><Metric label="Staging health" value="Connected" /></section><section className="nexcommand__panel"><h2>Operator overview</h2><p>Use NexCommand to manage verified tenant onboarding and platform operations. Metrics appear only when the platform provides the underlying data.</p><a href="/nexcommand?area=team">Open Team</a></section></>;
  if (props.area === "live-status") return <LiveBuildStatusPanel user={props.user} />;
  if (props.area === "team") return <PlatformSettingsPanel user={props.user} />;
  if (props.area === "tenants") return <section className="nexcommand__panel tenant-roster-panel"><div className="tenant-roster-panel__banner"><div><p className="ui-eyebrow">NexCommand tenant administration</p><h2>Tenant Roster</h2><p>Each tenant has one profile. View details to manage its business profile and review secure access.</p></div><span>{props.rows.length} Active Profiles</span></div><TenantOverviewPanel rows={props.rows} onViewDetails={props.onViewTenant} /></section>;
  if (props.area === "prospects") return <PlatformProspectIntakePanel user={props.user} />;
  if (props.area === "subscriptions") return <PlatformSubscriptionCatalogPanel user={props.user} />;
  if (props.area === "blueprints") return <PlatformLifecycleRecordsPanel user={props.user} mode="blueprints" />;
  if (props.area === "onboarding") return <PlatformTenantOnboardingPanel user={props.user} rows={props.rows} />;
  if (props.area === "migrations") return <PlatformMigrationsPanel user={props.user} />;
  if (props.area === "support") return <PlatformSupportPanel user={props.user} />;
  if (props.area === "modules") return <Directory title="Module directory" items={moduleDirectory} />;
  if (props.area === "templates") return <TemplatesRoster rosterId={new URLSearchParams(window.location.search).get("template")} />;
  if (props.area === "integrations") return <ProviderCredentialsPanel user={props.user} />;
  if (props.area === "system") return <section className="nexcommand__panel"><h2>Code &amp; System</h2><p>Current system identity, diagnostics, provider health, and green-gate evidence belong here. Embedded build controls are intentionally not enabled in this release.</p><dl className="nexcommand__facts"><div><dt>Staging</dt><dd>nexstage.nexteam.studio</dd></div><div><dt>Production</dt><dd>nexapp.nexteam.studio</dd></div><div><dt>Global Control</dt><dd>Local diagnostic access available to authorized operators.</dd></div></dl></section>;
  if (props.area === "security") return <section className="nexcommand__panel"><h2>Security &amp; audit</h2><p>NexCommand is for authorized NexTeam platform personnel. Tenant ownership alone does not grant NexCommand access. Provider credentials and tenant secrets remain masked.</p><p>Support access is not active. A future request-and-approval session will require tenant approval, explicit scope, a time limit, revocation, and audit history.</p></section>;
  if (props.area === "billing") return <StripeBillingPanel user={props.user} />;
  if (props.area === "settings") return <PlatformSettingsPanel user={props.user} />;
  return <section className="nexcommand__panel"><h2>{props.area === "releases" ? "Release Controls" : "Usage"}</h2><p>This area is prepared for the next authorized platform capability. It does not expose unverified data or production controls.</p></section>;
}

function Metric(props: { label: string; value: string }): React.ReactElement { return <article><span>{props.label}</span><strong>{props.value}</strong></article>; }
type LiveBuildStatus = {
  currentBuild: string | null; currentTask: string | null; actualState: "ACTIVE" | "IDLE"; controlState: "IDLE" | "QUEUED" | "DISPATCHED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED"; runId: string | null; pid: number | null;
  lastHeartbeat: string | null; progress: string | null; completedTasks: string[]; remainingTasks: string[]; blocker: string | null; lastActivity: string | null;
  noProgressWarning: boolean; noProgressSince: string | null; events: Array<{ id: string; type: string; at: string; detail: string | null }>;
  deploymentEvidence: { environment: "staging"; sourceSha: string; deploymentSha: string; liveSha: string; verifiedAt: string } | null;
};

function displayBuildValue(value: string | number | null): string { return value === null || value === "" ? "—" : String(value); }

function LiveBuildStatusPanel({ user }: { user: ReturnType<typeof useAuthSession>["user"] }): React.ReactElement {
  const [status, setStatus] = useState<LiveBuildStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!user) return;
    let live = true;
    const refresh = async (): Promise<void> => {
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/platform/admin/live-build-status", { headers: { authorization: `Bearer ${token}` } });
        const body = await response.json() as LiveBuildStatus;
        if (!live) return;
        setStatus(response.ok ? body : null);
        setUnavailable(!response.ok);
      } catch {
        if (live) { setStatus(null); setUnavailable(true); }
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => { live = false; window.clearInterval(interval); };
  }, [user]);
  const rows: Array<[string, string | number | null]> = status ? [
    ["Current Build", status.currentBuild], ["Current Task", status.currentTask], ["Actual State", status.actualState], ["Control State", status.controlState], ["Run ID", status.runId], ["PID", status.pid],
    ["Last Heartbeat", status.lastHeartbeat], ["Progress", status.progress], ["Completed Tasks", status.completedTasks.join(", ") || null], ["Remaining Tasks", status.remainingTasks.join(", ") || null], ["Blocker", status.blocker], ["Last Activity", status.lastActivity], ["No-progress warning", status.noProgressWarning ? `No progress since ${displayBuildValue(status.noProgressSince)}` : "None"]
  ] : [];
  return <section className="nexcommand__panel nexcommand__live-build"><p className="ui-eyebrow">NexCommand Live Build Status</p><h2>{unavailable ? "Unavailable" : status?.controlState ?? "Loading…"}</h2><p>Durable controller state, run records, event ledger, and live deployment evidence only. Refreshes automatically every 30 seconds.</p>{status ? <><dl className="nexcommand__facts">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{displayBuildValue(value)}</dd></div>)}<div><dt>Live deployment SHA</dt><dd>{status.deploymentEvidence?.liveSha ?? "Unverified"}</dd></div><div><dt>Deployment verified</dt><dd>{status.deploymentEvidence?.verifiedAt ?? "Unverified"}</dd></div></dl><h3>Last 10 controller events</h3>{status.events.length ? <ol className="nexcommand__live-events">{status.events.map((event) => <li key={event.id}><strong>{event.type}</strong><span>{event.at}</span>{event.detail ? <p>{event.detail}</p> : null}</li>)}</ol> : <p>No durable controller events are available for this run.</p>}</> : null}</section>;
}
type StagingGmailProviderStatus = {
  senderIdentity: string; environment: string; purpose: string; requiredScope: string; secretDestinationName: string;
  oauthClientStatus: string; quarantineState: string; secretHealth: string; safeToReauthorize: boolean; reauthorizationReason: string;
};
function ProviderCredentialsPanel({ user }: { user: ReturnType<typeof useAuthSession>["user"] }): React.ReactElement {
  const [gmail, setGmail] = useState<StagingGmailProviderStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!user) return;
    void user.getIdToken().then((token) => fetch("/api/platform/admin/providers/gmail/staging-owner-invitation", { headers: { authorization: `Bearer ${token}` } }))
      .then(async (response) => { if (!response.ok) throw new Error("Provider status unavailable."); return response.json() as Promise<StagingGmailProviderStatus>; })
      .then((status) => { setGmail(status); setUnavailable(false); })
      .catch(() => { setGmail(null); setUnavailable(true); });
  }, [user]);
  return <section className="nexcommand__panel"><p className="ui-eyebrow">Credentials &amp; Provider Management</p><h2>Provider status</h2><p>Only non-secret identity and health metadata are displayed. Credentials are never shown.</p><h3>Staging owner-invitation Gmail</h3>{gmail ? <dl className="nexcommand__facts"><div><dt>Sender identity</dt><dd>{gmail.senderIdentity}</dd></div><div><dt>Environment</dt><dd>{gmail.environment}</dd></div><div><dt>Purpose</dt><dd>{gmail.purpose}</dd></div><div><dt>Required scope</dt><dd>{gmail.requiredScope}</dd></div><div><dt>OAuth client</dt><dd>{gmail.oauthClientStatus}</dd></div><div><dt>Quarantine</dt><dd>{gmail.quarantineState}</dd></div><div><dt>Secret health</dt><dd>{gmail.secretHealth}</dd></div><div><dt>Secret destination</dt><dd>{gmail.secretDestinationName}</dd></div><div><dt>Safe to reauthorize</dt><dd>{gmail.safeToReauthorize ? "YES" : "NO"}</dd></div></dl> : <p>{unavailable ? "Provider status is unavailable." : "Loading provider status…"}</p>}{gmail ? <p>{gmail.reauthorizationReason}</p> : null}<Directory title="Provider quick access" items={providers} external /></section>;
}
function Directory(props: { title: string; items: string[][]; external?: boolean }): React.ReactElement { return <section className="nexcommand__panel"><h2>{props.title}</h2><div className="nexcommand__directory">{props.items.map(([name, purpose, environment, link]) => { const href = props.external ? link : environment; const badge = props.external ? environment : "Available"; return <article key={name}><h3>{name}</h3><p>{purpose}</p><span>{badge}</span><a href={href} target={props.external ? "_blank" : undefined} rel={props.external ? "noreferrer" : undefined}>{props.external ? "Open console" : "Open area"}</a></article>; })}</div></section>; }
function StripeBillingPanel({ user }: { user: ReturnType<typeof useAuthSession>["user"] }): React.ReactElement { const [status, setStatus] = useState("Loading Stripe provider status…"); useEffect(() => { if (!user) return; void user.getIdToken().then((token) => fetch("/api/platform/admin/providers/stripe", { headers: { authorization: `Bearer ${token}` } })).then(async (response) => { const body = await response.json() as { environment?: string; credentialStatus?: string; billingRailStatus?: string; lastVerification?: string; liveChargesAllowed?: boolean }; setStatus(response.ok ? `${body.environment} · Credentials: ${body.credentialStatus} · Billing Rail: ${body.billingRailStatus} · Last Verification: ${body.lastVerification} · Live Charges: ${body.liveChargesAllowed ? "Allowed" : "Blocked"}` : "Stripe status is unavailable."); }).catch(() => setStatus("Stripe status is unavailable.")); }, [user]); return <section className="nexcommand__panel"><p className="ui-eyebrow">Stripe Billing</p><h2>Billing</h2><p>{status}</p><p>Staging is limited to Stripe Test Mode. No live payment method can be charged from staging. Subscription assignments appear in Subscriptions.</p><a href="https://dashboard.stripe.com/test" target="_blank" rel="noreferrer">Open Stripe Test Console</a></section>; }
