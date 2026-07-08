// Owner-reported trial cases that have not yet been regenerated from the Firestore export.
// Keep these in the live wall so same-cycle fixes are protected immediately.
export const nexiOwnerReportedRegressionSessions = [
  {
    conversationId: "owner-reported-2026-07-07-cross-rail-measurements",
    cases: [
      {
        id: "20260707-owner-1-total-gallons-deborah-justice-cross-rail",
        createdAt: "2026-07-07T23:59:00.000-04:00",
        originalConversationId: "owner-reported",
        question: "What are the total gallons for Deborah Justice?",
        expectedIntent: "report_measurement_lookup",
        requiredTools: ["getJobDetail", "getDocuments", "lookupSiteJobBlueprintField"],
        forbiddenTools: ["searchEmail"],
        assertions: ["usesRequiredRails", "noRawToolError"]
      }
    ]
  },
  {
    conversationId: "owner-reported-2026-07-07-crm-client-list",
    cases: [
      {
        id: "20260707-owner-2-show-me-a-client-list",
        createdAt: "2026-07-07T23:59:01.000-04:00",
        originalConversationId: "owner-reported",
        question: "show me a client list",
        expectedIntent: "crm_client_list",
        requiredTools: ["clientLookup"],
        forbiddenTools: ["searchEmail"],
        assertions: ["usesRequiredRails", "noRawToolError"]
      },
      {
        id: "20260707-owner-3-how-many-clients-do-we-have",
        createdAt: "2026-07-07T23:59:02.000-04:00",
        originalConversationId: "owner-reported",
        question: "how many clients do we have",
        expectedIntent: "crm_client_list",
        requiredTools: ["clientLookup"],
        forbiddenTools: ["searchEmail"],
        assertions: ["usesRequiredRails", "noRawToolError"]
      }
    ]
  },
  {
    conversationId: "owner-reported-2026-07-07-report-pdf-email-gap",
    cases: [
      {
        id: "20260707-owner-4-email-me-report-pdfs",
        createdAt: "2026-07-07T23:59:03.000-04:00",
        originalConversationId: "owner-reported",
        question: "email me the report PDFs",
        expectedIntent: "capability_gap_report_pdf_email",
        requiredTools: [],
        forbiddenTools: ["searchEmail"],
        assertions: ["capabilityGap", "noNoSourceStonewall", "noRawToolError"]
      }
    ]
  }
];
