/**
 * AquatraceDashboard - Client-facing Aquatrace workspace overview.
 * Route: /mission-control/aquatrace
 */

import { useNavigate } from "react-router-dom";

const WORKSPACE = "/mission-control/aquatrace/workspace";

const S = {
  page: {
    minHeight: "100vh",
    background: "#0A0A14",
    color: "#E2E8F0",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  topNav: {
    background: "#111827",
    borderBottom: "1px solid #21262D",
    padding: "0 32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: 56,
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  brandName: {
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: 2,
    color: "#4F46E5",
    textTransform: "uppercase",
  },
  navLinks: {
    display: "flex",
    gap: 28,
    alignItems: "center",
  },
  navLink: {
    fontSize: 13,
    fontWeight: 500,
    color: "#8B949E",
    cursor: "pointer",
    padding: "4px 0",
    borderBottom: "2px solid transparent",
  },
  chatBtn: {
    background: "#4F46E5",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "8px 16px",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  body: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "40px 24px",
  },
  greeting: {
    marginBottom: 32,
  },
  greetingTitle: {
    margin: "0 0 6px 0",
    fontSize: 28,
    fontWeight: 700,
    color: "#F8FAFC",
  },
  greetingSub: {
    margin: 0,
    fontSize: 15,
    color: "#8B949E",
  },
  attentionRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
    marginBottom: 32,
  },
  attentionCard: {
    background: "#161B22",
    border: "1px solid #21262D",
    borderRadius: 12,
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  attentionTitle: {
    margin: 0,
    fontSize: 17,
    fontWeight: 700,
    color: "#F1F5F9",
  },
  attentionDesc: {
    margin: 0,
    fontSize: 13,
    color: "#8B949E",
    flexGrow: 1,
  },
  attentionBtn: {
    background: "none",
    border: "1px solid #4F46E5",
    color: "#818CF8",
    borderRadius: 7,
    padding: "7px 14px",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    alignSelf: "flex-start",
    marginTop: 4,
  },
  njordHero: {
    background: "linear-gradient(135deg, #111827 0%, #161B22 100%)",
    border: "1px solid #4F46E5",
    borderRadius: 14,
    padding: "28px 32px",
    marginBottom: 32,
  },
  njordHeroTitle: {
    margin: "0 0 10px 0",
    fontSize: 20,
    fontWeight: 700,
    color: "#F8FAFC",
  },
  njordHeroBody: {
    margin: "0 0 20px 0",
    fontSize: 14,
    color: "#8B949E",
    lineHeight: 1.65,
    maxWidth: 580,
  },
  promptChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  chip: {
    background: "#1F2937",
    border: "1px solid #374151",
    color: "#CBD5E1",
    borderRadius: 20,
    padding: "6px 14px",
    fontSize: 13,
    cursor: "pointer",
  },
  openWorkspaceBtn: {
    background: "#4F46E5",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "11px 22px",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#6B7280",
    marginBottom: 12,
    marginTop: 0,
  },
  twoCol: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginBottom: 32,
  },
  opsCard: {
    background: "#161B22",
    border: "1px solid #21262D",
    borderRadius: 12,
    padding: "20px",
  },
  opsCardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  opsCardTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    color: "#E2E8F0",
  },
  viewAllLink: {
    fontSize: 12,
    color: "#4F46E5",
    cursor: "pointer",
    background: "none",
    border: "none",
    padding: 0,
    fontWeight: 600,
  },
  activityRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "9px 0",
    borderTop: "1px solid #21262D",
    fontSize: 13,
  },
  activityName: {
    color: "#E2E8F0",
    fontWeight: 500,
  },
  activityStatus: {
    color: "#8B949E",
    fontSize: 12,
  },
  activityTime: {
    color: "#6B7280",
    fontSize: 11,
  },
  campaignSection: {
    marginBottom: 32,
  },
  campaignCard: {
    background: "#161B22",
    border: "1px solid #21262D",
    borderRadius: 12,
    padding: "20px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
    flexWrap: "wrap",
  },
  campaignTitle: {
    margin: "0 0 4px 0",
    fontSize: 16,
    fontWeight: 700,
    color: "#F1F5F9",
  },
  campaignMeta: {
    margin: 0,
    fontSize: 13,
    color: "#8B949E",
  },
  reviewBtn: {
    background: "#4F46E5",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "9px 18px",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  websiteGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 14,
    marginBottom: 32,
  },
  websiteCard: {
    background: "#161B22",
    border: "1px solid #21262D",
    borderRadius: 12,
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  websiteTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: "#F1F5F9",
  },
  websiteDesc: {
    margin: 0,
    fontSize: 13,
    color: "#8B949E",
    flexGrow: 1,
    lineHeight: 1.6,
  },
  helperText: {
    margin: 0,
    fontSize: 12,
    color: "#6B7280",
  },
  requestBtn: {
    background: "#4F46E5",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    alignSelf: "flex-start",
  },
  playbooksGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 14,
  },
  playbookCard: {
    background: "#161B22",
    border: "1px solid #21262D",
    borderRadius: 12,
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  playbookTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    color: "#E2E8F0",
  },
  playbookDesc: {
    margin: 0,
    fontSize: 13,
    color: "#8B949E",
    flexGrow: 1,
  },
  viewBtn: {
    background: "none",
    border: "1px solid #374151",
    color: "#8B949E",
    borderRadius: 7,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    alignSelf: "flex-start",
  },
};

