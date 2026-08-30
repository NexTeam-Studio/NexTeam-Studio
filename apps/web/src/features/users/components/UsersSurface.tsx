import React, { useEffect, useState } from "react";
import "../styles/users.css";

type AccessLevel = "NONE" | "READ" | "CREATE" | "WRITE" | "MANAGE" | "DELETE" | "FULL";
export type MemberRole = "Owner" | "Office Admin" | "Technician";
export type UsersSurfaceView = "team" | "own-profile";

export interface NexOpsSignedInUser {
  id: string;
  name: string;
  title?: string;
  email: string;
  initials?: string;
  avatarUrl?: string;
  phone?: string;
  role?: MemberRole;
}

export interface NexOpsTeamMember extends NexOpsSignedInUser {
  role: MemberRole;
  lastActive: string;
  assigned: boolean;
  color?: string;
  permissionOverrides?: Partial<Record<string, AccessLevel>>;
  active?: boolean;
}

export interface UsersSurfaceProps {
  /** The authenticated person supplied by Global's auth/session layer. */
  signedInUser?: NexOpsSignedInUser;
  /** Tenant-scoped people supplied by the Users data layer. */
  teamMembers?: NexOpsTeamMember[];
  /** Lets Global open the signed-in person's profile without owning profile state. */
  initialView?: UsersSurfaceView;
  tenantId?: string;
  getAccessToken?: () => Promise<string>;
}

interface NotificationPreferences { daily: boolean; activity: boolean; platform: boolean; marketing: boolean; }
interface ProfileDraft { firstName: string; middleName: string; lastName: string; title: string; email: string; phone: string; streetAddress: string; city: string; stateProvince: string; zipCode: string; avatarDataUrl: string; notificationPreferences: NotificationPreferences; }

interface TeamMember extends NexOpsTeamMember {
  id: string;
  initials: string;
  title: string;
  phone: string;
  color: string;
}

const permissionAreas = ["CLIENTS", "PROPERTIES", "REQUESTS", "QUOTES", "JOBS", "VISITS", "SCHEDULING", "PRODUCTS_AND_SERVICES", "INVOICES", "PAYMENTS", "REPORTS", "NEXDOCS", "NEXCAM", "TEAM", "SETTINGS", "COMMUNICATIONS", "AUTOMATIONS", "APPROVALS", "IMPORTS", "VIEW_AS_CLIENT"];
const permissionLevels: AccessLevel[] = ["NONE", "READ", "CREATE", "WRITE", "MANAGE", "DELETE", "FULL"];

export const workingHours = [
  ["Sunday", "Unavailable"], ["Monday", "8:00 AM – 4:30 PM"], ["Tuesday", "8:00 AM – 4:30 PM"],
  ["Wednesday", "8:00 AM – 4:30 PM"], ["Thursday", "8:00 AM – 4:30 PM"], ["Friday", "8:00 AM – 3:30 PM"], ["Saturday", "Unavailable"],
];

