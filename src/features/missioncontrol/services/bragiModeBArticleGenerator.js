import { validateBragiModeBArticle } from "./bragiModeBGuardrails.js";
import { resolveBragiArticleModel } from "../../../lib/anthropicModels.js";
import { callAnthropicMessages } from "../../../server/anthropicClient.js";

function getBrandName(config) {
  return String(config?.displayName || config?.brandName || config?.profile?.brandName || "the client").trim();
}

function parseJsonBlock(raw) {
  const fenced = String(raw || "").match(/```json\s*([\s\S]*?)```/i);
  return JSON.parse((fenced ? fenced[1] : raw).trim());
}

function summarizeLinks(linkPlan) {
  return [
    "Internal links you may use:",
    ...linkPlan.internalLinks.map((link) => `- ${link.url} | ${link.purpose} | anchors: ${link.anchors.join(", ")}`),
    ...(linkPlan.externalLinks.length
      ? ["External links allowed only if directly relevant:", ...linkPlan.externalLinks.map((link) => `- ${link.url} | ${link.label}`)]
      : []),
  ].join("\n");
}

function pickBlueprint({ topic, location, topicProfile }) {
  const blueprints = [
    {
      name: "money-first",
      opening: "Open with the financial sting or frustration of unexplained water loss.",
      structure: "Move from money-loss tension into diagnosis, then into practical field examples and next-step clarity.",
    },
    {
      name: "field-story",
      opening: "Open with a short, believable field-style scenario or homeowner moment.",
      structure: "Use a narrative flow first, then pivot into how the brand sorts the problem out.",
    },
    {
      name: "myth-buster",
      opening: "Open by pushing back on a common bad assumption.",
      structure: "Debunk the easy wrong answer, then explain what a real diagnostic path looks like.",
    },
    {
      name: "checklist",
      opening: "Open with symptom recognition and a calm checklist feel.",
      structure: "Move through what pool owners notice, what matters, and where the brand steps in.",
    },
    {
      name: "plainspoken-education",
      opening: "Open with a plain-spoken teaching angle rather than a dramatic hook.",
      structure: "Use an educational rhythm with practical examples and one sharper hook later in the article.",
    },
  ];

  const seed = `${topicProfile?.key || ""}|${location?.display || ""}|${topic || ""}`;
  const hash = [...seed].reduce((total, char) => total + char.charCodeAt(0), 0);
  return blueprints[hash % blueprints.length];
}

function pickWordRange(topicProfile, blueprint) {
  if (topicProfile?.key === "commercial-vgb") {
    return "900-1200 words";
  }
  if (topicProfile?.key === "evaporation") {
    return blueprint?.name === "checklist" ? "700-900 words" : "800-1050 words";
  }
  return blueprint?.name === "field-story" ? "850-1100 words" : "750-1000 words";
}

function buildReadabilityTargets() {
  return [
    "Vary sentence openings. Do not start 3 consecutive sentences with the same word.",
    "Keep passive voice low. Aim under 10% of sentences.",
    "Keep long sentences under control. Aim for fewer than 25% of sentences over 20 words.",
    "Aim for a Flesch reading ease of about 60 or higher by using short, clear sentences and simple words.",
    "Prefer short paragraphs, concrete nouns, and direct verbs.",
  ].join("\n- ");
}

