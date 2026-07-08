export const classCIntentRoutingSessions = [
  {
    conversationId: "part9-class-C-action-meta-closure",
    cases: [
      {
        id: "part9-class-C-draft-email-action-not-search",
        createdAt: "2026-07-08T20:46:00.000Z",
        originalConversationId: "part9-class-closure",
        question: "Please draft an email to nexi@aquatraceleak.com saying the report is ready for review.",
        expectedIntent: "email_draft_action",
        requiredTools: ["draftEmail"],
        forbiddenTools: ["searchEmail"],
        assertions: ["draftQueued", "noNoSourceStonewall", "noRawToolError"]
      },
      {
        id: "part9-class-C-inbox-summary-not-search-misroute",
        createdAt: "2026-07-08T20:46:01.000Z",
        originalConversationId: "part9-class-closure",
        question: "Give me a quick inbox rundown.",
        expectedIntent: "email_inbox_summary",
        requiredTools: ["summarizeInbox"],
        forbiddenTools: ["draftEmail"],
        assertions: ["usesRequiredRails", "noNoSourceStonewall", "noRawToolError"]
      },
      {
        id: "part9-class-C-correction-not-fact-lookup",
        createdAt: "2026-07-08T20:46:02.000Z",
        originalConversationId: "part9-class-closure",
        question: "That answer was wrong; log this correction.",
        expectedIntent: "feedback_or_correction",
        requiredTools: [],
        forbiddenTools: ["searchEmail", "getJobDetail", "getDocuments"],
        assertions: ["noNoSourceStonewall", "noRawToolError"]
      },
      {
        id: "part9-class-C-capabilities-meta-not-stonewall",
        createdAt: "2026-07-08T20:46:03.000Z",
        originalConversationId: "part9-class-closure",
        question: "What can you help me do from here?",
        expectedIntent: "meta_capabilities",
        requiredTools: [],
        forbiddenTools: ["searchEmail", "getJobDetail", "getDocuments"],
        assertions: ["capabilitiesList", "noNoSourceStonewall", "noRawToolError"]
      }
    ]
  }
];
