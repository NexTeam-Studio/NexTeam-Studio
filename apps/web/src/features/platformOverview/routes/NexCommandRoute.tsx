import React, { useMemo, useState } from "react";
import { useAuthSession } from "../../../shared/auth/AuthSessionProvider";
import { PlatformMark } from "../../../shared/branding/ProductBranding";
import { TenantOverviewPanel } from "../../tenantOverview/components/TenantOverviewPanel";
import { useTenantOverview } from "../../tenantOverview/hooks/useTenantOverview";
import { PlatformPlansPanel } from "../components/PlatformPlansPanel";
import { PlatformProspectIntakePanel } from "../components/PlatformProspectIntakePanel";
import { PlatformTenantBlockersPanel } from "../components/PlatformTenantBlockersPanel";
import { usePlatformPlans } from "../hooks/usePlatformPlans";
import { usePathname } from "../../../shared/router/usePathname";
import "../../tenantOverview/styles/tenantOverview.css";
import "../styles/nexCommand.css";

type Area = "dashboard" | "tenants" | "prospects" | "blueprints" | "subscriptions" | "onboarding" | "migrations" | "support" | "modules" | "integrations" | "system" | "releases" | "usage" | "billing" | "security" | "settings";

const navigation: Array<[Area, string, string]> = [
  ["dashboard", "Dashboard", "⌂"], ["tenants", "Tenants", "◫"], ["prospects", "Prospects", "◌"], ["blueprints", "Blueprints", "◇"], ["subscriptions", "Subscriptions", "◈"], ["onboarding", "Onboarding", "→"], ["migrations", "Migrations", "↻"], ["support", "Support", "?"], ["modules", "Modules", "▦"], ["integrations", "Integrations", "⌁"], ["system", "Code & System", "⌘"], ["releases", "Releases", "↑"], ["usage", "Usage", "▥"], ["billing", "Billing", "$"], ["security", "Security & Audit", "◉"], ["settings", "Settings", "⚙"]
];

const moduleDirectory = [
  ["NexOps", "Business operations workspace", "/nexops"], ["Nexi", "Tool-backed operating assistant", "/nexi"], ["Tenant onboarding", "Prospect, Blueprint, subscription, and activation workflow", "/nexcommand?area=onboarding"], ["Settings", "Tenant configuration controls", "/platform/settings"], ["Authentication", "Platform and tenant access boundaries", "/nexcommand?area=security"], ["Integrations", "Configured provider health and quick access", "/nexcommand?area=integrations"], ["Global Control", "Build and verification coordination", "/nexcommand?area=system"], ["Code & System", "Build identity and diagnostic foundation", "/nexcommand?area=system"]
];

const providers = [
  ["Railway", "Staging deployment and runtime", "Staging", "https://railway.app"], ["Firebase", "Authentication and durable data", "Staging", "https://console.firebase.google.com"], ["Google Cloud", "Project and Firestore administration", "Staging", "https://console.cloud.google.com"], ["GitHub", "Source and review", "Shared", "https://github.com"], ["OpenAI", "Codex development tools", "Shared", "https://platform.openai.com"], ["Anthropic", "Configured AI provider", "Staging", "https://console.anthropic.com"], ["ElevenLabs", "Configured voice provider", "Staging", "https://elevenlabs.io"], ["InMotion", "Marketing-site hosting", "Production website only", "https://www.inmotionhosting.com"], ["Namecheap", "Domain administration", "Production domain only", "https://www.namecheap.com"]
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
  const { plans, status: planStatus } = usePlatformPlans(user);
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
    <main className="nexcommand__workspace"><section className="nexcommand__heading"><div><p className="ui-eyebrow">NexTeam internal operations</p><h1>{navigation.find(([key]) => key === area)?.[1]}</h1><p>{user?.email ?? "Authorized NexTeam operator"}</p></div><span className="nexcommand__health">Staging connected</span></section>{issue ? <p className="nexcommand__notice">{issue}</p> : null}<NexCommandArea area={area} rows={rows} plans={plans} workingTenant={workingTenant} onRunBackup={runBackup} user={user} summary={summary} /></main>
  </div>;
}

