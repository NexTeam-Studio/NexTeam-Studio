import React, { useState } from "react";
import "../styles/users.css";

type AccessLevel = "None" | "View" | "Create & edit" | "Full access";
type MemberRole = "Owner" | "Office Admin" | "Technician" | "Custom";

interface TeamMember {
  id: string;
  initials: string;
  name: string;
  email: string;
  phone: string;
  role: MemberRole;
  lastActive: string;
  assigned: boolean;
  color: string;
}

const startingMembers: TeamMember[] = [
  { id: "maria", initials: "MC", name: "Maria Chen", email: "maria@nexops.demo", phone: "(555) 013-2841", role: "Office Admin", lastActive: "Today, 8:42 AM", assigned: true, color: "coral" },
  { id: "avery", initials: "AB", name: "Avery Brooks", email: "avery@nexops.demo", phone: "(555) 013-8910", role: "Owner", lastActive: "Today, 7:15 AM", assigned: true, color: "violet" },
  { id: "nolan", initials: "NR", name: "Nolan Rivera", email: "nolan@nexops.demo", phone: "(555) 013-1664", role: "Technician", lastActive: "Yesterday", assigned: true, color: "aqua" },
  { id: "jordan", initials: "JP", name: "Jordan Patel", email: "jordan@nexops.demo", phone: "(555) 013-2098", role: "Technician", lastActive: "Jul 24, 2026", assigned: false, color: "gold" },
  { id: "riley", initials: "RW", name: "Riley Wilson", email: "riley@nexops.demo", phone: "(555) 013-7823", role: "Technician", lastActive: "Jul 19, 2026", assigned: false, color: "pink" },
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

export function UsersSurface(): React.ReactElement {
  const [members, setMembers] = useState(startingMembers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [saved, setSaved] = useState(false);

  const selected = members.find((member) => member.id === selectedId);
  const assigned = members.filter((member) => member.assigned);
  const unassigned = members.filter((member) => !member.assigned);
  const filteredAssigned = filterMembers(assigned, query);
  const filteredUnassigned = filterMembers(unassigned, query);

  function selectMember(id: string): void {
    setSelectedId(id);
    setSaved(false);
  }

  function assignSeat(id: string): void {
    setMembers((current) => current.map((member) => member.id === id ? { ...member, assigned: true } : member));
  }

  if (selected) {
    return <MemberEditor member={selected} onBack={() => setSelectedId(null)} onSave={() => setSaved(true)} saved={saved} />;
  }

  return (
    <main className="users-surface">
      <header className="users-hero">
        <div>
          <p className="users-kicker">NexOps / Team</p>
          <h1>People make the work happen.</h1>
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
  return <div className="users-table-wrap"><table className="users-table"><thead><tr><th>Team member</th><th>Role</th><th>Last active</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{props.members.map((member) => <tr key={member.id}><td><button type="button" className="users-member" onClick={() => props.onSelect(member.id)}><span className={`users-avatar users-avatar--${member.color}`}>{member.initials}</span><span><strong>{member.name}</strong><small>{member.email}</small></span></button></td><td><span className={`users-role users-role--${roleTone(member.role)}`}>{member.role}</span></td><td>{member.lastActive}</td><td>{props.action ? <button type="button" className="users-text-button" onClick={() => props.action?.onClick(member.id)}>{props.action.label}</button> : <button type="button" className="users-row-button" aria-label={`Edit ${member.name}`} onClick={() => props.onSelect(member.id)}>Edit</button>}</td></tr>)}</tbody></table>{props.members.length === 0 ? <p className="users-empty">No team members match that search.</p> : null}</div>;
}

function MemberEditor(props: { member: TeamMember; onBack: () => void; onSave: () => void; saved: boolean }): React.ReactElement {
  const [tab, setTab] = useState<"profile" | "permissions" | "preferences">("profile");
  const [role, setRole] = useState<MemberRole>(props.member.role);
  const [administrator, setAdministrator] = useState(props.member.role === "Owner");
  const [access, setAccess] = useState<Record<string, AccessLevel>>({
    "Schedule": "Create & edit", "Clients & properties": "View", "Requests": "Create & edit", "Quotes & invoices": "None", "Jobs & visits": "Create & edit", "Files & media": "View", "Notes": "Create & edit",
  });
  const [subscriptions, setSubscriptions] = useState({ daily: true, activity: true, platform: false, marketing: false });

  return <main className="users-surface users-member-editor">
    <button type="button" className="users-back" onClick={props.onBack}>← Back to team</button>
    <header className="users-editor-heading"><div><p className="users-kicker">Team member</p><h1>{props.member.name}</h1><p>{props.member.role} · Last active {props.member.lastActive}</p></div><span className={`users-avatar users-avatar--${props.member.color} users-avatar--large`}>{props.member.initials}</span></header>
    <div className="users-tabs" role="tablist" aria-label="Team member editor"><button type="button" className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>Profile</button><button type="button" className={tab === "permissions" ? "active" : ""} onClick={() => setTab("permissions")}>Role & access</button><button type="button" className={tab === "preferences" ? "active" : ""} onClick={() => setTab("preferences")}>Preferences</button></div>
    {tab === "profile" ? <ProfilePanel member={props.member} /> : null}
    {tab === "permissions" ? <PermissionsPanel role={role} setRole={setRole} administrator={administrator} setAdministrator={setAdministrator} access={access} setAccess={setAccess} /> : null}
    {tab === "preferences" ? <PreferencesPanel subscriptions={subscriptions} setSubscriptions={setSubscriptions} /> : null}
    <footer className="users-save-bar"><span>{props.saved ? "Changes saved for this team member." : "Changes apply to this team member only."}</span><div><button type="button" className="users-danger">Deactivate</button><button type="button" className="users-primary" onClick={props.onSave}>{props.saved ? "Saved" : "Save changes"}</button></div></footer>
  </main>;
}

function ProfilePanel(props: { member: TeamMember }): React.ReactElement {
  return <div className="users-editor-grid"><section className="users-panel"><div className="users-panel-heading"><div><p className="users-kicker">Contact details</p><h2>Personal information</h2></div><button type="button" className="users-text-button">Change photo</button></div><div className="users-form-grid"><Field label="Full name" value={props.member.name} /><Field label="Email address" value={props.member.email} /><Field label="Mobile number" value={props.member.phone} /><Field label="Street address" value="" placeholder="Add street address" /><Field label="City" value="" placeholder="Add city" /><Field label="State / province" value="" placeholder="Add state or province" /></div></section><section className="users-panel"><p className="users-kicker">Field readiness</p><h2>Working hours</h2><p className="users-panel-detail">Availability is used by scheduling and helps the office know who can be assigned.</p><div className="users-hours">{workingHours.map(([day, hours]) => <div key={day}><span>{day}</span><strong className={hours === "Unavailable" ? "muted" : ""}>{hours}</strong></div>)}</div><button className="users-secondary users-full-width" type="button">Edit working hours</button></section></div>;
}

function PermissionsPanel(props: { role: MemberRole; setRole: (role: MemberRole) => void; administrator: boolean; setAdministrator: (value: boolean) => void; access: Record<string, AccessLevel>; setAccess: (access: Record<string, AccessLevel>) => void }): React.ReactElement {
  return <div className="users-editor-grid"><section className="users-panel users-panel--wide"><p className="users-kicker">Access control</p><h2>Role & permissions</h2><label className="users-admin-switch"><span><strong>Administrator access</strong><small>Administrators can manage the team, business settings, and all NexOps work.</small></span><input type="checkbox" checked={props.administrator} onChange={(event) => props.setAdministrator(event.target.checked)} /><i /></label><div className="users-presets"><h3>Start with a role</h3><p>Choose a starting point, then fine-tune access for this person.</p><div>{(["Technician", "Office Admin", "Owner", "Custom"] as MemberRole[]).map((role) => <button type="button" key={role} className={props.role === role ? "selected" : ""} onClick={() => props.setRole(role)}><span className="users-radio" /> <strong>{role}</strong><small>{roleDescription(role)}</small></button>)}</div></div><div className="users-permission-list"><h3>Detailed access</h3>{permissionGroups.map(([area, ...levels]) => <div className="users-permission-row" key={area}><div><strong>{area}</strong><small>{levels[1]}</small></div><select value={props.access[area]} onChange={(event) => props.setAccess({ ...props.access, [area]: event.target.value as AccessLevel })} aria-label={`${area} access`}><option>None</option><option>View</option><option>Create & edit</option><option>Full access</option></select></div>)}</div></section></div>;
}

function PreferencesPanel(props: { subscriptions: Record<string, boolean>; setSubscriptions: (value: Record<string, boolean>) => void }): React.ReactElement {
  const entries: Array<[string, string, string]> = [["daily", "Daily work summary", "A short summary of today’s schedule and work that needs attention."], ["activity", "Team activity updates", "Updates when work assigned to this person changes."], ["platform", "Product and account notices", "Important account, security, and feature notices."], ["marketing", "NexTeam tips and updates", "Occasional tips for running a better operation."]];
  return <div className="users-editor-grid"><section className="users-panel users-panel--wide"><p className="users-kicker">Communications</p><h2>Email preferences</h2><p className="users-panel-detail">Choose the operational updates this team member receives.</p><div className="users-subscriptions">{entries.map(([key, title, description]) => <label key={key}><input type="checkbox" checked={props.subscriptions[key]} onChange={(event) => props.setSubscriptions({ ...props.subscriptions, [key]: event.target.checked })} /><span><strong>{title}</strong><small>{description}</small></span></label>)}</div></section></div>;
}

function InviteDialog(props: { onClose: () => void; onSend: () => void; sent: boolean }): React.ReactElement {
  return <div className="users-dialog-backdrop" role="presentation"><section className="users-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-title"><button type="button" className="users-dialog-close" onClick={props.onClose} aria-label="Close invite dialog">×</button>{props.sent ? <><p className="users-kicker">Invitation ready</p><h2 id="invite-title">Invite sent</h2><p>They’ll receive a secure link to join your NexOps workspace.</p><button type="button" className="users-primary" onClick={props.onClose}>Done</button></> : <><p className="users-kicker">Grow your team</p><h2 id="invite-title">Invite a team member</h2><p>They’ll choose a password and see only the tools you allow.</p><div className="users-form-grid"><Field label="Full name" value="" placeholder="e.g. Sam Carter" /><Field label="Email address" value="" placeholder="sam@company.com" /></div><label className="users-dialog-label">Starting role<select defaultValue="Technician"><option>Technician</option><option>Office Admin</option></select></label><div className="users-dialog-actions"><button type="button" className="users-secondary" onClick={props.onClose}>Cancel</button><button type="button" className="users-primary" onClick={props.onSend}>Send invite</button></div></>}</section></div>;
}

function Field(props: { label: string; value: string; placeholder?: string }): React.ReactElement { return <label className="users-field"><span>{props.label}</span><input defaultValue={props.value} placeholder={props.placeholder} /></label>; }
function filterMembers(members: TeamMember[], query: string): TeamMember[] { const term = query.trim().toLowerCase(); return term ? members.filter((member) => `${member.name} ${member.email} ${member.role}`.toLowerCase().includes(term)) : members; }
function roleTone(role: MemberRole): string { return role === "Owner" ? "owner" : role === "Office Admin" ? "admin" : role === "Technician" ? "tech" : "custom"; }
function roleDescription(role: MemberRole): string { return role === "Technician" ? "Field work, their schedule, and assigned jobs." : role === "Office Admin" ? "Office workflow, clients, scheduling, and billing support." : role === "Owner" ? "Full business oversight and team management." : "Build access one area at a time."; }
