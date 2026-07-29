import React, { useEffect, useState } from "react";
import "../styles/users.css";

type AccessLevel = "None" | "View" | "Create & edit" | "Full access";
export type MemberRole = "Owner" | "Office Admin" | "Technician" | "Custom";
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
}

export interface UsersSurfaceProps {
  /** The authenticated person supplied by Global's auth/session layer. */
  signedInUser?: NexOpsSignedInUser;
  /** Tenant-scoped people supplied by the Users data layer. */
  teamMembers?: NexOpsTeamMember[];
  /** Lets Global open the signed-in person's profile without owning profile state. */
  initialView?: UsersSurfaceView;
}

interface TeamMember extends NexOpsTeamMember {
  id: string;
  initials: string;
  title: string;
  phone: string;
  color: string;
}

const startingMembers: TeamMember[] = [
  { id: "maria", initials: "MC", name: "Maria Chen", title: "Office Coordinator", email: "maria@nexops.demo", phone: "(555) 013-2841", role: "Office Admin", lastActive: "Today, 8:42 AM", assigned: true, color: "coral" },
  { id: "avery", initials: "AB", name: "Avery Brooks", title: "Founder", email: "avery@nexops.demo", phone: "(555) 013-8910", role: "Owner", lastActive: "Today, 7:15 AM", assigned: true, color: "violet" },
  { id: "nolan", initials: "NR", name: "Nolan Rivera", title: "Field Technician", email: "nolan@nexops.demo", phone: "(555) 013-1664", role: "Technician", lastActive: "Yesterday", assigned: true, color: "aqua" },
  { id: "jordan", initials: "JP", name: "Jordan Patel", title: "Field Technician", email: "jordan@nexops.demo", phone: "(555) 013-2098", role: "Technician", lastActive: "Jul 24, 2026", assigned: false, color: "gold" },
  { id: "riley", initials: "RW", name: "Riley Wilson", title: "Field Technician", email: "riley@nexops.demo", phone: "(555) 013-7823", role: "Technician", lastActive: "Jul 19, 2026", assigned: false, color: "pink" },
];

const permissionGroups = [
  ["Schedule", "View and complete their own schedule", "Edit their own schedule", "Manage everyone’s schedule"],
  ["Clients & properties", "View client details", "Create and edit client details", "Manage all client records"],
  ["Requests", "View requests", "Create and edit requests", "Manage request lifecycle"],
  ["Quotes & invoices", "View pricing", "Create and edit quotes", "Send invoices and record payments"],
  ["Jobs & visits", "View assigned work", "Create and edit jobs", "Manage and close jobs"],
  ["Files & media", "View job files and media", "Upload job files and media", "Manage shared files and media"],
  ["Notes", "View work notes", "Add and edit notes", "Delete notes"],
];

const workingHours = [
  ["Sunday", "Unavailable"], ["Monday", "8:00 AM – 4:30 PM"], ["Tuesday", "8:00 AM – 4:30 PM"],
  ["Wednesday", "8:00 AM – 4:30 PM"], ["Thursday", "8:00 AM – 4:30 PM"], ["Friday", "8:00 AM – 3:30 PM"], ["Saturday", "Unavailable"],
];

export function UsersSurface(props: UsersSurfaceProps = {}): React.ReactElement {
  const [members, setMembers] = useState<TeamMember[]>(() => normalizeMembers(props.teamMembers ?? startingMembers));
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

  function selectMember(id: string): void {
    setSelectedId(id);
    setSaved(false);
  }

  function assignSeat(id: string): void {
    setMembers((current) => current.map((member) => member.id === id ? { ...member, assigned: true } : member));
  }

  if (view === "own-profile" && signedInMember) {
    return <MemberEditor member={signedInMember} ownProfile canManageTeam={canManageTeam} onBack={() => setView("team")} onSave={() => setSaved(true)} saved={saved} />;
  }

  if (selected) {
    return <MemberEditor member={selected} canManageTeam={canManageTeam} onBack={() => setSelectedId(null)} onSave={() => setSaved(true)} saved={saved} />;
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
        <MemberTable members={filteredAssigned} onSelect={selectMember} />
      </section>

      <section className="users-roster-card users-roster-card--unassigned">
        <div className="users-card-heading"><div><p className="users-kicker">Seats available</p><h2>Ready to assign <span>{unassigned.length}</span></h2><p className="users-card-detail">Add a seat when someone needs access to NexOps.</p></div></div>
        <MemberTable members={filteredUnassigned} onSelect={selectMember} action={{ label: "Assign seat", onClick: assignSeat }} />
      </section>

      {inviteOpen ? <InviteDialog onClose={() => setInviteOpen(false)} onSend={() => setInviteSent(true)} sent={inviteSent} /> : null}
    </main>
  );
}

