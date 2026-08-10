import React, { useEffect, useMemo, useState } from "react";
import { useAuthSession } from "../../../shared/auth/AuthSessionProvider";
import { PlatformMark } from "../../../shared/branding/ProductBranding";
import { TenantOverviewPanel } from "../../tenantOverview/components/TenantOverviewPanel";
import { useTenantOverview } from "../../tenantOverview/hooks/useTenantOverview";
import { PlatformProspectIntakePanel } from "../components/PlatformProspectIntakePanel";
import { PlatformSupportPanel } from "../components/PlatformSupportPanel";
import { PlatformLifecycleRecordsPanel } from "../components/PlatformLifecycleRecordsPanel";
import { PlatformMigrationsPanel } from "../components/PlatformMigrationsPanel";
import { usePlatformPlans } from "../hooks/usePlatformPlans";
import { usePathname } from "../../../shared/router/usePathname";
import "../../tenantOverview/styles/tenantOverview.css";
import "../styles/nexCommand.css";

type Area = "dashboard" | "team" | "tenants" | "prospects" | "blueprints" | "subscriptions" | "onboarding" | "migrations" | "support" | "modules" | "integrations" | "system" | "releases" | "usage" | "billing" | "security" | "settings";

const navigation: Array<[Area, string, string]> = [
  ["dashboard", "Dashboard", "⌂"], ["tenants", "Tenants", "◫"], ["prospects", "Prospects", "◌"], ["blueprints", "Blueprints", "◇"], ["subscriptions", "Subscriptions", "◈"], ["onboarding", "Onboarding", "→"], ["migrations", "Migrations", "↻"], ["support", "Support", "?"], ["modules", "Modules", "▦"], ["integrations", "Integrations", "⌁"], ["system", "Code & System", "⌘"], ["releases", "Releases", "↑"], ["usage", "Usage", "▥"], ["billing", "Billing", "$"], ["security", "Security & Audit", "◉"], ["settings", "Settings", "⚙"]
];

const moduleDirectory = [
  ["NexOps", "Business operations workspace", "/nexops"], ["Nexi", "Tool-backed operating assistant", "/nexi"], ["Tenant onboarding", "Prospect, Blueprint, subscription, and activation workflow", "/nexcommand?area=onboarding"], ["Settings", "Tenant configuration controls", "/platform/settings"], ["Authentication", "Platform and tenant access boundaries", "/nexcommand?area=security"], ["Integrations", "Configured provider health and quick access", "/nexcommand?area=integrations"], ["Global Control", "Build and verification coordination", "/nexcommand?area=system"], ["Code & System", "Build identity and diagnostic foundation", "/nexcommand?area=system"]
];

const providers = [
  ["Railway", "Staging deployment and runtime", "Staging", "https://railway.app"], ["Firebase", "Authentication and durable data", "Staging", "https://console.firebase.google.com"], ["Google Cloud", "Project and Firestore administration", "Staging", "https://console.cloud.google.com"], ["Stripe", "Subscription and payment provider", "Staging · Test Mode", "https://dashboard.stripe.com/test"], ["GitHub", "Source and review", "Shared", "https://github.com"], ["OpenAI", "Codex development tools", "Shared", "https://platform.openai.com"], ["Anthropic", "Configured AI provider", "Staging", "https://console.anthropic.com"], ["ElevenLabs", "Configured voice provider", "Staging", "https://elevenlabs.io"], ["InMotion", "Marketing-site hosting", "Production website only", "https://www.inmotionhosting.com"], ["Namecheap", "Domain administration", "Production domain only", "https://www.namecheap.com"]
];

function safeOperatorMessage(value: string): string { return value && !value.startsWith("Loading") ? "Data query needs attention. NexTeam has logged the issue." : ""; }

function areaFromLocation(): Area {
  const requested = new URLSearchParams(window.location.search).get("area");
  return navigation.some(([area]) => area === requested) ? requested as Area : "dashboard";
}

