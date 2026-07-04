/**
 * NjordSessionLog — searchable Njord session log viewer.
 * Reads from Firestore njordSessions collection.
 */

import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, limit, getDoc, doc } from "firebase/firestore";
import { db } from "../../../firebase";
import { NJORD_CONFIG } from "../config/njordConfig";

const S = {
  page: {
    minHeight: "100vh",
    background: "#060D18",
    color: "#E2E8F0",
    fontFamily: "system-ui, -apple-system, sans-serif",
    padding: "24px"
  },
  header: {
    marginBottom: 24,
    display: "flex",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap"
  },
  badge: {
    background: "linear-gradient(135deg,#0EA5E9,#0284C7)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 12,
    padding: "3px 9px",
    borderRadius: 6,
    letterSpacing: 1
  },
  title: { margin: 0, fontSize: 20, fontWeight: 700, color: "#F1F5F9" },
  searchBar: {
    width: "100%",
    maxWidth: 480,
    background: "#0B1120",
    border: "1px solid #334155",
    borderRadius: 8,
    color: "#E2E8F0",
    padding: "10px 14px",
    fontSize: 14,
    outline: "none"
  },
  grid: { display: "grid", gap: 12, gridTemplateColumns: "320px 1fr" },
  panel: {
    background: "#0B1120",
    border: "1px solid #1E293B",
    borderRadius: 10,
    padding: 16,
    overflowY: "auto",
    maxHeight: "78vh"
  },
  sessionRow: {
    padding: "10px 12px",
    borderRadius: 8,
    cursor: "pointer",
    marginBottom: 6,
    border: "1px solid transparent"
  },
  sessionRowActive: {
    background: "#0F172A",
    borderColor: "#0EA5E9"
  },
  sessionRowHover: {
    background: "#0F172A"
  },
  sessionId: { fontSize: 12, fontWeight: 700, color: "#67E8F9", marginBottom: 2 },
  sessionMeta: { fontSize: 11, color: "#64748B" },
  eventChip: {
    display: "inline-block",
    fontSize: 11,
    padding: "2px 7px",
    borderRadius: 4,
    marginRight: 4,
    marginBottom: 4,
    fontWeight: 600
  },
  eventRow: {
    padding: "10px 0",
    borderBottom: "1px solid #1E293B",
    fontSize: 13
  },
  pre: {
    background: "#060D18",
    border: "1px solid #1E293B",
    borderRadius: 6,
    padding: 10,
    fontSize: 11,
    color: "#94A3B8",
    overflowX: "auto",
    whiteSpace: "pre-wrap",
    marginTop: 6
  },
  emptyState: { color: "#475569", fontSize: 14, padding: "24px 0" },
  loading: { color: "#475569", fontSize: 13, padding: "16px 0" }
};

const EVENT_COLORS = {
  transcript: { background: "#0F2744", color: "#93C5FD" },
  "intent-classification": { background: "#14231A", color: "#86EFAC" },
  routing: { background: "#1E1B4B", color: "#C4B5FD" },
  "test-send": { background: "#1C2A14", color: "#86EFAC" },
  "test-confirm": { background: "#1C2A14", color: "#86EFAC" },
  approval: { background: "#1C1A00", color: "#FDE68A" },
  "send-sandboxed": { background: "#1C1A00", color: "#FDE68A" },
  escalation: { background: "#2D0F0F", color: "#FCA5A5" },
  error: { background: "#2D0F0F", color: "#FCA5A5" }
};

function eventColor(type) {
  return EVENT_COLORS[type] || { background: "#1E293B", color: "#CBD5E1" };
}

function formatTimestamp(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString();
}

function statusColor(status) {
  if (status === "completed" || status === "done") return "#22C55E";
  if (status === "active" || status === "in_progress") return "#60A5FA";
  if (status === "error" || status === "failed") return "#F87171";
  return "#64748B";
}

