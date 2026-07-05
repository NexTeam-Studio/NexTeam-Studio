import test from "node:test";
import assert from "node:assert/strict";
import { firebaseNexiV1RepositoryInternals } from "./firebaseNexiV1Repository.js";

test("buildConversationHistoryMessages recreates alternating user/assistant chat turns", () => {
  const messages = firebaseNexiV1RepositoryInternals.buildConversationHistoryMessages([
    {
      question: "What is the gallonage for Camp Mikell?",
      answer: "Camp Mikell total gallons: 101,000.",
    },
    {
      question: "What issues were present?",
      answer: "The report noted dye-response findings at the skimmer line.",
    },
  ]);

  assert.deepEqual(messages, [
    { role: "user", content: "What is the gallonage for Camp Mikell?" },
    { role: "assistant", content: "Camp Mikell total gallons: 101,000." },
    { role: "user", content: "What issues were present?" },
    { role: "assistant", content: "The report noted dye-response findings at the skimmer line." },
  ]);
});