export function AquatraceDashboard() {
  const navigate = useNavigate();

  const attentionCards = [
    {
      title: "3 Follow-Ups Overdue",
      desc: "Customers waiting on a response",
      btn: "Review Follow-Ups →",
    },
    {
      title: "1 Campaign Ready to Review",
      desc: "Njord prepared a seasonal reminder",
      btn: "Review Campaign →",
    },
    {
      title: "2 Jobs In Progress",
      desc: "Active field work this week",
      btn: "View Jobs →",
    },
  ];

  const recentActivity = [
    { name: "Sarah Mitchell", status: "Service completed", time: "2h ago" },
    { name: "Tom Reyes", status: "Follow-up pending", time: "4h ago" },
    { name: "Karen Osei", status: "Intake received", time: "Yesterday" },
  ];

  const followUpsDue = [
    { name: "Derek Chan", status: "Post-service check-in", time: "Today 2pm" },
    { name: "Lucia Fernandez", status: "Quote follow-up", time: "Today 4pm" },
    { name: "James Park", status: "Overdue — 2 days", time: "Overdue" },
  ];

  const playbooks = [
    {
      title: "New Customer Intake",
      desc: "Steps to onboard a new residential or commercial customer.",
    },
    {
      title: "Post-Service Follow-Up",
      desc: "Automated check-in workflow after a job is completed.",
    },
    {
      title: "Emergency Escalation",
      desc: "How to handle urgent service requests and after-hours calls.",
    },
  ];

  return (
    <div style={S.page}>
      {/* Top Nav */}
      <nav style={S.topNav}>
        <span style={S.brandName}>Aquatrace</span>

        <div style={S.navLinks}>
          <span style={S.navLink}>Home</span>
          <span style={S.navLink}>Operations</span>
          <span style={S.navLink}>Campaigns</span>
          <span style={S.navLink}>Playbooks</span>
        </div>

        <button style={S.chatBtn} onClick={() => navigate(`${WORKSPACE}?tab=website&request=${item.title === "Request Website Change" ? "brokk" : "bragi"}`)}>
          Chat with Njord
        </button>
      </nav>

      <div style={S.body}>
        {/* Greeting */}
        <div style={S.greeting}>
          <h1 style={S.greetingTitle}>Good morning, Aquatrace.</h1>
          <p style={S.greetingSub}>Here is what needs your attention today.</p>
        </div>

        {/* Attention Cards */}
        <div style={S.attentionRow}>
          {attentionCards.map((card) => (
            <div key={card.title} style={S.attentionCard}>
              <h3 style={S.attentionTitle}>{card.title}</h3>
              <p style={S.attentionDesc}>{card.desc}</p>
              <button style={S.attentionBtn} onClick={() => navigate(WORKSPACE)}>
                {card.btn}
              </button>
            </div>
          ))}
        </div>

        {/* Njord Hero Card */}
        <div style={S.njordHero}>
          <h2 style={S.njordHeroTitle}>Your AI Operations Assistant</h2>
          <p style={S.njordHeroBody}>
            Njord handles customer intake, drafts follow-ups, prepares campaigns, and keeps
            your team organized so you can focus on the work.
          </p>
          <div style={S.promptChips}>
            {[
              "Draft a follow-up message",
              "Who needs a check-in?",
              "Prepare a seasonal campaign",
              "Review today's activity",
            ].map((chip) => (
              <span key={chip} style={S.chip} onClick={() => navigate(WORKSPACE)}>
                {chip}
              </span>
            ))}
          </div>
          <button style={S.openWorkspaceBtn} onClick={() => navigate(WORKSPACE)}>
            Open Workspace
          </button>
        </div>

        {/* Today's Operations */}
        <p style={S.sectionLabel}>Today's Operations</p>
        <div style={S.twoCol}>
          {/* Recent Customer Activity */}
          <div style={S.opsCard}>
            <div style={S.opsCardHeader}>
              <h3 style={S.opsCardTitle}>Recent Customer Activity</h3>
              <button style={S.viewAllLink} onClick={() => navigate(WORKSPACE)}>
                View All
              </button>
            </div>
            {recentActivity.map((row) => (
              <div key={row.name} style={S.activityRow}>
                <span style={S.activityName}>{row.name}</span>
                <span style={S.activityStatus}>{row.status}</span>
                <span style={S.activityTime}>{row.time}</span>
              </div>
            ))}
          </div>

          {/* Follow-Ups Due Today */}
          <div style={S.opsCard}>
            <div style={S.opsCardHeader}>
              <h3 style={S.opsCardTitle}>Follow-Ups Due Today</h3>
              <button style={S.viewAllLink} onClick={() => navigate(WORKSPACE)}>
                View All
              </button>
            </div>
            {followUpsDue.map((row) => (
              <div key={row.name} style={S.activityRow}>
                <span style={S.activityName}>{row.name}</span>
                <span style={S.activityStatus}>{row.status}</span>
                <span style={S.activityTime}>{row.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Campaigns */}
        <div style={S.campaignSection}>
          <p style={S.sectionLabel}>Campaigns</p>
          <div style={S.campaignCard}>
            <div>
              <h3 style={S.campaignTitle}>
                Spring Inspection Reminder - Ready for your review
              </h3>
              <p style={S.campaignMeta}>
                Njord prepared this campaign. Review the message before it sends.
              </p>
            </div>
            <button style={S.reviewBtn} onClick={() => navigate(WORKSPACE)}>
              Review and Approve
            </button>
          </div>
        </div>

        {/* Playbooks */}
        <div>
          <p style={S.sectionLabel}>Playbooks</p>
          <div style={S.playbooksGrid}>
            {playbooks.map((pb) => (
              <div key={pb.title} style={S.playbookCard}>
                <h3 style={S.playbookTitle}>{pb.title}</h3>
                <p style={S.playbookDesc}>{pb.desc}</p>
                <button style={S.viewBtn} onClick={() => navigate(WORKSPACE)}>
                  View
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


