import registry from "../../../../docs/internal/goonies/GOONIES_DASHBOARD_REGISTRY.json";

import systemOverviewRaw from "../../../../docs/internal/goonies/GOONIES_SYSTEM_OVERVIEW.md?raw";
import consultProtocolRaw from "../../../../docs/internal/goonies/CONSULT_PROTOCOL.md?raw";
import sourceStandardsRaw from "../../../../docs/internal/goonies/SOURCE_STANDARDS.md?raw";
import knowledgeSchemaRaw from "../../../../docs/internal/goonies/KNOWLEDGE_BASE_SCHEMA.md?raw";
import onlineResearchRulesRaw from "../../../../docs/internal/goonies/ONLINE_RESEARCH_APPROVAL_RULES.md?raw";
import escalationRulesRaw from "../../../../docs/internal/goonies/ESCALATION_AND_CONFIDENCE_RULES.md?raw";

import chunkSoulRaw from "../../../../docs/internal/goonies/chunk/SOUL.md?raw";
import chunkMemoryRaw from "../../../../docs/internal/goonies/chunk/MEMORY.md?raw";
import chunkKnowledgeBaseRaw from "../../../../docs/internal/goonies/chunk/KNOWLEDGE_BASE.md?raw";
import mikeySoulRaw from "../../../../docs/internal/goonies/mikey/SOUL.md?raw";
import mikeyMemoryRaw from "../../../../docs/internal/goonies/mikey/MEMORY.md?raw";
import mikeyKnowledgeBaseRaw from "../../../../docs/internal/goonies/mikey/KNOWLEDGE_BASE.md?raw";
import mouthSoulRaw from "../../../../docs/internal/goonies/mouth/SOUL.md?raw";
import mouthMemoryRaw from "../../../../docs/internal/goonies/mouth/MEMORY.md?raw";
import mouthKnowledgeBaseRaw from "../../../../docs/internal/goonies/mouth/KNOWLEDGE_BASE.md?raw";
import brandSoulRaw from "../../../../docs/internal/goonies/brand/SOUL.md?raw";
import brandMemoryRaw from "../../../../docs/internal/goonies/brand/MEMORY.md?raw";
import brandKnowledgeBaseRaw from "../../../../docs/internal/goonies/brand/KNOWLEDGE_BASE.md?raw";
import dataSoulRaw from "../../../../docs/internal/goonies/data/SOUL.md?raw";
import dataMemoryRaw from "../../../../docs/internal/goonies/data/MEMORY.md?raw";
import dataKnowledgeBaseRaw from "../../../../docs/internal/goonies/data/KNOWLEDGE_BASE.md?raw";
import andySoulRaw from "../../../../docs/internal/goonies/andy/SOUL.md?raw";
import andyMemoryRaw from "../../../../docs/internal/goonies/andy/MEMORY.md?raw";
import andyKnowledgeBaseRaw from "../../../../docs/internal/goonies/andy/KNOWLEDGE_BASE.md?raw";
import willySoulRaw from "../../../../docs/internal/goonies/willy/SOUL.md?raw";
import willyMemoryRaw from "../../../../docs/internal/goonies/willy/MEMORY.md?raw";
import willyKnowledgeBaseRaw from "../../../../docs/internal/goonies/willy/KNOWLEDGE_BASE.md?raw";
import willyPlaybookRaw from "../../../../docs/internal/goonies/willy/WILLY_PLAYBOOK_V1.md?raw";
import willySystemPromptRaw from "../../../../docs/internal/goonies/willy/WILLY_SYSTEM_PROMPT.md?raw";

export const ADVISORY_PLACEHOLDER_ASSET = "/assets/goonies/advisory-placeholder.svg";

