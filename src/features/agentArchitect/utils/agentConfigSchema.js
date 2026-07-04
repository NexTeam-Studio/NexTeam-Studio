export const agentConfigSchema = {
  business_name: { type: "string", label: "Business Name" },
  trade: { type: "string", label: "Trade" },
  crew_size: { type: "string", label: "Crew Size" },
  job_volume: { type: "string", label: "Job Volume" },
  service_area: { type: "string", label: "Service Area" },
  biggest_pain: { type: "string", label: "Biggest Pain" },
  existing_tools: { type: "string[]", label: "Existing Tools" },
  agent_recommendation: { type: "string[]", label: "Agent Recommendation" },
  priority_agent: { type: "string", label: "Priority Agent" },
  agent_name: { type: "string", label: "Agent Name" }
};
