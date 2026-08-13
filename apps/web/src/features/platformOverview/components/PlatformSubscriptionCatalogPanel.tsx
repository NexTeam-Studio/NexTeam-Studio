import React, { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";

type SubscriptionPackage = { id: string; name: string; priceCents: number; currency: string; includedModules: string[]; active: boolean };

async function loadPackages(user: User): Promise<SubscriptionPackage[]> {
  const token = await user.getIdToken();
  const response = await fetch("/api/platform/admin/subscription-packages", { headers: { authorization: `Bearer ${token}` } });
  const body = await response.json() as { packages?: SubscriptionPackage[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? "Subscription packages could not be loaded.");
  return (body.packages ?? []).filter((entry) => entry.id.startsWith("staging-tier-"));
}

export function PlatformSubscriptionCatalogPanel({ user }: { user: User | null }): React.ReactElement {
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (!user) return; void loadPackages(user).then(setPackages).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Subscription packages could not be loaded.")); }, [user]);
  const selected = packages.find((entry) => entry.id === selectedId) ?? null;
  if (selected) return <SubscriptionDetails entry={selected} onBack={() => setSelectedId(null)} />;
  return <section className="nexcommand__panel tenant-roster-panel subscription-roster-panel"><div className="tenant-roster-panel__banner"><div><p className="ui-eyebrow">NexCommand subscription administration</p><h2>Subscription Roster</h2><p>Staging packages mirror the tenant roster and provide safe visual testing of modules, pricing, and promotions.</p></div><span>{packages.length} Staging Tiers</span></div><div className="tenant-overview__filter"><label>Find Subscription<input placeholder="Name or module" /></label><strong>{packages.length} shown</strong></div>{error ? <p className="tenant-profile__message tenant-profile__message--error">{error}</p> : null}<div className="subscription-roster-panel__rows">{packages.map((entry) => <article className="tenant-overview__row subscription-roster-panel__row" key={entry.id}><div className="tenant-overview__identity"><span className="subscription-roster-panel__mark">$0</span><div><h2>{entry.name}</h2><p>Staging subscription · Active</p><strong>$0.00 monthly · $0.00 annually</strong></div></div><div className="tenant-overview__modules">{entry.includedModules.map((module) => <span key={module}>{module}</span>)}</div><div className="tenant-overview__actions"><p>$0.00 tracked</p><button className="tenant-action" type="button" onClick={() => setSelectedId(entry.id)}>View Details</button></div></article>)}</div></section>;
}

function SubscriptionDetails({ entry, onBack }: { entry: SubscriptionPackage; onBack: () => void }): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [promo, setPromo] = useState(false);
  const [monthly, setMonthly] = useState("0.00");
  const [annual, setAnnual] = useState("0.00");
  const [modules, setModules] = useState(entry.includedModules);
  const [message, setMessage] = useState("");
  const allModules = useMemo(() => entry.includedModules, [entry]);
  return <section className="nexcommand__panel tenant-profile subscription-details"><button className="tenant-action" type="button" onClick={onBack}>Back to Subscription Roster</button><div className="tenant-profile__heading"><div className="tenant-profile__heading-copy"><p className="ui-eyebrow">Staging subscription</p><div className="tenant-profile__tenant-line"><h2>{entry.name}</h2><span>$0</span></div><p>$0.00 monthly · $0.00 annually paid in full</p></div><button className="tenant-action" type="button" onClick={() => setEditing((value) => !value)}>{editing ? "Cancel" : "Edit Subscription"}</button></div><p className="subscription-details__notice">Testing preview only. Saving here does not create charges or change Stripe billing.</p><fieldset disabled={!editing}><div className="tenant-profile__grid"><label>Monthly Billing Price<input inputMode="decimal" value={monthly} onChange={(event) => setMonthly(event.target.value)} /></label><label>Annual Billing Price (paid in full)<input inputMode="decimal" value={annual} onChange={(event) => setAnnual(event.target.value)} /></label></div><label className="subscription-details__toggle"><input type="checkbox" checked={promo} onChange={(event) => setPromo(event.target.checked)} /><span aria-hidden="true" /><div><strong>Promotion discount</strong><small>{promo ? "Promotion is on for this staging preview." : "Promotion is off."}</small></div></label><h3>Included NexTeam Modules</h3><div className="subscription-details__modules">{allModules.map((module) => <label key={module}><input type="checkbox" checked={modules.includes(module)} onChange={(event) => setModules((current) => event.target.checked ? [...current, module] : current.filter((value) => value !== module))} />{module}</label>)}</div></fieldset>{editing ? <button className="tenant-action" type="button" onClick={() => { setEditing(false); setMessage("Staging subscription preview saved for this browser. No billing records were changed."); }}>Save Staging Preview</button> : null}{message ? <p className="tenant-profile__message tenant-profile__message--success">{message}</p> : null}</section>;
}
