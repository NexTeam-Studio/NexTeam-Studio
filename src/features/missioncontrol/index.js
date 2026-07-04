/**
 * Mission Control — Public exports
 *
 * Aquatrace case-study entry points.
 * Route: /mission-control  (AdminGate + MissionControlGate protected)
 */

export { MissionControlHome } from "./components/MissionControlHome.jsx";
export { NjordMissionControl } from "./components/NjordMissionControl.jsx";
export { MissionControlGate } from "./components/MissionControlGate.jsx";
export { useNjordSession } from "./hooks/useNjordSession.js";
export { NJORD_CONFIG, isCaseStudyMode } from "./config/njordConfig.js";
export { NORSE_ROSTER } from "./config/norseRoster.js";
export { fetchMissionControlClients } from "./services/missionControlRegistry.js";