function MemberTable(props: { members: TeamMember[]; onSelect: (id: string) => void; action?: { label: string; onClick: (id: string) => void } }): React.ReactElement {
  return <div className="users-table-wrap"><table className="users-table"><thead><tr><th>Team member</th><th>Role</th><th>Last active</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{props.members.map((member) => <tr key={member.id}><td><button type="button" className="users-member" onClick={() => props.onSelect(member.id)}><Avatar member={member} /><span><strong>{member.name}</strong><small>{member.email}</small></span></button></td><td><span className={`users-role users-role--${roleTone(member.role)}`}>{member.role}</span></td><td>{member.lastActive}</td><td>{props.action ? <button type="button" className="users-text-button" onClick={() => props.action?.onClick(member.id)}>{props.action.label}</button> : <button type="button" className="users-row-button" aria-label={`Edit ${member.name}`} onClick={() => props.onSelect(member.id)}>Edit</button>}</td></tr>)}</tbody></table>{props.members.length === 0 ? <p className="users-empty">No team members match that search.</p> : null}</div>;
}

function MemberEditor(props: { member: TeamMember; ownProfile?: boolean; canManageTeam: boolean; onBack: () => void; onSave: () => void; saved: boolean }): React.ReactElement {
  const [tab, setTab] = useState<"profile" | "permissions" | "preferences">("profile");
  const [role, setRole] = useState<MemberRole>(props.member.role);
  const [administrator, setAdministrator] = useState(props.member.role === "Owner");
  const [access, setAccess] = useState<Record<string, AccessLevel>>({
    "Schedule": "Create & edit", "Clients & properties": "View", "Requests": "Create & edit", "Quotes & invoices": "None", "Jobs & visits": "Create & edit", "Files & media": "View", "Notes": "Create & edit",
  });
  const [subscriptions, setSubscriptions] = useState({ daily: true, activity: true, platform: false, marketing: false });
  const [dirty, setDirty] = useState(false);

  function saveChanges(): void {
    props.onSave();
    setDirty(false);
  }

  return <main className="users-surface users-member-editor">
    <button type="button" className="users-back" onClick={props.onBack}>← Back to team</button>
    <header className="users-editor-heading"><div>{props.ownProfile ? null : <p className="users-kicker">Team Member</p>}{props.ownProfile ? <h1 className="users-page-title"><PersonTitleIcon /> <span>My Profile</span></h1> : <h1>{props.member.name}</h1>}<div className="users-profile-identity"><Avatar member={props.member} large /><div><strong>{props.member.name}</strong><span>{props.member.title}</span></div></div></div></header>
    <div className="users-tabs" role="tablist" aria-label="Team member editor"><button type="button" className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>Profile</button><button type="button" className={tab === "permissions" ? "active" : ""} onClick={() => setTab("permissions")}>Role & access</button><button type="button" className={tab === "preferences" ? "active" : ""} onClick={() => setTab("preferences")}>Preferences</button></div>
    {tab === "profile" ? <ProfilePanel member={props.member} onEdit={() => setDirty(true)} /> : null}
    {tab === "permissions" ? <PermissionsPanel role={role} setRole={(nextRole) => { setRole(nextRole); setDirty(true); }} administrator={administrator} setAdministrator={(value) => { setAdministrator(value); setDirty(true); }} access={access} setAccess={(nextAccess) => { setAccess(nextAccess); setDirty(true); }} /> : null}
    {tab === "preferences" ? <PreferencesPanel subscriptions={subscriptions} setSubscriptions={(nextSubscriptions) => { setSubscriptions(nextSubscriptions); setDirty(true); }} /> : null}
    {dirty ? <button type="button" className="users-profile-save" onClick={saveChanges} aria-label="Save changes" title="Save changes">✓</button> : null}
    {!props.ownProfile && props.canManageTeam ? <button type="button" className="users-profile-deactivate">Deactivate user</button> : null}
  </main>;
}