function buildPrompt({ topic, location, config, linkPlan, topicProfile, retryNotes = "" }) {
  const blueprint = pickBlueprint({ topic, location, topicProfile });
  const targetWordRange = pickWordRange(topicProfile, blueprint);
  const brandName = getBrandName(config);
  return `You are Bragi, the ${brandName} Mode B article brain.

Write one long-form WordPress article draft for ${brandName}.

Target input:
- Topic: ${topic}
- Location: ${location.display}
- Region cues: ${location.regionTerms.join(", ")}
- Topic intent: ${topicProfile.intent}
- Focus keyword hint: ${topicProfile.focusKeywordHint}
- Article blueprint: ${blueprint.name}
- Opening direction: ${blueprint.opening}
- Structure direction: ${blueprint.structure}
- Target length: ${targetWordRange}

Voice rules:
- ${config.brandVoice.join("\n- ")}
- Sound like a real ${brandName} operator talking to a worried pool owner, not a generic content template.
- Vary the article shape so it does not read like the same city-swapped skeleton every time.
- Warmth matters. Use field-aware human language, not flat filler.
- Write from the reader's question outward, not from the keyword inward.
- Sound like Chris or ${brandName} explaining what actually happens in the field to a neighbor.
- Plain language wins. Specificity wins. Sell naturally by showing why the problem matters.
- Stay diagnostic-not-repair in tone. ${brandName} is the calm specialist who finds the real problem before repair money goes in the wrong direction.

Location and keyphrase rules:
- Reference the location naturally and sparingly for real context. Use it like a local human would, not like a template.
- Avoid robotic exact-match phrasing like "[City] pool leak detection" repeated across headings and body copy.
- If the exact focus keyphrase sounds stiff in a heading, use a more natural heading and work the exact phrase somewhere else that reads cleanly.
- Use coastal, regional, weather, property-type, or service-area context when it helps the reader, but do not force it into every section.
- Never force the exact focus keyphrase into more than one H2 or H3. Natural language matters more than mechanical repetition.

Hard guardrails:
- No phone numbers anywhere in the article body, excerpt, or metadata.
- ${brandName} is diagnostics-first. Do not present ${brandName} as the repair crew.
- No guaranteed-results or overpromise language.
- If VGB or drain-cover topics appear, clearly state that the expiration detail is on the underside and confirmable only through underwater documentation or underwater photo evidence.
- Keep wording plain, human, and useful. No filler.
- Use real HTML for WordPress: one H1, strong H2 structure, optional H3s, paragraphs, and lists where useful.
- Add 3 to 5 internal links naturally with absolute URLs from the approved link list.
- Include exactly one approved external authoritative link when one is available.

SEO rules:
- Choose a focus keyword that matches the search intent and can still sound human in the article.
- Put the exact focus keyword naturally in the first paragraph.
- Use the exact focus keyword naturally at least 2 times in the article body, but do not stuff it.
- Put the exact focus keyword naturally in at least one H2 or H3.
- Write a click-worthy SEO title that stays under the Yoast pixel limit. Prefer about 45 to 58 characters and avoid wide, bloated wording.
- Put the exact focus keyword in the meta description.
- Write a social title and social description that are ready for Yoast's Social tab.
- Make the social title and social description distinct enough to feel written for sharing, not copied blindly from the SEO fields.
- Keep the excerpt under 200 characters.
- Make the CTA point to ${brandName} without using a phone number.
- Add one section order or angle that feels meaningfully different from the last generic "is it evaporation or a leak" structure unless the topic absolutely demands it.
- The article must contain at least one authoritative outbound link from the approved list.
- The featured image is also the social share image, so write image metadata that works for both SEO and social sharing.
- The image alt text must include the focus keyword naturally while still describing what the image actually shows.
- Every imageMeta field must be non-empty: filename, title, altText, caption, and description.

Readability targets:
- ${buildReadabilityTargets()}

Structure guidance:
- Build a real article, not a formula. You may open with a money problem, field example, myth, checklist, or calm explanation depending on the topic.
- Use H2s that sound like natural subheads a real writer would use.
- At least one section should use a concrete field example, symptom pattern, or diagnostic clue.
- Keep ${brandName} positioned as the specialist who finds the real problem before unnecessary work starts.

${summarizeLinks(linkPlan)}

Return ONLY valid JSON with this exact shape:
{
  "title": "string",
  "slug": "string",
  "excerpt": "string",
  "focusKeyword": "string",
  "seoTitle": "string",
  "metaDescription": "string",
  "socialTitle": "string",
  "socialDescription": "string",
  "categoryNames": ["string"],
  "tagNames": ["string"],
  "contentHtml": "<h1>...</h1>...",
  "imageMeta": {
    "filename": "string",
    "title": "string",
    "altText": "string",
    "caption": "string",
    "description": "string"
  }
}

${retryNotes ? `Fix these issues from the previous attempt:\n${retryNotes}\n` : ""}`;
}

