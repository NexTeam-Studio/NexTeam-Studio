const response = await fetch("http://127.0.0.1:3001/api/bragi/notify-email", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    articlePackage: {
      title: "Why a Pool Leak That Seems to Stop Is Still a Problem",
      summary: "Aquatrace explains why an intermittent leak still needs professional inspection.",
      excerpt: "A leak that seems to stop can still be active.",
      targetWordCount: "1,400-1,600 words",
      author: "Chris Sears",
      category: "Swimming Pool Leak Detection",
      whyTopicChosen: "High-intent homeowner search tied directly to Aquatrace leak-detection authority.",
      yoast: {
        focusKeyphrase: "pool leak seems to stop",
        seoTitle: "Pool Leak Seems to Stop? Why It Still Matters | Aquatrace",
        metaDescription: "Aquatrace explains why a pool leak that seems to stop can still be active and why a proper inspection still matters.",
        socialTitle: "Pool Leak Seems to Stop? It Still Needs Attention",
        socialDescription: "Aquatrace explains why an intermittent leak still needs professional leak detection.",
        suggestedExcerpt: "A pool leak that seems to stop can still be active and still worth inspecting.",
      },
      internalLinksApplied: [
        {
          title: "Aquatrace leak detection service",
          anchorText: "professional pool leak detection",
          url: "https://aquatraceleak.com/",
          reason: "Primary service page for the article CTA.",
        },
      ],
      internalLinksRecommended: [
        {
          title: "Aquatrace contact page",
          anchorText: "schedule a leak inspection",
          url: "https://aquatraceleak.com/contact/",
          reason: "Direct conversion path after the article.",
        },
      ],
      backlinkOpportunities: [
        {
          title: "Bucket test explainer",
          anchorText: "bucket test",
          reason: "Strong internal backlink from top-of-funnel content.",
        },
      ],
      externalLinksRecommended: [
        {
          sourceName: "Human-reviewed evaporation reference",
          url: "",
          reason: "Leave empty until a human approves the source.",
        },
      ],
      imageRecommendations: [
        {
          label: "Featured Image",
          photoType: "Technician pressure testing pool plumbing at the equipment pad",
          placement: "Top of article",
          filename: "aquatrace-pool-plumbing-pressure-test.jpg",
          title: "Aquatrace Technician Pressure Testing Pool Plumbing",
          altText: "Aquatrace technician pressure testing swimming pool plumbing to locate a leak",
          caption: "Pressure testing helps isolate hidden plumbing leaks.",
          description: "Aquatrace technician pressure testing pool plumbing during leak detection.",
        },
        {
          label: "Photo 1",
          photoType: "Bucket test setup beside a residential pool",
          placement: "Evaporation versus leak section",
          filename: "bucket-test-evaporation-vs-leak.jpg",
          title: "Bucket Test for Pool Water Loss",
          altText: "Bucket test setup used to compare evaporation and pool water loss",
          caption: "The bucket test helps separate evaporation from a likely leak.",
          description: "Bucket test setup beside a pool for comparing water-loss rates.",
        },
        {
          label: "Photo 2",
          photoType: "Technician dye testing around a skimmer throat",
          placement: "Skimmer leak section",
          filename: "skimmer-dye-test-leak-detection.jpg",
          title: "Dye Test Around Pool Skimmer",
          altText: "Aquatrace technician dye testing a pool skimmer for a leak",
          caption: "Dye testing can reveal movement into a leak path.",
          description: "Aquatrace technician performing a dye test around the skimmer throat.",
        },
        {
          label: "Photo 3",
          photoType: "Underwater inspection at a pool light niche",
          placement: "Light niche section",
          filename: "pool-light-niche-underwater-inspection.jpg",
          title: "Underwater Pool Light Niche Inspection",
          altText: "Underwater inspection of a pool light niche during leak detection",
          caption: "Light niches are a common place to investigate when water loss is persistent.",
          description: "Underwater inspection focused on the pool light niche during leak testing.",
        },
      ],
    },
    draftResult: {
      postId: 3307,
      draftUrl: "https://aquatraceleak.com/?p=3307",
      wordpress: { status: "draft" },
    },
  }),
});

console.log(await response.text());