export function NexCommandRoute(): React.ReactElement {
  const { signOut, user } = useAuthSession();
  const pathname = usePathname();
  const [area, setArea] = useState<Area>(areaFromLocation);
  const [open, setOpen] = useState(false);
  const { status: planStatus } = usePlatformPlans(user);
  const { rows, runBackup, status: tenantStatus, workingTenant } = useTenantOverview(user);
  const issue = safeOperatorMessage(planStatus || tenantStatus);
  const summary = useMemo(() => ({ tenants: rows.length, active: rows.filter((row) => row.subscription?.status === "active").length }), [rows]);

  function selectArea(next: Area): void {
    window.history.pushState({}, "", `${pathname.startsWith("/platform") ? "/platform" : "/nexcommand"}?area=${next}`);
    setArea(next);
  }

  return <div className="nexcommand">
    <header className="nexcommand__topbar"><button className="nexcommand__menu" aria-label="Open NexCommand navigation" onClick={() => setOpen((value) => !value)}>☰</button><div className="nexcommand__brand"><PlatformMark decorative /><span>NexCommand</span></div><div className="nexcommand__environment"><span>STAGING</span><small>nexstage.nexteam.studio</small></div><button className="nexcommand__signout" onClick={() => void signOut()}>Sign out</button></header>
    <aside className={`nexcommand__nav ${open ? "nexcommand__nav--open" : ""}`} aria-label="NexCommand navigation"><div className="nexcommand__nav-title"><PlatformMark decorative /><div><strong>NexCommand</strong><span>Internal operating console</span></div></div>{navigation.map(([key, label, icon]) => <button key={key} className={area === key ? "is-active" : ""} onClick={() => { selectArea(key); setOpen(false); }}><i aria-hidden="true">{icon}</i>{label}</button>)}</aside>
    <main className="nexcommand__workspace"><section className="nexcommand__heading"><div><p className="ui-eyebrow">NexTeam internal operations</p><h1>{navigation.find(([key]) => key === area)?.[1]}</h1><p>{user?.email ?? "Authorized NexTeam operator"}</p></div><span className="nexcommand__health">Staging connected</span></section>{issue ? <p className="nexcommand__notice">{issue}</p> : null}<NexCommandArea area={area} rows={rows} workingTenant={workingTenant} onRunBackup={runBackup} user={user} summary={summary} /></main>
  </div>;
}

function NexCommandArea(props: { area: Area; rows: ReturnType<typeof useTenantOverview>["rows"]; workingTenant: string; onRunBackup: ReturnType<typeof useTenantOverview>["runBackup"]; user: ReturnType<typeof useAuthSession>["user"]; summary: { tenants: number; active: number } }): React.ReactElement {
  if (props.area === "dashboard") return <><section className="nexcommand__metrics"><Metric label="Active tenants" value={String(props.summary.active)} /><Metric label="Tenant records" value={String(props.summary.tenants)} /><Metric label="Pilot package" value="$0.00" /><Metric label="Staging health" value="Connected" /></section><LiveBuildStatusPanel user={props.user} /><section className="nexcommand__panel"><h2>Operator overview</h2><p>Use NexCommand to manage verified tenant onboarding and platform operations. Metrics appear only when the platform provides the underlying data.</p><a href="/nexcommand?area=team">Open Team</a></section></>;
  if (props.area === "team") return <PlatformTeamPanel user={props.user} />;
  if (props.area === "tenants") return <section className="nexcommand__panel"><h2>Tenant administration</h2><p>Tenant records remain scoped to their own data. Open a tenant row to review its current platform summary.</p><TenantOverviewPanel rows={props.rows} workingTenant={props.workingTenant} onRunBackup={props.onRunBackup} /></section>;
  if (props.area === "prospects") return <PlatformProspectIntakePanel user={props.user} />;
  if (props.area === "blueprints" || props.area === "subscriptions" || props.area === "onboarding") return <PlatformLifecycleRecordsPanel user={props.user} mode={props.area} />;
  if (props.area === "migrations") return <PlatformMigrationsPanel user={props.user} />;
  if (props.area === "support") return <PlatformSupportPanel user={props.user} />;
  if (props.area === "modules") return <Directory title="Module directory" items={moduleDirectory} />;
  if (props.area === "integrations") return <ProviderCredentialsPanel user={props.user} />;
  if (props.area === "system") return <section className="nexcommand__panel"><h2>Code &amp; System</h2><p>Current system identity, diagnostics, provider health, and green-gate evidence belong here. Embedded build controls are intentionally not enabled in this release.</p><dl className="nexcommand__facts"><div><dt>Staging</dt><dd>nexstage.nexteam.studio</dd></div><div><dt>Production</dt><dd>nexapp.nexteam.studio</dd></div><div><dt>Global Control</dt><dd>Local diagnostic access available to authorized operators.</dd></div></dl></section>;
  if (props.area === "security") return <section className="nexcommand__panel"><h2>Security &amp; audit</h2><p>NexCommand is for authorized NexTeam platform personnel. Tenant ownership alone does not grant NexCommand access. Provider credentials and tenant secrets remain masked.</p><p>Support access is not active. A future request-and-approval session will require tenant approval, explicit scope, a time limit, revocation, and audit history.</p></section>;
  if (props.area === "billing") return <StripeBillingPanel user={props.user} />;
  return <section className="nexcommand__panel"><h2>{props.area === "releases" ? "Release Controls" : props.area === "usage" ? "Usage" : "NexTeam Settings"}</h2><p>This area is prepared for the next authorized platform capability. It does not expose unverified data or production controls.</p></section>;
}