function slugify(value) {
  return String(value || "bragi-article")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function buildLink(url, label) {
  return `<a href="${url}">${label}</a>`;
}

function chooseAnchor(link, fallback) {
  return link?.anchors?.[0] || fallback;
}

function findLink(linkPlan, matcher) {
  return linkPlan.internalLinks.find((link) => matcher.test(link.url)) || null;
}

function buildFallbackContent({ topic, location, linkPlan, topicProfile, config }) {
  const brandName = getBrandName(config);
  const serviceLink = findLink(linkPlan, /services\/pool-leaks/i);
  const symptomLink = findLink(linkPlan, /do-you-have-a-leak/i);
  const requestLink = findLink(linkPlan, /service-request/i);
  const commercialLink = findLink(linkPlan, /commercial-pool-services/i);
  const underwaterLink = findLink(linkPlan, /underwater-pool-inspection/i);
  const stateLink = linkPlan.internalLinks.find((link) => /locations/i.test(link.url) && link.url.includes(location.state.toLowerCase())) || null;

  if (topicProfile.key === "commercial-vgb") {
    return [
      `<h1>${location.display} Commercial Pool VGB Drain Cover Documentation</h1>`,
      `<p>When a commercial pool operator in ${location.display} needs a straight answer about a main drain cover, guesswork is the expensive option. The problem is not always that something looks obviously wrong. A lot of the time, the real problem is that nobody can clearly document what is installed, what markings are visible, or what the next conversation should be based on.</p>`,
      `<p>${brandName} stays in the diagnostics lane. That means underwater documentation, clear observations, and practical field evidence before anybody starts acting like a deck-side glance settled the question. If you need broader background first, start with ${buildLink(serviceLink?.url, chooseAnchor(serviceLink, "swimming pool leak detection"))} or ${buildLink(commercialLink?.url, chooseAnchor(commercialLink, "commercial pool leak detection services"))}.</p>`,
      `<h2>Why VGB Questions Get Stuck</h2>`,
      `<p>Commercial pool drain covers can create a paperwork problem long before they create a visible emergency. Operators may have old records, contractor notes, or photos from years ago, but still not have what they need when an owner, inspector, or contractor asks a simple question: what is actually installed right now?</p>`,
      `<p>That is where bad assumptions creep in. Two covers can look similar from above the water and still not carry the same markings, rating, or history. The expiration detail that matters is on the underside, so it is only confirmable through underwater documentation or underwater photo evidence.</p>`,
      `<h2>What ${brandName} Documents</h2>`,
      `<p>${brandName} does not certify compliance, write legal opinions, or promise that one site visit solves every question. What ${brandName} can do is document the visible field facts: drain cover condition, visible markings, surrounding conditions, and the kind of underwater detail that helps the next contractor, owner, or operator conversation move faster.</p>`,
      `<p>${underwaterLink ? `That is why ${buildLink(underwaterLink.url, chooseAnchor(underwaterLink, "underwater pool inspection"))} matters so much on commercial sites.` : "That is why underwater inspection matters so much on commercial sites."} It gives people something better than memory and guesswork to work from.</p>`,
      `<h2>Why a Pool May Not Need to Be Drained First</h2>`,
      `<p>A lot of operators assume the first step is a full drain. Sometimes it is. Sometimes it is not. A pool may not need to be drained just to start gathering answers when water clarity, access, and safety conditions allow a proper underwater documentation visit.</p>`,
      `<p>That matters because downtime costs money. A diagnostics-first visit helps narrow the problem before the site commits to the wrong disruption.</p>`,
      `<h2>How This Helps the Next Decision</h2>`,
      `<p>Good records make the next conversation easier. Instead of arguing from incomplete notes, the property team can work from recent field photos, organized observations, and a clearer picture of what is actually in the water. ${stateLink ? `For broader regional context, see ${buildLink(stateLink.url, chooseAnchor(stateLink, `${location.stateName} pool leak detection`))}.` : ""}</p>`,
      `<h2>Start With Evidence, Not Guesswork</h2>`,
      `<p>If your team is trying to sort out a commercial drain-cover question in ${location.display}, the smartest first move is usually better documentation, not louder opinions. ${brandName} helps pool operators get clearer field evidence so the next step is based on what is real.</p>`,
      `<p>${requestLink ? `If you are ready to move, ${buildLink(requestLink.url, chooseAnchor(requestLink, "schedule a diagnostic visit"))}.` : "If you are ready to move, start with a diagnostic visit request."}</p>`,
    ].join("");
  }

  const externalLink = linkPlan.externalLinks[0] || null;
  return [
    `<h1>${location.display} Pool Leak Detection Before You Chase the Wrong Fix</h1>`,
    `<p>${location.city} pool leak detection gets expensive when a water-loss question hangs around too long. If you are watching the water line drop in ${location.display}, you do not need more noise. You need a cleaner way to tell the difference between normal evaporation and a real leak, and that is exactly where ${brandName} is strongest.</p>`,
    `<p>Pool owners usually start in the same place. The water looks low. The weather is hot. The bill feels wrong. The problem is that suspicious water loss can look ordinary right up until it gets expensive. ${brandName} helps people sort that out with ${buildLink(serviceLink?.url, chooseAnchor(serviceLink, "pool leak detection"))} that is built around evidence instead of guesswork.</p>`,
    `<h2>Why ${location.city} Pool Leak Detection Starts With Better Questions</h2>`,
    `<p>When pool owners are not sure what they are seeing, they tend to do one of two things: ignore it too long or spend money too early. Both are expensive. Waiting can mean more water loss, higher chemical costs, and more damage. Jumping straight to a repair theory can send money toward the wrong fix.</p>`,
    `<p>That is why ${brandName} keeps the first step focused on diagnosis. ${symptomLink ? `If you are still not sure whether the symptoms point to a real leak, start with ${buildLink(symptomLink.url, chooseAnchor(symptomLink, "do you have a leak"))}.` : "If you are still not sure whether the symptoms point to a real leak, start with the symptom check instead of guessing."}</p>`,
    `<h2>Evaporation or Leak?</h2>`,
    `<p>Heat, wind, and pool use can all move the water level. But a pattern that keeps showing up, especially when it starts affecting your bill or your routine, deserves a closer look. The goal is not to panic. The goal is to separate a normal seasonal swing from water that is leaving the pool somewhere it should not.</p>`,
    `<p>The bucket-test idea is useful, but most owners do not actually want a science project. They want a straight answer. ${brandName} gives them a better path to that answer when the numbers or symptoms stop making sense.</p>`,
    `<h2>What ${brandName} Looks For</h2>`,
    `<p>Diagnostics-first work means looking at the places water loss likes to hide: fittings, plumbing, structure transitions, and underwater details that get missed when everybody is working from the deck. ${brandName} uses non-invasive methods, careful testing, and plain-language reporting so the next move is based on what the pool is actually doing.</p>`,
    `<p>${underwaterLink ? `That is why ${buildLink(underwaterLink.url, chooseAnchor(underwaterLink, "underwater pool inspection"))} can be part of the conversation when the symptoms call for it.` : "That is why underwater inspection can be part of the conversation when the symptoms call for it."}</p>`,
    ...(externalLink ? [`<p>For a broader reminder that small leaks turn into bigger waste fast, even the ${buildLink(externalLink.url, externalLink.label)} is worth a look.</p>`] : []),
    `<h2>Why Local Context Matters in ${location.display}</h2>`,
    `<p>${location.regionTerms[0]} conditions can make worried pool owners second-guess themselves. Warm weather, heavy use, and long stretches of sun all make it easier to talk yourself into believing the water loss is probably normal. Sometimes it is. Sometimes it is not. The only way to stop wasting money is to narrow that down with real testing.</p>`,
    ...(stateLink
      ? [`<p>${brandName} also connects this local question back to the broader ${buildLink(stateLink.url, chooseAnchor(stateLink, `${location.stateName} pool leak detection`))} footprint, so homeowners are not stuck wondering whether they are outside the service conversation.</p>`]
      : []),
    `<h2>Start With a Clearer Answer</h2>`,
    `<p>If your pool in ${location.display} keeps dropping and you are tired of wondering whether it is just heat or something more expensive, start with a real diagnostic path. ${brandName} is built for pool owners who want to protect the pool, the budget, and the next decision at the same time.</p>`,
    `<p>${requestLink ? `When you are ready, ${buildLink(requestLink.url, chooseAnchor(requestLink, "start with a service request"))}.` : "When you are ready, start with a service request."}</p>`,
  ].join("");
}

function buildFallbackArticlePackage({ topic, location, linkPlan, topicProfile, config }) {
  const brandName = getBrandName(config);
  const title = topicProfile.key === "commercial-vgb"
    ? `${location.display} Commercial Pool VGB Drain Cover Documentation`
    : `${location.display} Pool Leak Detection Before You Chase the Wrong Fix`;
  const focusKeyword = topicProfile.key === "commercial-vgb"
    ? "commercial pool VGB drain cover documentation"
    : `${location.city} pool leak detection`;
  const excerpt = topicProfile.key === "commercial-vgb"
    ? `${focusKeyword} questions get clearer when ${brandName} documents drain-cover details underwater before guesswork slows the next step.`
    : `${focusKeyword} gets clearer when ${brandName} helps pool owners in ${location.display} separate suspicious water loss from the wrong repair guess.`;

  return {
    title,
    slug: slugify(`${location.label} ${topic}`),
    excerpt,
    focusKeyword,
    seoTitle: `${location.city} Pool Leak Detection | ${brandName}`,
    metaDescription: excerpt,
    socialTitle: `${location.city} Pool Leak Detection | ${brandName}`,
    socialDescription: excerpt,
    categoryNames: topicProfile.categoryNames,
    tagNames: topicProfile.tagNames,
    contentHtml: buildFallbackContent({ topic, location, linkPlan, topicProfile, config }),
    imageMeta: {
      filename: slugify(`${location.label} ${topic}`),
      title,
      altText: `${location.display} pool leak detection photo selected by ${brandName}`,
      caption: "A real field photo helps tie the article back to the work itself.",
      description: `CompanyCam field photo selected for a ${location.display} ${brandName} article about ${topic}.`,
    },
  };
}

export async function generateBragiModeBArticle({ topic, location, config, linkPlan, topicProfile, clientId = "aquatrace" }) {
  let retryNotes = "";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let data;
    try {
      data = await callAnthropicMessages({
        env: process.env,
        tenantId: clientId,
        routeActionName: "bragiModeBArticleGeneration",
        taskType: "article_writer",
        model: resolveBragiArticleModel(process.env),
        maxTokens: 3200,
        temperature: 0.6,
        system: "Return JSON only. No markdown fences unless absolutely necessary for valid JSON extraction.",
        messages: [{ role: "user", content: buildPrompt({ topic, location, config, linkPlan, topicProfile, retryNotes }) }],
        metadata: {
          topic,
          location: location.display,
          attempt,
        },
      });
    } catch (error) {
      if (attempt === 1) {
        const articlePackage = buildFallbackArticlePackage({ topic, location, linkPlan, topicProfile, config });
        const validation = validateBragiModeBArticle({
          articlePackage,
          topic,
          location,
          config,
        });
        if (!validation.valid) {
          error.validation = validation;
          throw error;
        }
        return {
          articlePackage,
          validation,
          rawModelResponse: `fallback:${error?.message || "anthropic_request_failed"}`,
          usedFallbackTemplate: true,
        };
      }
      throw error;
    }

    const raw = (data?.content || []).map((item) => item?.text || "").join("\n").trim();
    const parsed = parseJsonBlock(raw);
    const articlePackage = {
      title: parsed.title,
      slug: parsed.slug,
      excerpt: parsed.excerpt,
      focusKeyword: parsed.focusKeyword,
      seoTitle: parsed.seoTitle,
      metaDescription: parsed.metaDescription,
      socialTitle: parsed.socialTitle,
      socialDescription: parsed.socialDescription,
      categoryNames: parsed.categoryNames,
      tagNames: parsed.tagNames,
      contentHtml: parsed.contentHtml,
      imageMeta: parsed.imageMeta || {},
    };

    const validation = validateBragiModeBArticle({
      articlePackage,
      topic,
      location,
      config,
    });

    if (validation.valid) {
      return {
        articlePackage,
        validation,
        rawModelResponse: raw,
      };
    }

    retryNotes = validation.errors.concat(validation.warnings).map((line) => `- ${line}`).join("\n");
    if (attempt === 2) {
      const error = new Error("Generated article did not pass Bragi Mode B guardrails.");
      error.validation = validation;
      error.articlePackage = articlePackage;
      throw error;
    }
  }

  throw new Error("Article generation failed unexpectedly.");
}

export const bragiModeBArticleGeneratorInternals = {
  buildPrompt,
  buildReadabilityTargets,
  pickBlueprint,
  pickWordRange,
};