export function UsersSurface(props: UsersSurfaceProps = {}): React.ReactElement {
  const [members, setMembers] = useState<TeamMember[]>(() => normalizeMembers(props.teamMembers ?? []));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<UsersSurfaceView>(props.initialView ?? "team");
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [saved, setSaved] = useState(false);

  const selected = members.find((member) => member.id === selectedId);
  const assigned = members.filter((member) => member.assigned);
  const unassigned = members.filter((member) => !member.assigned);
  const filteredAssigned = filterMembers(assigned, query);
  const filteredUnassigned = filterMembers(unassigned, query);
  const signedInMember = props.signedInUser ? toTeamMember(props.signedInUser) : undefined;
  const canManageTeam = props.signedInUser?.role === "Owner" || props.signedInUser?.role === "Office Admin";

  useEffect(() => {
    setView(props.initialView ?? "team");
  }, [props.initialView]);

  useEffect(() => { let cancelled = false; if (!props.tenantId || !props.getAccessToken) return; void (async () => { try { const token = await props.getAccessToken(); const response = await fetch(`/api/platform/tenants/${encodeURIComponent(props.tenantId)}/users`, { headers: token ? { authorization: `Bearer ${token}` } : {} }); const body = await response.json() as { ok?: boolean; users?: Array<{ id: string; displayName: string; email?: string; role: "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN"; active: boolean; updatedAt: string; permissionOverrides?: Partial<Record<string, AccessLevel>> }> }; if (response.ok && body.ok && !cancelled) setMembers(normalizeMembers((body.users ?? []).map((user) => ({ id: user.id, name: user.displayName, email: user.email ?? "", role: roleLabel(user.role), lastActive: user.updatedAt, assigned: user.active, active: user.active, permissionOverrides: user.permissionOverrides })))); } catch { /* Keep any supplied tenant list visible while offline. */ } })(); return () => { cancelled = true; }; }, [props.tenantId, props.getAccessToken]);

  function selectMember(id: string): void {
    setSelectedId(id);
    setSaved(false);
  }

  function assignSeat(id: string): void {
    setMembers((current) => current.map((member) => member.id === id ? { ...member, assigned: true } : member));
  }

  if (view === "own-profile" && signedInMember) {
    return <MemberEditor member={signedInMember} ownProfile canManageTeam={canManageTeam} tenantId={props.tenantId} getAccessToken={props.getAccessToken} onBack={() => setView("team")} onSave={() => setSaved(true)} saved={saved} />;
  }

  if (selected) {
    return <MemberEditor member={selected} canManageTeam={canManageTeam} tenantId={props.tenantId} getAccessToken={props.getAccessToken} onBack={() => setSelectedId(null)} onSave={() => setSaved(true)} saved={saved} />;
  }

  return (
    <main className="users-surface">
      <header className="users-hero">
        <div>
          <p className="users-kicker">NexOps / Team</p>
          <h1 className="users-page-title"><TeamTitleIcon /> <span>Team</span></h1>
          <p>Invite your crew, give each person the access they need, and keep everyone ready for the day.</p>
        </div>
        <button className="users-primary" type="button" onClick={() => { setInviteOpen(true); setInviteSent(false); }}>Invite team member <span>+</span></button>
      </header>

      <section className="users-summary" aria-label="Team seat summary">
        <div className="users-summary__copy"><span className="users-summary__label">Team seats</span><strong>{assigned.length} of 8 assigned</strong><p>{8 - assigned.length} seats are ready for your next teammate.</p></div>
        <div className="users-seat-meter" aria-hidden><span style={{ width: `${(assigned.length / 8) * 100}%` }} /></div>
        <button type="button" className="users-secondary">Manage seats</button>
      </section>

      <section className="users-roster-card">
        <div className="users-card-heading"><div><p className="users-kicker">Your team</p><h2>Assigned seats <span>{assigned.length}</span></h2></div><label className="users-search"><span aria-hidden>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search team" aria-label="Search team members" /></label></div>
        <MemberTable members={filteredAssigned} onSelect={selectMember} canManageTeam={canManageTeam} />
      </section>

      <section className="users-roster-card users-roster-card--unassigned">
        <div className="users-card-heading"><div><p className="users-kicker">Seats available</p><h2>Ready to assign <span>{unassigned.length}</span></h2><p className="users-card-detail">Add a seat when someone needs access to NexOps.</p></div></div>
        <MemberTable members={filteredUnassigned} onSelect={selectMember} canManageTeam={canManageTeam} action={canManageTeam ? { label: "Assign seat", onClick: assignSeat } : undefined} />
      </section>

      {inviteOpen ? <InviteDialog tenantId={props.tenantId} getAccessToken={props.getAccessToken} onClose={() => setInviteOpen(false)} onSend={(member) => { setMembers((current) => [...current, member]); setInviteSent(true); }} sent={inviteSent} /> : null}
    </main>
  );
}

function MemberTable(props: { members: TeamMember[]; onSelect: (id: string) => void; canManageTeam: boolean; action?: { label: string; onClick: (id: string) => void } }): React.ReactElement {
  return <div className="users-table-wrap"><table className="users-table"><thead><tr><th>Team member</th><th>Role</th><th>Last active</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{props.members.map((member) => <tr key={member.id}><td>{props.canManageTeam ? <button type="button" className="users-member" onClick={() => props.onSelect(member.id)}><Avatar member={member} /><span><strong>{member.name}</strong><small>{member.email}</small></span></button> : <span className="users-member"><Avatar member={member} /><span><strong>{member.name}</strong><small>{member.email}</small></span></span>}</td><td><span className={`users-role users-role--${roleTone(member.role)}`}>{member.role}</span></td><td>{member.lastActive}</td><td>{props.action ? <button type="button" className="users-text-button" onClick={() => props.action?.onClick(member.id)}>{props.action.label}</button> : props.canManageTeam ? <button type="button" className="users-row-button" aria-label={`Edit ${member.name}`} onClick={() => props.onSelect(member.id)}>Edit</button> : null}</td></tr>)}</tbody></table>{props.members.length === 0 ? <p className="users-empty">No team members match that search.</p> : null}</div>;
}