function timeAgo(ts) {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function SessionListItem({ session, active, onClick }) {
  const [hovered, setHovered] = useState(false);
  const displayId = session.sessionId?.slice(-10) || session.id?.slice(-10) || "unknown";
  const clientLabel = session.clientId || session.tenantId || "—";
  const statusVal = session.status || "unknown";
  return (
    <div
      style={{
        ...S.sessionRow,
        ...(active ? S.sessionRowActive : hovered ? S.sessionRowHover : {})
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <div style={S.sessionId}>{displayId}</div>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          color: statusColor(statusVal),
          background: "rgba(255,255,255,0.05)",
          borderRadius: 3,
          padding: "1px 5px"
        }}>{statusVal}</span>
        {session.caseStudyMode && <span style={{ fontSize: 10, color: "#EAB308" }}>🟡</span>}
      </div>
      <div style={S.sessionMeta}>{clientLabel}</div>
      {session.intent && (
        <div style={{ ...S.sessionMeta, color: "#94A3B8", marginTop: 2 }}>Topic: {session.intent}</div>
      )}
      <div style={{ ...S.sessionMeta, marginTop: 3 }}>
        {formatTimestamp(session.createdAt)}
        {session.createdAt && (
          <span style={{ marginLeft: 6, color: "#475569" }}>{timeAgo(session.createdAt)}</span>
        )}
      </div>
    </div>
  );
}

export function NjordSessionLog() {
  const [sessions, setSessions] = useState([]);
  const [events, setEvents] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedEvents, setExpandedEvents] = useState({});

  useEffect(() => {
    async function loadSessions() {
      setLoading(true);
      try {
        const q = query(collection(db, NJORD_CONFIG.sessionCollection), orderBy("createdAt", "desc"), limit(50));
        const snap = await getDocs(q);
        setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.warn("[NjordSessionLog] load error:", err.message);
        setSessions([]);
      } finally {
        setLoading(false);
      }
    }
    loadSessions();
  }, []);

  const loadEvents = useCallback(async (session) => {
    setActiveSession(session);
    setEventsLoading(true);
    setEvents([]);
    try {
      const eventsQ = query(
        collection(db, NJORD_CONFIG.sessionCollection, session.id, "events"),
        orderBy("timestamp", "asc")
      );
      const snap = await getDocs(eventsQ);
      setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.warn("[NjordSessionLog] events error:", err.message);
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  const filteredSessions = sessions.filter((s) => {
    if (!search.trim()) return true;
    const lower = search.toLowerCase();
    return (
      s.sessionId?.toLowerCase().includes(lower) ||
      s.id?.toLowerCase().includes(lower) ||
      s.clientId?.toLowerCase().includes(lower) ||
      s.tenantId?.toLowerCase().includes(lower) ||
      s.status?.toLowerCase().includes(lower) ||
      s.intent?.toLowerCase().includes(lower)
    );
  });

  function toggleExpand(eventId) {
    setExpandedEvents((prev) => ({ ...prev, [eventId]: !prev[eventId] }));
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <span style={S.badge}>NJORD</span>
        <h2 style={S.title}>Conversation History</h2>
        <input
          style={S.searchBar}
          placeholder="Search by ID, client, or status..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div style={S.grid}>
        {/* Session list */}
        <div style={S.panel}>
          {!loading && sessions.length > 0 && (
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #1E293B" }}>
              {filteredSessions.length === sessions.length
                ? `${sessions.length} sessions`
                : `${filteredSessions.length} of ${sessions.length} sessions`}
            </div>
          )}
          {loading ? (
            <div style={S.loading}>Loading sessions...</div>
          ) : filteredSessions.length === 0 ? (
            <div style={S.emptyState}>No sessions found.</div>
          ) : (
            filteredSessions.map((session) => (
              <SessionListItem
                key={session.id}
                session={session}
                active={activeSession?.id === session.id}
                onClick={() => loadEvents(session)}
              />
            ))
          )}
        </div>

        {/* Event detail */}
        <div style={S.panel}>
          {!activeSession ? (
            <div style={S.emptyState}>Select a conversation to view its messages.</div>
          ) : eventsLoading ? (
            <div style={S.loading}>Loading messages...</div>
          ) : (
            <>
              <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid #1E293B" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={S.badge}>SESSION</span>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: "#67E8F9" }}>
                    {activeSession.sessionId || activeSession.id}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
                  <span style={{ color: "#64748B" }}>Client: <span style={{ color: "#94A3B8" }}>{activeSession.clientId || activeSession.tenantId || "—"}</span></span>
                  <span style={{ color: "#64748B" }}>Status: <span style={{ color: statusColor(activeSession.status) }}>{activeSession.status || "unknown"}</span></span>
                  {activeSession.intent && (
                    <span style={{ color: "#64748B" }}>Topic: <span style={{ color: "#C4B5FD" }}>{activeSession.intent}</span></span>
                  )}
                  {activeSession.caseStudyMode && (
                    <span style={{ color: "#EAB308" }}>🟡 case-study</span>
                  )}
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: "#475569" }}>
                  Started: {formatTimestamp(activeSession.createdAt)}
                  {activeSession.updatedAt && activeSession.updatedAt !== activeSession.createdAt && (
                    <span style={{ marginLeft: 10 }}>Updated: {formatTimestamp(activeSession.updatedAt)}</span>
                  )}
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: "#475569" }}>
                  {events.length} messages logged
                </div>
              </div>

              {events.length === 0 ? (
                <div style={S.emptyState}>No messages recorded for this conversation.</div>
              ) : (
                events.map((event) => {
                  const colors = eventColor(event.type);
                  const expanded = expandedEvents[event.id];
                  const { type, timestamp, ...rest } = event;
                  return (
                    <div key={event.id} style={S.eventRow}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ ...S.eventChip, background: colors.background, color: colors.color }}>
                          {event.type === 'intent-classification' ? 'Request classified' : event.type === 'routing' ? 'Assigned' : event.type === 'error' ? 'Issue logged' : event.type}
                        </span>
                        <span style={{ fontSize: 11, color: "#64748B" }}>{formatTimestamp(timestamp)}</span>
                        <button
                          type="button"
                          onClick={() => toggleExpand(event.id)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#475569",
                            cursor: "pointer",
                            fontSize: 11,
                            marginLeft: "auto"
                          }}
                        >
                          {expanded ? "hide" : "show"} payload
                        </button>
                      </div>
                      {event.type === "transcript" ? (
                        <div style={{ fontSize: 13, color: "#CBD5E1" }}>
                          <span style={{ color: "#64748B" }}>[{event.role}] </span>
                          {event.content?.slice(0, 200) || "(empty)"}
                          {(event.content?.length || 0) > 200 ? "…" : ""}
                        </div>
                      ) : null}
                      {event.type === "intent-classification" ? (
                        <div style={{ fontSize: 13, color: "#86EFAC" }}>
                          Intent: <strong>{event.intent}</strong> · Confidence: {event.confidence}
                        </div>
                      ) : null}
                      {event.type === "routing" ? (
                        <div style={{ fontSize: 13, color: "#C4B5FD" }}>
                          Assigned to: <strong>{event.agentName}</strong>
                          {event.stub ? " (preview)" : ""}
                        </div>
                      ) : null}
                      {expanded && (
                        <pre style={S.pre}>{JSON.stringify({ type, timestamp, ...rest }, null, 2)}</pre>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
