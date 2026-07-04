import { useMemo, useState } from "react";
import {
  ADVISORY_PLACEHOLDER_ASSET,
  GOONIES_SHARED_RULE_DOCS,
  getAdvisoryBenchAgents,
  getAgentById,
  getAdvisoryBenchOverview,
  getDocContentByPath,
} from "../services/gooniesRegistryService.js";
import { maybeRunGoonieConsult } from "../services/gooniesConsultService.js";

const S = {
  page: {
    minHeight: "100%",
    background: "#060D18",
    color: "#E2E8F0",
    padding: "28px 24px 40px",
  },
  shell: {
    maxWidth: 1240,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.6fr) minmax(320px, 0.9fr)",
    gap: 20,
    alignItems: "start",
  },
  mainCol: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    minWidth: 0,
  },
  sideCol: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minWidth: 0,
  },
  panel: {
    background: "#0B1120",
    border: "1px solid #1E293B",
    borderRadius: 18,
    padding: 22,
    boxShadow: "0 18px 48px rgba(3, 7, 18, 0.28)",
  },
  eyebrow: {
    margin: 0,
    color: "#38BDF8",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  title: {
    margin: "8px 0 10px",
    fontSize: 30,
    color: "#F8FAFC",
    fontWeight: 800,
  },
  subtitle: {
    margin: 0,
    color: "#94A3B8",
    lineHeight: 1.7,
    fontSize: 14,
    maxWidth: 760,
  },
  badgeRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 14,
  },
  badge: (bg, color) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: bg,
    color,
    borderRadius: 999,
    padding: "5px 10px",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.4,
  }),
  consultPanel: {
    display: "grid",
    gap: 12,
  },
  consultLabel: {
    margin: 0,
    fontSize: 13,
    fontWeight: 700,
    color: "#C4B5FD",
  },
  textarea: {
    width: "100%",
    minHeight: 110,
    resize: "vertical",
    borderRadius: 14,
    border: "1px solid #334155",
    background: "#020617",
    color: "#E2E8F0",
    padding: 14,
    fontSize: 14,
    lineHeight: 1.6,
    boxSizing: "border-box",
    outline: "none",
  },
  actionRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  primaryBtn: {
    background: "linear-gradient(135deg, #0EA5E9, #0284C7)",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    padding: "11px 16px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  ghostBtn: {
    background: "transparent",
    color: "#CBD5E1",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: "11px 16px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  responseBox: {
    background: "#020617",
    border: "1px solid #334155",
    borderRadius: 14,
    padding: 16,
    whiteSpace: "pre-wrap",
    fontSize: 13,
    lineHeight: 1.65,
    color: "#E2E8F0",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
    gap: 16,
  },
  card: {
    background: "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(10,15,28,0.98))",
    border: "1px solid #22314D",
    borderRadius: 18,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  cardHeader: {
    display: "flex",
    gap: 14,
    alignItems: "center",
  },
  avatarWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    overflow: "hidden",
    border: "1px solid #334155",
    background: "#0F172A",
    flexShrink: 0,
    position: "relative",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  initials: {
    position: "absolute",
    right: 6,
    bottom: 6,
    minWidth: 24,
    height: 24,
    borderRadius: 999,
    background: "rgba(8,15,31,0.86)",
    color: "#E0F2FE",
    fontSize: 10,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 6px",
  },
  cardTitle: {
    margin: 0,
    fontSize: 21,
    color: "#F8FAFC",
    fontWeight: 800,
  },
  role: {
    margin: "4px 0 0",
    color: "#BFDBFE",
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.5,
  },
  desc: {
    margin: 0,
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 1.65,
  },
  kvList: {
    display: "grid",
    gap: 8,
  },
  kvRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 12,
    lineHeight: 1.5,
  },
  kvKey: {
    color: "#64748B",
    fontWeight: 700,
    flexShrink: 0,
  },
  kvValue: {
    color: "#E2E8F0",
    textAlign: "right",
  },
  linkGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  cardActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  linkBtn: {
    background: "#111827",
    color: "#E2E8F0",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "left",
  },
  previewMeta: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  previewTitle: {
    margin: "2px 0 8px",
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: 800,
  },
  previewPath: {
    margin: 0,
    color: "#7DD3FC",
    fontSize: 12,
    wordBreak: "break-all",
  },
  previewBody: {
    margin: 0,
    whiteSpace: "pre-wrap",
    color: "#CBD5E1",
    fontSize: 12,
    lineHeight: 1.6,
    maxHeight: "65vh",
    overflowY: "auto",
  },
  note: {
    margin: 0,
    color: "#64748B",
    fontSize: 12,
    lineHeight: 1.6,
  },
};

