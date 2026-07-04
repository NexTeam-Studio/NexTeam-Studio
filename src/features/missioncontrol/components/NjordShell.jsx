/**
 * NjordShell - tabbed nav wrapper for the Aquatrace workspace.
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { NjordMissionControl } from "./NjordMissionControl";
import { NjordSessionLog } from "./NjordSessionLog";
import { SOPLibrary } from "./SOPLibrary";
import { SOPEditor } from "./SOPEditor";
import { BlueprintLibrary } from "./BlueprintLibrary";
import { OnboardingChecklist } from "./OnboardingChecklist";
import { WebsiteRequestPanel } from "./WebsiteRequestPanel";
import { BragiArticleDashboard } from "./BragiArticleDashboard";
import { VgbCampaignWorkspace } from "./VgbCampaignWorkspace";
import { GooniesAdvisoryBench } from "./GooniesAdvisoryBench";
import { NJORD_CONFIG } from "../config/njordConfig";

const TABS = [
  { id: "chat", label: "Chat with Njord", icon: "??" },
  { id: "website", label: "Website Requests", icon: "??" },
  { id: "bragi", label: "Bragi", icon: "??" },
  { id: "vgb-campaign", label: "VGB Outreach", icon: "??" },
  { id: "agents", label: "Agents", icon: "[] " },
  { id: "session-log", label: "Conversation History", icon: "??" },
  { id: "sop-library", label: "Playbooks", icon: "??" },
  { id: "blueprint-library", label: "Blueprints", icon: "??" },
  { id: "onboarding", label: "Setup Progress", icon: "?" },
];

const S = {
  shell: {
    minHeight: "100vh",
    background: "#060D18",
    color: "#E2E8F0",
    fontFamily: "system-ui, -apple-system, sans-serif",
    display: "flex",
    flexDirection: "column",
  },
  backBar: {
    padding: "12px 24px",
    borderBottom: "1px solid #21262D",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  backBtn: {
    background: "none",
    border: "none",
    color: "#8B949E",
    cursor: "pointer",
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  nav: {
    background: "#0B1120",
    borderBottom: "1px solid #1E293B",
    display: "flex",
    alignItems: "center",
    gap: 0,
    padding: "0 16px",
    flexWrap: "nowrap",
    overflowX: "auto",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px 12px 0",
    marginRight: 16,
    borderRight: "1px solid #1E293B",
  },
  brandBadge: {
    background: "linear-gradient(135deg,#0EA5E9,#0284C7)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 5,
    letterSpacing: 1,
  },
  brandName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#94A3B8",
    whiteSpace: "nowrap",
  },
  tab: {
    padding: "14px 16px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    border: "none",
    background: "transparent",
    color: "#64748B",
    borderBottom: "2px solid transparent",
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "center",
    gap: 6,
    transition: "color 0.15s",
  },
  tabActive: {
    color: "#7DD3FC",
    borderBottomColor: "#0EA5E9",
  },
  content: {
    flex: 1,
  },
};

export function NjordShell() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("chat");
  const [sopEditorMode, setSopEditorMode] = useState(null);

  const requestType = searchParams.get("request") === "bragi" ? "bragi" : "brokk";

  useEffect(() => {
    if (searchParams.get("tab") === "website") {
      setActiveTab("website");
    }
    if (searchParams.get("tab") === "bragi") {
      setActiveTab("bragi");
    }
  }, [searchParams]);

  function clearWebsiteParams() {
    const next = new URLSearchParams(searchParams);
    next.delete("tab");
    next.delete("request");
    setSearchParams(next, { replace: true });
  }

  function handleCreateNew() {
    setActiveTab("sop-editor");
    setSopEditorMode("create");
  }

  function handleSopSaved() {
    setActiveTab("sop-library");
    setSopEditorMode(null);
  }

  const displayTabs = [
    ...TABS,
    ...(sopEditorMode !== null ? [{ id: "sop-editor", label: "Edit Playbook", icon: "??" }] : []),
  ];

  return (
    <div style={S.shell}>
      <div style={S.backBar}>
        <button onClick={() => navigate("/mission-control/aquatrace")} style={S.backBtn}>
          ? Back to Dashboard
        </button>
      </div>
      <div style={{ color: "#8B949E", fontSize: 12, padding: "4px 24px 8px" }}>Home &gt; Workspace</div>

      <nav style={S.nav}>
        <div style={S.brand}>
          <span style={S.brandBadge}>NJORD</span>
          <span style={S.brandName}>{NJORD_CONFIG.brandName} Workspace</span>
        </div>

        {displayTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            style={{
              ...S.tab,
              ...(activeTab === tab.id ? S.tabActive : {}),
            }}
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id !== "sop-editor") setSopEditorMode(null);
              if (tab.id !== "website") clearWebsiteParams();
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <div style={S.content}>
        {activeTab === "chat" && <NjordMissionControl />}
        {activeTab === "website" && (
          <WebsiteRequestPanel
            initialType={requestType}
            onBack={() => {
              clearWebsiteParams();
              setActiveTab("chat");
            }}
          />
        )}
        {activeTab === "bragi" && <BragiArticleDashboard />}
        {activeTab === "vgb-campaign" && <VgbCampaignWorkspace />}
        {activeTab === "agents" && <GooniesAdvisoryBench />}
        {activeTab === "session-log" && <NjordSessionLog />}
        {activeTab === "sop-library" && <SOPLibrary onCreateNew={handleCreateNew} />}
        {activeTab === "sop-editor" && (
          <SOPEditor
            existingSOP={sopEditorMode !== "create" ? sopEditorMode : null}
            onSaved={handleSopSaved}
            onCancel={() => {
              setActiveTab("sop-library");
              setSopEditorMode(null);
            }}
          />
        )}
        {activeTab === "blueprint-library" && <BlueprintLibrary />}
        {activeTab === "onboarding" && <OnboardingChecklist />}
      </div>
    </div>
  );
}
