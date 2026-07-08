export const classDCapabilityGapSessions = [
  {
    conversationId: "part9-class-D-capability-gap-closure",
    cases: [
      {
        id: "part9-class-D-distance-tool-gap-plain-language",
        createdAt: "2026-07-08T20:47:00.000Z",
        originalConversationId: "part9-class-closure",
        question: "How far is today's pool from my house?",
        expectedIntent: "capability_gap_distance_or_maps",
        requiredTools: [],
        forbiddenTools: ["searchEmail"],
        assertions: ["capabilityGap", "noNoSourceStonewall", "noRawToolError"]
      },
      {
        id: "part9-class-D-report-pdf-email-attachment-gap",
        createdAt: "2026-07-08T20:47:01.000Z",
        originalConversationId: "part9-class-closure",
        question: "Email me every Deborah Justice report PDF.",
        expectedIntent: "capability_gap_report_pdf_email",
        requiredTools: [],
        forbiddenTools: ["searchEmail"],
        assertions: ["capabilityGap", "noNoSourceStonewall", "noRawToolError"]
      },
      {
        id: "part9-class-D-ar-summary-gap-not-empty-data",
        createdAt: "2026-07-08T20:47:02.000Z",
        originalConversationId: "part9-class-closure",
        question: "Who owes us money right now?",
        expectedIntent: "capability_gap_ar_summary",
        requiredTools: [],
        forbiddenTools: ["searchEmail"],
        assertions: ["capabilityGap", "noNoSourceStonewall", "noRawToolError"]
      }
    ]
  }
];