const DOC_CONTENT_BY_PATH = {
  "docs/internal/goonies/GOONIES_SYSTEM_OVERVIEW.md": systemOverviewRaw,
  "docs/internal/goonies/CONSULT_PROTOCOL.md": consultProtocolRaw,
  "docs/internal/goonies/SOURCE_STANDARDS.md": sourceStandardsRaw,
  "docs/internal/goonies/KNOWLEDGE_BASE_SCHEMA.md": knowledgeSchemaRaw,
  "docs/internal/goonies/ONLINE_RESEARCH_APPROVAL_RULES.md": onlineResearchRulesRaw,
  "docs/internal/goonies/ESCALATION_AND_CONFIDENCE_RULES.md": escalationRulesRaw,
  "docs/internal/goonies/chunk/SOUL.md": chunkSoulRaw,
  "docs/internal/goonies/chunk/MEMORY.md": chunkMemoryRaw,
  "docs/internal/goonies/chunk/KNOWLEDGE_BASE.md": chunkKnowledgeBaseRaw,
  "docs/internal/goonies/mikey/SOUL.md": mikeySoulRaw,
  "docs/internal/goonies/mikey/MEMORY.md": mikeyMemoryRaw,
  "docs/internal/goonies/mikey/KNOWLEDGE_BASE.md": mikeyKnowledgeBaseRaw,
  "docs/internal/goonies/mouth/SOUL.md": mouthSoulRaw,
  "docs/internal/goonies/mouth/MEMORY.md": mouthMemoryRaw,
  "docs/internal/goonies/mouth/KNOWLEDGE_BASE.md": mouthKnowledgeBaseRaw,
  "docs/internal/goonies/brand/SOUL.md": brandSoulRaw,
  "docs/internal/goonies/brand/MEMORY.md": brandMemoryRaw,
  "docs/internal/goonies/brand/KNOWLEDGE_BASE.md": brandKnowledgeBaseRaw,
  "docs/internal/goonies/data/SOUL.md": dataSoulRaw,
  "docs/internal/goonies/data/MEMORY.md": dataMemoryRaw,
  "docs/internal/goonies/data/KNOWLEDGE_BASE.md": dataKnowledgeBaseRaw,
  "docs/internal/goonies/andy/SOUL.md": andySoulRaw,
  "docs/internal/goonies/andy/MEMORY.md": andyMemoryRaw,
  "docs/internal/goonies/andy/KNOWLEDGE_BASE.md": andyKnowledgeBaseRaw,
  "docs/internal/goonies/willy/SOUL.md": willySoulRaw,
  "docs/internal/goonies/willy/MEMORY.md": willyMemoryRaw,
  "docs/internal/goonies/willy/KNOWLEDGE_BASE.md": willyKnowledgeBaseRaw,
  "docs/internal/goonies/willy/WILLY_PLAYBOOK_V1.md": willyPlaybookRaw,
  "docs/internal/goonies/willy/WILLY_SYSTEM_PROMPT.md": willySystemPromptRaw,
};

const GOONIE_DOC_PATHS_BY_ID = {
  chunk: {
    soulPath: "docs/internal/goonies/chunk/SOUL.md",
    memoryPath: "docs/internal/goonies/chunk/MEMORY.md",
    knowledgeBasePath: "docs/internal/goonies/chunk/KNOWLEDGE_BASE.md",
  },
  mikey: {
    soulPath: "docs/internal/goonies/mikey/SOUL.md",
    memoryPath: "docs/internal/goonies/mikey/MEMORY.md",
    knowledgeBasePath: "docs/internal/goonies/mikey/KNOWLEDGE_BASE.md",
  },
  mouth: {
    soulPath: "docs/internal/goonies/mouth/SOUL.md",
    memoryPath: "docs/internal/goonies/mouth/MEMORY.md",
    knowledgeBasePath: "docs/internal/goonies/mouth/KNOWLEDGE_BASE.md",
  },
  brand: {
    soulPath: "docs/internal/goonies/brand/SOUL.md",
    memoryPath: "docs/internal/goonies/brand/MEMORY.md",
    knowledgeBasePath: "docs/internal/goonies/brand/KNOWLEDGE_BASE.md",
  },
  data: {
    soulPath: "docs/internal/goonies/data/SOUL.md",
    memoryPath: "docs/internal/goonies/data/MEMORY.md",
    knowledgeBasePath: "docs/internal/goonies/data/KNOWLEDGE_BASE.md",
  },
  andy: {
    soulPath: "docs/internal/goonies/andy/SOUL.md",
    memoryPath: "docs/internal/goonies/andy/MEMORY.md",
    knowledgeBasePath: "docs/internal/goonies/andy/KNOWLEDGE_BASE.md",
  },
  willy: {
    soulPath: "docs/internal/goonies/willy/SOUL.md",
    memoryPath: "docs/internal/goonies/willy/MEMORY.md",
    knowledgeBasePath: "docs/internal/goonies/willy/KNOWLEDGE_BASE.md",
    playbookPath: "docs/internal/goonies/willy/WILLY_PLAYBOOK_V1.md",
    systemPromptPath: "docs/internal/goonies/willy/WILLY_SYSTEM_PROMPT.md",
  },
};