function agentInitials(name) {
  return String(name || "")
    .split(/\s+/)
    .map((part) => part[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function buildDocLinks(agent) {
  const links = [
    { label: "View SOUL", path: agent.soul_path },
    { label: "View MEMORY", path: agent.memory_path },
    { label: "View KNOWLEDGE BASE", path: agent.knowledge_base_path },
  ];
  if (agent.playbook_path) {
    links.push({ label: "View PLAYBOOK", path: agent.playbook_path });
  }
  if (agent.system_prompt_path) {
    links.push({ label: "View SYSTEM PROMPT", path: agent.system_prompt_path });
  }
  return links;
}

export function GooniesAdvisoryBench() {
  const agents = useMemo(() => getAdvisoryBenchAgents(), []);
  const overview = useMemo(() => getAdvisoryBenchOverview(), []);
  const [consultInput, setConsultInput] = useState(
    "Clawdia, ask Chunk to research VGB compliance sources."
  );
  const [consultResult, setConsultResult] = useState(null);
  const [consulting, setConsulting] = useState(false);
  const [preview, setPreview] = useState({
    title: "Advisory Bench Overview",
    path: overview.overviewPath,
    content: overview.overviewContent,
  });

  function openDoc(label, path) {
    const content = getDocContentByPath(path);
    setPreview({
      title: label,
      path,
      content: content || "Document preview is not available yet.",
    });
  }

  function prepareConsult(agent) {
    setConsultInput(`Clawdia, ask ${agent.name} to help with the ${agent.consult_lane} lane.`);
    setConsultResult(null);
    openDoc(`${agent.name} SOUL`, agent.soul_path);
  }

  async function handleConsult() {
    setConsulting(true);
    const result = await maybeRunGoonieConsult(consultInput);
    if (!result) {
      setConsultResult(
        "GOONIE CONSULT RESPONSE\n\nGOONIE:\n- needs clarification\nQUESTION:\n- No consult request detected.\nRECOMMENDATION:\n- Ask Clawdia to consult a named Goonie or use clear advisory-bench wording.\nREASONING:\n- The request did not match the consult-only routing rules.\nCONFIDENCE:\n- LOW\nCONFIDENCE REASON:\n- No advisory routing signal was found.\nSOURCES USED:\n- internal | citation_ready: no | source_type: internal_doc | source_name: Consult Protocol | source_url_or_path: docs/internal/goonies/CONSULT_PROTOCOL.md\nRISKS:\n- A non-consult request could be mistaken for a Goonie advisory request.\nWHAT CLAWDIA SHOULD DO NEXT:\n- Rewrite the request as: Clawdia, ask <Goonie> to ...\nESCALATE TO CHRIS:\n- no\n- reason: this can be clarified safely in the dashboard."
      );
      setConsulting(false);
      return;
    }

    setConsultResult(result.response);
    if (result.goonie) {
      const registryAgent = getAgentById(result.goonie.id);
      if (registryAgent?.soul_path) {
        openDoc(`${registryAgent.name} SOUL`, registryAgent.soul_path);
      }
    }
    setConsulting(false);
  }

  return (
    <div style={S.page}>
      <div style={S.shell}>
        <div style={S.mainCol}>
          <section style={S.panel}>
            <p style={S.eyebrow}>Agents</p>
            <h1 style={S.title}>Advisory Bench</h1>
            <p style={S.subtitle}>
              The Goonies are visible live as real advisory agents. They can help Clawdia think,
              route, and pressure-test decisions, but they remain consult-only and cannot execute
              tools, contact clients, publish, send, delete, or trigger builds.
            </p>
            <div style={S.badgeRow}>
              <span style={S.badge("rgba(14,165,233,0.16)", "#7DD3FC")}>registry-backed</span>
              <span style={S.badge("rgba(34,197,94,0.14)", "#86EFAC")}>consult-only</span>
              <span style={S.badge("rgba(245,158,11,0.14)", "#FCD34D")}>mixed live bench</span>
            </div>
          </section>

          <section style={{ ...S.panel, ...S.consultPanel }}>
            <p style={S.consultLabel}>Consult the bench</p>
            <p style={S.subtitle}>
              Ask Clawdia to consult one of the Goonies. The response stays advisory, cites its
              internal source basis, and keeps Clawdia as the operator.
            </p>
            <textarea
              style={S.textarea}
              value={consultInput}
              onChange={(event) => setConsultInput(event.target.value)}
            />
            <div style={S.actionRow}>
              <button type="button" style={S.primaryBtn} onClick={handleConsult}>
                {consulting ? "Consulting runtime..." : "Run consult-only sample"}
              </button>
              <button
                type="button"
                style={S.ghostBtn}
                onClick={() => {
                  setConsultInput("Clawdia, ask Data to review the safest architecture boundary.");
                  setConsultResult(null);
                }}
              >
                Load systems example
              </button>
              <button
                type="button"
                style={S.ghostBtn}
                onClick={() => {
                  setConsultInput("Clawdia, ask Mouth to tighten this outreach wording without overclaiming.");
                  setConsultResult(null);
                }}
              >
                Load messaging example
              </button>
            </div>
            {consultResult ? <div style={S.responseBox}>{consultResult}</div> : null}
          </section>

          <section style={S.grid}>
            {agents.map((agent) => (
              <article key={agent.id} style={S.card}>
                <div style={S.cardHeader}>
                  <div style={S.avatarWrap}>
                    <img
                      alt={`${agent.name} placeholder avatar`}
                      src={ADVISORY_PLACEHOLDER_ASSET}
                      style={S.avatarImg}
                    />
                    <span style={S.initials}>{agentInitials(agent.name)}</span>
                  </div>
                  <div>
                    <h2 style={S.cardTitle}>{agent.name}</h2>
                    <p style={S.role}>{agent.role}</p>
                    {agent.llm_backed ? (
                      <div style={{ ...S.badge("rgba(16,185,129,0.16)", "#6EE7B7"), marginTop: 8 }}>
                        LLM-backed
                      </div>
                    ) : null}
                  </div>
                </div>

                <p style={S.desc}>{agent.short_description}</p>

                <div style={S.cardActions}>
                  <button type="button" style={S.primaryBtn} onClick={() => prepareConsult(agent)}>
                    Consult
                  </button>
                </div>

                <div style={S.kvList}>
                  <div style={S.kvRow}>
                    <span style={S.kvKey}>Consult lane</span>
                    <span style={S.kvValue}>{agent.consult_lane}</span>
                  </div>
                  <div style={S.kvRow}>
                    <span style={S.kvKey}>Status</span>
                    <span style={S.kvValue}>{agent.statusLabel}</span>
                  </div>
                  <div style={S.kvRow}>
                    <span style={S.kvKey}>Avatar status</span>
                    <span style={S.kvValue}>{agent.avatar_status}</span>
                  </div>
                  <div style={S.kvRow}>
                    <span style={S.kvKey}>can_execute</span>
                    <span style={S.kvValue}>{String(agent.can_execute)}</span>
                  </div>
                  <div style={S.kvRow}>
                    <span style={S.kvKey}>consult_only</span>
                    <span style={S.kvValue}>{String(agent.consult_only)}</span>
                  </div>
                </div>

                <div style={S.linkGrid}>
                  {buildDocLinks(agent).map((link) => (
                    <button
                      key={`${agent.id}-${link.path}`}
                      type="button"
                      style={S.linkBtn}
                      onClick={() => openDoc(link.label, link.path)}
                    >
                      {link.label}
                    </button>
                  ))}
                  {GOONIES_SHARED_RULE_DOCS.slice(0, 1).map((link) => (
                    <button
                      key={`${agent.id}-${link.id}`}
                      type="button"
                      style={S.linkBtn}
                      onClick={() => openDoc(link.label, link.path)}
                    >
                      {link.label}
                    </button>
                  ))}
                  {GOONIES_SHARED_RULE_DOCS.slice(1, 2).map((link) => (
                    <button
                      key={`${agent.id}-${link.id}`}
                      type="button"
                      style={S.linkBtn}
                      onClick={() => openDoc(link.label, link.path)}
                    >
                      {link.label}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </section>
        </div>

        <aside style={S.sideCol}>
          <section style={S.panel}>
            <p style={S.eyebrow}>Preview</p>
            <h2 style={S.previewTitle}>{preview.title}</h2>
            <div style={S.previewMeta}>
              <span style={S.badge("rgba(14,165,233,0.16)", "#7DD3FC")}>registry truth</span>
              <span style={S.badge("rgba(245,158,11,0.14)", "#FCD34D")}>docs-backed</span>
            </div>
            <p style={S.previewPath}>{preview.path}</p>
            <pre style={S.previewBody}>{preview.content}</pre>
          </section>

          <section style={S.panel}>
            <p style={S.eyebrow}>Guardrails</p>
            <p style={S.note}>
              The Goonies are visible live, but they still cannot execute tools, send email,
              publish, schedule, contact clients, modify CompanyCam, write to Dropbox, trigger
              Codex, or override Clawdia.
            </p>
            <div style={{ ...S.linkGrid, gridTemplateColumns: "1fr" }}>
              {GOONIES_SHARED_RULE_DOCS.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  style={S.linkBtn}
                  onClick={() => openDoc(link.label, link.path)}
                >
                  {link.label}
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
