import React, { useEffect, useRef, useState } from "react";
import { EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail, type User } from "firebase/auth";
import { loadFirebaseAuth } from "../../../shared/auth/firebaseAuth";

type Address = { street1?: string; street2?: string; city?: string; province?: string; postalCode?: string; country?: string };
type AddressSuggestion = Required<Pick<Address, "street1" | "city" | "province" | "postalCode" | "country">>;
type Contact = { firstName?: string; lastName?: string; email?: string; phone?: string; address?: Address; physicalAddress?: Address; mailingAddress?: Address };
type TenantProfileResponse = {
  tenant: { id: string; name: string; timezone: string; lifecycleState?: "ACTIVE" | "DISABLED_ARCHIVED"; branding: { assistantName: string } };
  profile: { tenantNumber?: number; legalName?: string; dbaName?: string; website?: string; status?: "ACTIVE" | "PENDING" | "INACTIVE" | "CANCELLED"; subscriptionPlan?: "none" | "staging-tier-1" | "staging-tier-2" | "staging-tier-3"; primaryContact?: Contact } | null;
  branding: { logo?: { url?: string; storageRef?: string; updatedAt?: string } } | null;
  subscription: { plan: string; status: string } | null;
  access: Array<{ displayName: string; email: string | null; role: string; active: boolean; firebaseUidBound: boolean }>;
};

const fallbackLogo: Record<string, string> = { aquatrace: "/tenant-packs/aquatrace/assets/banner-logo.png", "owens-bluewater-wash": "/assets/brand/owens-bluewater-wash-logo-transparent.png" };
const timezones = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "America/Toronto", "America/Vancouver", "Europe/London", "Europe/Paris", "Australia/Sydney"];