export const GOONIES_SHARED_RULE_DOCS = [
  {
    id: "source-rules",
    label: "View Source Rules",
    path: "docs/internal/goonies/SOURCE_STANDARDS.md",
  },
  {
    id: "citation-rules",
    label: "View Citation Rules",
    path: "docs/internal/goonies/KNOWLEDGE_BASE_SCHEMA.md",
  },
  {
    id: "research-rules",
    label: "View Research Rules",
    path: "docs/internal/goonies/ONLINE_RESEARCH_APPROVAL_RULES.md",
  },
];

export function getAdvisoryBenchAgents() {
  return (registry.agents || []).map((agent) => ({
    ...agent,
    statusLabel: agent.llm_backed ? "LLM-backed consult-only live" : String(agent.status || "docs_ready").replace(/_/g, " / "),
    placeholderAvatar: ADVISORY_PLACEHOLDER_ASSET,
  }));
}

export function getRegistryMeta() {
  return {
    version: registry.version,
    status: registry.status,
    group: registry.group,
  };
}

export function getDocContentByPath(path) {
  return DOC_CONTENT_BY_PATH[path] ?? null;
}

export function getAgentById(agentId) {
  return getAdvisoryBenchAgents().find((agent) => agent.id === agentId) ?? null;
}

export function getAdvisoryBenchOverview() {
  return {
    title: "Advisory Bench",
    overviewPath: "docs/internal/goonies/GOONIES_SYSTEM_OVERVIEW.md",
    overviewContent: systemOverviewRaw,
    consultProtocolPath: "docs/internal/goonies/CONSULT_PROTOCOL.md",
    consultProtocolContent: consultProtocolRaw,
  };
}

export function getSharedGoonieRuleBundle() {
  return {
    systemOverview: {
      path: "docs/internal/goonies/GOONIES_SYSTEM_OVERVIEW.md",
      content: systemOverviewRaw,
    },
    consultProtocol: {
      path: "docs/internal/goonies/CONSULT_PROTOCOL.md",
      content: consultProtocolRaw,
    },
    sourceStandards: {
      path: "docs/internal/goonies/SOURCE_STANDARDS.md",
      content: sourceStandardsRaw,
    },
    knowledgeSchema: {
      path: "docs/internal/goonies/KNOWLEDGE_BASE_SCHEMA.md",
      content: knowledgeSchemaRaw,
    },
    onlineResearchRules: {
      path: "docs/internal/goonies/ONLINE_RESEARCH_APPROVAL_RULES.md",
      content: onlineResearchRulesRaw,
    },
    escalationRules: {
      path: "docs/internal/goonies/ESCALATION_AND_CONFIDENCE_RULES.md",
      content: escalationRulesRaw,
    },
  };
}

export function getGoonieRuntimeContext(agentId) {
  const agent = getAgentById(agentId);
  const docPaths = GOONIE_DOC_PATHS_BY_ID[agentId];

  if (!agent || !docPaths) {
    return null;
  }

  return {
    agent,
    soul: {
      path: docPaths.soulPath,
      content: getDocContentByPath(docPaths.soulPath),
    },
    memory: {
      path: docPaths.memoryPath,
      content: getDocContentByPath(docPaths.memoryPath),
    },
    knowledgeBase: {
      path: docPaths.knowledgeBasePath,
      content: getDocContentByPath(docPaths.knowledgeBasePath),
    },
    playbook: docPaths.playbookPath
      ? {
          path: docPaths.playbookPath,
          content: getDocContentByPath(docPaths.playbookPath),
        }
      : null,
    systemPrompt: docPaths.systemPromptPath
      ? {
          path: docPaths.systemPromptPath,
          content: getDocContentByPath(docPaths.systemPromptPath),
        }
      : null,
    sharedRules: getSharedGoonieRuleBundle(),
  };
}