function MemberEditor(props: { member: TeamMember; ownProfile?: boolean; canManageTeam: boolean; tenantId?: string; getAccessToken?: () => Promise<string>; onBack: () => void; onSave: () => void; saved: boolean }): React.ReactElement {
  const [tab, setTab] = useState<"profile" | "permissions" | "preferences">("profile");
  const [role, setRole] = useState<MemberRole>(props.member.role);
  const [administrator, setAdministrator] = useState(props.member.role === "Owner");
  const [access, setAccess] = useState<Record<string, AccessLevel>>(props.member.permissionOverrides ?? {});
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(() => profileDraftFor(props.member));

  useEffect(() => { let cancelled = false; if (!props.tenantId || !props.getAccessToken) return; void (async () => { try { const token = await props.getAccessToken?.(); const response = await fetch(`/api/nexops/users/${encodeURIComponent(props.member.id)}/profile?tenantId=${encodeURIComponent(props.tenantId ?? "")}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }); const body = await response.json() as { ok: boolean; profile?: Partial<ProfileDraft> | null }; if (body.ok && body.profile && !cancelled) setProfileDraft((current) => ({ ...current, ...body.profile, notificationPreferences: { ...current.notificationPreferences, ...body.profile?.notificationPreferences } })); } catch { /* Existing identity values remain editable when initial load fails. */ } })(); return () => { cancelled = true; }; }, [props.member.id, props.tenantId, props.getAccessToken]);

  async function saveChanges(): Promise<void> {
    if (!props.tenantId || !props.getAccessToken) { setSaveError("Profile storage is not connected."); return; }
    setSaving(true); setSaveError("");
    try { const token = await props.getAccessToken(); if (!props.ownProfile && props.canManageTeam) { const teamResponse = await fetch(`/api/platform/tenants/${encodeURIComponent(props.tenantId)}/users`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ id: props.member.id, displayName: props.member.name, email: props.member.email || undefined, role: roleCode(role), active: props.member.active ?? props.member.assigned, permissionOverrides: access }) }); const teamBody = await teamResponse.json() as { ok?: boolean; error?: string }; if (!teamResponse.ok || !teamBody.ok) throw new Error(teamBody.error ?? "Unable to save team permissions."); } const response = await fetch(`/api/nexops/users/${encodeURIComponent(props.member.id)}/profile`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ tenantId: props.tenantId, profile: profileDraft }) }); const body = await response.json() as { ok: boolean; error?: string; profile?: ProfileDraft }; if (!response.ok || !body.ok) throw new Error(body.error ?? "Unable to save profile."); if (body.profile) setProfileDraft(body.profile); props.onSave(); setDirty(false); } catch (error) { setSaveError(error instanceof Error ? error.message : "Unable to save profile."); } finally { setSaving(false); }
  }

  async function selectProfilePhoto(file: File | undefined): Promise<void> {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setSaveError("Choose an image file for the profile photo."); return; }
    if (file.size > 350_000) { setSaveError("Choose a profile photo smaller than 350 KB."); return; }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Unable to read profile photo."));
      reader.onerror = () => reject(new Error("Unable to read profile photo."));
      reader.readAsDataURL(file);
    });
    setProfileDraft((current) => ({ ...current, avatarDataUrl: dataUrl }));
    setSaveError("");
    setDirty(true);
  }

  return <main className="users-surface users-member-editor">
    <button type="button" className="users-back" onClick={props.onBack}>← Back to team</button>
    <header className="users-editor-heading"><div>{props.ownProfile ? null : <p className="users-kicker">Team Member</p>}{props.ownProfile ? <h1 className="users-page-title"><PersonTitleIcon /> <span>My Profile</span></h1> : <h1>{props.member.name}</h1>}<div className="users-profile-identity"><Avatar member={props.member} large photoUrl={profileDraft.avatarDataUrl || undefined} /><label className="users-photo-action"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { void selectProfilePhoto(event.target.files?.[0]); event.currentTarget.value = ""; }} />{profileDraft.avatarDataUrl ? "Change Photo" : "Add Photo"}</label><div><strong>{props.member.name}</strong><span>{props.member.title}</span></div></div></div></header>
    <div className="users-tabs" role="tablist" aria-label="Team member editor"><button type="button" className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>Profile</button><button type="button" className={tab === "permissions" ? "active" : ""} onClick={() => setTab("permissions")}>Role & access</button><button type="button" className={tab === "preferences" ? "active" : ""} onClick={() => setTab("preferences")}>Preferences</button></div>
    {tab === "profile" ? <ProfilePanel draft={profileDraft} onChange={(patch) => { setProfileDraft((current) => ({ ...current, ...patch })); setDirty(true); }} /> : null}
    {tab === "permissions" ? <PermissionsPanel role={role} setRole={(nextRole) => { if (nextRole !== role && window.confirm(`Change ${props.member.name} to ${nextRole}? This resets their individual permission overrides to that tier's defaults.`)) { setRole(nextRole); setAccess({}); setDirty(true); } }} administrator={administrator} setAdministrator={(value) => { setAdministrator(value); setDirty(true); }} access={access} setAccess={(nextAccess) => { setAccess(nextAccess); setDirty(true); }} editable={props.canManageTeam && !props.ownProfile} /> : null}
    {tab === "preferences" ? <PreferencesPanel subscriptions={profileDraft.notificationPreferences} setSubscriptions={(notificationPreferences) => { setProfileDraft((current) => ({ ...current, notificationPreferences })); setDirty(true); }} /> : null}
    {saveError ? <p className="users-profile-error" role="alert">{saveError}</p> : null}{dirty ? <button type="button" className="users-profile-save" onClick={() => void saveChanges()} aria-label="Save changes" title="Save changes" disabled={saving}>{saving ? "…" : "✓"}</button> : null}
    {!props.ownProfile && props.canManageTeam ? <button type="button" className="users-profile-deactivate">Deactivate user</button> : null}
  </main>;
}

function ProfilePanel(props: { draft: ProfileDraft; onChange: (patch: Partial<ProfileDraft>) => void }): React.ReactElement {
  return <div className="users-editor-grid"><section className="users-panel"><div className="users-panel-heading"><div><p className="users-kicker">Contact Details</p><h2>Personal Information</h2></div></div><div className="users-form-grid"><Field label="First Name" value={props.draft.firstName} required onChange={(value) => props.onChange({ firstName: value })} /><Field label="Middle Name" value={props.draft.middleName} optional onChange={(value) => props.onChange({ middleName: value })} /><Field label="Last Name" value={props.draft.lastName} required onChange={(value) => props.onChange({ lastName: value })} /><Field label="Title" value={props.draft.title} onChange={(value) => props.onChange({ title: value })} /><Field label="Email Address" value={props.draft.email} onChange={(value) => props.onChange({ email: value })} /><Field label="Mobile Number" value={props.draft.phone} onChange={(value) => props.onChange({ phone: value })} /><Field label="Street Address" value={props.draft.streetAddress} onChange={(value) => props.onChange({ streetAddress: value })} /><Field label="City" value={props.draft.city} onChange={(value) => props.onChange({ city: value })} /><Field label="State / Province" value={props.draft.stateProvince} onChange={(value) => props.onChange({ stateProvince: value })} /><Field label="Zip Code" value={props.draft.zipCode} onChange={(value) => props.onChange({ zipCode: value })} /></div></section></div>;
}

function PermissionsPanel(props: { role: MemberRole; setRole: (role: MemberRole) => void; administrator: boolean; setAdministrator: (value: boolean) => void; access: Record<string, AccessLevel>; setAccess: (access: Record<string, AccessLevel>) => void; editable: boolean }): React.ReactElement {
  return <div className="users-editor-grid"><section className="users-panel users-panel--wide"><p className="users-kicker">Access control</p><h2>Role & permissions</h2><p className="users-panel-detail">The assigned tier remains this person’s role label. Individual settings below override only the selected area.</p><div className="users-presets"><h3>Assigned tier</h3><p>Changing a tier requires confirmation and resets individual overrides.</p><div>{(["Technician", "Office Admin", "Owner"] as MemberRole[]).map((role) => <button type="button" key={role} disabled={!props.editable} className={props.role === role ? "selected" : ""} onClick={() => props.setRole(role)}><span className="users-radio" /> <strong>{role}</strong><small>{roleDescription(role)}</small></button>)}</div></div><div className="users-permission-list"><h3>Detailed access</h3>{permissionAreas.map((area) => <div className="users-permission-row" key={area}><div><strong>{area.replaceAll("_", " ")}</strong><small>Override this area without changing the assigned tier.</small></div><select value={props.access[area] ?? ""} disabled={!props.editable} onChange={(event) => { const next = { ...props.access }; if (!event.target.value) delete next[area]; else next[area] = event.target.value as AccessLevel; props.setAccess(next); }} aria-label={`${area} access`}><option value="">Tier default</option>{permissionLevels.map((level) => <option key={level}>{level}</option>)}</select></div>)}</div></section></div>;
}

function PreferencesPanel(props: { subscriptions: Record<string, boolean>; setSubscriptions: (value: Record<string, boolean>) => void }): React.ReactElement {
  const entries: Array<[string, string, string]> = [["daily", "Daily work summary", "A short summary of today’s schedule and work that needs attention."], ["activity", "Team activity updates", "Updates when work assigned to this person changes."], ["platform", "Product and account notices", "Important account, security, and feature notices."], ["marketing", "NexTeam tips and updates", "Occasional tips for running a better operation."]];
  return <div className="users-editor-grid"><section className="users-panel users-panel--wide"><p className="users-kicker">Communications</p><h2>Email preferences</h2><p className="users-panel-detail">Choose the operational updates this team member receives.</p><div className="users-subscriptions">{entries.map(([key, title, description]) => <label key={key}><input type="checkbox" checked={props.subscriptions[key]} onChange={(event) => props.setSubscriptions({ ...props.subscriptions, [key]: event.target.checked })} /><span><strong>{title}</strong><small>{description}</small></span></label>)}</div></section></div>;
}

function InviteDialog(props: { tenantId?: string; getAccessToken?: () => Promise<string>; onClose: () => void; onSend: (member: TeamMember) => void; sent: boolean }): React.ReactElement {
  const [email, setEmail] = useState(""); const [role, setRole] = useState<MemberRole>("Technician"); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function createInvite(): Promise<void> { if (!props.tenantId || !props.getAccessToken) { setError("Team storage is not connected."); return; } setSaving(true); setError(""); try { const token = await props.getAccessToken(); const response = await fetch(`/api/platform/tenants/${encodeURIComponent(props.tenantId)}/invites`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ email, role: roleCode(role) }) }); const body = await response.json() as { ok?: boolean; error?: string; invite?: { id: string; displayName: string; email?: string; role: "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN"; updatedAt: string; permissionOverrides?: Partial<Record<string, AccessLevel>> } }; if (!response.ok || !body.ok || !body.invite) throw new Error(body.error ?? "Unable to create pending invite."); props.onSend(normalizeMembers([{ id: body.invite.id, name: body.invite.displayName, email: body.invite.email ?? email, role: roleLabel(body.invite.role), lastActive: "Pending invite", assigned: false, active: false, permissionOverrides: body.invite.permissionOverrides }])[0]); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create pending invite."); } finally { setSaving(false); } }
  return <div className="users-dialog-backdrop" role="presentation"><section className="users-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-title"><button type="button" className="users-dialog-close" onClick={props.onClose} aria-label="Close invite dialog">×</button>{props.sent ? <><p className="users-kicker">Team invitation sent</p><h2 id="invite-title">Password setup email delivered</h2><p>The membership stays pending until the invited person sets a password, verifies their email, and signs in for the first time.</p><button type="button" className="users-primary" onClick={props.onClose}>Done</button></> : <><p className="users-kicker">Grow Your Team</p><h2 id="invite-title">Invite a Team Member</h2><p>Create a pending access record and send its password-setup link.</p><div className="users-form-grid"><Field label="Email Address" value={email} placeholder="teammate@company.com" onChange={setEmail} /></div><label className="users-dialog-label">Starting Role<select value={role} onChange={(event) => setRole(event.target.value as MemberRole)}><option>Technician</option><option>Office Admin</option></select></label>{error ? <p className="users-profile-error" role="alert">{error}</p> : null}<div className="users-dialog-actions"><button type="button" className="users-secondary" onClick={props.onClose}>Cancel</button><button type="button" className="users-primary" disabled={saving || !email} onClick={() => void createInvite()}>{saving ? "Creating…" : "Send invitation"}</button></div></>}</section></div>;
}

function TeamTitleIcon(): React.ReactElement {
  return <svg className="users-page-title__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5a5.5 5.5 0 0 1 11 0V20" /><path d="M16 5.5a3 3 0 0 1 0 5.7" /><path d="M18.5 20v-1.5a5.5 5.5 0 0 0-2.6-4.7" /></svg>;
}

function PersonTitleIcon(): React.ReactElement {
  return <svg className="users-page-title__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>;
}

function Avatar(props: { member: TeamMember; large?: boolean; photoUrl?: string }): React.ReactElement {
  const photoUrl = props.photoUrl ?? props.member.avatarUrl;
  const className = `users-avatar users-avatar--${props.member.color}${props.large ? " users-avatar--large" : ""}${photoUrl ? "" : " users-avatar--placeholder"}`;
  return <span className={className}>{photoUrl ? <img src={photoUrl} alt="" /> : props.member.initials}</span>;
}

function normalizeMembers(members: NexOpsTeamMember[]): TeamMember[] {
  return members.map((member, index) => ({
    ...member,
    initials: member.initials ?? initialsFor(member.name),
    title: member.title ?? member.role,
    phone: member.phone ?? "",
    color: member.color ?? colorFor(index),
  }));
}

function toTeamMember(user: NexOpsSignedInUser): TeamMember {
  return normalizeMembers([{
    ...user,
    initials: user.initials ?? initialsFor(user.name),
    title: user.title ?? user.role ?? "Technician",
    phone: user.phone ?? "",
    role: user.role ?? "Technician",
    lastActive: "Signed in now",
    assigned: true,
    color: "aqua",
  }])[0];
}

function initialsFor(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function colorFor(index: number): string {
  const colors = ["aqua", "violet", "coral", "gold", "pink"];
  return colors[index % colors.length] ?? "aqua";
}

function Field(props: { label: string; value: string; placeholder?: string; required?: boolean; optional?: boolean; onChange?: (value: string) => void }): React.ReactElement { return <label className="users-field"><span>{props.label}{props.required ? <b aria-label="required"> *</b> : null}{props.optional ? <em> (optional)</em> : null}</span><input value={props.value} placeholder={props.placeholder} required={props.required} onChange={(event) => props.onChange?.(event.target.value)} /></label>; }
function profileDraftFor(member: TeamMember): ProfileDraft { const { firstName, middleName, lastName } = nameParts(member.name); return { firstName, middleName, lastName, title: member.title, email: member.email, phone: member.phone, streetAddress: "", city: "", stateProvince: "", zipCode: "", avatarDataUrl: "", notificationPreferences: { daily: true, activity: true, platform: true, marketing: false } }; }
function nameParts(name: string): { firstName: string; middleName: string; lastName: string } { const parts = name.trim().split(/\s+/).filter(Boolean); return { firstName: parts[0] ?? "", middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : "", lastName: parts.length > 1 ? parts.at(-1) ?? "" : "" }; }
function filterMembers(members: TeamMember[], query: string): TeamMember[] { const term = query.trim().toLowerCase(); return term ? members.filter((member) => `${member.name} ${member.email} ${member.role}`.toLowerCase().includes(term)) : members; }
function roleTone(role: MemberRole): string { return role === "Owner" ? "owner" : role === "Office Admin" ? "admin" : role === "Technician" ? "tech" : "custom"; }
function roleDescription(role: MemberRole): string { return role === "Technician" ? "Field work, their schedule, and assigned jobs." : role === "Office Admin" ? "Office workflow, clients, scheduling, and billing support." : "Full business oversight and team management."; }
function roleLabel(role: "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN"): MemberRole { return role === "OWNER" ? "Owner" : role === "OFFICE_ADMIN" ? "Office Admin" : "Technician"; }
function roleCode(role: MemberRole): "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN" { return role === "Owner" ? "OWNER" : role === "Office Admin" ? "OFFICE_ADMIN" : "TECHNICIAN"; }
