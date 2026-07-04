import { maybeGenerateBragiArticlePackage, getBragiContinuitySchedule } from "../src/features/missioncontrol/services/bragiContinuityService.js";

const topicOverride = process.argv.find((value) => value.startsWith("--topic="))?.split("=")[1];
const result = await maybeGenerateBragiArticlePackage({ topicOverride, dryRun: true });
const schedule = getBragiContinuitySchedule();

console.log(JSON.stringify({
  ok: true,
  mode: result.mode,
  schedule,
  selectedTopic: result.topic,
  articlePackage: result.package,
  draftOnly: true,
  publishAllowed: false,
  scheduleAllowed: false,
}, null, 2));
