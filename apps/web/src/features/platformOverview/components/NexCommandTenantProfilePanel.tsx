import React, { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";

type Address = { street1?: string; street2?: string; city?: string; province?: string; postalCode?: string; country?: string };
type Contact = { firstName?: string; lastName?: string; email?: string; phone?: string; address?: Address; physicalAddress?: Address; mailingAddress?: Address };
type TenantProfileResponse = {
  tenant: { id: string; name: string; timezone: string; lifecycleState?: "ACTIVE" | "DISABLED_ARCHIVED"; branding: { assistantName: string } };
  profile: { legalName?: string; dbaName?: string; website?: string; primaryContact?: Contact } | null;
  branding: { logo?: { url?: string; storageRef?: string } } | null;
  subscription: { plan: string; status: string } | null;
  access: Array<{ displayName: string; email: string | null; role: string; active: boolean; firebaseUidBound: boolean }>;
};

const fallbackLogo: Record<string, string> = { aquatrace: "/tenant-packs/aquatrace/assets/banner-logo.png", "owens-bluewater-wash": "/assets/brand/owens-bluewater-wash-logo-transparent.png" };

async function request(user: User, path: string, init?: RequestInit): Promise<TenantProfileResponse> {
  const token = await user.getIdToken();
  const response = await fetch(path, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json() as TenantProfileResponse & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Tenant profile is unavailable.");
  return body;
}

function logoFor(data: TenantProfileResponse): string | undefined { return data.branding?.logo?.url ?? (data.branding?.logo?.storageRef ? `/api/public/tenant-branding/logo?tenantId=${encodeURIComponent(data.tenant.id)}` : fallbackLogo[data.tenant.id]); }
function currentAddress(contact: Contact): Address | undefined { return contact.address ?? contact.physicalAddress ?? contact.mailingAddress; }

export function NexCommandTenantProfilePanel({ user, tenantId, onBack }: { user: User | null; tenantId: string; onBack: () => void }): React.ReactElement {
  const [data, setData] = useState<TenantProfileResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [pendingLogoUrl, setPendingLogoUrl] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const load = async (): Promise<void> => { if (user) setData(await request(user, `/api/platform/admin/tenants/${encodeURIComponent(tenantId)}/profile`)); };
  useEffect(() => { void load().catch(() => setMessage("Tenant profile could not be loaded.")); }, [tenantId, user]);
  useEffect(() => () => { if (pendingLogoUrl) URL.revokeObjectURL(pendingLogoUrl); }, [pendingLogoUrl]);
  if (!data) return <section className="nexcommand__panel"><button className="tenant-action" type="button" onClick={onBack}>Back to Tenant Roster</button><p>{message || "Loading tenant profile…"}</p></section>;
  const profile = data.profile ?? {};
  const primary = profile.primaryContact ?? {};
  const displayedLogo = pendingLogoUrl || logoFor(data);

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
      const uploadedLogo = logoFile ? await uploadLogo(logoFile) : undefined;
      await request(user, `/api/platform/admin/tenants/${encodeURIComponent(tenantId)}/profile`, { method: "PATCH", body: JSON.stringify({ legalName: stringOrUndefined(form, "legalName"), dbaName: stringOrUndefined(form, "dbaName"), website: stringOrUndefined(form, "website"), primaryContact: contactFrom(form), tenant: { name: form.get("name"), timezone: form.get("timezone"), lifecycleState: form.get("lifecycleState"), ...(uploadedLogo ? { logoUrl: uploadedLogo } : {}) } }) });
      setLogoFile(null); setPendingLogoUrl(""); await load(); setEditing(false); setMessage("Tenant profile saved.");
    } catch { setMessage("The tenant profile was not saved. Check the required fields and image type."); } finally { setSaving(false); }
  }

  return <section className="nexcommand__panel tenant-profile">
    <button className="tenant-action" type="button" onClick={onBack}>Back to Tenant Roster</button>
    <div className="tenant-profile__heading"><div className="tenant-profile__heading-copy"><p className="ui-eyebrow">Tenant Profile</p><div className="tenant-profile__tenant-line"><h2>{data.tenant.name}</h2>{displayedLogo ? <img src={displayedLogo} alt={`${data.tenant.name} logo`} /> : <span>{data.tenant.name.slice(0, 1)}</span>}</div><p>{data.subscription?.plan ?? "No plan"} · {data.subscription?.status ?? "No subscription"}</p></div><button className="tenant-action" type="button" onClick={() => setEditing((value) => !value)}>{editing ? "Cancel" : "Edit Tenant"}</button></div>
    <form onSubmit={(event) => void save(event)}><fieldset disabled={!editing || saving}>
      <div className="tenant-profile__grid"><label>Tenant Name<input name="name" defaultValue={data.tenant.name} required /></label><label>Legal Business Name<input name="legalName" defaultValue={profile.legalName ?? ""} /></label><label>DBA / Public Name<input name="dbaName" defaultValue={profile.dbaName ?? ""} /></label><label>Website<input name="website" type="url" defaultValue={profile.website ?? ""} /></label><label>Timezone<input name="timezone" defaultValue={data.tenant.timezone} required /></label><label>Status<select name="lifecycleState" defaultValue={data.tenant.lifecycleState ?? "ACTIVE"}><option value="ACTIVE">Active</option><option value="DISABLED_ARCHIVED">Archived</option></select></label></div>
      <section className="tenant-profile__logo-control"><div><strong>Tenant Logo</strong>{displayedLogo ? <img src={displayedLogo} alt="Tenant logo preview" /> : null}</div><input ref={fileInput} name="logoFile" type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={chooseLogo} /><button className="tenant-action" type="button" onClick={() => fileInput.current?.click()}>Choose File</button><p>This logo is used throughout NexCommand, NexOps, and tenant-facing product areas.</p></section>
      <h3>Contact Details</h3><ContactFields contact={primary} />
    </fieldset>{editing ? <button className="tenant-action" type="submit" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button> : null}</form>
    <h3>Secure NexOps Access</h3><p>Firebase access requires a verified Firebase account bound to an active tenant membership. Firebase identifiers cannot be edited here.</p><div className="nexcommand__directory">{data.access.map((member) => <article key={`${member.email}-${member.displayName}`}><h3>{member.displayName}</h3><p>{member.email ?? "No email"} · {member.role} · {member.active ? "Active" : "Inactive"}</p><p>{member.active && member.firebaseUidBound ? "Firebase identity bound" : member.active ? "No Firebase identity bound" : "Inactive membership — no access"}</p></article>)}</div>{message ? <p className="nexcommand__notice">{message}</p> : null}
  </section>;
}
function ContactFields({ contact }: { contact: Contact }): React.ReactElement { return <><div className="tenant-profile__grid"><label>First Name<input name="firstName" defaultValue={contact.firstName ?? ""} required /></label><label>Last Name<input name="lastName" defaultValue={contact.lastName ?? ""} required /></label><label>Email<input type="email" name="email" defaultValue={contact.email ?? ""} /></label><label>Telephone<input name="phone" defaultValue={contact.phone ?? ""} /></label></div><h4>Address</h4><AddressFields address={currentAddress(contact)} /></>; }
function AddressFields({ address }: { address?: Address }): React.ReactElement { return <div className="tenant-profile__grid"><label>Street<input name="street1" defaultValue={address?.street1 ?? ""} /></label><label>Unit / Suite<input name="street2" defaultValue={address?.street2 ?? ""} /></label><label>City<input name="city" defaultValue={address?.city ?? ""} /></label><label>State / Province<input name="province" defaultValue={address?.province ?? ""} /></label><label>ZIP / Postal Code<input name="postalCode" defaultValue={address?.postalCode ?? ""} /></label><label>Country<input name="country" defaultValue={address?.country ?? ""} /></label></div>; }
function contactFrom(form: FormData): Contact { return { firstName: String(form.get("firstName") ?? "").trim(), lastName: String(form.get("lastName") ?? "").trim(), email: stringOrUndefined(form, "email"), phone: stringOrUndefined(form, "phone"), address: addressFrom(form) }; }
function addressFrom(form: FormData): Address | undefined { const address: Address = { street1: String(form.get("street1") ?? "").trim(), street2: String(form.get("street2") ?? "").trim(), city: String(form.get("city") ?? "").trim(), province: String(form.get("province") ?? "").trim(), postalCode: String(form.get("postalCode") ?? "").trim(), country: String(form.get("country") ?? "").trim() }; return Object.values(address).some(Boolean) ? address : undefined; }
function stringOrUndefined(form: FormData, name: string): string | undefined { const value = String(form.get(name) ?? "").trim(); return value || undefined; }