type PlatformTeamUser = { id: string; firstName: string; lastName: string; role: string; accountStatus: "ACTIVE" | "DISABLED"; updatedAt: string };
function PlatformTeamPanel({ user }: { user: ReturnType<typeof useAuthSession>["user"] }): React.ReactElement {
  const [members, setMembers] = useState<PlatformTeamUser[]>([]); const [error, setError] = useState(""); const [busy, setBusy] = useState("");
  const request = async (path: string, init?: RequestInit): Promise<{ users?: PlatformTeamUser[]; error?: string }> => { const token = await user?.getIdToken(); const response = await fetch(path, { ...init, headers: { authorization: `Bearer ${token ?? ""}`, "content-type": "application/json", ...init?.headers } }); const body = await response.json() as { users?: PlatformTeamUser[]; error?: string }; if (!response.ok) throw new Error(body.error ?? "Team request failed."); return body; };
  const refresh = async (): Promise<void> => { if (!user) return; try { setError(""); setMembers((await request("/api/platform/admin/team")).users ?? []); } catch { setError("Team records are unavailable to this signed-in operator."); } };
  useEffect(() => { void refresh(); }, [user]);
  const changeStatus = async (member: PlatformTeamUser): Promise<void> => { try { setBusy(member.id); await request(`/api/platform/admin/team/${encodeURIComponent(member.id)}/${member.accountStatus === "ACTIVE" ? "disable" : "reactivate"}`, { method: "POST" }); await refresh(); } catch { setError("Unable to update account status."); } finally { setBusy(""); } };
  return <section className="nexcommand__panel nexcommand__team"><p className="ui-eyebrow">NexTeam platform personnel</p><h2>Team</h2><p>Platform profiles are separate from tenant users. Identity creation, invitations, and email delivery are intentionally unavailable here.</p>{error ? <p className="nexcommand__notice" role="alert">{error}</p> : null}<div className="nexcommand__team-grid">{members.map((member) => <article key={member.id}><div><strong>{member.firstName} {member.lastName}</strong><span>{member.role}</span></div><span className={`nexcommand__status nexcommand__status--${member.accountStatus.toLowerCase()}`}>{member.accountStatus}</span><button type="button" disabled={busy === member.id} onClick={() => void changeStatus(member)}>{member.accountStatus === "ACTIVE" ? "Disable" : "Reactivate"}</button></article>)}</div>{members.length === 0 && !error ? <p>No platform profile records yet. The signed-in identity remains visible in the header.</p> : null}</section>;
}

function Metric(props: { label: string; value: string }): React.ReactElement { return <article><span>{props.label}</span><strong>{props.value}</strong></article>; }
type LiveBuildStatus = {
  currentBuild: string | null; currentTask: string | null; actualState: "ACTIVE" | "IDLE"; runId: string | null; pid: number | null;
  lastHeartbeat: string | null; progress: string | null; completedTasks: string[]; remainingTasks: string[]; blocker: string | null; lastActivity: string | null;
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
    ["Current Build", status.currentBuild], ["Current Task", status.currentTask], ["Actual State", status.actualState], ["Run ID", status.runId], ["PID", status.pid],
    ["Last Heartbeat", status.lastHeartbeat], ["Progress", status.progress], ["Completed Tasks", status.completedTasks.join(", ") || null], ["Remaining Tasks", status.remainingTasks.join(", ") || null], ["Blocker", status.blocker], ["Last Activity", status.lastActivity]
  ] : [];
  return <section className="nexcommand__panel nexcommand__live-build"><p className="ui-eyebrow">NexCommand Live Build Status</p><h2>{unavailable ? "Unavailable" : status?.actualState ?? "Loading…"}</h2><p>Controller-backed runtime state. No current controller run or fresh heartbeat means IDLE.</p>{status ? <dl className="nexcommand__facts">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{displayBuildValue(value)}</dd></div>)}</dl> : null}</section>;
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
