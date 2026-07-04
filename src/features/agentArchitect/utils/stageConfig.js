import { STAGES, STAGE_LABELS, FINAL_STAGE } from "../constants/stages.js";

export const stageConfig = Object.fromEntries(
  STAGES.map((stage) => [
    stage,
    {
      id: stage,
      label: STAGE_LABELS[stage] ?? stage,
      isFinal: stage === FINAL_STAGE
    }
  ])
);
