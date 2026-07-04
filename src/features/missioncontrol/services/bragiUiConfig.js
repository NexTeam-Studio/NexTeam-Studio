export const BRAGI_UI_CONFIG = {
  brandName: "Aquatrace",
  audiences: [
    "Pool Owner",
    "Hotel Manager",
    "HOA Manager",
    "Property Manager",
    "General Public",
  ],
  tones: ["Professional", "Friendly", "Urgent", "Educational"],
  labels: {
    articleTopic: "What is this article about?",
    audience: "Who is this article for?",
    tone: "What tone should this article use?",
    keywords: "SEO keywords to include (optional)",
    publishDate: "When should this publish?",
    callToAction: "What should readers do after reading?",
    primaryAction: "Generate Article Draft",
    approveAction: "Approve & Schedule",
    editAction: "Edit Draft",
  },
  placeholders: {
    articleTopic: "What is the VGB Act and why does your pool need to comply?",
    keywords: "VGB Act, pool safety, drain covers",
    callToAction: "Contact Aquatrace for a free consultation",
  },
  setup: {
    configFields: [
      "brandName",
      "audiences",
      "tones",
      "labels",
      "placeholders",
      "defaultCallToAction",
      "defaultPublishOffsetDays",
    ],
    estimatedSetupTime: "10 minutes",
  },
  defaultCallToAction: "Contact Aquatrace for a free consultation",
  defaultPublishOffsetDays: 7,
};

export function getDefaultPublishDate(offsetDays = 7) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function buildBragiDraft({ articleTopic, targetAudience, tone, keywords, publishDate, callToAction }) {
  const keywordLine = keywords.length ? `SEO keywords: ${keywords.join(", ")}` : "SEO keywords: not provided";
  return `Title: ${articleTopic}\n\nAudience: ${targetAudience}\nTone: ${tone}\nPublish date: ${publishDate}\n${keywordLine}\nCall to action: ${callToAction}\n\nDraft opening:\n${articleTopic} matters because readers need a clear, plain-language explanation they can trust. This draft is written for ${targetAudience.toLowerCase()} readers in a ${tone.toLowerCase()} tone, with a clear next step at the end.\n\nMain points:\n1. Explain the problem in plain language.\n2. Show why it matters now.\n3. Give readers a simple next step.\n\nClosing CTA:\n${callToAction}`;
}
