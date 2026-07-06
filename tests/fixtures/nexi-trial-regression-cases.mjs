// Generated from receipts/m1/nexi-trial-full-session-export-redacted.json. Do not hand-edit cases; regenerate after each trial audit.
export const nexiTrialRegressionSessions = [
  {
    "conversationId": "conv_5b437bd0-1351-4535-b339-d34b3a612ef4",
    "cases": [
      {
        "id": "20260704172042-1-how-many-pool-gallons-are-in-the-camp-mikell-sitejobblueprint-use-lookupsitejobb",
        "createdAt": "2026-07-04T17:20:42.712Z",
        "originalConversationId": "conv_5b437bd0-1351-4535-b339-d34b3a612ef4",
        "question": "How many pool gallons are in the Camp Mikell SiteJobBlueprint? Use lookupSiteJobBlueprintField for poolGallons and include sources.",
        "expectedIntent": "site_blueprint_lookup",
        "requiredTools": [
          "lookupSiteJobBlueprintField"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails",
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "conv_9d8d2204-eb1f-43b0-a9c0-ba523b8c3039",
    "cases": [
      {
        "id": "20260704172049-1-how-many-pool-gallons-are-in-the-camp-mikell-sitejobblueprint-use-lookupsitejobb",
        "createdAt": "2026-07-04T17:20:49.617Z",
        "originalConversationId": "conv_9d8d2204-eb1f-43b0-a9c0-ba523b8c3039",
        "question": "How many pool gallons are in the Camp Mikell SiteJobBlueprint? Use lookupSiteJobBlueprintField for poolGallons and include sources.",
        "expectedIntent": "site_blueprint_lookup",
        "requiredTools": [
          "lookupSiteJobBlueprintField"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails",
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "conv_85c799ff-a298-4c24-8a23-ad9cfafc1ed0",
    "cases": [
      {
        "id": "20260704172534-1-what-jobber-jobs-are-on-the-schedule-today-use-getschedule-and-include-sources",
        "createdAt": "2026-07-04T17:25:34.406Z",
        "originalConversationId": "conv_85c799ff-a298-4c24-8a23-ad9cfafc1ed0",
        "question": "What Jobber jobs are on the schedule today? Use getSchedule and include sources.",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      }
    ]
  },
  {
    "conversationId": "conv_2a840853-a50b-4288-8211-b091da6458d5",
    "cases": [
      {
        "id": "20260704172544-1-find-companycam-photos-for-deborah-justice-use-getphotos-and-include-sources",
        "createdAt": "2026-07-04T17:25:44.767Z",
        "originalConversationId": "conv_2a840853-a50b-4288-8211-b091da6458d5",
        "question": "Find CompanyCam photos for Deborah Justice. Use getPhotos and include sources.",
        "expectedIntent": "companycam_photo_lookup",
        "requiredTools": [
          "getPhotos"
        ],
        "forbiddenTools": [],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "conv_1b4f804d-ae7e-4f4e-ae65-39fe8f580f30",
    "cases": [
      {
        "id": "20260704172547-1-how-many-pool-gallons-are-in-the-camp-mikell-sitejobblueprint-use-lookupsitejobb",
        "createdAt": "2026-07-04T17:25:47.688Z",
        "originalConversationId": "conv_1b4f804d-ae7e-4f4e-ae65-39fe8f580f30",
        "question": "How many pool gallons are in the Camp Mikell SiteJobBlueprint? Use lookupSiteJobBlueprintField for poolGallons and include sources.",
        "expectedIntent": "site_blueprint_lookup",
        "requiredTools": [
          "lookupSiteJobBlueprintField"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails",
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "conv_1fa53bf0-6be7-4a88-a032-1dfad96f49cd",
    "cases": [
      {
        "id": "20260704172554-1-how-many-pool-gallons-are-in-the-camp-mikell-sitejobblueprint-use-lookupsitejobb",
        "createdAt": "2026-07-04T17:25:54.012Z",
        "originalConversationId": "conv_1fa53bf0-6be7-4a88-a032-1dfad96f49cd",
        "question": "How many pool gallons are in the Camp Mikell SiteJobBlueprint? Use lookupSiteJobBlueprintField for poolGallons and include sources.",
        "expectedIntent": "site_blueprint_lookup",
        "requiredTools": [
          "lookupSiteJobBlueprintField"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails",
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "probe-20260704132924",
    "cases": [
      {
        "id": "20260704172947-1-what-jobber-jobs-are-on-the-schedule-today-use-getschedule-and-include-sources",
        "createdAt": "2026-07-04T17:29:47.787Z",
        "originalConversationId": "probe-20260704132924",
        "question": "What Jobber jobs are on the schedule today? Use getSchedule and include sources.",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      }
    ]
  },
  {
    "conversationId": "live-m1-A-20260704133021",
    "cases": [
      {
        "id": "20260704173045-1-what-jobber-jobs-are-on-the-schedule-today-use-getschedule-and-include-sources",
        "createdAt": "2026-07-04T17:30:45.190Z",
        "originalConversationId": "live-m1-A-20260704133021",
        "question": "What Jobber jobs are on the schedule today? Use getSchedule and include sources.",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      }
    ]
  },
  {
    "conversationId": "live-m1-B-20260704133021",
    "cases": [
      {
        "id": "20260704173052-1-find-companycam-photos-for-deborah-justice-use-getphotos-and-include-sources",
        "createdAt": "2026-07-04T17:30:52.873Z",
        "originalConversationId": "live-m1-B-20260704133021",
        "question": "Find CompanyCam photos for Deborah Justice. Use getPhotos and include sources.",
        "expectedIntent": "companycam_photo_lookup",
        "requiredTools": [
          "getPhotos"
        ],
        "forbiddenTools": [],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "live-m1-C-20260704133021",
    "cases": [
      {
        "id": "20260704173057-1-how-many-pool-gallons-are-in-the-camp-mikell-sitejobblueprint-use-lookupsitejobb",
        "createdAt": "2026-07-04T17:30:57.286Z",
        "originalConversationId": "live-m1-C-20260704133021",
        "question": "How many pool gallons are in the Camp Mikell SiteJobBlueprint? Use lookupSiteJobBlueprintField for poolGallons and include sources.",
        "expectedIntent": "site_blueprint_lookup",
        "requiredTools": [
          "lookupSiteJobBlueprintField"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails",
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260704173102-2-how-many-pool-gallons-are-in-the-camp-mikell-sitejobblueprint-use-lookupsitejobb",
        "createdAt": "2026-07-04T17:31:02.700Z",
        "originalConversationId": "live-m1-C-20260704133021",
        "question": "How many pool gallons are in the Camp Mikell SiteJobBlueprint? Use lookupSiteJobBlueprintField for poolGallons and include sources.",
        "expectedIntent": "site_blueprint_lookup",
        "requiredTools": [
          "lookupSiteJobBlueprintField"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails",
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "live-m1-A-20260704133541",
    "cases": [
      {
        "id": "20260704173548-1-what-jobber-jobs-are-on-the-schedule-today-use-getschedule-and-include-sources",
        "createdAt": "2026-07-04T17:35:48.602Z",
        "originalConversationId": "live-m1-A-20260704133541",
        "question": "What Jobber jobs are on the schedule today? Use getSchedule and include sources.",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      }
    ]
  },
  {
    "conversationId": "live-m1-B-20260704133541",
    "cases": [
      {
        "id": "20260704173555-1-find-companycam-photos-for-deborah-justice-use-getphotos-and-include-sources",
        "createdAt": "2026-07-04T17:35:55.752Z",
        "originalConversationId": "live-m1-B-20260704133541",
        "question": "Find CompanyCam photos for Deborah Justice. Use getPhotos and include sources.",
        "expectedIntent": "companycam_photo_lookup",
        "requiredTools": [
          "getPhotos"
        ],
        "forbiddenTools": [],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "live-m1-C-20260704133541",
    "cases": [
      {
        "id": "20260704173600-1-how-many-pool-gallons-are-in-the-camp-mikell-sitejobblueprint-use-lookupsitejobb",
        "createdAt": "2026-07-04T17:36:00.708Z",
        "originalConversationId": "live-m1-C-20260704133541",
        "question": "How many pool gallons are in the Camp Mikell SiteJobBlueprint? Use lookupSiteJobBlueprintField for poolGallons and include sources.",
        "expectedIntent": "site_blueprint_lookup",
        "requiredTools": [
          "lookupSiteJobBlueprintField"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails",
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260704173606-2-how-many-pool-gallons-are-in-the-camp-mikell-sitejobblueprint-use-lookupsitejobb",
        "createdAt": "2026-07-04T17:36:06.992Z",
        "originalConversationId": "live-m1-C-20260704133541",
        "question": "How many pool gallons are in the Camp Mikell SiteJobBlueprint? Use lookupSiteJobBlueprintField for poolGallons and include sources.",
        "expectedIntent": "site_blueprint_lookup",
        "requiredTools": [
          "lookupSiteJobBlueprintField"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails",
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "live-m1-A-20260704134036",
    "cases": [
      {
        "id": "20260704174049-1-what-jobber-jobs-are-on-the-schedule-today-use-getschedule-and-include-sources",
        "createdAt": "2026-07-04T17:40:49.119Z",
        "originalConversationId": "live-m1-A-20260704134036",
        "question": "What Jobber jobs are on the schedule today? Use getSchedule and include sources.",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      }
    ]
  },
  {
    "conversationId": "live-m1-B-20260704134036",
    "cases": [
      {
        "id": "20260704174053-1-find-companycam-photos-for-deborah-justice-use-getphotos-and-include-sources",
        "createdAt": "2026-07-04T17:40:53.215Z",
        "originalConversationId": "live-m1-B-20260704134036",
        "question": "Find CompanyCam photos for Deborah Justice. Use getPhotos and include sources.",
        "expectedIntent": "companycam_photo_lookup",
        "requiredTools": [
          "getPhotos"
        ],
        "forbiddenTools": [],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "live-m1-C-20260704134036",
    "cases": [
      {
        "id": "20260704174056-1-how-many-pool-gallons-are-in-the-camp-mikell-sitejobblueprint-use-lookupsitejobb",
        "createdAt": "2026-07-04T17:40:56.525Z",
        "originalConversationId": "live-m1-C-20260704134036",
        "question": "How many pool gallons are in the Camp Mikell SiteJobBlueprint? Use lookupSiteJobBlueprintField for poolGallons and include sources.",
        "expectedIntent": "site_blueprint_lookup",
        "requiredTools": [
          "lookupSiteJobBlueprintField"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails",
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260704174059-2-how-many-pool-gallons-are-in-the-camp-mikell-sitejobblueprint-use-lookupsitejobb",
        "createdAt": "2026-07-04T17:40:59.515Z",
        "originalConversationId": "live-m1-C-20260704134036",
        "question": "How many pool gallons are in the Camp Mikell SiteJobBlueprint? Use lookupSiteJobBlueprintField for poolGallons and include sources.",
        "expectedIntent": "site_blueprint_lookup",
        "requiredTools": [
          "lookupSiteJobBlueprintField"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails",
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "live-m1-A-20260704134513",
    "cases": [
      {
        "id": "20260704174524-1-what-jobber-jobs-are-on-the-schedule-today-use-getschedule-and-include-sources",
        "createdAt": "2026-07-04T17:45:24.849Z",
        "originalConversationId": "live-m1-A-20260704134513",
        "question": "What Jobber jobs are on the schedule today? Use getSchedule and include sources.",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      }
    ]
  },
  {
    "conversationId": "live-m1-B-20260704134513",
    "cases": [
      {
        "id": "20260704174530-1-find-companycam-photos-for-deborah-justice-use-getphotos-and-include-sources",
        "createdAt": "2026-07-04T17:45:30.588Z",
        "originalConversationId": "live-m1-B-20260704134513",
        "question": "Find CompanyCam photos for Deborah Justice. Use getPhotos and include sources.",
        "expectedIntent": "companycam_photo_lookup",
        "requiredTools": [
          "getPhotos"
        ],
        "forbiddenTools": [],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "live-m1-C-20260704134513",
    "cases": [
      {
        "id": "20260704174533-1-how-many-pool-gallons-are-in-the-camp-mikell-sitejobblueprint-use-lookupsitejobb",
        "createdAt": "2026-07-04T17:45:33.784Z",
        "originalConversationId": "live-m1-C-20260704134513",
        "question": "How many pool gallons are in the Camp Mikell SiteJobBlueprint? Use lookupSiteJobBlueprintField for poolGallons and include sources.",
        "expectedIntent": "site_blueprint_lookup",
        "requiredTools": [
          "lookupSiteJobBlueprintField"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails",
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260704174536-2-how-many-pool-gallons-are-in-the-camp-mikell-sitejobblueprint-use-lookupsitejobb",
        "createdAt": "2026-07-04T17:45:36.844Z",
        "originalConversationId": "live-m1-C-20260704134513",
        "question": "How many pool gallons are in the Camp Mikell SiteJobBlueprint? Use lookupSiteJobBlueprintField for poolGallons and include sources.",
        "expectedIntent": "site_blueprint_lookup",
        "requiredTools": [
          "lookupSiteJobBlueprintField"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails",
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "live-m1-cache-20260704134551",
    "cases": [
      {
        "id": "20260704174553-1-reply-with-exactly-readiness-check",
        "createdAt": "2026-07-04T17:45:53.922Z",
        "originalConversationId": "live-m1-cache-20260704134551",
        "question": "Reply with exactly: readiness check.",
        "expectedIntent": "meta_echo",
        "requiredTools": [],
        "forbiddenTools": [
          "getJobDetail",
          "searchEmail",
          "draftEmail"
        ],
        "assertions": [
          "noNoSourceStonewall",
          "noRawToolError"
        ]
      },
      {
        "id": "20260704174559-2-reply-with-exactly-readiness-check",
        "createdAt": "2026-07-04T17:45:59.565Z",
        "originalConversationId": "live-m1-cache-20260704134551",
        "question": "Reply with exactly: readiness check.",
        "expectedIntent": "meta_echo",
        "requiredTools": [],
        "forbiddenTools": [
          "getJobDetail",
          "searchEmail",
          "draftEmail"
        ],
        "assertions": [
          "noNoSourceStonewall",
          "noRawToolError"
        ]
      }
    ]
  },
  {
    "conversationId": "live-m1-A-20260704135302",
    "cases": [
      {
        "id": "20260704175316-1-what-jobber-jobs-are-on-the-schedule-today-use-getschedule-and-include-sources",
        "createdAt": "2026-07-04T17:53:16.006Z",
        "originalConversationId": "live-m1-A-20260704135302",
        "question": "What Jobber jobs are on the schedule today? Use getSchedule and include sources.",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      }
    ]
  },
  {
    "conversationId": "live-m1-B-20260704135302",
    "cases": [
      {
        "id": "20260704175322-1-find-companycam-photos-for-deborah-justice-use-getphotos-and-include-sources",
        "createdAt": "2026-07-04T17:53:22.864Z",
        "originalConversationId": "live-m1-B-20260704135302",
        "question": "Find CompanyCam photos for Deborah Justice. Use getPhotos and include sources.",
        "expectedIntent": "companycam_photo_lookup",
        "requiredTools": [
          "getPhotos"
        ],
        "forbiddenTools": [],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "live-m1-C-20260704135302",
    "cases": [
      {
        "id": "20260704175325-1-how-many-pool-gallons-are-in-the-camp-mikell-sitejobblueprint-use-lookupsitejobb",
        "createdAt": "2026-07-04T17:53:25.888Z",
        "originalConversationId": "live-m1-C-20260704135302",
        "question": "How many pool gallons are in the Camp Mikell SiteJobBlueprint? Use lookupSiteJobBlueprintField for poolGallons and include sources.",
        "expectedIntent": "site_blueprint_lookup",
        "requiredTools": [
          "lookupSiteJobBlueprintField"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails",
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260704175328-2-how-many-pool-gallons-are-in-the-camp-mikell-sitejobblueprint-use-lookupsitejobb",
        "createdAt": "2026-07-04T17:53:28.972Z",
        "originalConversationId": "live-m1-C-20260704135302",
        "question": "How many pool gallons are in the Camp Mikell SiteJobBlueprint? Use lookupSiteJobBlueprintField for poolGallons and include sources.",
        "expectedIntent": "site_blueprint_lookup",
        "requiredTools": [
          "lookupSiteJobBlueprintField"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails",
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "live-m1-cache-20260704135302",
    "cases": [
      {
        "id": "20260704175331-1-reply-with-exactly-readiness-check",
        "createdAt": "2026-07-04T17:53:31.466Z",
        "originalConversationId": "live-m1-cache-20260704135302",
        "question": "Reply with exactly: readiness check.",
        "expectedIntent": "meta_echo",
        "requiredTools": [],
        "forbiddenTools": [
          "getJobDetail",
          "searchEmail",
          "draftEmail"
        ],
        "assertions": [
          "noNoSourceStonewall",
          "noRawToolError"
        ]
      },
      {
        "id": "20260704175335-2-reply-with-exactly-readiness-check",
        "createdAt": "2026-07-04T17:53:35.850Z",
        "originalConversationId": "live-m1-cache-20260704135302",
        "question": "Reply with exactly: readiness check.",
        "expectedIntent": "meta_echo",
        "requiredTools": [],
        "forbiddenTools": [
          "getJobDetail",
          "searchEmail",
          "draftEmail"
        ],
        "assertions": [
          "noNoSourceStonewall",
          "noRawToolError"
        ]
      }
    ]
  },
  {
    "conversationId": "web-fe853026-1a7f-446e-a111-bf7adee505d0",
    "cases": [
      {
        "id": "20260704175418-1-find-companycam-photos-for-deborah-justice",
        "createdAt": "2026-07-04T17:54:18.266Z",
        "originalConversationId": "web-fe853026-1a7f-446e-a111-bf7adee505d0",
        "question": "Find CompanyCam photos for Deborah Justice.",
        "expectedIntent": "companycam_photo_lookup",
        "requiredTools": [
          "getPhotos"
        ],
        "forbiddenTools": [],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "web-1b5e0de1-3464-446b-aefb-4d922a107718",
    "cases": [
      {
        "id": "20260705015415-1-what-s-on-schedule-for-monday",
        "createdAt": "2026-07-05T01:54:15.668Z",
        "originalConversationId": "web-1b5e0de1-3464-446b-aefb-4d922a107718",
        "question": "What's on schedule for monday",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      },
      {
        "id": "20260705015758-2-a-lot-of-information-here-mich-of-these-are-unscheduled-or-late-jobs-there-is-a-",
        "createdAt": "2026-07-05T01:57:58.518Z",
        "originalConversationId": "web-1b5e0de1-3464-446b-aefb-4d922a107718",
        "question": "A lot of information here. Mich of these are unscheduled or late jobs.  There is a job on schedule for Monday July 6. What is it",
        "expectedIntent": "pipeline_status",
        "requiredTools": [
          "getPipeline"
        ],
        "forbiddenTools": [],
        "assertions": [
          "usesRequiredRails"
        ]
      },
      {
        "id": "20260705015834-3-what-is-our-current-ytd-revenue",
        "createdAt": "2026-07-05T01:58:34.059Z",
        "originalConversationId": "web-1b5e0de1-3464-446b-aefb-4d922a107718",
        "question": "What is our current ytd revenue",
        "expectedIntent": "capability_gap_revenue",
        "requiredTools": [],
        "forbiddenTools": [
          "getJobDetail",
          "searchEmail"
        ],
        "assertions": [
          "capabilityGap",
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260705015924-4-who-owes-us-money",
        "createdAt": "2026-07-05T01:59:24.594Z",
        "originalConversationId": "web-1b5e0de1-3464-446b-aefb-4d922a107718",
        "question": "Who owes us money",
        "expectedIntent": "payment_status_cross_rail",
        "requiredTools": [
          "getSchedule",
          "getJobDetail",
          "invoiceStatus",
          "searchEmail"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noSingleRailPaymentConclusion",
          "noJan2024"
        ]
      },
      {
        "id": "20260705020136-5-show-me-deborah-justice-pool-photos",
        "createdAt": "2026-07-05T02:01:36.601Z",
        "originalConversationId": "web-1b5e0de1-3464-446b-aefb-4d922a107718",
        "question": "Show me Deborah Justice pool photos",
        "expectedIntent": "companycam_photo_lookup",
        "requiredTools": [
          "getPhotos"
        ],
        "forbiddenTools": [],
        "assertions": [
          "usesRequiredRails"
        ]
      },
      {
        "id": "20260705020209-6-what-sources-do-you-use",
        "createdAt": "2026-07-05T02:02:09.845Z",
        "originalConversationId": "web-1b5e0de1-3464-446b-aefb-4d922a107718",
        "question": "What sources do you use",
        "expectedIntent": "meta_capability",
        "requiredTools": [],
        "forbiddenTools": [],
        "assertions": [
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260705020327-7-what-was-the-issue-at-camp-mikell",
        "createdAt": "2026-07-05T02:03:27.449Z",
        "originalConversationId": "web-1b5e0de1-3464-446b-aefb-4d922a107718",
        "question": "What was the issue at camp mikell",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      },
      {
        "id": "20260705020702-8-you-re-incorrect-this-would-have-been-referenced-in-companycan",
        "createdAt": "2026-07-05T02:07:02.865Z",
        "originalConversationId": "web-1b5e0de1-3464-446b-aefb-4d922a107718",
        "question": "You're incorrect, this would have been referenced in companycan",
        "expectedIntent": "feedback_or_correction",
        "requiredTools": [],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260705020810-9-somewhat-correct-there-is-a-report-in-company-cam-that-specifies-the-resukts",
        "createdAt": "2026-07-05T02:08:10.868Z",
        "originalConversationId": "web-1b5e0de1-3464-446b-aefb-4d922a107718",
        "question": "Somewhat correct, there is a report in company cam that specifies the resukts",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      },
      {
        "id": "20260705020837-10-the-photos-in-that-reply-show-thumbnails-but-are-t-clickable-or-savable",
        "createdAt": "2026-07-05T02:08:37.056Z",
        "originalConversationId": "web-1b5e0de1-3464-446b-aefb-4d922a107718",
        "question": "The photos in that reply show thumbnails but are t clickable or savable",
        "expectedIntent": "feedback_or_correction",
        "requiredTools": [],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260705020910-11-what-were-the-pool-leak-detection-results-for-deborah-justice-in-company-cam-rep",
        "createdAt": "2026-07-05T02:09:10.686Z",
        "originalConversationId": "web-1b5e0de1-3464-446b-aefb-4d922a107718",
        "question": "What were the pool leak detection results for Deborah Justice in company cam report",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      },
      {
        "id": "20260705021006-12-findings-are-in-the-report-what-are-the-total-gallons-of-deborah-justice",
        "createdAt": "2026-07-05T02:10:06.484Z",
        "originalConversationId": "web-1b5e0de1-3464-446b-aefb-4d922a107718",
        "question": "Findings are in the report. What are the total gallons of Deborah Justice",
        "expectedIntent": "site_blueprint_lookup",
        "requiredTools": [
          "lookupSiteJobBlueprintField"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails",
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260705021035-13-same-report-shows-results-of-leak-detection-what-are-they",
        "createdAt": "2026-07-05T02:10:35.915Z",
        "originalConversationId": "web-1b5e0de1-3464-446b-aefb-4d922a107718",
        "question": "Same.report shows results of leak detection. What are they",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      },
      {
        "id": "20260705021112-14-who-are-the-technicians-for-deborah-justice",
        "createdAt": "2026-07-05T02:11:12.781Z",
        "originalConversationId": "web-1b5e0de1-3464-446b-aefb-4d922a107718",
        "question": "Who are the technicians for Deborah Justice",
        "expectedIntent": "general_job_fact",
        "requiredTools": [
          "getJobDetail"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noRawToolError"
        ]
      },
      {
        "id": "20260705021149-15-wrong-answer",
        "createdAt": "2026-07-05T02:11:49.039Z",
        "originalConversationId": "web-1b5e0de1-3464-446b-aefb-4d922a107718",
        "question": "Wrong answer",
        "expectedIntent": "feedback_or_correction",
        "requiredTools": [],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "trial-p1-live-1783219362945",
    "cases": [
      {
        "id": "20260705024248-1-findings-are-in-the-report-what-are-the-total-gallons-of-deborah-justice",
        "createdAt": "2026-07-05T02:42:48.510Z",
        "originalConversationId": "trial-p1-live-1783219362945",
        "question": "Findings are in the report. What are the total gallons of Deborah Justice",
        "expectedIntent": "site_blueprint_lookup",
        "requiredTools": [
          "lookupSiteJobBlueprintField"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails",
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260705024300-2-what-sources-do-you-use",
        "createdAt": "2026-07-05T02:43:00.828Z",
        "originalConversationId": "trial-p1-live-1783219362945",
        "question": "What sources do you use",
        "expectedIntent": "meta_capability",
        "requiredTools": [],
        "forbiddenTools": [],
        "assertions": [
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260705024302-3-wrong-answer-that-was-a-live-receipt-correction-and-should-be-logged",
        "createdAt": "2026-07-05T02:43:02.191Z",
        "originalConversationId": "trial-p1-live-1783219362945",
        "question": "Wrong answer, that was a live receipt correction and should be logged.",
        "expectedIntent": "feedback_or_correction",
        "requiredTools": [],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "trial-p1-live-tight-1783219444871",
    "cases": [
      {
        "id": "20260705024409-1-findings-are-in-the-report-what-are-the-total-gallons-of-deborah-justice",
        "createdAt": "2026-07-05T02:44:09.167Z",
        "originalConversationId": "trial-p1-live-tight-1783219444871",
        "question": "Findings are in the report. What are the total gallons of Deborah Justice",
        "expectedIntent": "site_blueprint_lookup",
        "requiredTools": [
          "lookupSiteJobBlueprintField"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails",
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260705024410-2-wrong-answer-that-was-a-live-receipt-correction-and-should-be-logged",
        "createdAt": "2026-07-05T02:44:10.672Z",
        "originalConversationId": "trial-p1-live-tight-1783219444871",
        "question": "Wrong answer, that was a live receipt correction and should be logged.",
        "expectedIntent": "feedback_or_correction",
        "requiredTools": [],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "trial-p1-live-meta-1783219444871",
    "cases": [
      {
        "id": "20260705024415-1-what-sources-do-you-use",
        "createdAt": "2026-07-05T02:44:15.790Z",
        "originalConversationId": "trial-p1-live-meta-1783219444871",
        "question": "What sources do you use",
        "expectedIntent": "meta_capability",
        "requiredTools": [],
        "forbiddenTools": [],
        "assertions": [
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "trial-p1d-live-1783262922683",
    "cases": [
      {
        "id": "20260705144853-1-what-were-the-pool-leak-detection-results-for-deborah-justice-in-companycam-repo",
        "createdAt": "2026-07-05T14:48:53.350Z",
        "originalConversationId": "trial-p1d-live-1783262922683",
        "question": "What were the pool leak detection results for Deborah Justice in CompanyCam report?",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      },
      {
        "id": "20260705144901-2-what-are-the-total-gallons-of-deborah-justice",
        "createdAt": "2026-07-05T14:49:01.802Z",
        "originalConversationId": "trial-p1d-live-1783262922683",
        "question": "What are the total gallons of Deborah Justice?",
        "expectedIntent": "site_blueprint_lookup",
        "requiredTools": [
          "lookupSiteJobBlueprintField"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails",
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "trial-p2e-schedule-live-1783263919853",
    "cases": [
      {
        "id": "20260705150543-1-what-s-on-monday-july-6-2026",
        "createdAt": "2026-07-05T15:05:43.830Z",
        "originalConversationId": "trial-p2e-schedule-live-1783263919853",
        "question": "What's on Monday July 6, 2026?",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      }
    ]
  },
  {
    "conversationId": "web-28f7da91-4559-48f8-bedf-4b16b1fce7c1",
    "cases": [
      {
        "id": "20260705151207-1-what-s-on-schedule-for-tomorrow",
        "createdAt": "2026-07-05T15:12:07.936Z",
        "originalConversationId": "web-28f7da91-4559-48f8-bedf-4b16b1fce7c1",
        "question": "What's on schedule for tomorrow",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      },
      {
        "id": "20260705151314-2-who-is-assigned-to-it",
        "createdAt": "2026-07-05T15:13:14.062Z",
        "originalConversationId": "web-28f7da91-4559-48f8-bedf-4b16b1fce7c1",
        "question": "Who is assigned to it",
        "expectedIntent": "general_job_fact",
        "requiredTools": [
          "getJobDetail"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noRawToolError"
        ]
      },
      {
        "id": "20260705151417-3-no-what-is-the-eta-for-the-job",
        "createdAt": "2026-07-05T15:14:17.306Z",
        "originalConversationId": "web-28f7da91-4559-48f8-bedf-4b16b1fce7c1",
        "question": "No. What is the eta for the  job",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      },
      {
        "id": "20260705151821-4-what-was-the-issue-at-camp-mikell",
        "createdAt": "2026-07-05T15:18:21.050Z",
        "originalConversationId": "web-28f7da91-4559-48f8-bedf-4b16b1fce7c1",
        "question": "What was the issue at camp mikell",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      },
      {
        "id": "20260705151859-5-what-was-the-issue-at-forrest-gerguson",
        "createdAt": "2026-07-05T15:18:59.474Z",
        "originalConversationId": "web-28f7da91-4559-48f8-bedf-4b16b1fce7c1",
        "question": "What was the issue at Forrest gerguson",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      },
      {
        "id": "20260705152536-6-ok-all-of-these-were-reasonably-correct-but-the-format-should-only-be-inclusive-",
        "createdAt": "2026-07-05T15:25:36.518Z",
        "originalConversationId": "web-28f7da91-4559-48f8-bedf-4b16b1fce7c1",
        "question": "Ok. All of these were reasonably correct.  But the format should only be inclusive of the info requested, not the whole project info..format should be easier to read.",
        "expectedIntent": "feedback_or_correction",
        "requiredTools": [],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260705152621-7-show-me-the-deborah-justice-photos",
        "createdAt": "2026-07-05T15:26:21.399Z",
        "originalConversationId": "web-28f7da91-4559-48f8-bedf-4b16b1fce7c1",
        "question": "Show me the Deborah Justice photos",
        "expectedIntent": "companycam_photo_lookup",
        "requiredTools": [
          "getPhotos"
        ],
        "forbiddenTools": [],
        "assertions": [
          "usesRequiredRails"
        ]
      },
      {
        "id": "20260705152707-8-what-is-on-schedule-for-next-week",
        "createdAt": "2026-07-05T15:27:07.156Z",
        "originalConversationId": "web-28f7da91-4559-48f8-bedf-4b16b1fce7c1",
        "question": "What is on schedule for next week",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      },
      {
        "id": "20260705152825-9-i-asked-that-and-now-you-are-wasting-api-tokens-because-you-should-already-inger",
        "createdAt": "2026-07-05T15:28:25.589Z",
        "originalConversationId": "web-28f7da91-4559-48f8-bedf-4b16b1fce7c1",
        "question": "I asked that and now you are wasting api tokens because you should already inger what I asked here,",
        "expectedIntent": "feedback_or_correction",
        "requiredTools": [],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260705152856-10-what-is-approved-but-not-scheduled-yet",
        "createdAt": "2026-07-05T15:28:56.873Z",
        "originalConversationId": "web-28f7da91-4559-48f8-bedf-4b16b1fce7c1",
        "question": "What is approved but not scheduled yet",
        "expectedIntent": "pipeline_status",
        "requiredTools": [
          "getPipeline"
        ],
        "forbiddenTools": [],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "trial-p2e-schedule-live-1783264321762",
    "cases": [
      {
        "id": "20260705151240-1-what-s-on-monday-july-6-2026",
        "createdAt": "2026-07-05T15:12:40.261Z",
        "originalConversationId": "trial-p2e-schedule-live-1783264321762",
        "question": "What's on Monday July 6, 2026?",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      }
    ]
  },
  {
    "conversationId": "trial-p2fg-issue-1783265014947",
    "cases": [
      {
        "id": "20260705152401-1-what-was-the-issue-at-deborah-justice",
        "createdAt": "2026-07-05T15:24:01.391Z",
        "originalConversationId": "trial-p2fg-issue-1783265014947",
        "question": "What was the issue at Deborah Justice?",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "trial-p2fg-technician-1783265042768",
    "cases": [
      {
        "id": "20260705152435-1-who-was-the-technician-for-deborah-justice",
        "createdAt": "2026-07-05T15:24:35.035Z",
        "originalConversationId": "trial-p2fg-technician-1783265042768",
        "question": "Who was the technician for Deborah Justice?",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "trial-p2fg-photos-1783265076425",
    "cases": [
      {
        "id": "20260705152441-1-show-me-photos-for-deborah-justice",
        "createdAt": "2026-07-05T15:24:41.023Z",
        "originalConversationId": "trial-p2fg-photos-1783265076425",
        "question": "Show me photos for Deborah Justice",
        "expectedIntent": "companycam_photo_lookup",
        "requiredTools": [
          "getPhotos"
        ],
        "forbiddenTools": [],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "trial-p2fg-issue-1783265131463",
    "cases": [
      {
        "id": "20260705152555-1-what-was-the-issue-at-deborah-justice",
        "createdAt": "2026-07-05T15:25:55.824Z",
        "originalConversationId": "trial-p2fg-issue-1783265131463",
        "question": "What was the issue at Deborah Justice?",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "trial-p2fg-technician-1783265157246",
    "cases": [
      {
        "id": "20260705152637-1-who-was-the-technician-for-deborah-justice",
        "createdAt": "2026-07-05T15:26:37.006Z",
        "originalConversationId": "trial-p2fg-technician-1783265157246",
        "question": "Who was the technician for Deborah Justice?",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "trial-p2fg-photos-1783265198068",
    "cases": [
      {
        "id": "20260705152641-1-show-me-photos-for-deborah-justice",
        "createdAt": "2026-07-05T15:26:41.641Z",
        "originalConversationId": "trial-p2fg-photos-1783265198068",
        "question": "Show me photos for Deborah Justice",
        "expectedIntent": "companycam_photo_lookup",
        "requiredTools": [
          "getPhotos"
        ],
        "forbiddenTools": [],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "trial-photo-regression-1783267087044",
    "cases": [
      {
        "id": "20260705155819-1-show-me-the-deborah-justice-photos",
        "createdAt": "2026-07-05T15:58:19.918Z",
        "originalConversationId": "trial-photo-regression-1783267087044",
        "question": "show me the Deborah Justice photos",
        "expectedIntent": "companycam_photo_lookup",
        "requiredTools": [
          "getPhotos"
        ],
        "forbiddenTools": [],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "trial-date-context-1783267087044",
    "cases": [
      {
        "id": "20260705155841-1-what-s-on-monday-july-6-2026",
        "createdAt": "2026-07-05T15:58:41.718Z",
        "originalConversationId": "trial-date-context-1783267087044",
        "question": "What's on Monday July 6, 2026?",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      },
      {
        "id": "20260705155845-2-what-s-the-eta",
        "createdAt": "2026-07-05T15:58:45.724Z",
        "originalConversationId": "trial-date-context-1783267087044",
        "question": "What's the ETA?",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      }
    ]
  },
  {
    "conversationId": "trial-photo-regression-1783267425128",
    "cases": [
      {
        "id": "20260705160350-1-show-me-the-deborah-justice-photos",
        "createdAt": "2026-07-05T16:03:50.029Z",
        "originalConversationId": "trial-photo-regression-1783267425128",
        "question": "show me the Deborah Justice photos",
        "expectedIntent": "companycam_photo_lookup",
        "requiredTools": [
          "getPhotos"
        ],
        "forbiddenTools": [],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "trial-date-context-1783267425128",
    "cases": [
      {
        "id": "20260705160410-1-what-s-on-monday-july-6-2026",
        "createdAt": "2026-07-05T16:04:10.013Z",
        "originalConversationId": "trial-date-context-1783267425128",
        "question": "What's on Monday July 6, 2026?",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      },
      {
        "id": "20260705160414-2-what-s-the-eta",
        "createdAt": "2026-07-05T16:04:14.736Z",
        "originalConversationId": "trial-date-context-1783267425128",
        "question": "What's the ETA?",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      }
    ]
  },
  {
    "conversationId": "trial-photo-regression-1783267512449",
    "cases": [
      {
        "id": "20260705160517-1-show-me-the-deborah-justice-photos",
        "createdAt": "2026-07-05T16:05:17.847Z",
        "originalConversationId": "trial-photo-regression-1783267512449",
        "question": "show me the Deborah Justice photos",
        "expectedIntent": "companycam_photo_lookup",
        "requiredTools": [
          "getPhotos"
        ],
        "forbiddenTools": [],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "trial-date-context-1783267512449",
    "cases": [
      {
        "id": "20260705160542-1-what-s-on-monday-july-6-2026",
        "createdAt": "2026-07-05T16:05:42.810Z",
        "originalConversationId": "trial-date-context-1783267512449",
        "question": "What's on Monday July 6, 2026?",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      },
      {
        "id": "20260705160553-2-what-s-the-eta",
        "createdAt": "2026-07-05T16:05:53.521Z",
        "originalConversationId": "trial-date-context-1783267512449",
        "question": "What's the ETA?",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      }
    ]
  },
  {
    "conversationId": "trial-photo-regression-1783267840003",
    "cases": [
      {
        "id": "20260705161046-1-show-me-the-deborah-justice-photos",
        "createdAt": "2026-07-05T16:10:46.130Z",
        "originalConversationId": "trial-photo-regression-1783267840003",
        "question": "show me the Deborah Justice photos",
        "expectedIntent": "companycam_photo_lookup",
        "requiredTools": [
          "getPhotos"
        ],
        "forbiddenTools": [],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "trial-date-context-1783267840003",
    "cases": [
      {
        "id": "20260705161106-1-what-s-on-monday-july-6-2026",
        "createdAt": "2026-07-05T16:11:06.914Z",
        "originalConversationId": "trial-date-context-1783267840003",
        "question": "What's on Monday July 6, 2026?",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      },
      {
        "id": "20260705161111-2-what-s-the-eta",
        "createdAt": "2026-07-05T16:11:11.049Z",
        "originalConversationId": "trial-date-context-1783267840003",
        "question": "What's the ETA?",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      }
    ]
  },
  {
    "conversationId": "receipt_m6_lite_email_1783278661068",
    "cases": [
      {
        "id": "20260705191129-1-what-emails-came-in-today",
        "createdAt": "2026-07-05T19:11:29.680Z",
        "originalConversationId": "receipt_m6_lite_email_1783278661068",
        "question": "what emails came in today",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      }
    ]
  },
  {
    "conversationId": "receipt_m6_lite_email_1783279021532",
    "cases": [
      {
        "id": "20260705191708-1-what-emails-came-in-today",
        "createdAt": "2026-07-05T19:17:08.856Z",
        "originalConversationId": "receipt_m6_lite_email_1783279021532",
        "question": "what emails came in today",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      }
    ]
  },
  {
    "conversationId": "receipt_m6_lite_email_1783279431677",
    "cases": [
      {
        "id": "20260705192403-1-what-emails-came-in-today",
        "createdAt": "2026-07-05T19:24:03.330Z",
        "originalConversationId": "receipt_m6_lite_email_1783279431677",
        "question": "what emails came in today",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      }
    ]
  },
  {
    "conversationId": "receipt_m6_lite_body_1783280070977",
    "cases": [
      {
        "id": "20260705193434-1-read-email-chris-19f3354877e85a73-and-tell-me-whether-it-has-attachments-do-not-",
        "createdAt": "2026-07-05T19:34:34.724Z",
        "originalConversationId": "receipt_m6_lite_body_1783280070977",
        "question": "read email:chris:19f3354877e85a73 and tell me whether it has attachments; do not quote or summarize the body",
        "expectedIntent": "email_search_or_read",
        "requiredTools": [
          "searchEmail"
        ],
        "forbiddenTools": [
          "draftEmail"
        ],
        "assertions": [
          "noRawToolError"
        ]
      }
    ]
  },
  {
    "conversationId": "receipt_m6_lite_body_1783280398789",
    "cases": [
      {
        "id": "20260705194001-1-read-email-chris-19f3354877e85a73-and-tell-me-whether-it-has-attachments-do-not-",
        "createdAt": "2026-07-05T19:40:01.336Z",
        "originalConversationId": "receipt_m6_lite_body_1783280398789",
        "question": "read email:chris:19f3354877e85a73 and tell me whether it has attachments; do not quote or summarize the body",
        "expectedIntent": "email_search_or_read",
        "requiredTools": [
          "searchEmail"
        ],
        "forbiddenTools": [
          "draftEmail"
        ],
        "assertions": [
          "noRawToolError"
        ]
      }
    ]
  },
  {
    "conversationId": "receipt_m6_lite_email_1783280461752",
    "cases": [
      {
        "id": "20260705194113-1-what-emails-came-in-today",
        "createdAt": "2026-07-05T19:41:13.562Z",
        "originalConversationId": "receipt_m6_lite_email_1783280461752",
        "question": "what emails came in today",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      }
    ]
  },
  {
    "conversationId": "conv_9f0b7fc7-bdd6-44d6-8bea-c4ba0c0805a9",
    "cases": [
      {
        "id": "20260705200500-1-what-needs-my-attention",
        "createdAt": "2026-07-05T20:05:00.984Z",
        "originalConversationId": "conv_9f0b7fc7-bdd6-44d6-8bea-c4ba0c0805a9",
        "question": "what needs my attention",
        "expectedIntent": "general_job_fact",
        "requiredTools": [
          "getJobDetail"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noRawToolError"
        ]
      }
    ]
  },
  {
    "conversationId": "web-7b1fe59c-e129-41ea-b20d-4234ccf7b34b",
    "cases": [
      {
        "id": "20260705202457-1-what-emails-came-in-today",
        "createdAt": "2026-07-05T20:24:57.631Z",
        "originalConversationId": "web-7b1fe59c-e129-41ea-b20d-4234ccf7b34b",
        "question": "What emails came in today",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      },
      {
        "id": "20260705202705-2-great-detail-organization-and-format-sucks",
        "createdAt": "2026-07-05T20:27:05.145Z",
        "originalConversationId": "web-7b1fe59c-e129-41ea-b20d-4234ccf7b34b",
        "question": "Great detail, organization and format sucks,",
        "expectedIntent": "feedback_or_correction",
        "requiredTools": [],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260705202722-3-what-needs-my-attention",
        "createdAt": "2026-07-05T20:27:22.262Z",
        "originalConversationId": "web-7b1fe59c-e129-41ea-b20d-4234ccf7b34b",
        "question": "What needs my attention",
        "expectedIntent": "general_job_fact",
        "requiredTools": [
          "getJobDetail"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noRawToolError"
        ]
      },
      {
        "id": "20260705202845-4-emails-pulled-but-no-information-specific-we-need-to-figure-out-how-to-roagaize-",
        "createdAt": "2026-07-05T20:28:45.075Z",
        "originalConversationId": "web-7b1fe59c-e129-41ea-b20d-4234ccf7b34b",
        "question": "Emails pulled but no information specific. We need to figure out how to roagaize these in a reasonably readable format. A client would never use this again fomatteds like this",
        "expectedIntent": "feedback_or_correction",
        "requiredTools": [],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260705202927-5-that-was-an-email-in-the-inbox",
        "createdAt": "2026-07-05T20:29:27.537Z",
        "originalConversationId": "web-7b1fe59c-e129-41ea-b20d-4234ccf7b34b",
        "question": "That was an email in the inbox",
        "expectedIntent": "email_search_or_read",
        "requiredTools": [
          "searchEmail"
        ],
        "forbiddenTools": [
          "draftEmail"
        ],
        "assertions": [
          "noRawToolError"
        ]
      },
      {
        "id": "20260705203001-6-send-me-an-email-to-chris1bata-gmail-com-bryson-city-job-is-confirmed-for-tomorr",
        "createdAt": "2026-07-05T20:30:01.072Z",
        "originalConversationId": "web-7b1fe59c-e129-41ea-b20d-4234ccf7b34b",
        "question": "Send me an email to chris1bata@gmail.com. Bryson City job is confirmed for tomorrow.",
        "expectedIntent": "email_draft_action",
        "requiredTools": [
          "draftEmail"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "draftQueued",
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "m6-lite-live-fix-1783285580070",
    "cases": [
      {
        "id": "20260705210628-1-what-did-the-semrush-site-audit-say",
        "createdAt": "2026-07-05T21:06:28.010Z",
        "originalConversationId": "m6-lite-live-fix-1783285580070",
        "question": "What did the Semrush site audit say",
        "expectedIntent": "email_search_or_read",
        "requiredTools": [
          "searchEmail"
        ],
        "forbiddenTools": [
          "draftEmail"
        ],
        "assertions": [
          "noRawToolError"
        ]
      },
      {
        "id": "20260705210631-2-send-an-email-to-nexi-aquatraceleak-com-saying-i-received-the-audit-and-will-rev",
        "createdAt": "2026-07-05T21:06:31.948Z",
        "originalConversationId": "m6-lite-live-fix-1783285580070",
        "question": "Send an email to nexi@aquatraceleak.com saying I received the audit and will review it today.",
        "expectedIntent": "email_draft_action",
        "requiredTools": [
          "draftEmail"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "draftQueued",
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260705210636-3-formatting-feedback-attention-items-must-lead-with-sender-subject-and-one-line-a",
        "createdAt": "2026-07-05T21:06:36.919Z",
        "originalConversationId": "m6-lite-live-fix-1783285580070",
        "question": "Formatting feedback: attention items must lead with sender, subject, and one-line ask, grouped by priority with minimal IDs.",
        "expectedIntent": "feedback_or_correction",
        "requiredTools": [],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260705210638-4-that-was-incorrect-this-feedback-should-be-logged-as-a-correction",
        "createdAt": "2026-07-05T21:06:38.365Z",
        "originalConversationId": "m6-lite-live-fix-1783285580070",
        "question": "That was incorrect, this feedback should be logged as a correction.",
        "expectedIntent": "feedback_or_correction",
        "requiredTools": [],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "m6-lite-live-fix-1783286037965",
    "cases": [
      {
        "id": "20260705211359-1-what-did-the-semrush-site-audit-say",
        "createdAt": "2026-07-05T21:13:59.229Z",
        "originalConversationId": "m6-lite-live-fix-1783286037965",
        "question": "What did the Semrush site audit say",
        "expectedIntent": "email_search_or_read",
        "requiredTools": [
          "searchEmail"
        ],
        "forbiddenTools": [
          "draftEmail"
        ],
        "assertions": [
          "noRawToolError"
        ]
      },
      {
        "id": "20260705211403-2-send-an-email-to-nexi-aquatraceleak-com-saying-i-received-the-audit-and-will-rev",
        "createdAt": "2026-07-05T21:14:03.812Z",
        "originalConversationId": "m6-lite-live-fix-1783286037965",
        "question": "Send an email to nexi@aquatraceleak.com saying I received the audit and will review it today.",
        "expectedIntent": "email_draft_action",
        "requiredTools": [
          "draftEmail"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "draftQueued",
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260705211407-3-formatting-feedback-attention-items-must-lead-with-sender-subject-and-one-line-a",
        "createdAt": "2026-07-05T21:14:07.953Z",
        "originalConversationId": "m6-lite-live-fix-1783286037965",
        "question": "Formatting feedback: attention items must lead with sender, subject, and one-line ask, grouped by priority with minimal IDs.",
        "expectedIntent": "feedback_or_correction",
        "requiredTools": [],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260705211409-4-that-was-incorrect-this-feedback-should-be-logged-as-a-correction",
        "createdAt": "2026-07-05T21:14:09.333Z",
        "originalConversationId": "m6-lite-live-fix-1783286037965",
        "question": "That was incorrect, this feedback should be logged as a correction.",
        "expectedIntent": "feedback_or_correction",
        "requiredTools": [],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "m4-report-extraction-1783288187771-7bca8141-13f4-4467-8915-c359233f4a0d",
    "cases": [
      {
        "id": "20260705215015-1-what-were-the-leak-detection-findings-for-valley-view-condominiums-from-the-comp",
        "createdAt": "2026-07-05T21:50:15.832Z",
        "originalConversationId": "m4-report-extraction-1783288187771-7bca8141-13f4-4467-8915-c359233f4a0d",
        "question": "What were the leak detection findings for Valley View Condominiums from the CompanyCam report?",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "m4-report-extraction-1783288217291-faf5a8eb-2000-47de-a0d1-77e282cd2be1",
    "cases": [
      {
        "id": "20260705215044-1-what-were-the-leak-detection-findings-for-l3-campus-statehouse-arena-from-the-co",
        "createdAt": "2026-07-05T21:50:44.244Z",
        "originalConversationId": "m4-report-extraction-1783288217291-faf5a8eb-2000-47de-a0d1-77e282cd2be1",
        "question": "What were the leak detection findings for L3 Campus Statehouse Arena from the CompanyCam report?",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "m4-report-extraction-1783288271732-f1a9e0a1-10d4-48c8-b7c3-f82e65007bb6",
    "cases": [
      {
        "id": "20260705215138-1-what-were-the-leak-detection-findings-for-valley-view-condominiums-from-the-comp",
        "createdAt": "2026-07-05T21:51:38.907Z",
        "originalConversationId": "m4-report-extraction-1783288271732-f1a9e0a1-10d4-48c8-b7c3-f82e65007bb6",
        "question": "What were the leak detection findings for Valley View Condominiums from the CompanyCam report?",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "m4-report-extraction-1783288300056-9e6cf1c3-aa3f-4090-a7ce-a892ad2eac93",
    "cases": [
      {
        "id": "20260705215212-1-what-were-the-leak-detection-findings-for-camp-mikell-from-the-companycam-report",
        "createdAt": "2026-07-05T21:52:12.979Z",
        "originalConversationId": "m4-report-extraction-1783288300056-9e6cf1c3-aa3f-4090-a7ce-a892ad2eac93",
        "question": "What were the leak detection findings for Camp Mikell from the CompanyCam report?",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "m4-report-extraction-1783288365900-fd27e554-f0cf-4466-875b-a7e219d7179c",
    "cases": [
      {
        "id": "20260705215312-1-what-were-the-leak-detection-findings-for-valley-view-condominiums-from-the-comp",
        "createdAt": "2026-07-05T21:53:12.578Z",
        "originalConversationId": "m4-report-extraction-1783288365900-fd27e554-f0cf-4466-875b-a7e219d7179c",
        "question": "What were the leak detection findings for Valley View Condominiums from the CompanyCam report?",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "m4-report-extraction-1783288393738-a8b63dd2-9c5f-41d8-8fba-420e9ffb3078",
    "cases": [
      {
        "id": "20260705215347-1-what-were-the-leak-detection-findings-for-camp-mikell-from-the-companycam-report",
        "createdAt": "2026-07-05T21:53:47.803Z",
        "originalConversationId": "m4-report-extraction-1783288393738-a8b63dd2-9c5f-41d8-8fba-420e9ffb3078",
        "question": "What were the leak detection findings for Camp Mikell from the CompanyCam report?",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "web-5e196eff-deab-4334-b17c-4a44dea92e59",
    "cases": [
      {
        "id": "20260705225853-1-send-me-an-email-at-chris1bata-gmail-com-tell-me-bryson-city-s-on-checdule-for-t",
        "createdAt": "2026-07-05T22:58:53.094Z",
        "originalConversationId": "web-5e196eff-deab-4334-b17c-4a44dea92e59",
        "question": "send me an email at chris1bata@gmail.com, tell me bryson city s on checdule for tomorrow",
        "expectedIntent": "email_draft_action",
        "requiredTools": [
          "draftEmail"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "draftQueued",
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260705225921-2-whats-important-from-chris-aquatraceleak-com",
        "createdAt": "2026-07-05T22:59:21.456Z",
        "originalConversationId": "web-5e196eff-deab-4334-b17c-4a44dea92e59",
        "question": "whats important from chris@aquatraceleak.com",
        "expectedIntent": "general_job_fact",
        "requiredTools": [
          "getJobDetail"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noRawToolError"
        ]
      },
      {
        "id": "20260705232426-3-what-was-the-service-ime-competion-for-deborah-justice",
        "createdAt": "2026-07-05T23:24:26.556Z",
        "originalConversationId": "web-5e196eff-deab-4334-b17c-4a44dea92e59",
        "question": "what was the service ime competion for deborah justice",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      },
      {
        "id": "20260705232454-4-yes-there-is-incorrect-here-service-comletion-is-in-company-cam-reports",
        "createdAt": "2026-07-05T23:24:54.702Z",
        "originalConversationId": "web-5e196eff-deab-4334-b17c-4a44dea92e59",
        "question": "yes there is, incorrect here, service comletion is in company cam reports",
        "expectedIntent": "feedback_or_correction",
        "requiredTools": [],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260705232530-5-ok-where-is-the-answer-then-i-corrected-you-and-you-should-have-replied-with-cor",
        "createdAt": "2026-07-05T23:25:30.373Z",
        "originalConversationId": "web-5e196eff-deab-4334-b17c-4a44dea92e59",
        "question": "ok, where is the answer then, i corrected you and you should have replied with correct answer",
        "expectedIntent": "email_search_or_read",
        "requiredTools": [
          "searchEmail"
        ],
        "forbiddenTools": [
          "draftEmail"
        ],
        "assertions": [
          "noRawToolError"
        ]
      },
      {
        "id": "20260705232559-6-using-company-cam-find-the-completion-time-for-deboarh-justice",
        "createdAt": "2026-07-05T23:25:59.324Z",
        "originalConversationId": "web-5e196eff-deab-4334-b17c-4a44dea92e59",
        "question": "using company cam find the completion time for deboarh justice",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      },
      {
        "id": "20260705232613-7-correct",
        "createdAt": "2026-07-05T23:26:13.337Z",
        "originalConversationId": "web-5e196eff-deab-4334-b17c-4a44dea92e59",
        "question": "correct",
        "expectedIntent": "general_job_fact",
        "requiredTools": [
          "getJobDetail"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noRawToolError"
        ]
      },
      {
        "id": "20260706202435-8-did-todays-pool-pay",
        "createdAt": "2026-07-06T20:24:35.401Z",
        "originalConversationId": "web-5e196eff-deab-4334-b17c-4a44dea92e59",
        "question": "did todays pool pay?",
        "expectedIntent": "payment_status_cross_rail",
        "requiredTools": [
          "getSchedule",
          "getJobDetail",
          "invoiceStatus",
          "searchEmail"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noSingleRailPaymentConclusion",
          "noJan2024"
        ]
      },
      {
        "id": "20260706202511-9-what-was-the-issue-at-todays-pool",
        "createdAt": "2026-07-06T20:25:11.450Z",
        "originalConversationId": "web-5e196eff-deab-4334-b17c-4a44dea92e59",
        "question": "what was the issue at todays pool",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "conv_990f2ef4-36f3-4ede-b430-9e61091f8ff5",
    "cases": [
      {
        "id": "20260706020754-1-send-me-an-email-at-chris1bata-gmail-com-tell-me-bryson-city-s-on-checdule-for-t",
        "createdAt": "2026-07-06T02:07:54.456Z",
        "originalConversationId": "conv_990f2ef4-36f3-4ede-b430-9e61091f8ff5",
        "question": "send me an email at chris1bata@gmail.com, tell me bryson city s on checdule for tomorrow",
        "expectedIntent": "email_draft_action",
        "requiredTools": [
          "draftEmail"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "draftQueued",
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "conv_a9863445-67f8-4986-b1b6-253f430cb326",
    "cases": [
      {
        "id": "20260706020819-1-what-was-the-service-time-completion-for-deborah-justice",
        "createdAt": "2026-07-06T02:08:19.533Z",
        "originalConversationId": "conv_a9863445-67f8-4986-b1b6-253f430cb326",
        "question": "what was the service time completion for Deborah Justice",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      },
      {
        "id": "20260706020821-2-yes-there-is-incorrect-here-service-completion-is-in-company-cam-reports",
        "createdAt": "2026-07-06T02:08:21.208Z",
        "originalConversationId": "conv_a9863445-67f8-4986-b1b6-253f430cb326",
        "question": "yes there is, incorrect here, service completion is in company cam reports",
        "expectedIntent": "feedback_or_correction",
        "requiredTools": [],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260706020857-3-ok-where-is-the-answer-then-i-corrected-you-and-you-should-have-replied-with-cor",
        "createdAt": "2026-07-06T02:08:57.037Z",
        "originalConversationId": "conv_a9863445-67f8-4986-b1b6-253f430cb326",
        "question": "ok, where is the answer then, i corrected you and you should have replied with correct answer",
        "expectedIntent": "email_search_or_read",
        "requiredTools": [
          "searchEmail"
        ],
        "forbiddenTools": [
          "draftEmail"
        ],
        "assertions": [
          "noRawToolError"
        ]
      }
    ]
  },
  {
    "conversationId": "wave2-1783308397184-b26e451f-f9ed-4c37-99a4-8082ff8b76b4",
    "cases": [
      {
        "id": "20260706032640-1-send-me-an-email-at-chris1bata-gmail-com-tell-me-bryson-city-s-on-checdule-for-t",
        "createdAt": "2026-07-06T03:26:40.929Z",
        "originalConversationId": "wave2-1783308397184-b26e451f-f9ed-4c37-99a4-8082ff8b76b4",
        "question": "send me an email at chris1bata@gmail.com, tell me bryson city s on checdule for tomorrow",
        "expectedIntent": "email_draft_action",
        "requiredTools": [
          "draftEmail"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "draftQueued",
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "wave2-1783308402361-287ee8b3-12ac-46e3-91f9-316942f816be",
    "cases": [
      {
        "id": "20260706032703-1-what-was-the-service-ime-competion-for-deborah-justice",
        "createdAt": "2026-07-06T03:27:03.163Z",
        "originalConversationId": "wave2-1783308402361-287ee8b3-12ac-46e3-91f9-316942f816be",
        "question": "what was the service ime competion for deborah justice",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "wave2-correction-1783308424665-dcb59e30-8ff7-4886-8852-cee3a4a62c60",
    "cases": [
      {
        "id": "20260706032704-1-yes-there-is-incorrect-here-service-comletion-is-in-company-cam-reports",
        "createdAt": "2026-07-06T03:27:04.800Z",
        "originalConversationId": "wave2-correction-1783308424665-dcb59e30-8ff7-4886-8852-cee3a4a62c60",
        "question": "yes there is, incorrect here, service comletion is in company cam reports",
        "expectedIntent": "feedback_or_correction",
        "requiredTools": [],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260706032743-2-ok-where-is-the-answer-then-i-corrected-you-and-you-should-have-replied-with-cor",
        "createdAt": "2026-07-06T03:27:43.254Z",
        "originalConversationId": "wave2-correction-1783308424665-dcb59e30-8ff7-4886-8852-cee3a4a62c60",
        "question": "ok, where is the answer then, i corrected you and you should have replied with correct answer",
        "expectedIntent": "email_search_or_read",
        "requiredTools": [
          "searchEmail"
        ],
        "forbiddenTools": [
          "draftEmail"
        ],
        "assertions": [
          "noRawToolError"
        ]
      }
    ]
  },
  {
    "conversationId": "wave2-1783308507724-e9cd2408-9016-494d-8427-3866554fda20",
    "cases": [
      {
        "id": "20260706032832-1-send-me-an-email-at-chris1bata-gmail-com-tell-me-bryson-city-s-on-checdule-for-t",
        "createdAt": "2026-07-06T03:28:32.188Z",
        "originalConversationId": "wave2-1783308507724-e9cd2408-9016-494d-8427-3866554fda20",
        "question": "send me an email at chris1bata@gmail.com, tell me bryson city s on checdule for tomorrow",
        "expectedIntent": "email_draft_action",
        "requiredTools": [
          "draftEmail"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "draftQueued",
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "wave2-1783308513684-e018ae16-7184-4ffe-9dd9-bd9019e3ff2f",
    "cases": [
      {
        "id": "20260706032900-1-what-was-the-service-ime-competion-for-deborah-justice",
        "createdAt": "2026-07-06T03:29:00.723Z",
        "originalConversationId": "wave2-1783308513684-e018ae16-7184-4ffe-9dd9-bd9019e3ff2f",
        "question": "what was the service ime competion for deborah justice",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "wave2-correction-1783308541875-f299d636-af1b-4b27-afd9-6bf3a029cb73",
    "cases": [
      {
        "id": "20260706032902-1-yes-there-is-incorrect-here-service-comletion-is-in-company-cam-reports",
        "createdAt": "2026-07-06T03:29:02.061Z",
        "originalConversationId": "wave2-correction-1783308541875-f299d636-af1b-4b27-afd9-6bf3a029cb73",
        "question": "yes there is, incorrect here, service comletion is in company cam reports",
        "expectedIntent": "feedback_or_correction",
        "requiredTools": [],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260706032939-2-ok-where-is-the-answer-then-i-corrected-you-and-you-should-have-replied-with-cor",
        "createdAt": "2026-07-06T03:29:39.252Z",
        "originalConversationId": "wave2-correction-1783308541875-f299d636-af1b-4b27-afd9-6bf3a029cb73",
        "question": "ok, where is the answer then, i corrected you and you should have replied with correct answer",
        "expectedIntent": "email_search_or_read",
        "requiredTools": [
          "searchEmail"
        ],
        "forbiddenTools": [
          "draftEmail"
        ],
        "assertions": [
          "noRawToolError"
        ]
      }
    ]
  },
  {
    "conversationId": "wave2-1783308984567-1956cb7f-fbec-4c63-ab17-ff3dadfa24b0",
    "cases": [
      {
        "id": "20260706033628-1-send-me-an-email-at-chris1bata-gmail-com-tell-me-bryson-city-s-on-checdule-for-t",
        "createdAt": "2026-07-06T03:36:28.514Z",
        "originalConversationId": "wave2-1783308984567-1956cb7f-fbec-4c63-ab17-ff3dadfa24b0",
        "question": "send me an email at chris1bata@gmail.com, tell me bryson city s on checdule for tomorrow",
        "expectedIntent": "email_draft_action",
        "requiredTools": [
          "draftEmail"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "draftQueued",
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "wave2-1783308989956-bbffa785-5b9c-4efc-a660-dffff48f62f9",
    "cases": [
      {
        "id": "20260706033653-1-what-was-the-service-ime-competion-for-deborah-justice",
        "createdAt": "2026-07-06T03:36:53.765Z",
        "originalConversationId": "wave2-1783308989956-bbffa785-5b9c-4efc-a660-dffff48f62f9",
        "question": "what was the service ime competion for deborah justice",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "wave2-correction-1783309015143-2890e6d9-007c-4004-baef-0455d9ad6512",
    "cases": [
      {
        "id": "20260706033655-1-yes-there-is-incorrect-here-service-comletion-is-in-company-cam-reports",
        "createdAt": "2026-07-06T03:36:55.203Z",
        "originalConversationId": "wave2-correction-1783309015143-2890e6d9-007c-4004-baef-0455d9ad6512",
        "question": "yes there is, incorrect here, service comletion is in company cam reports",
        "expectedIntent": "feedback_or_correction",
        "requiredTools": [],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260706033729-2-ok-where-is-the-answer-then-i-corrected-you-and-you-should-have-replied-with-cor",
        "createdAt": "2026-07-06T03:37:29.226Z",
        "originalConversationId": "wave2-correction-1783309015143-2890e6d9-007c-4004-baef-0455d9ad6512",
        "question": "ok, where is the answer then, i corrected you and you should have replied with correct answer",
        "expectedIntent": "email_search_or_read",
        "requiredTools": [
          "searchEmail"
        ],
        "forbiddenTools": [
          "draftEmail"
        ],
        "assertions": [
          "noRawToolError"
        ]
      }
    ]
  },
  {
    "conversationId": "wave2-1783309135614-a2d7f3c9-4026-49d3-82ec-b3d16843cef0",
    "cases": [
      {
        "id": "20260706033859-1-send-me-an-email-at-chris1bata-gmail-com-tell-me-bryson-city-s-on-checdule-for-t",
        "createdAt": "2026-07-06T03:38:59.688Z",
        "originalConversationId": "wave2-1783309135614-a2d7f3c9-4026-49d3-82ec-b3d16843cef0",
        "question": "send me an email at chris1bata@gmail.com, tell me bryson city s on checdule for tomorrow",
        "expectedIntent": "email_draft_action",
        "requiredTools": [
          "draftEmail"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "draftQueued",
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "wave2-1783309141226-d6189635-464d-4f4a-88f7-10b545c04b69",
    "cases": [
      {
        "id": "20260706033924-1-what-was-the-service-ime-competion-for-deborah-justice",
        "createdAt": "2026-07-06T03:39:24.866Z",
        "originalConversationId": "wave2-1783309141226-d6189635-464d-4f4a-88f7-10b545c04b69",
        "question": "what was the service ime competion for deborah justice",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      }
    ]
  },
  {
    "conversationId": "wave2-correction-1783309166056-7ec4283c-c80f-4b8d-a151-da9d01e7205c",
    "cases": [
      {
        "id": "20260706033926-1-yes-there-is-incorrect-here-service-comletion-is-in-company-cam-reports",
        "createdAt": "2026-07-06T03:39:26.247Z",
        "originalConversationId": "wave2-correction-1783309166056-7ec4283c-c80f-4b8d-a151-da9d01e7205c",
        "question": "yes there is, incorrect here, service comletion is in company cam reports",
        "expectedIntent": "feedback_or_correction",
        "requiredTools": [],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260706034005-2-ok-where-is-the-answer-then-i-corrected-you-and-you-should-have-replied-with-cor",
        "createdAt": "2026-07-06T03:40:05.014Z",
        "originalConversationId": "wave2-correction-1783309166056-7ec4283c-c80f-4b8d-a151-da9d01e7205c",
        "question": "ok, where is the answer then, i corrected you and you should have replied with correct answer",
        "expectedIntent": "email_search_or_read",
        "requiredTools": [
          "searchEmail"
        ],
        "forbiddenTools": [
          "draftEmail"
        ],
        "assertions": [
          "noRawToolError"
        ]
      }
    ]
  },
  {
    "conversationId": "web-3e22bec7-ef7c-4827-94b3-dcb5115277df",
    "cases": [
      {
        "id": "20260706121714-1-did-i-send-the-report-more-medallion-pool-company-last-week",
        "createdAt": "2026-07-06T12:17:14.782Z",
        "originalConversationId": "web-3e22bec7-ef7c-4827-94b3-dcb5115277df",
        "question": "Did I send the report more medallion Pool company last week?",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      },
      {
        "id": "20260706121750-2-there-is-a-report-for-medallion-pool-company-last-week-in-company-camp-but-i-nee",
        "createdAt": "2026-07-06T12:17:50.545Z",
        "originalConversationId": "web-3e22bec7-ef7c-4827-94b3-dcb5115277df",
        "question": "There is a report for medallion Pool company last week in company camp. But I need you to check the aqua Trace leak in Gmail mail box for it",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      },
      {
        "id": "20260706121819-3-you-need-to-infer-what-i-mean-regardless-of-typos-the-report-should-be-sitting-i",
        "createdAt": "2026-07-06T12:18:19.313Z",
        "originalConversationId": "web-3e22bec7-ef7c-4827-94b3-dcb5115277df",
        "question": "You need to infer what I mean. Regardless of typos. The report should be sitting in one of the email boxes as sent and I also copy ourselves on those so we should also have a receipt in the mail",
        "expectedIntent": "payment_status_cross_rail",
        "requiredTools": [
          "getSchedule",
          "getJobDetail",
          "invoiceStatus",
          "searchEmail"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noSingleRailPaymentConclusion",
          "noJan2024"
        ]
      },
      {
        "id": "20260706121846-4-check-email-for-a-report-sent-to-medallion-pool-company-last-week",
        "createdAt": "2026-07-06T12:18:46.422Z",
        "originalConversationId": "web-3e22bec7-ef7c-4827-94b3-dcb5115277df",
        "question": "Check email for a report sent to medallion Pool company last week",
        "expectedIntent": "job_detail_cross_rail",
        "requiredTools": [
          "getJobDetail",
          "getDocuments"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails"
        ]
      },
      {
        "id": "20260706121905-5-aquatraceleak-gmail-com",
        "createdAt": "2026-07-06T12:19:05.002Z",
        "originalConversationId": "web-3e22bec7-ef7c-4827-94b3-dcb5115277df",
        "question": "aquatraceleak@gmail.com",
        "expectedIntent": "general_job_fact",
        "requiredTools": [
          "getJobDetail"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noRawToolError"
        ]
      },
      {
        "id": "20260706122032-6-do-you-see-any-emails-for-medallion-pool-company",
        "createdAt": "2026-07-06T12:20:32.005Z",
        "originalConversationId": "web-3e22bec7-ef7c-4827-94b3-dcb5115277df",
        "question": "Do you see any emails for medallion Pool company?",
        "expectedIntent": "email_search_or_read",
        "requiredTools": [
          "searchEmail"
        ],
        "forbiddenTools": [
          "draftEmail"
        ],
        "assertions": [
          "noRawToolError"
        ]
      },
      {
        "id": "20260706122140-7-check-the-email-inbox-and-see-if-they-were-four-was-sent-to-oleta-falls-communit",
        "createdAt": "2026-07-06T12:21:40.740Z",
        "originalConversationId": "web-3e22bec7-ef7c-4827-94b3-dcb5115277df",
        "question": "Check the email inbox and see if they were four was sent to Oleta Falls Community",
        "expectedIntent": "email_search_or_read",
        "requiredTools": [
          "searchEmail"
        ],
        "forbiddenTools": [
          "draftEmail"
        ],
        "assertions": [
          "noRawToolError"
        ]
      },
      {
        "id": "20260706122253-8-what-s-on-schedule-for-today",
        "createdAt": "2026-07-06T12:22:53.363Z",
        "originalConversationId": "web-3e22bec7-ef7c-4827-94b3-dcb5115277df",
        "question": "What's on schedule for today?",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      },
      {
        "id": "20260706122545-9-what-s-on-schedule-for-today",
        "createdAt": "2026-07-06T12:25:45.151Z",
        "originalConversationId": "web-3e22bec7-ef7c-4827-94b3-dcb5115277df",
        "question": "What's on schedule for today?",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      },
      {
        "id": "20260706122834-10-show-me-pictures-from-deborah-justice",
        "createdAt": "2026-07-06T12:28:34.383Z",
        "originalConversationId": "web-3e22bec7-ef7c-4827-94b3-dcb5115277df",
        "question": "Show me pictures from Deborah Justice",
        "expectedIntent": "companycam_photo_lookup",
        "requiredTools": [
          "getPhotos"
        ],
        "forbiddenTools": [],
        "assertions": [
          "usesRequiredRails"
        ]
      },
      {
        "id": "20260706122902-11-deborah-justice-is-in-company-cam-and-you-have-shown-me-the-pictures-before",
        "createdAt": "2026-07-06T12:29:02.029Z",
        "originalConversationId": "web-3e22bec7-ef7c-4827-94b3-dcb5115277df",
        "question": "Deborah Justice is in company cam and you have shown me the pictures before",
        "expectedIntent": "companycam_photo_lookup",
        "requiredTools": [
          "getPhotos"
        ],
        "forbiddenTools": [],
        "assertions": [
          "usesRequiredRails"
        ]
      },
      {
        "id": "20260706122934-12-what-is-the-square-footage-of-the-deborah-justice-pool-and-how-many-gallons-per-",
        "createdAt": "2026-07-06T12:29:34.183Z",
        "originalConversationId": "web-3e22bec7-ef7c-4827-94b3-dcb5115277df",
        "question": "What is the square footage of the Deborah Justice pool and how many gallons per inch?",
        "expectedIntent": "report_measurement_lookup",
        "requiredTools": [
          "getDocuments",
          "lookupSiteJobBlueprintField"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails",
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260706123034-13-gallons-per-inch-and-square-footage-are-both-available-in-the-same-report-in-the",
        "createdAt": "2026-07-06T12:30:34.313Z",
        "originalConversationId": "web-3e22bec7-ef7c-4827-94b3-dcb5115277df",
        "question": "Gallons per inch and square footage are both available in the same report in the same section of the total gallons and square footage is also available on a separate document in the same area of company cam for the mosier measurement document",
        "expectedIntent": "report_measurement_lookup",
        "requiredTools": [
          "getDocuments",
          "lookupSiteJobBlueprintField"
        ],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "usesRequiredRails",
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260706123058-14-deborah-justice",
        "createdAt": "2026-07-06T12:30:58.375Z",
        "originalConversationId": "web-3e22bec7-ef7c-4827-94b3-dcb5115277df",
        "question": "Deborah Justice",
        "expectedIntent": "general_job_fact",
        "requiredTools": [
          "getJobDetail"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noRawToolError"
        ]
      },
      {
        "id": "20260706123130-15-how-many-miles-are-we-away-from-today-s-pool",
        "createdAt": "2026-07-06T12:31:30.012Z",
        "originalConversationId": "web-3e22bec7-ef7c-4827-94b3-dcb5115277df",
        "question": "How many miles are we away from today's pool?",
        "expectedIntent": "capability_gap_distance_or_maps",
        "requiredTools": [],
        "forbiddenTools": [
          "getJobDetail",
          "searchEmail"
        ],
        "assertions": [
          "capabilityGap",
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260706123148-16-open-denver-justice-pool-address-in-google-maps",
        "createdAt": "2026-07-06T12:31:48.481Z",
        "originalConversationId": "web-3e22bec7-ef7c-4827-94b3-dcb5115277df",
        "question": "Open Denver Justice pool address in Google maps",
        "expectedIntent": "capability_gap_distance_or_maps",
        "requiredTools": [],
        "forbiddenTools": [
          "getJobDetail",
          "searchEmail"
        ],
        "assertions": [
          "capabilityGap",
          "noNoSourceStonewall"
        ]
      }
    ]
  },
  {
    "conversationId": "web-7e2524c5-9aca-4df2-936c-bdee3f70702b",
    "cases": [
      {
        "id": "20260706202634-1-did-todays-pool-pay",
        "createdAt": "2026-07-06T20:26:34.266Z",
        "originalConversationId": "web-7e2524c5-9aca-4df2-936c-bdee3f70702b",
        "question": "did todays pool pay",
        "expectedIntent": "payment_status_cross_rail",
        "requiredTools": [
          "getSchedule",
          "getJobDetail",
          "invoiceStatus",
          "searchEmail"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noSingleRailPaymentConclusion",
          "noJan2024"
        ]
      },
      {
        "id": "20260706202756-2-what-ssues-were-found-on-rachel-paynes-pool",
        "createdAt": "2026-07-06T20:27:56.420Z",
        "originalConversationId": "web-7e2524c5-9aca-4df2-936c-bdee3f70702b",
        "question": "what ssues were found on rachel paynes pool",
        "expectedIntent": "general_job_fact",
        "requiredTools": [
          "getJobDetail"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noRawToolError"
        ]
      },
      {
        "id": "20260706202830-3-did-she-pay",
        "createdAt": "2026-07-06T20:28:30.328Z",
        "originalConversationId": "web-7e2524c5-9aca-4df2-936c-bdee3f70702b",
        "question": "did she pay",
        "expectedIntent": "payment_status_cross_rail",
        "requiredTools": [
          "getSchedule",
          "getJobDetail",
          "invoiceStatus",
          "searchEmail"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noSingleRailPaymentConclusion",
          "noJan2024"
        ]
      },
      {
        "id": "20260706202858-4-incorrect-it-is-paid-in-jobber-and-also-email-receipt-was-sent-and-zero-blaanc-e",
        "createdAt": "2026-07-06T20:28:58.838Z",
        "originalConversationId": "web-7e2524c5-9aca-4df2-936c-bdee3f70702b",
        "question": "incorrect. it is paid in jobber and also email receipt was sent and zero blaanc einvoce sent, bth viweable in email",
        "expectedIntent": "feedback_or_correction",
        "requiredTools": [],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260706202922-5-what-time-is-tomorrows-pool",
        "createdAt": "2026-07-06T20:29:22.643Z",
        "originalConversationId": "web-7e2524c5-9aca-4df2-936c-bdee3f70702b",
        "question": "what time is tomorrows pool",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      },
      {
        "id": "20260706202946-6-explain-this-date-you-randonly-pulled-from-your-ass",
        "createdAt": "2026-07-06T20:29:46.828Z",
        "originalConversationId": "web-7e2524c5-9aca-4df2-936c-bdee3f70702b",
        "question": "explain this date you randonly pulled from your ass",
        "expectedIntent": "feedback_or_correction",
        "requiredTools": [],
        "forbiddenTools": [
          "searchEmail"
        ],
        "assertions": [
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260706203000-7-when-is-forrest-ferguson-scheduled",
        "createdAt": "2026-07-06T20:30:00.768Z",
        "originalConversationId": "web-7e2524c5-9aca-4df2-936c-bdee3f70702b",
        "question": "when is forrest ferguson scheduled",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      },
      {
        "id": "20260706203043-8-his-job-is-on-schedule-for-tomorrow-in-jobber-he-also-has-pror-work-alst-year",
        "createdAt": "2026-07-06T20:30:43.344Z",
        "originalConversationId": "web-7e2524c5-9aca-4df2-936c-bdee3f70702b",
        "question": "his job is on schedule for tomorrow. in jobber. he also has pror work alst year",
        "expectedIntent": "schedule_lookup",
        "requiredTools": [
          "getSchedule"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noJan2024"
        ]
      },
      {
        "id": "20260706203049-9-how-far-is-deborah-justice-from-here",
        "createdAt": "2026-07-06T20:30:49.540Z",
        "originalConversationId": "web-7e2524c5-9aca-4df2-936c-bdee3f70702b",
        "question": "how far is deborah justice from here",
        "expectedIntent": "capability_gap_distance_or_maps",
        "requiredTools": [],
        "forbiddenTools": [
          "getJobDetail",
          "searchEmail"
        ],
        "assertions": [
          "capabilityGap",
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260706203112-10-what-is-forrest-fergusons-address",
        "createdAt": "2026-07-06T20:31:12.188Z",
        "originalConversationId": "web-7e2524c5-9aca-4df2-936c-bdee3f70702b",
        "question": "what is forrest fergusons address",
        "expectedIntent": "general_job_fact",
        "requiredTools": [
          "getJobDetail"
        ],
        "forbiddenTools": [],
        "assertions": [
          "noRawToolError"
        ]
      },
      {
        "id": "20260706203121-11-open-it-in-google-maps",
        "createdAt": "2026-07-06T20:31:21.686Z",
        "originalConversationId": "web-7e2524c5-9aca-4df2-936c-bdee3f70702b",
        "question": "open it in google maps",
        "expectedIntent": "capability_gap_distance_or_maps",
        "requiredTools": [],
        "forbiddenTools": [
          "getJobDetail",
          "searchEmail"
        ],
        "assertions": [
          "capabilityGap",
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260706203133-12-how-far-is-it-from-my-house",
        "createdAt": "2026-07-06T20:31:33.417Z",
        "originalConversationId": "web-7e2524c5-9aca-4df2-936c-bdee3f70702b",
        "question": "how far is it from my house",
        "expectedIntent": "capability_gap_distance_or_maps",
        "requiredTools": [],
        "forbiddenTools": [
          "getJobDetail",
          "searchEmail"
        ],
        "assertions": [
          "capabilityGap",
          "noNoSourceStonewall"
        ]
      },
      {
        "id": "20260706203144-13-102-kate-lane-fair-play-sc",
        "createdAt": "2026-07-06T20:31:44.890Z",
        "originalConversationId": "web-7e2524c5-9aca-4df2-936c-bdee3f70702b",
        "question": "102 kate lane fair play sc",
        "expectedIntent": "capability_gap_distance_or_maps",
        "requiredTools": [],
        "forbiddenTools": [
          "getJobDetail",
          "searchEmail"
        ],
        "assertions": [
          "capabilityGap",
          "noNoSourceStonewall"
        ]
      }
    ]
  }
];