async function request(user: User, path: string, init?: RequestInit): Promise<TenantProfileResponse> {
  const token = await user.getIdToken();
  const response = await fetch(path, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json() as TenantProfileResponse & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Tenant profile is unavailable.");
  return body;
}

function logoFor(data: TenantProfileResponse): string | undefined {
  const logo = data.branding?.logo;
  return logo?.url ?? (logo?.storageRef ? `/api/public/tenant-branding/logo?tenantId=${encodeURIComponent(data.tenant.id)}&v=${encodeURIComponent(logo.updatedAt ?? "current")}` : fallbackLogo[data.tenant.id]);
}
function currentAddress(contact: Contact): Address | undefined { return contact.address ?? contact.physicalAddress ?? contact.mailingAddress; }

export function NexCommandTenantProfilePanel({ user, tenantId, onBack }: { user: User | null; tenantId: string; onBack: () => void }): React.ReactElement {
  const [data, setData] = useState<TenantProfileResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("success");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [pendingLogoUrl, setPendingLogoUrl] = useState("");
  const [subscriptionPlan, setSubscriptionPlan] = useState<"none" | "staging-tier-1" | "staging-tier-2" | "staging-tier-3">("none");
  const [status, setStatus] = useState<"ACTIVE" | "PENDING" | "INACTIVE" | "CANCELLED">("INACTIVE");
  const [resetOpen, setResetOpen] = useState(false);
  const [operatorPassword, setOperatorPassword] = useState("");
  const [resetWorking, setResetWorking] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const load = async (): Promise<void> => { if (user) setData(await request(user, `/api/platform/admin/tenants/${encodeURIComponent(tenantId)}/profile`)); };
  useEffect(() => { void load().catch(() => setMessage("Tenant profile could not be loaded.")); }, [tenantId, user]);
  useEffect(() => { if (data) { const plan = data.profile?.subscriptionPlan ?? "none"; setSubscriptionPlan(plan); setStatus(data.profile?.status ?? (plan === "none" ? "INACTIVE" : "ACTIVE")); } }, [data]);
  useEffect(() => () => { if (pendingLogoUrl) URL.revokeObjectURL(pendingLogoUrl); }, [pendingLogoUrl]);
  if (!data) return <section className="nexcommand__panel"><button className="tenant-action" type="button" onClick={onBack}>Back to Tenant Roster</button><p>{message || "Loading tenant profile…"}</p></section>;
  const profile = data.profile ?? {};
  const primary = profile.primaryContact ?? {};
  const displayedLogo = pendingLogoUrl || logoFor(data);

  async function sendPasswordReset(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const targetEmail = primary.email?.trim();
    const operatorEmail = user?.email?.trim();
    if (!user || !operatorEmail || !targetEmail) { setMessageTone("error"); setMessage("A signed-in NexCommand operator and a Primary Contact email are required."); return; }
    setResetWorking(true); setMessage("");
    try {
      const auth = await loadFirebaseAuth();
      if (!auth?.currentUser || auth.currentUser.uid !== user.uid) throw new Error("Your NexCommand session must be refreshed before sending a reset email.");
      await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(operatorEmail, operatorPassword));
      await sendPasswordResetEmail(auth, targetEmail);
      setOperatorPassword(""); setResetOpen(false); setMessageTone("success"); setMessage(`Password reset email sent to ${targetEmail}.`);
    } catch (error) {
      setMessageTone("error"); setMessage(error instanceof Error && error.message.includes("password") ? "Your NexCommand password was not accepted. No reset email was sent." : "The password reset email could not be sent. Verify the active NexCommand session and try again.");
    } finally { setResetWorking(false); }
  }

  async function uploadLogo(file: File): Promise<string> {
    if (!user) throw new Error("You must be signed in to upload a logo.");
    const token = await user.getIdToken();
    const response = await fetch(`/api/platform/admin/tenants/${encodeURIComponent(tenantId)}/logo`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": file.type }, body: file });
    const body = await response.json() as { logoUrl?: string; error?: string };
    if (!response.ok || !body.logoUrl) throw new Error(body.error ?? "Logo upload failed.");
    return body.logoUrl;
  }
  function chooseLogo(event: React.ChangeEvent<HTMLInputElement>): void { const nextFile = event.target.files?.[0] ?? null; if (pendingLogoUrl) URL.revokeObjectURL(pendingLogoUrl); setLogoFile(nextFile); setPendingLogoUrl(nextFile ? URL.createObjectURL(nextFile) : ""); }
  async function save(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); if (!user) return; const form = new FormData(event.currentTarget); setSaving(true); setMessage("");
    try {
      await request(user, `/api/platform/admin/tenants/${encodeURIComponent(tenantId)}/profile`, { method: "PATCH", body: JSON.stringify({ legalName: stringOrUndefined(form, "legalName"), dbaName: stringOrUndefined(form, "dbaName"), website: stringOrUndefined(form, "website"), subscriptionPlan, status: subscriptionPlan === "none" ? "INACTIVE" : status, primaryContact: contactFrom(form), tenant: { name: form.get("name"), timezone: form.get("timezone"), lifecycleState: form.get("lifecycleState") } }) });
      if (logoFile) await uploadLogo(logoFile);
      setLogoFile(null); setPendingLogoUrl(""); await load(); setEditing(false); setMessageTone("success"); setMessage("Tenant profile saved.");
    } catch (error) { const detail = error instanceof Error ? error.message : ""; setMessageTone("error"); setMessage(/logo|image|png|jpe?g|webp/i.test(detail) ? "Logo upload was not saved. Choose a PNG, JPEG, or WebP image and try again; your other profile changes were saved." : "Tenant profile was not saved. Use a complete website URL beginning with http:// or https://, then try again."); } finally { setSaving(false); }
  }

  return <section className="nexcommand__panel tenant-profile">
    <button className="tenant-action" type="button" onClick={onBack}>Back to Tenant Roster</button>
    <div className="tenant-profile__heading"><div className="tenant-profile__heading-copy"><p className="ui-eyebrow">Tenant Profile</p><small>Tenant ID: {profile.tenantNumber ?? "Pending"}</small><div className="tenant-profile__tenant-line"><h2>{data.tenant.name}</h2>{displayedLogo ? <img src={displayedLogo} alt={`${data.tenant.name} logo`} /> : <span>{data.tenant.name.slice(0, 1)}</span>}</div><p>{data.subscription?.plan ?? "No plan"} · {data.subscription?.status ?? "No subscription"}</p></div><button className="tenant-action" type="button" onClick={() => setEditing((value) => !value)}>{editing ? "Cancel" : "Edit Tenant"}</button></div>
    {resetOpen ? <form className="tenant-profile__reset" onSubmit={(event) => void sendPasswordReset(event)}><strong>Confirm Password Reset</strong><p>Re-enter your current NexCommand password to send a reset link to the tenant Primary Contact: <b>{primary.email ?? "No email on file"}</b>. Your password is used only to re-authenticate this action and is never saved.</p><label>Current NexCommand Password<input type="password" value={operatorPassword} onChange={(event) => setOperatorPassword(event.target.value)} autoComplete="current-password" required /></label><div><button className="tenant-action tenant-action--secondary" type="button" onClick={() => { setOperatorPassword(""); setResetOpen(false); }}>Cancel</button><button className="tenant-action" type="submit" disabled={resetWorking || !primary.email}>{resetWorking ? "Sending…" : "Send Reset Email"}</button></div></form> : null}
    <div className="tenant-profile__security-actions"><button className="tenant-action tenant-action--secondary" type="button" onClick={() => setResetOpen((value) => !value)}>Send Password Reset</button></div>
    <form onSubmit={(event) => void save(event)}>
      <fieldset disabled={!editing || saving}>
      <div className="tenant-profile__grid"><label>Tenant Name<input name="name" defaultValue={data.tenant.name} required /></label><label>Legal Business Name<input name="legalName" defaultValue={profile.legalName ?? ""} /></label><label>DBA / Public Name<input name="dbaName" defaultValue={profile.dbaName ?? ""} /></label><label>Website<input name="website" type="url" defaultValue={profile.website ?? ""} placeholder="https://aquatraceleak.com" /></label><label>Timezone<select name="timezone" defaultValue={data.tenant.timezone}>{[...new Set([data.tenant.timezone, ...timezones])].map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}</select></label><label>Subscription<select name="subscriptionPlan" value={subscriptionPlan} onChange={(event) => { const next = event.target.value as typeof subscriptionPlan; setSubscriptionPlan(next); if (next === "none") setStatus("INACTIVE"); }}><option value="none">None</option><option value="staging-tier-1">Staging Tier 1</option><option value="staging-tier-2">Staging Tier 2</option><option value="staging-tier-3">Staging Tier 3</option></select></label></div>
    </fieldset><div className="tenant-profile__control-grid"><section className="tenant-profile__logo-control"><div><strong>Tenant Logo</strong>{displayedLogo ? <img src={displayedLogo} alt="Tenant logo preview" /> : null}</div><input ref={fileInput} name="logoFile" type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={chooseLogo} /><button className="tenant-action" type="button" onClick={() => { setEditing(true); fileInput.current?.click(); }}>Choose File</button><p>This logo is used throughout NexCommand, NexOps, and tenant-facing product areas.</p></section><label>Status<select name="status" value={status} disabled={!editing || saving || subscriptionPlan === "none"} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="ACTIVE">Active</option><option value="PENDING">Pending</option><option value="INACTIVE">Inactive</option><option value="CANCELLED">Cancelled</option></select><input name="lifecycleState" type="hidden" value={data.tenant.lifecycleState ?? "ACTIVE"} /></label></div><fieldset disabled={!editing || saving}><h3>Contact Details</h3><ContactFields contact={primary} user={user} /></fieldset>{editing ? <button className="tenant-action" type="submit" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button> : null}</form>
    {message ? <p className={`tenant-profile__message tenant-profile__message--${messageTone}`} role={messageTone === "error" ? "alert" : "status"}>{message}</p> : null}
  </section>;
}
function ContactFields({ contact, user }: { contact: Contact; user: User | null }): React.ReactElement { return <><div className="tenant-profile__grid"><label>First Name<input name="firstName" defaultValue={contact.firstName ?? ""} required /></label><label>Last Name<input name="lastName" defaultValue={contact.lastName ?? ""} required /></label><label>Email<input type="email" name="email" defaultValue={contact.email ?? ""} required /></label><label>Telephone<input name="phone" defaultValue={contact.phone ?? ""} /></label></div><h4>Address</h4><AddressFields address={currentAddress(contact)} user={user} /></>; }
function AddressFields({ address, user }: { address?: Address; user: User | null }): React.ReactElement {
  const [value, setValue] = useState<Address>(address ?? {});
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [streetFocused, setStreetFocused] = useState(false);
  const [addressResolved, setAddressResolved] = useState(Boolean(address?.street1 && address?.city && address?.postalCode && address?.country));
  useEffect(() => { const query = [value.street1, value.city, value.province, value.postalCode].filter(Boolean).join(", "); if (!user || !streetFocused || addressResolved || (value.street1?.trim().length ?? 0) < 3) { setSuggestions([]); return undefined; } const controller = new AbortController(); const timer = window.setTimeout(async () => { try { const token = await user.getIdToken(); const response = await fetch(`/api/platform/admin/address-suggestions?query=${encodeURIComponent(query)}`, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal }); const body = await response.json() as { ok?: boolean; suggestions?: AddressSuggestion[] }; setSuggestions(response.ok ? body.suggestions ?? [] : []); } catch { if (!controller.signal.aborted) setSuggestions([]); } }, 250); return () => { controller.abort(); window.clearTimeout(timer); }; }, [addressResolved, streetFocused, user, value.street1, value.city, value.province, value.postalCode]);
  const set = (key: keyof Address) => (event: React.ChangeEvent<HTMLInputElement>) => { if (key === "street1") setAddressResolved(false); setValue((current) => ({ ...current, [key]: event.target.value })); };
  return <div className="tenant-profile__address"><div className="tenant-profile__grid"><label>Street<input name="street1" value={value.street1 ?? ""} onChange={set("street1")} onFocus={() => setStreetFocused(true)} onBlur={() => { window.setTimeout(() => { setStreetFocused(false); setSuggestions([]); }, 120); }} autoComplete="street-address" /></label><label>Unit / Suite<input name="street2" value={value.street2 ?? ""} onChange={set("street2")} autoComplete="address-line2" /></label><label>City<input name="city" value={value.city ?? ""} onChange={set("city")} autoComplete="address-level2" /></label><label>State / Province<input name="province" value={value.province ?? ""} onChange={set("province")} autoComplete="address-level1" /></label><label>ZIP / Postal Code<input name="postalCode" value={value.postalCode ?? ""} onChange={set("postalCode")} autoComplete="postal-code" /></label><label>Country<input name="country" value={value.country ?? ""} onChange={set("country")} autoComplete="country-name" /></label></div>{suggestions.length ? <div className="tenant-profile__suggestions" role="listbox" aria-label="Google address suggestions">{suggestions.map((suggestion) => <button key={`${suggestion.street1}-${suggestion.city}-${suggestion.postalCode}`} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setValue((current) => ({ ...current, ...suggestion })); setAddressResolved(true); setStreetFocused(false); setSuggestions([]); }}>{[suggestion.street1, suggestion.city, suggestion.province, suggestion.postalCode, suggestion.country].filter(Boolean).join(", ")}</button>)}</div> : null}</div>;
}
function contactFrom(form: FormData): Contact { return { firstName: String(form.get("firstName") ?? "").trim(), lastName: String(form.get("lastName") ?? "").trim(), email: stringOrUndefined(form, "email"), phone: stringOrUndefined(form, "phone"), address: addressFrom(form) }; }
function addressFrom(form: FormData): Address | undefined { const address: Address = { street1: String(form.get("street1") ?? "").trim(), street2: String(form.get("street2") ?? "").trim(), city: String(form.get("city") ?? "").trim(), province: String(form.get("province") ?? "").trim(), postalCode: String(form.get("postalCode") ?? "").trim(), country: String(form.get("country") ?? "").trim() }; return Object.values(address).some(Boolean) ? address : undefined; }
function stringOrUndefined(form: FormData, name: string): string | undefined { const value = String(form.get(name) ?? "").trim(); return value || undefined; }
