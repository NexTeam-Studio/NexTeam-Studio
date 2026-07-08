import { classASingleRailSessions } from "./class-A-single-rail/cases.mjs";
import { classCIntentRoutingSessions } from "./class-C-intent-routing/cases.mjs";
import { classDCapabilityGapSessions } from "./class-D-capability-gap/cases.mjs";

export const nexiClassRegressionSessions = [
  ...classASingleRailSessions,
  ...classCIntentRoutingSessions,
  ...classDCapabilityGapSessions
];