function NexCommandArea(props: { area: Area; rows: ReturnType<typeof useTenantOverview>["rows"]; plans: ReturnType<typeof usePlatformPlans>["plans"]; workingTenant: string; onRunBackup: ReturnType<typeof useTenantOverview>["runBackup"]; user: ReturnType<typeof useAuthSession>["user"]; summary: { tenants: number; active: number } }): React.ReactElement {
  if (props.area === "dashboard") return <><section className="nexcommand__metrics"><Metric label="Active tenants" value={String(props.summary.active)} /><Metric label="Tenant records" value={String(props.summary.tenants)} /><Metric label="Pilot package" value="$0.00" /><Metric label="Staging health" value="Connected" /></section><section className="nexcommand__panel"><h2>Operator overview</h2><p>Use NexCommand to manage verified tenant onboarding and platform operations. Metrics appear only when the platform provides the underlying data.</p></section></>;
  if (props.area === "tenants") return <section className="nexcommand__panel"><h2>Tenant administration</h2><p>Tenant records remain scoped to their own data. Open a tenant row to review its current platform summary.</p><TenantOverviewPanel rows={props.rows} workingTenant={props.workingTenant} onRunBackup={props.onRunBackup} /></section>;
  if (props.area === "prospects" || props.area === "blueprints" || props.area === "onboarding") return <PlatformProspectIntakePanel user={props.user} />;
  if (props.area === "subscriptions") return <PlatformPlansPanel plans={props.plans} />;
  if (props.area === "migrations" || props.area === "support") return <PlatformTenantBlockersPanel user={props.user} />;
  if (props.area === "modules") return <Directory title="Module directory" items={moduleDirectory} />;
  if (props.area === "integrations") return <Directory title="Provider quick access" items={providers} external />;
  if (props.area === "system") return <section className="nexcommand__panel"><h2>Code &amp; System</h2><p>Current system identity, diagnostics, provider health, and green-gate evidence belong here. Embedded build controls are intentionally not enabled in this release.</p><dl className="nexcommand__facts"><div><dt>Staging</dt><dd>nexstage.nexteam.studio</dd></div><div><dt>Production</dt><dd>nexapp.nexteam.studio</dd></div><div><dt>Global Control</dt><dd>Local diagnostic access available to authorized operators.</dd></div></dl></section>;
  if (props.area === "security") return <section className="nexcommand__panel"><h2>Security &amp; audit</h2><p>NexCommand is for authorized NexTeam platform personnel. Tenant ownership alone does not grant NexCommand access. Provider credentials and tenant secrets remain masked.</p><p>Support access is not active. A future request-and-approval session will require tenant approval, explicit scope, a time limit, revocation, and audit history.</p></section>;
  return <section className="nexcommand__panel"><h2>{props.area === "releases" ? "Release controls" : props.area === "usage" ? "Usage" : props.area === "billing" ? "Billing" : "NexTeam settings"}</h2><p>This area is prepared for the next authorized platform capability. It does not expose unverified data or production controls.</p></section>;
}

function Metric(props: { label: string; value: string }): React.ReactElement { return <article><span>{props.label}</span><strong>{props.value}</strong></article>; }
function Directory(props: { title: string; items: string[][]; external?: boolean }): React.ReactElement { return <section className="nexcommand__panel"><h2>{props.title}</h2><div className="nexcommand__directory">{props.items.map(([name, purpose, environment, link]) => { const href = props.external ? link : environment; const badge = props.external ? environment : "Available"; return <article key={name}><h3>{name}</h3><p>{purpose}</p><span>{badge}</span><a href={href} target={props.external ? "_blank" : undefined} rel={props.external ? "noreferrer" : undefined}>{props.external ? "Open console" : "Open area"}</a></article>; })}</div></section>; }
