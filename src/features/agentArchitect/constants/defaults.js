import { STAGES } from "./stages.js";

export const DEFAULT_STAGE = STAGES[0];

export const DEFAULT_DRAFT_PATCH = {
  business_name: "",
  trade: "",
  crew_size: "",
  job_volume: "",
  service_area: "",
  biggest_pain: "",
  existing_tools: [],
  agent_recommendation: [],
  priority_agent: "",
  agent_name: ""
};

export const defaults = {
  stage: DEFAULT_STAGE,
  missingFields: [...STAGES.filter((stage) => !["complete"].includes(stage))],
  draftPatch: { ...DEFAULT_DRAFT_PATCH }
};
