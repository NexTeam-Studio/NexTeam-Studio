import { useMemo, useState } from "react";
import {
  buildContactEmailPreview,
  defaultCampaignState,
  readVgbCampaignState,
  saveVgbCampaignState,
  sendVgbEmail,
  summarizeCampaign,
} from "../services/vgbCampaignClient.js";

const SEGMENTS = [
  "Hotel / Resort",
  "HOA Community Pool",
  "Property Management Group",
  "Fitness Center / YMCA",
  "Apartment Complex",
  "School / University",
  "Municipality / Recreation",
];

const ZONES = ["Zone 1", "Zone 2", "Zone 3"];
const STATES = ["SC", "NC", "GA", "TN", "VA", "FL"];

const S = {
  page: { minHeight: "100%", background: "#060D18", color: "#E2E8F0", padding: 24, fontFamily: "system-ui, -apple-system, sans-serif" },
  shell: { maxWidth: 1200, margin: "0 auto", display: "grid", gap: 18 },
  hero: { background: "#0B1120", border: "1px solid #1E293B", borderRadius: 16, padding: 24, display: "grid", gap: 12 },
  h1: { margin: 0, fontSize: 30, color: "#F8FAFC" },
  copy: { margin: 0, color: "#94A3B8", lineHeight: 1.6, fontSize: 14 },
  grid4: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 },
  metric: { background: "#111827", border: "1px solid #334155", borderRadius: 14, padding: 16, display: "grid", gap: 6 },
  metricLabel: { margin: 0, color: "#64748B", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8 },
  metricValue: { margin: 0, color: "#F8FAFC", fontSize: 26, fontWeight: 700 },
  section: { background: "#0B1120", border: "1px solid #1E293B", borderRadius: 16, padding: 24, display: "grid", gap: 16 },
  sectionTitle: { margin: 0, fontSize: 18, color: "#F8FAFC" },
  sectionSub: { margin: 0, fontSize: 13, color: "#94A3B8" },
  columns: { display: "grid", gridTemplateColumns: "1.1fr 1.4fr", gap: 16 },
  list: { display: "grid", gap: 10 },
  card: { background: "#111827", border: "1px solid #334155", borderRadius: 12, padding: 14, display: "grid", gap: 8 },
  row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  input: { background: "#111827", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 10, padding: "10px 12px", fontSize: 14, outline: "none", width: "100%" },
  textarea: { background: "#111827", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 10, padding: "12px 14px", fontSize: 14, minHeight: 150, outline: "none", width: "100%", resize: "vertical" },
  btn: { background: "#4F46E5", color: "#fff", border: "none", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  secondary: { background: "#1E293B", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  tag: { display: "inline-flex", padding: "4px 8px", borderRadius: 999, background: "#1E3A8A", color: "#DBEAFE", fontSize: 11, fontWeight: 700 },
  code: { background: "#020617", border: "1px solid #1E293B", borderRadius: 12, padding: 12, fontSize: 12, color: "#BFDBFE", whiteSpace: "pre-wrap" },
  checklist: { margin: 0, paddingLeft: 18, color: "#CBD5E1", fontSize: 13, lineHeight: 1.6 },
  success: { background: "#0F172A", border: "1px solid #1D4ED8", borderRadius: 12, padding: 16, color: "#BFDBFE", fontSize: 13, lineHeight: 1.6 },
};

function createContact() {
  return {
    id: `vgb-${Date.now()}`,
    firstName: "",
    lastName: "",
    propertyName: "",
    email: "",
    segment: SEGMENTS[0],
    state: STATES[0],
    zone: ZONES[0],
    status: "Ready",
    sendState: { sent: false, opened: false, replied: false, booked: false, sentAt: null, followUpDueAt: null, lastMessageId: null },
    followUpNeeded: false,
    notes: "",
  };
}

export function VgbCampaignWorkspace() {
  const [campaign, setCampaign] = useState(() => readVgbCampaignState());
  const [selectedId, setSelectedId] = useState(() => readVgbCampaignState().contacts[0]?.id ?? null);
  const [newContact, setNewContact] = useState(createContact());
  const [sendingId, setSendingId] = useState(null);
  const [sendMessage, setSendMessage] = useState("");

  const summary = useMemo(() => summarizeCampaign(campaign), [campaign]);
  const selected = campaign.contacts.find((c) => c.id === selectedId) || campaign.contacts[0] || null;
  const preview = selected ? buildContactEmailPreview(selected, campaign.template) : defaultCampaignState().template;

  function persist(next) {
    const saved = saveVgbCampaignState(next);
    setCampaign(saved);
    return saved;
  }

  function updateTemplate(key, value) {
    persist({ ...campaign, template: { ...campaign.template, [key]: value } });
  }

  function updateScripts(key, value) {
    persist({ ...campaign, scripts: { ...campaign.scripts, [key]: value } });
  }

  function updateContact(id, patch) {
    persist({
      ...campaign,
      contacts: campaign.contacts.map((contact) => (contact.id === id ? { ...contact, ...patch } : contact)),
    });
  }

  function updateSendState(id, key, value) {
    persist({
      ...campaign,
      contacts: campaign.contacts.map((contact) =>
        contact.id === id ? { ...contact, sendState: { ...contact.sendState, [key]: value } } : contact
      ),
      activity: [
        {
          id: `activity-${Date.now()}`,
          type: key,
          propertyName: campaign.contacts.find((c) => c.id === id)?.propertyName || "Unknown property",
          createdAt: new Date().toISOString(),
          value,
        },
        ...campaign.activity,
      ].slice(0, 20),
    });
  }

  function addContact() {
    if (!newContact.propertyName || !newContact.email) return;
    persist({ ...campaign, contacts: [newContact, ...campaign.contacts] });
    setSelectedId(newContact.id);
    setNewContact(createContact());
  }

  function markFollowUp(id, value) {
    updateContact(id, { followUpNeeded: value, status: value ? "Follow Up" : "Ready" });
  }

  async function handleSend(contact) {
    setSendingId(contact.id);
    setSendMessage("");
    try {
      const sent = await sendVgbEmail(contact, campaign.template);
      const followUpDueAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      persist({
        ...campaign,
        contacts: campaign.contacts.map((item) =>
          item.id === contact.id
            ? {
                ...item,
                status: "Sent",
                followUpNeeded: true,
                sendState: {
                  ...item.sendState,
                  sent: true,
                  sentAt: sent.sentAt,
                  followUpDueAt,
                  lastMessageId: sent.messageId,
                },
              }
            : item
        ),
        activity: [
          {
            id: `activity-${Date.now()}`,
            type: "sent",
            propertyName: contact.propertyName,
            createdAt: sent.sentAt,
            value: contact.email,
          },
          ...campaign.activity,
        ].slice(0, 20),
      });
      setSendMessage(`Sent to ${contact.email}`);
    } catch (error) {
      setSendMessage(error.message);
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div style={S.page}>
      <div style={S.shell}>
        <section style={S.hero}>
          <p style={S.tag}>Priority #1</p>
          <h1 style={S.h1}>VGB Cold Outreach Frontend</h1>
          <p style={S.copy}>One clean operator workflow for cold commercial pool contacts, outreach execution, follow-up tracking, and booked-visit visibility.</p>
          <div style={S.grid4}>
            <div style={S.metric}><p style={S.metricLabel}>Contacts</p><p style={S.metricValue}>{summary.total}</p></div>
            <div style={S.metric}><p style={S.metricLabel}>Sent</p><p style={S.metricValue}>{summary.sent}</p></div>
            <div style={S.metric}><p style={S.metricLabel}>Replied</p><p style={S.metricValue}>{summary.replied}</p></div>
            <div style={S.metric}><p style={S.metricLabel}>Booked</p><p style={S.metricValue}>{summary.booked}</p></div>
          </div>
        </section>

        <section style={S.section}>
          <div style={S.columns}>
            <div style={S.list}>
              <h2 style={S.sectionTitle}>Contact list</h2>
              {campaign.contacts.map((contact) => (
                <div key={contact.id} style={S.card} onClick={() => setSelectedId(contact.id)}>
                  <div style={S.row}>
                    <strong>{contact.propertyName}</strong>
                    <span style={S.tag}>{contact.segment}</span>
                    <span style={S.tag}>{contact.zone}</span>
                  </div>
                  <div style={S.row}>
                    <span>{contact.firstName} {contact.lastName}</span>
                    <span>{contact.email}</span>
                  </div>
                  <div style={S.row}>
                    <label><input type="checkbox" checked={contact.sendState.sent} onChange={(e) => updateSendState(contact.id, "sent", e.target.checked)} /> Sent</label>
                    <label><input type="checkbox" checked={contact.sendState.opened} onChange={(e) => updateSendState(contact.id, "opened", e.target.checked)} /> Opened</label>
                    <label><input type="checkbox" checked={contact.sendState.replied} onChange={(e) => updateSendState(contact.id, "replied", e.target.checked)} /> Replied</label>
                    <label><input type="checkbox" checked={contact.sendState.booked} onChange={(e) => updateSendState(contact.id, "booked", e.target.checked)} /> Booked</label>
                  </div>
                  <label><input type="checkbox" checked={contact.followUpNeeded} onChange={(e) => markFollowUp(contact.id, e.target.checked)} /> Follow-up needed</label>
                  <button style={S.btn} type="button" onClick={(e) => { e.stopPropagation(); handleSend(contact); }}>{sendingId === contact.id ? "Sending..." : "Send email"}</button>
                </div>
              ))}
            </div>

            <div style={S.list}>
              <h2 style={S.sectionTitle}>Selected contact preview</h2>
              <div style={S.card}>
                <strong>{selected?.propertyName || "Select a contact"}</strong>
                <div style={S.code}>{preview.subject}</div>
                <div style={{ ...S.code, minHeight: 360 }}>{preview.body}</div>
                {sendMessage ? <div style={S.success}>{sendMessage}</div> : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
