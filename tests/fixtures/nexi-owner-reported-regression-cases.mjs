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
  },
  {
    conversationId: "owner-reported-2026-07-08-email-rail-p1w",
    cases: [
      {
        id: "20260708-owner-p1w-check-inbox",
        createdAt: "2026-07-08T23:58:00.000-04:00",
        originalConversationId: "owner-reported",
        question: "check inbox",
        expectedIntent: "email_inbox_summary",
        requiredTools: ["summarizeInbox"],
        forbiddenTools: ["searchEmail"],
        assertions: ["usesRequiredRails", "noNoSourceStonewall", "noRawToolError"]
      },
      {
        id: "20260708-owner-p1w-summarize-inbox",
        createdAt: "2026-07-08T23:58:01.000-04:00",
        originalConversationId: "owner-reported",
        question: "summarize inbox",
        expectedIntent: "email_inbox_summary",
        requiredTools: ["summarizeInbox"],
        forbiddenTools: ["searchEmail"],
        assertions: ["usesRequiredRails", "noNoSourceStonewall", "noRawToolError"]
      },
      {
        id: "20260708-owner-p1w-order-unread",
        createdAt: "2026-07-08T23:58:02.000-04:00",
        originalConversationId: "owner-reported",
        question: "order unread",
        expectedIntent: "email_inbox_triage",
        requiredTools: ["triageInbox"],
        forbiddenTools: ["searchEmail"],
        assertions: ["usesRequiredRails", "noNoSourceStonewall", "noRawToolError"]
      }
    ]
  },
  {
    conversationId: "owner-reported-2026-07-08-evap-p1x",
    cases: [
      {
        id: "20260708-owner-p1x-use-evaporation-calculator-deborah-justice",
        createdAt: "2026-07-08T23:58:03.000-04:00",
        originalConversationId: "owner-reported",
        question: "use the evaporation calculator on Deborah Justice's pool",
        expectedIntent: "evaporation_report_from_job_context",
        requiredTools: ["getJobDetail", "getDocuments", "runEvaporation"],
        forbiddenTools: ["searchEmail"],
        assertions: ["usesRequiredRails", "noNoSourceStonewall", "noRawToolError"]
      }
    ]
  },
  {
    conversationId: "owner-reported-2026-07-08-spa-followup-p1y",
    cases: [
      {
        id: "20260708-owner-p1y-pool-main-drains-deborah-justice",
        createdAt: "2026-07-08T23:58:04.000-04:00",
        originalConversationId: "owner-reported",
        question: "How many pool main drains did Deborah Justice have?",
        expectedIntent: "section_scoped_report_measurement_lookup",
        requiredTools: ["getJobDetail", "getDocuments", "lookupSiteJobBlueprintField"],
        forbiddenTools: ["searchEmail"],
        assertions: ["usesRequiredRails", "noNoSourceStonewall", "noRawToolError"]
      },
      {
        id: "20260708-owner-p1y-spa-main-drains-followup",
        createdAt: "2026-07-08T23:58:05.000-04:00",
        originalConversationId: "owner-reported",
        question: "what about the spa main drains?",
        expectedIntent: "section_scoped_report_measurement_lookup",
        requiredTools: ["getJobDetail", "getDocuments", "lookupSiteJobBlueprintField"],
        forbiddenTools: ["searchEmail"],
        assertions: ["usesRequiredRails", "noNoSourceStonewall", "noRawToolError"]
      }
    ]
  },
  {
    conversationId: "owner-reported-2026-07-08-basic-tools-p2z",
    cases: [
      {
        id: "20260708-owner-p2z-what-time-is-it",
        createdAt: "2026-07-08T23:58:06.000-04:00",
        originalConversationId: "owner-reported",
        question: "what time is it",
        expectedIntent: "current_time",
        requiredTools: ["getCurrentTime"],
        forbiddenTools: ["searchEmail"],
        assertions: ["usesRequiredRails", "noNoSourceStonewall", "noRawToolError"]
      },
      {
        id: "20260708-owner-p2z-current-temp-fair-play",
        createdAt: "2026-07-08T23:58:07.000-04:00",
        originalConversationId: "owner-reported",
        question: "current temp in Fair Play",
        expectedIntent: "current_weather",
        requiredTools: ["getCurrentWeather"],
        forbiddenTools: ["searchEmail"],
        assertions: ["usesRequiredRails", "noNoSourceStonewall", "noRawToolError"]
      }
    ]
  },
  {
    conversationId: "owner-reported-2026-07-08-meta-p2aa",
    cases: [
      {
        id: "20260708-owner-p2aa-what-commands-can-i-use",
        createdAt: "2026-07-08T23:58:08.000-04:00",
        originalConversationId: "owner-reported",
        question: "what commands can I use",
        expectedIntent: "meta_capabilities",
        requiredTools: [],
        forbiddenTools: ["searchEmail", "getJobDetail", "getDocuments"],
        assertions: ["noNoSourceStonewall", "noRawToolError"]
      },
      {
        id: "20260708-owner-p2aa-why-did-that-fail",
        createdAt: "2026-07-08T23:58:09.000-04:00",
        originalConversationId: "owner-reported",
        question: "why did that fail",
        expectedIntent: "meta_failure_explanation",
        requiredTools: [],
        forbiddenTools: ["searchEmail", "getJobDetail", "getDocuments"],
        assertions: ["noNoSourceStonewall", "noRawToolError"]
      },
      {
        id: "20260708-owner-p2aa-how-do-i-upload-photos",
        createdAt: "2026-07-08T23:58:10.000-04:00",
        originalConversationId: "owner-reported",
        question: "how do I upload photos",
        expectedIntent: "meta_photo_upload_help",
        requiredTools: [],
        forbiddenTools: ["searchEmail", "getJobDetail", "getDocuments"],
        assertions: ["noNoSourceStonewall", "noRawToolError"]
      }
    ]
  },
  {
    conversationId: "owner-reported-2026-07-08-good-behavior-bank",
    cases: [
      {
        id: "20260708-owner-good-ytd-revenue-honest-gap",
        createdAt: "2026-07-08T23:58:11.000-04:00",
        originalConversationId: "owner-reported",
        question: "what is our YTD revenue",
        expectedIntent: "capability_gap_revenue",
        requiredTools: [],
        forbiddenTools: ["searchEmail"],
        assertions: ["capabilityGap", "noNoSourceStonewall", "noRawToolError"]
      },
      {
        id: "20260708-owner-good-close-out-mismatch-caution",
        createdAt: "2026-07-08T23:58:12.000-04:00",
        originalConversationId: "owner-reported",
        question: "close out the Deborah Justice job even if Jobber still shows it as a future lead",
        expectedIntent: "approval_caution_no_unsafe_write",
        requiredTools: ["getJobDetail"],
        forbiddenTools: ["searchEmail"],
        assertions: ["usesRequiredRails", "noNoSourceStonewall", "noRawToolError"]
      },
      {
        id: "20260708-owner-good-denver-deborah-clarification",
        createdAt: "2026-07-08T23:58:13.000-04:00",
        originalConversationId: "owner-reported",
        question: "show me Denver Justice photos",
        expectedIntent: "companycam_photo_lookup_or_clarification",
        requiredTools: ["getPhotos"],
        forbiddenTools: ["searchEmail"],
        assertions: ["usesRequiredRails", "noNoSourceStonewall", "noRawToolError"]
      },
      {
        id: "20260708-owner-good-fourteen-vs-four-glitch-catch",
        createdAt: "2026-07-08T23:58:14.000-04:00",
        originalConversationId: "owner-reported",
        question: "did Deborah Justice have 14 pool main drains or 4?",
        expectedIntent: "section_scoped_report_measurement_lookup",
        requiredTools: ["getJobDetail", "getDocuments", "lookupSiteJobBlueprintField"],
        forbiddenTools: ["searchEmail"],
        assertions: ["usesRequiredRails", "noNoSourceStonewall", "noRawToolError"]
      }
    ]
  },
  {
    conversationId: "owner-reported-2026-07-09-class-h-client-identity",
    cases: [
      {
        id: "20260709-owner-class-h-client-lookup-kristi-king",
        createdAt: "2026-07-09T18:00:00.000-04:00",
        originalConversationId: "owner-reported",
        question: "Look up client Kristi King",
        expectedIntent: "client_identity_lookup_live_jobber_fallback",
        requiredTools: ["clientLookup"],
        forbiddenTools: ["searchEmail", "getSchedule"],
        expectedAnswerIncludes: ["I found", "Kristi King"],
        assertions: ["usesRequiredRails", "noNoSourceStonewall", "noRawToolError"]
      },
      {
        id: "20260709-owner-class-h-job-lookup-kristi-king",
        createdAt: "2026-07-09T18:00:01.000-04:00",
        originalConversationId: "owner-reported",
        question: "What job do we have for Kristi King?",
        expectedIntent: "job_identity_lookup_live_jobber",
        requiredTools: ["getJobDetail"],
        forbiddenTools: ["searchEmail", "getSchedule"],
        expectedAnswerIncludes: ["Kristi King", "Swimming Pool Leak Detection"],
        assertions: ["usesRequiredRails", "noNoSourceStonewall", "noRawToolError"]
      },
      {
        id: "20260709-owner-class-h-client-lookup-valley-view-condominiums",
        createdAt: "2026-07-09T18:00:02.000-04:00",
        originalConversationId: "owner-reported",
        question: "Look up client Valley View Condominiums",
        expectedIntent: "client_identity_lookup_live_jobber_fallback_other_client",
        requiredTools: ["clientLookup"],
        forbiddenTools: ["searchEmail", "getSchedule"],
        expectedAnswerIncludes: ["I found", "Valley View Condominiums"],
        forbiddenAnswerIncludes: ["Kristi King"],
        assertions: ["usesRequiredRails", "noNoSourceStonewall", "noRawToolError"]
      }
    ]
  }
];