function ProfilePanel(props: { member: TeamMember; onEdit: () => void }): React.ReactElement {
  const { firstName, middleName, lastName } = nameParts(props.member.name);
  return <div className="users-editor-grid"><section className="users-panel"><div className="users-panel-heading"><div><p className="users-kicker">Contact Details</p><h2>Personal Information</h2></div><button type="button" className="users-text-button" onClick={props.onEdit}>Change Photo</button></div><div className="users-form-grid"><Field label="First Name" value={firstName} required onChange={props.onEdit} /><Field label="Middle Name" value={middleName} optional onChange={props.onEdit} /><Field label="Last Name" value={lastName} required onChange={props.onEdit} /><Field label="Title" value={props.member.title} placeholder="e.g. Field Technician" onChange={props.onEdit} /><Field label="Email Address" value={props.member.email} onChange={props.onEdit} /><Field label="Mobile Number" value={props.member.phone} onChange={props.onEdit} /><Field label="Street Address" value="" placeholder="Add street address" onChange={props.onEdit} /><Field label="City" value="" placeholder="Add city" onChange={props.onEdit} /><Field label="State / Province" value="" placeholder="Add state or province" onChange={props.onEdit} /><Field label="Zip Code" value="" placeholder="Add zip code" onChange={props.onEdit} /></div></section><section className="users-panel"><p className="users-kicker">Field Readiness</p><h2>Working Hours</h2><p className="users-panel-detail">Availability is used by scheduling and helps the office know who can be assigned.</p><div className="users-hours">{workingHours.map(([day, hours]) => <div key={day}><span>{day}</span><strong className={hours === "Unavailable" ? "muted" : ""}>{hours}</strong></div>)}</div><button className="users-secondary users-full-width" type="button" onClick={props.onEdit}>Edit Working Hours</button></section></div>;
}

function PermissionsPanel(props: { role: MemberRole; setRole: (role: MemberRole) => void; administrator: boolean; setAdministrator: (value: boolean) => void; access: Record<string, AccessLevel>; setAccess: (access: Record<string, AccessLevel>) => void }): React.ReactElement {
  return <div className="users-editor-grid"><section className="users-panel users-panel--wide"><p className="users-kicker">Access control</p><h2>Role & permissions</h2><label className="users-admin-switch"><span><strong>Administrator access</strong><small>Administrators can manage the team, business settings, and all NexOps work.</small></span><input type="checkbox" checked={props.administrator} onChange={(event) => props.setAdministrator(event.target.checked)} /><i /></label><div className="users-presets"><h3>Start with a role</h3><p>Choose a starting point, then fine-tune access for this person.</p><div>{(["Technician", "Office Admin", "Owner", "Custom"] as MemberRole[]).map((role) => <button type="button" key={role} className={props.role === role ? "selected" : ""} onClick={() => props.setRole(role)}><span className="users-radio" /> <strong>{role}</strong><small>{roleDescription(role)}</small></button>)}</div></div><div className="users-permission-list"><h3>Detailed access</h3>{permissionGroups.map(([area, ...levels]) => <div className="users-permission-row" key={area}><div><strong>{area}</strong><small>{levels[1]}</small></div><select value={props.access[area]} onChange={(event) => props.setAccess({ ...props.access, [area]: event.target.value as AccessLevel })} aria-label={`${area} access`}><option>None</option><option>View</option><option>Create & edit</option><option>Full access</option></select></div>)}</div></section></div>;
}

