import React, { useEffect, useState } from "react";
import type { User } from "firebase/auth";

type Address = { street1?: string; street2?: string; city?: string; province?: string; postalCode?: string; country?: string };
type Contact = { firstName?: string; lastName?: string; email?: string; phone?: string; physicalAddress?: Address; mailingAddress?: Address; mailingSameAsPhysical?: boolean; sameAsPrimary?: boolean };
type TenantProfileResponse = {
  tenant: { id: string; name: string; timezone: string; lifecycleState?: "ACTIVE" | "DISABLED_ARCHIVED"; branding: { assistantName: string } };
  profile: { legalName?: string; dbaName?: string; website?: string; primaryContact?: Contact; billingContact?: Contact } | null;
  branding: { logo?: { url?: string; storageRef?: string } } | null;
  subscription: { plan: string; status: string } | null;
  access: Array<{ displayName: string; email: string | null; role: string; active: boolean; firebaseUidBound: boolean }>;
};

const fallbackLogo: Record<string, string> = {
  aquatrace: "/tenant-packs/aquatrace/assets/banner-logo.png",
  "owens-bluewater-wash": "/assets/brand/owens-bluewater-wash-logo-transparent.png"
};

async function request(user: User, path: string, init?: RequestInit): Promise<TenantProfileResponse> {
  const token = await user.getIdToken();
  const response = await fetch(path, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json() as TenantProfileResponse & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Tenant profile is unavailable.");
  return body;
}

function logoFor(data: TenantProfileResponse): string | undefined {
  return data.branding?.logo?.url ?? (data.branding?.logo?.storageRef ? `/api/public/tenant-branding/logo?tenantId=${encodeURIComponent(data.tenant.id)}` : fallbackLogo[data.tenant.id]);
}

export function NexCommandTenantProfilePanel({ user, tenantId, onBack }: { user: User | null; tenantId: string; onBack: () => void }): React.ReactElement {
  const [data, setData] = useState<TenantProfileResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [billingSame, setBillingSame] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [pendingLogoUrl, setPendingLogoUrl] = useState("");

  const load = async (): Promise<void> => { if (user) setData(await request(user, `/api/platform/admin/tenants/${encodeURIComponent(tenantId)}/profile`)); };
  useEffect(() => { void load().catch(() => setMessage("Tenant profile could not be loaded.")); }, [tenantId, user]);
  useEffect(() => () => { if (pendingLogoUrl) URL.revokeObjectURL(pendingLogoUrl); }, [pendingLogoUrl]);

  if (!data) return <section className="nexcommand__panel"><button className="tenant-action tenant-action--secondary" type="button" onClick={onBack}>Back to Tenant Roster</button><p>{message || "Loading tenant profile…"}</p></section>;
  const profile = data.profile ?? {};
  const primary = profile.primaryContact ?? {};
  const billing = profile.billingContact ?? {};
  const savedLogo = logoFor(data);
  const displayedLogo = pendingLogoUrl || savedLogo;

  async function uploadLogo(file: File): Promise<string> {
    if (!user) throw new Error("You must be signed in to upload a logo.");
    const token = await user.getIdToken();
    const response = await fetch(`/api/platform/admin/tenants/${encodeURIComponent(tenantId)}/logo`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": file.type }, body: file });
    const body = await response.json() as { logoUrl?: string; error?: string };
    if (!response.ok || !body.logoUrl) throw new Error(body.error ?? "Logo upload failed.");
    return body.logoUrl;
  }

  function chooseLogo(event: React.ChangeEvent<HTMLInputElement>): void {
    const nextFile = event.target.files?.[0] ?? null;
    if (pendingLogoUrl) URL.revokeObjectURL(pendingLogoUrl);
    setLogoFile(nextFile);
    setPendingLogoUrl(nextFile ? URL.createObjectURL(nextFile) : "");
  }

  async function save(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!user) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setMessage("");
    try {
      const uploadedLogo = logoFile ? await uploadLogo(logoFile) : undefined;
      const primaryContact = contactFrom(form, "primary");
      const billingContact = billingSame ? { ...primaryContact, sameAsPrimary: true } : { ...contactFrom(form, "billing"), sameAsPrimary: false };
      await request(user, `/api/platform/admin/tenants/${encodeURIComponent(tenantId)}/profile`, {
        method: "PATCH",
        body: JSON.stringify({
          legalName: stringOrUndefined(form, "legalName"),
          dbaName: stringOrUndefined(form, "dbaName"),
          website: stringOrUndefined(form, "website"),
          primaryContact,
          billingContact,
          tenant: { name: form.get("name"), timezone: form.get("timezone"), lifecycleState: form.get("lifecycleState"), ...(uploadedLogo ? { logoUrl: uploadedLogo } : {}) }
        })
      });
      setLogoFile(null);
      setPendingLogoUrl("");
      await load();
      setEditing(false);
      setMessage("Tenant profile saved.");
    } catch {
      setMessage("The tenant profile was not saved. Check the required fields and image type.");
    } finally { setSaving(false); }
  }

  return <section className="nexcommand__panel tenant-profile">
    <button className="tenant-action tenant-action--secondary" type="button" onClick={onBack}>Back to Tenant Roster</button>
    <div className="tenant-profile__heading">
      <div className="tenant-profile__heading-copy"><p className="ui-eyebrow">Tenant Profile</p><div className="tenant-profile__tenant-line"><h2>{data.tenant.name}</h2>{displayedLogo ? <img src={displayedLogo} alt={`${data.tenant.name} logo`} /> : <span>{data.tenant.name.slice(0, 1)}</span>}</div><p>{data.subscription?.plan ?? "No plan"} · {data.subscription?.status ?? "No subscription"}</p></div>
      <button className="tenant-action" type="button" onClick={() => setEditing((value) => !value)}>{editing ? "Cancel" : "Edit Tenant"}</button>
    </div>
    <form onSubmit={(event) => void save(event)}>
      <fieldset disabled={!editing || saving}>
        <div className="tenant-profile__grid">
          <label>Tenant Name<input name="name" defaultValue={data.tenant.name} required /></label><label>Legal Business Name<input name="legalName" defaultValue={profile.legalName ?? ""} /></label>
          <label>DBA / Public Name<input name="dbaName" defaultValue={profile.dbaName ?? ""} /></label><label>Website<input name="website" type="url" defaultValue={profile.website ?? ""} /></label>
          <label>Timezone<input name="timezone" defaultValue={data.tenant.timezone} required /></label><label>Status<select name="lifecycleState" defaultValue={data.tenant.lifecycleState ?? "ACTIVE"}><option value="ACTIVE">Active</option><option value="DISABLED_ARCHIVED">Archived</option></select></label>
        </div>
        <div className="tenant-profile__logo-control"><div><strong>Tenant Logo</strong><p>This saved logo is used throughout NexCommand, NexOps, and every tenant-facing logo placement.</p></div>{displayedLogo ? <img src={displayedLogo} alt="Pending tenant logo preview" /> : null}<label className="tenant-action"><span>Choose Logo</span><input name="logoFile" type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={chooseLogo} /><span className="tenant-profile__file-name">{logoFile?.name ?? "Choose a file or take a photo"}</span></label></div>
        <h3>Primary Contact</h3><ContactFields prefix="primary" contact={primary} />
        <h3>Billing Contact</h3><label className="tenant-profile__check"><input type="checkbox" checked={billingSame} onChange={(event) => setBillingSame(event.target.checked)} />Billing contact and address are the same as primary contact.</label>{!billingSame ? <ContactFields prefix="billing" contact={billing} /> : null}
      </fieldset>
      {editing ? <button className="tenant-action" type="submit" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button> : null}
    </form>
    <h3>Secure NexOps Access</h3><p>Firebase access requires a verified Firebase account bound to an active tenant membership. Firebase identifiers cannot be edited here.</p>
    <div className="nexcommand__directory">{data.access.map((member) => <article key={`${member.email}-${member.displayName}`}><h3>{member.displayName}</h3><p>{member.email ?? "No email"} · {member.role} · {member.active ? "Active" : "Inactive"}</p><p>{member.active && member.firebaseUidBound ? "Firebase identity bound" : member.active ? "No Firebase identity bound" : "Inactive membership — no access"}</p></article>)}</div>
    {message ? <p className="nexcommand__notice">{message}</p> : null}
  </section>;
}

function ContactFields({ prefix, contact }: { prefix: string; contact: Contact }): React.ReactElement {
  const [preferred, setPreferred] = useState(contact.mailingSameAsPhysical !== false ? "physical" : "mailing");
  return <><div className="tenant-profile__grid"><label>First Name<input name={`${prefix}FirstName`} defaultValue={contact.firstName ?? ""} required /></label><label>Last Name<input name={`${prefix}LastName`} defaultValue={contact.lastName ?? ""} required /></label><label>Email<input type="email" name={`${prefix}Email`} defaultValue={contact.email ?? ""} /></label><label>Telephone<input name={`${prefix}Phone`} defaultValue={contact.phone ?? ""} /></label></div><h4>Physical Address</h4><AddressFields prefix={`${prefix}Physical`} address={contact.physicalAddress} /><section className="tenant-profile__preferred"><h4>Preferred Mailing Contact Address</h4><p>Select one address for mail and communications.</p><label><input type="radio" name={`${prefix}PreferredAddress`} value="physical" checked={preferred === "physical"} onChange={() => setPreferred("physical")} /> Use Physical Address</label><label><input type="radio" name={`${prefix}PreferredAddress`} value="mailing" checked={preferred === "mailing"} onChange={() => setPreferred("mailing")} /> Use Mailing Address</label></section>{preferred === "mailing" ? <><h4>Mailing Address</h4><AddressFields prefix={`${prefix}Mailing`} address={contact.mailingAddress} /></> : null}</>;
}

function AddressFields({ prefix, address }: { prefix: string; address?: Address }): React.ReactElement { return <div className="tenant-profile__grid"><label>Street<input name={`${prefix}Street1`} defaultValue={address?.street1 ?? ""} /></label><label>Unit / Suite<input name={`${prefix}Street2`} defaultValue={address?.street2 ?? ""} /></label><label>City<input name={`${prefix}City`} defaultValue={address?.city ?? ""} /></label><label>State / Province<input name={`${prefix}Province`} defaultValue={address?.province ?? ""} /></label><label>ZIP / Postal Code<input name={`${prefix}PostalCode`} defaultValue={address?.postalCode ?? ""} /></label><label>Country<input name={`${prefix}Country`} defaultValue={address?.country ?? ""} /></label></div>; }
function addressFrom(form: FormData, prefix: string): Address | undefined { const address: Address = { street1: String(form.get(`${prefix}Street1`) ?? "").trim(), street2: String(form.get(`${prefix}Street2`) ?? "").trim(), city: String(form.get(`${prefix}City`) ?? "").trim(), province: String(form.get(`${prefix}Province`) ?? "").trim(), postalCode: String(form.get(`${prefix}PostalCode`) ?? "").trim(), country: String(form.get(`${prefix}Country`) ?? "").trim() }; return Object.values(address).some(Boolean) ? address : undefined; }
function contactFrom(form: FormData, prefix: string): Contact { const physicalAddress = addressFrom(form, `${prefix}Physical`); const mailingSameAsPhysical = form.get(`${prefix}PreferredAddress`) !== "mailing"; return { firstName: String(form.get(`${prefix}FirstName`) ?? "").trim(), lastName: String(form.get(`${prefix}LastName`) ?? "").trim(), email: stringOrUndefined(form, `${prefix}Email`), phone: stringOrUndefined(form, `${prefix}Phone`), physicalAddress, mailingAddress: mailingSameAsPhysical ? physicalAddress : addressFrom(form, `${prefix}Mailing`), mailingSameAsPhysical }; }
function stringOrUndefined(form: FormData, name: string): string | undefined { const value = String(form.get(name) ?? "").trim(); return value || undefined; }
