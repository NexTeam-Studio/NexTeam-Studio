export const classASingleRailSessions = [
  {
    conversationId: "part9-class-A-cross-rail-closure",
    cases: [
      {
        id: "part9-class-A-valley-view-findings-different-client",
        createdAt: "2026-07-08T20:45:00.000Z",
        originalConversationId: "part9-class-closure",
        question: "What did the Valley View Condominiums leak report find?",
        expectedIntent: "job_detail_cross_rail",
        requiredTools: ["getJobDetail", "getDocuments"],
        forbiddenTools: ["searchEmail"],
        assertions: ["usesRequiredRails", "noNoSourceStonewall", "noRawToolError"]
      },
      {
        id: "part9-class-A-rachel-payne-findings-different-phrasing",
        createdAt: "2026-07-08T20:45:01.000Z",
        originalConversationId: "part9-class-closure",
        question: "Tell me what problems were found on Rachel Payne's pool.",
        expectedIntent: "job_detail_cross_rail",
        requiredTools: ["getJobDetail", "getDocuments"],
        forbiddenTools: ["searchEmail"],
        assertions: ["usesRequiredRails", "noNoSourceStonewall", "noRawToolError"]
      },
      {
        id: "part9-class-A-forrest-ferguson-issue-different-client",
        createdAt: "2026-07-08T20:45:02.000Z",
        originalConversationId: "part9-class-closure",
        question: "What issue was written up for Forrest Ferguson?",
        expectedIntent: "job_detail_cross_rail",
        requiredTools: ["getJobDetail", "getDocuments"],
        forbiddenTools: ["searchEmail"],
        assertions: ["usesRequiredRails", "noNoSourceStonewall", "noRawToolError"]
      },
      {
        id: "part9-class-A-deborah-justice-measurement-section-scope",
        createdAt: "2026-07-08T20:45:03.000Z",
        originalConversationId: "part9-class-closure",
        question: "For Deborah Justice, how many spa main drains were listed?",
        expectedIntent: "section_scoped_report_measurement_lookup",
        requiredTools: ["getJobDetail", "getDocuments", "lookupSiteJobBlueprintField"],
        forbiddenTools: ["searchEmail"],
        assertions: ["usesRequiredRails", "noNoSourceStonewall", "noRawToolError"]
      }
    ]
  }
];