function PreferencesPanel(props: { subscriptions: Record<string, boolean>; setSubscriptions: (value: Record<string, boolean>) => void }): React.ReactElement {
  const entries: Array<[string, string, string]> = [["daily", "Daily work summary", "A short summary of today’s schedule and work that needs attention."], ["activity", "Team activity updates", "Updates when work assigned to this person changes."], ["platform", "Product and account notices", "Important account, security, and feature notices."], ["marketing", "NexTeam tips and updates", "Occasional tips for running a better operation."]];
  return <div className="users-editor-grid"><section className="users-panel users-panel--wide"><p className="users-kicker">Communications</p><h2>Email preferences</h2><p className="users-panel-detail">Choose the operational updates this team member receives.</p><div className="users-subscriptions">{entries.map(([key, title, description]) => <label key={key}><input type="checkbox" checked={props.subscriptions[key]} onChange={(event) => props.setSubscriptions({ ...props.subscriptions, [key]: event.target.checked })} /><span><strong>{title}</strong><small>{description}</small></span></label>)}</div></section></div>;
}

function InviteDialog(props: { onClose: () => void; onSend: () => void; sent: boolean }): React.ReactElement {
  return <div className="users-dialog-backdrop" role="presentation"><section className="users-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-title"><button type="button" className="users-dialog-close" onClick={props.onClose} aria-label="Close invite dialog">×</button>{props.sent ? <><p className="users-kicker">Invitation Ready</p><h2 id="invite-title">Invite Sent</h2><p>They’ll receive a secure link to join your NexOps workspace.</p><button type="button" className="users-primary" onClick={props.onClose}>Done</button></> : <><p className="users-kicker">Grow Your Team</p><h2 id="invite-title">Invite a Team Member</h2><p>They’ll choose a password and see only the tools you allow.</p><div className="users-form-grid"><Field label="Full Name" value="" placeholder="e.g. Sam Carter" /><Field label="Email Address" value="" placeholder="sam@company.com" /></div><label className="users-dialog-label">Starting Role<select defaultValue="Technician"><option>Technician</option><option>Office Admin</option></select></label><div className="users-dialog-actions"><button type="button" className="users-secondary" onClick={props.onClose}>Cancel</button><button type="button" className="users-primary" onClick={props.onSend}>Send Invite</button></div></>}</section></div>;
}

function TeamTitleIcon(): React.ReactElement {
  return <svg className="users-page-title__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5a5.5 5.5 0 0 1 11 0V20" /><path d="M16 5.5a3 3 0 0 1 0 5.7" /><path d="M18.5 20v-1.5a5.5 5.5 0 0 0-2.6-4.7" /></svg>;
}

function PersonTitleIcon(): React.ReactElement {
  return <svg className="users-page-title__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>;
}

function Avatar(props: { member: TeamMember; large?: boolean }): React.ReactElement {
  const className = `users-avatar users-avatar--${props.member.color}${props.large ? " users-avatar--large" : ""}${props.member.avatarUrl ? "" : " users-avatar--placeholder"}`;
  return <span className={className}>{props.member.avatarUrl ? <img src={props.member.avatarUrl} alt="" /> : props.member.initials}</span>;
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

function Field(props: { label: string; value: string; placeholder?: string; required?: boolean; optional?: boolean; onChange?: () => void }): React.ReactElement { return <label className="users-field"><span>{props.label}{props.required ? <b aria-label="required"> *</b> : null}{props.optional ? <em> (optional)</em> : null}</span><input defaultValue={props.value} placeholder={props.placeholder} required={props.required} onChange={props.onChange} /></label>; }
function nameParts(name: string): { firstName: string; middleName: string; lastName: string } { const parts = name.trim().split(/\s+/).filter(Boolean); return { firstName: parts[0] ?? "", middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : "", lastName: parts.length > 1 ? parts.at(-1) ?? "" : "" }; }
function filterMembers(members: TeamMember[], query: string): TeamMember[] { const term = query.trim().toLowerCase(); return term ? members.filter((member) => `${member.name} ${member.email} ${member.role}`.toLowerCase().includes(term)) : members; }
function roleTone(role: MemberRole): string { return role === "Owner" ? "owner" : role === "Office Admin" ? "admin" : role === "Technician" ? "tech" : "custom"; }
function roleDescription(role: MemberRole): string { return role === "Technician" ? "Field work, their schedule, and assigned jobs." : role === "Office Admin" ? "Office workflow, clients, scheduling, and billing support." : role === "Owner" ? "Full business oversight and team management." : "Build access one area at a time."; }
