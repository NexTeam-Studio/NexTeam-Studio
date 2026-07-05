import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SITE_URL = "https://divefactor.com";
const PHONE_DISPLAY = "(864) 873-7082";
const PHONE_LINK = "tel:+18648737082";
const EMAIL = "service@divefactor.com";
const ASSET_VERSION = "20260615-boutique";

const PACKAGE_DIR = join(
  REPO_ROOT,
  "docs",
  "clients",
  "dive-factor-underwater-services",
  "07_WEBSITE_SEO",
  "STATIC_SITE_PACKAGE",
);
const IMAGE_CACHE_DIR = join(
  REPO_ROOT,
  "docs",
  "clients",
  "dive-factor-underwater-services",
  "07_WEBSITE_SEO",
  "IMAGE_SOURCE_CACHE",
);
const LOGO_SOURCE = join(REPO_ROOT, "mockup-assets", "Dive_Factor_Logo.png");

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/underwater-services/", label: "Underwater Services" },
  { href: "/dive-training/", label: "Dive Training" },
  { href: "/aquatic-programs/", label: "Aquatic Programs" },
  { href: "/safety-training/", label: "Safety Training" },
  { href: "/aquatic-staff-training/", label: "Aquatic Staff Training" },
  { href: "/resources/", label: "Resources" },
];

const FEATURED_RESOURCES = [
  {
    title: "Below-Waterline Inspection Guide",
    path: "/resources/below-waterline-inspection-guide/",
    image: "images/resources/below-waterline-guide.jpg",
    excerpt: "What a visual below-waterline check can cover, what it cannot, and why documentation matters.",
  },
  {
    title: "Camp Scuba Experience Guide",
    path: "/resources/camp-scuba-experience-guide/",
    image: "images/resources/camp-scuba-experience-guide.jpg",
    excerpt: "How to frame a youth or camp water program safely without turning the page into legalese.",
  },
  {
    title: "Aquatic Staff CPR / First Aid / Oxygen Guide",
    path: "/resources/aquatic-staff-cpr-first-aid-oxygen-guide/",
    image: "images/resources/aquatic-staff-cpr-guide.jpg",
    excerpt: "A plain-English readiness piece for camps, marinas, pools, and waterfront teams.",
  },
  {
    title: "Scuba Training Options for New Divers",
    path: "/resources/scuba-training-options-for-new-divers/",
    image: "images/resources/scuba-training-options.jpg",
    excerpt: "Private lessons, refreshers, confidence-building, and certification-path conversations for new divers.",
  },
];

const SERVICE_PAGES = [
  {
    path: "/underwater-services/",
    title: "Underwater Services | Dive Factor",
    description:
      "Dive Factor provides below-waterline checks, dock and lift visual inspections, lost item recovery, and marina support with clear documentation and direct contact paths.",
    heroImage: "images/site/underwater-services.jpg",
    eyebrow: "Underwater / Aquatic Services",
    heroTitle: "Most boat and dock problems start where you cannot see them.",
    heroBody:
      "Dive Factor helps lake owners, marinas, and waterfront properties get a cleaner look below the surface with visual checks, practical documentation, and straightforward next-step conversations.",
    stat: ["Lake-Ready", "Built first for Lake Hartwell and Lake Keowee, with expansion markets framed carefully."],
    whoFor: [
      "Boat owners dealing with vibration, fouling, or below-the-surface questions",
      "Dock and lift owners who want a clearer picture before repairs or heavier decisions",
      "Marinas, clubs, and waterfront partners who need a dependable visual support lane",
    ],
    problems: [
      "You suspect a prop, running gear, lift, or dock issue but cannot confirm it from above the waterline.",
      "You need photo or video documentation before scheduling repair, replacement, or partner follow-up.",
      "You want a cleaner answer than guesswork, but you do not need inflated technical claims.",
    ],
    included: [
      "Below-waterline visual inspections",
      "Dock and lift visual checks",
      "Prop / running gear visual checks",
      "Swim area hazard scans",
      "Lost item recovery when conditions fit a focused search",
      "Marina partner support and recurring waterfront visibility work",
    ],
    excluded:
      "This page does not present engineer-approved findings, structural certification, salvage-contractor claims, or insurance-approval claims.",
    process: [
      "Start with a call or email so Dive Factor can understand the water, structure, and urgency.",
      "Set the right visual scope: hull, lift, dock, swim zone, running gear, or item-recovery target.",
      "Complete the below-waterline check and return useful observations with photo or video support where applicable.",
      "Use the findings to decide whether the next move is monitoring, repair coordination, partner follow-up, or another service lane.",
    ],
    faqs: [
      ["What is the difference between a visual inspection and a structural inspection?", "Dive Factor positions this lane as a visual check and documentation service. It is built to help owners see conditions below the surface, not to replace engineering or certified structural review."],
      ["Do you work only on lakes?", "Lake Hartwell and Lake Keowee are the clearest public fit today. Lake Murray, Clarks Hill / Lake Thurmond, Coastal South Carolina, and Coastal Georgia stay in an expansion or review-gate posture."],
      ["Can you recover anything that falls into the water?", "Lost item recovery is presented as a targeted service when access, depth, visibility, and search conditions fit the request. It is not framed as a guaranteed outcome."],
    ],
    subject: "Dive Factor Underwater Services Request",
    related: [
      FEATURED_RESOURCES[0],
      FEATURED_RESOURCES[2],
    ],
  },
  {
    path: "/dive-training/",
    title: "Scuba Dive Training | Dive Factor",
    description:
      "Dive Factor presents scuba certification options, private lessons, refresher-style training, and dive trip preparation with calm, confidence-building copy and clear review boundaries.",
    heroImage: "images/site/dive-training.jpg",
    eyebrow: "Scuba Dive Training",
    heroTitle: "Scuba training should feel calm, clear, and confidence-building.",
    heroBody:
      "Dive Factor uses straightforward language for new divers, returning divers, families, and private groups who want help choosing the right training path without getting buried in agency jargon on page one.",
    stat: ["Review-Pending", "NAUI standards details remain review-pending where exact public standards would matter."],
    whoFor: [
      "New divers exploring beginner certification options",
      "Private clients who prefer a one-on-one or small-group pace",
      "Returning divers who want a refresher before travel or more training",
    ],
    problems: [
      "Many training pages read like a course catalog instead of helping a real person figure out where to start.",
      "Returning divers often need confidence and pace, not a wall of acronyms.",
      "Families and private groups want a cleaner, more personal training path.",
    ],
    included: [
      "Beginner scuba certification options",
      "Private scuba lessons",
      "Refresher / reactivation-style options",
      "Advanced and specialty interest conversations",
      "Family or private-group training",
      "Dive trip preparation and comfort-building",
    ],
    excluded:
      "This page does not guarantee certification and does not publish final age limits, student ratios, forms, or exact agency standards without verified review.",
    process: [
      "Start with the diver's real situation: new, returning, private-group, or trip-prep.",
      "Choose the right path between beginner options, refresher work, or more personalized private instruction.",
      "Keep the first conversation practical: comfort level, schedule, goals, and what kind of water confidence needs to be built first.",
      "Use official standards review where exact agency detail is needed, while keeping the public page readable and buyer-friendly.",
    ],
    faqs: [
      ["Do you guarantee certification?", "No. Dive Factor uses the safer phrase scuba certification options and keeps final outcome language tied to actual training performance and standards review."],
      ["Can I start with private lessons before choosing a bigger path?", "Yes. Private instruction is positioned as a clean starting point for many buyers, especially people returning to the water or looking for a lower-pressure pace."],
      ["Are NAUI details final on this page?", "No. NAUI-related specifics remain review-pending unless they are verified from official sources."],
    ],
    subject: "Dive Factor Dive Training Request",
    related: [
      FEATURED_RESOURCES[1],
      FEATURED_RESOURCES[3],
    ],
  },
  {
    path: "/aquatic-programs/",
    title: "Aquatic Programs | Dive Factor",
    description:
      "Dive Factor builds boutique aquatic programs for camps, schools, youth groups, private groups, and waterfront organizations with clear logistics and safer public wording.",
    heroImage: "images/site/aquatic-programs.jpg",
    eyebrow: "Aquatic Programs",
    heroTitle: "Better group aquatic experiences start with the right fit, not a generic activity menu.",
    heroBody:
      "Dive Factor frames aquatic programs for camps, schools, youth groups, churches, homeschool groups, scouts, and private groups that want something memorable, organized, and easy to understand.",
    stat: ["Group-Ready", "Built for camps, schools, youth groups, private groups, and waterfront programs."],
    whoFor: [
      "Camps and youth programs looking for a memorable water-based add-on",
      "Schools, homeschool groups, churches, scouts, and outdoor groups",
      "Private or family groups that want a guided aquatic experience with a polished feel",
    ],
    problems: [
      "Many program pages are vague about who the experience is actually for.",
      "Camp decision-makers need logistics and safety posture without pages becoming stiff or overly technical.",
      "Group buyers want a professional look and clear communication before they ever call.",
    ],
    included: [
      "Camp Try Scuba Experience",
      "Youth Aquatic Adventure Session",
      "Camp Water Adventure Day",
      "Youth-group aquatic programs",
      "Private or family-group aquatic experiences",
      "School, swim-team, camp, and community-group programming conversations",
    ],
    excluded:
      "This page keeps NAUI and DAN specifics review-pending where exact standards, age limits, or final credential details would need official verification.",
    process: [
      "Start with the group type, age mix, setting, and experience goal.",
      "Shape the day around the right lane: try-scuba style, aquatic adventure, safety-aware waterfront session, or a custom group fit.",
      "Clarify logistics, supervision posture, and on-site expectations before anything is presented as final.",
      "Use direct phone or email contact only. No live forms, no CRM routing, and no hard-sell flow.",
    ],
    faqs: [
      ["Are these pages promising final scuba standards for youth programs?", "No. They are positioned as program options and experience concepts. Exact standards, forms, and age details stay review-pending unless verified."],
      ["Can non-camp groups use this lane?", "Yes. The page is written for camps and also for schools, homeschool groups, churches, scouts, swim teams, and private groups."],
      ["Do you need a giant camp to inquire?", "No. Smaller private groups or family groups can still be a fit if the experience goals are clear."],
    ],
    subject: "Dive Factor Aquatic Program Request",
    related: [
      FEATURED_RESOURCES[1],
      FEATURED_RESOURCES[2],
    ],
  },
  {
    path: "/safety-training/",
    title: "Safety Training | Dive Factor",
    description:
      "Dive Factor presents DAN DFA Pro, CPR, first aid, AED, and emergency oxygen training as practical readiness tools for camps, waterfronts, marinas, and aquatic teams.",
    heroImage: "images/site/safety-training.jpg",
    eyebrow: "Safety Training",
    heroTitle: "Readiness training lands better when it sounds useful, not corporate.",
    heroBody:
      "Dive Factor uses practical, buyer-focused copy for teams that need stronger CPR, first aid, AED, emergency oxygen, or DAN DFA Pro conversations without overclaiming outcomes.",
    stat: ["Practical", "Built for camps, waterfronts, marinas, aquatic teams, and program operators who want readiness language that makes sense."],
    whoFor: [
      "Camp and waterfront operators",
      "Marina, club, or pool teams needing a clearer safety-training lane",
      "Programs that want better readiness conversations before a season starts",
    ],
    problems: [
      "Many safety-training pages rely on acronyms without explaining why the training matters on a real day.",
      "Program buyers want readiness language tied to their environment, not a generic classroom pitch.",
      "Pages often blur the line between useful preparedness and unsupported guarantee language.",
    ],
    included: [
      "DAN DFA Pro training conversations",
      "CPR / First Aid / AED training",
      "Emergency Oxygen / O2 administration conversations",
      "Aquatic and waterfront readiness framing",
      "Camp or staff-season prep discussions",
    ],
    excluded:
      "This page does not claim guaranteed safety, OSHA compliance, final credential outcomes, or agency specifics that have not been verified.",
    process: [
      "Start with the operating environment: camp, marina, pool, club, group, or seasonal waterfront.",
      "Clarify whether the need is core first-aid readiness, aquatic staff support, oxygen-response awareness, or a broader team discussion.",
      "Use direct contact to shape the training conversation before presenting anything as final.",
      "Keep public wording restrained while translating the training into day-of usefulness.",
    ],
    faqs: [
      ["Do you claim guaranteed compliance on this page?", "No. The page is intentionally written around readiness, team support, and safer public wording rather than unsupported compliance promises."],
      ["What does DAN DFA Pro mean here?", "It is presented as a training lane and buyer-recognizable credential reference. Exact standards detail stays review-pending unless verified from official DAN sources."],
      ["Can this lane support aquatic staff teams too?", "Yes. It connects closely with the aquatic staff training lane and its readiness framing."],
    ],
    subject: "Dive Factor Safety Training Request",
    related: [
      FEATURED_RESOURCES[2],
      FEATURED_RESOURCES[1],
    ],
  },
  {
    path: "/aquatic-staff-training/",
    title: "Aquatic Staff Training | Dive Factor",
    description:
      "Dive Factor positions aquatic staff and lifeguard-readiness support around drills, response confidence, waterfront awareness, and practical seasonal preparation.",
    heroImage: "images/site/aquatic-staff-training.jpg",
    eyebrow: "Aquatic Staff Training",
    heroTitle: "A strong waterfront team needs more than a checkbox training page.",
    heroBody:
      "Dive Factor gives camps, marinas, and aquatic operators a cleaner way to talk about staff readiness, response drills, and practical team preparation without drifting into unsafe claims.",
    stat: ["Readiness", "Focused on staff confidence, response posture, and waterfront communication rather than inflated guarantee language."],
    whoFor: [
      "Seasonal camp staff and waterfront teams",
      "Aquatic leaders preparing for a new season or staffing reset",
      "Operators who want a more polished readiness story for internal teams or client-facing programs",
    ],
    problems: [
      "Staff-readiness pages often sound generic or overlap awkwardly with broader safety pages.",
      "Waterfront teams need training that feels operational, not theoretical.",
      "Public copy needs to stay careful around certification and guarantee language.",
    ],
    included: [
      "Aquatic staff readiness conversations",
      "Lifeguard or waterfront in-service framing",
      "Emergency-response awareness and role clarity",
      "Season-start refresher and drill-oriented discussion",
      "Related CPR / first aid / oxygen support pathways",
    ],
    excluded:
      "This page does not publish unsupported lifeguard-certification claims or promise outcome language that should stay tied to verified credentials.",
    process: [
      "Clarify the setting: pool, lakefront, camp, club, or marina-adjacent operation.",
      "Pin down whether the team needs drills, refresher posture, response-role clarity, or broader readiness support.",
      "Keep the public story simple, then move specifics into direct conversation where the real environment can be understood.",
      "Link related safety-training resources so the page feels connected instead of isolated.",
    ],
    faqs: [
      ["Is this the same as a lifeguard certification page?", "No. This lane is framed around readiness and support. Final credential wording stays behind verified review."],
      ["Can a camp use this without a huge staff roster?", "Yes. The page is written for lean teams too, especially when the goal is clearer role readiness and stronger on-site response posture."],
      ["Does it connect with CPR, first aid, AED, and oxygen training?", "Yes. That is one of the main reasons this page exists as a separate lane rather than a generic staff page."],
    ],
    subject: "Dive Factor Aquatic Staff Training Request",
    related: [
      FEATURED_RESOURCES[2],
      FEATURED_RESOURCES[1],
    ],
  },
];

const ARTICLES = [
  {
    path: "/resources/below-waterline-inspection-guide/",
    title: "Below-Waterline Inspection Guide | Dive Factor Resources",
    description:
      "A practical guide to below-waterline visual inspections for boat owners, dock owners, and waterfront properties.",
    heroImage: "images/resources/below-waterline-guide.jpg",
    readTime: "6 min read",
    eyebrow: "Resource Guide",
    heroTitle: "What a below-waterline inspection can tell you before guesswork gets expensive.",
    toc: [
      ["what-it-covers", "What it usually covers"],
      ["when-to-call", "When people request one"],
      ["what-it-does-not-do", "What it does not do"],
      ["documentation", "Why documentation matters"],
    ],
    sections: `
      <h2 id="what-it-covers">What it usually covers</h2>
      <p>A visual below-waterline check is built to answer the practical question first: <strong>what is happening below the surface right now?</strong> For many owners, that is enough to move from uncertainty into a smarter next step.</p>
      <ul>
        <li>Visible fouling or growth</li>
        <li>Prop or running-gear concerns that can be seen visually</li>
        <li>Lift, dock, or swim-area condition questions</li>
        <li>Useful photo or video documentation for repair conversations</li>
      </ul>
      <h2 id="when-to-call">When people request one</h2>
      <p>Most calls happen when the owner notices vibration, impact, odd performance, storm-related concern, or a nagging dock or lift question that cannot be answered from shore.</p>
      <h2 id="what-it-does-not-do">What it does not do</h2>
      <p>This kind of page should stay honest. A below-waterline visual check is not the same thing as a formal engineering or structural sign-off. That distinction matters, and good copy makes it easy to understand.</p>
      <h2 id="documentation">Why documentation matters</h2>
      <p>Clean documentation helps owners slow down, see the problem more clearly, and decide whether the next move is repair, monitoring, partner follow-up, or a broader inspection conversation.</p>
    `,
    faq: [
      ["Is this the same as a full structural inspection?", "No. Dive Factor uses visual-inspection wording intentionally. The goal is visibility, not overstated certification language."],
      ["Can this help with a dock or lift question?", "Yes. Dock and lift visual checks are one of the clearest reasons buyers ask for underwater visibility."],
    ],
    ctaPath: "/underwater-services/",
    ctaLabel: "View Underwater Services",
    ctaSubject: "Dive Factor Underwater Services Request",
    related: [FEATURED_RESOURCES[2], FEATURED_RESOURCES[3]],
  },
  {
    path: "/resources/camp-scuba-experience-guide/",
    title: "Camp Scuba Experience Guide | Dive Factor Resources",
    description:
      "How camps and group operators can think about try-scuba style experiences, aquatic adventure sessions, and buyer-friendly planning.",
    heroImage: "images/resources/camp-scuba-experience-guide.jpg",
    readTime: "7 min read",
    eyebrow: "Resource Guide",
    heroTitle: "How to talk about a camp scuba experience without sounding reckless or generic.",
    toc: [
      ["buyer", "What group buyers need first"],
      ["fit", "Who this kind of program fits"],
      ["logistics", "Logistics that matter"],
      ["tone", "The safer public tone"],
    ],
    sections: `
      <h2 id="buyer">What group buyers need first</h2>
      <p>Camp directors, program leaders, and group organizers usually want the same three things quickly: a sense of fit, a sense of professionalism, and a sense that the operator understands group logistics.</p>
      <h2 id="fit">Who this kind of program fits</h2>
      <p>Good camp-program copy does not try to be everything. It should say clearly that these aquatic programs can fit camps, schools, homeschool groups, churches, scouts, swim teams, and private groups.</p>
      <h2 id="logistics">Logistics that matter</h2>
      <p>Readers do not need every standard on page one, but they do need to know that setting, supervision, experience level, and day-of structure are part of the planning conversation.</p>
      <h2 id="tone">The safer public tone</h2>
      <p>Safer wording matters. "Scuba experience," "aquatic adventure," and "program options" are more useful than making public promises about final standards, age thresholds, or guaranteed outcomes before review.</p>
    `,
    faq: [
      ["Does this page guarantee final youth-program details?", "No. It is designed to help a buyer understand the option and start the right conversation, not to publish every final standard publicly."],
      ["Can private groups use the same lane?", "Yes. The page is intentionally broader than just summer camps."],
    ],
    ctaPath: "/aquatic-programs/",
    ctaLabel: "View Aquatic Programs",
    ctaSubject: "Dive Factor Aquatic Program Request",
    related: [FEATURED_RESOURCES[2], FEATURED_RESOURCES[3]],
  },
  {
    path: "/resources/aquatic-staff-cpr-first-aid-oxygen-guide/",
    title: "Aquatic Staff CPR, First Aid, AED, and Oxygen Guide | Dive Factor Resources",
    description:
      "Why aquatic teams, waterfront programs, and camp staff should think in readiness terms instead of checkbox language.",
    heroImage: "images/resources/aquatic-staff-cpr-guide.jpg",
    readTime: "6 min read",
    eyebrow: "Resource Guide",
    heroTitle: "What aquatic staff training should really communicate to a buyer.",
    toc: [
      ["readiness", "Why readiness beats jargon"],
      ["buyers", "What program operators care about"],
      ["training-lanes", "How the training lanes fit together"],
      ["safe-claims", "Keeping claims safe"],
    ],
    sections: `
      <h2 id="readiness">Why readiness beats jargon</h2>
      <p>CPR, first aid, AED, and oxygen language matters, but buyers usually care more about what the training does for a real team in a real season. Better copy translates credentials into readiness.</p>
      <h2 id="buyers">What program operators care about</h2>
      <p>Camps, marinas, clubs, and waterfront teams care about confidence, clarity of role, season-start preparation, and how quickly a staff group can act well under pressure.</p>
      <h2 id="training-lanes">How the training lanes fit together</h2>
      <p>One lane can lead with safety training while another focuses on aquatic staff readiness. That separation helps the public site stay readable without blurring audiences together.</p>
      <h2 id="safe-claims">Keeping claims safe</h2>
      <p>Strong safety pages avoid guarantee language. They also avoid claiming compliance or final credential outcomes unless those statements are verified and appropriate to publish.</p>
    `,
    faq: [
      ["Does this article promise final credential outcomes?", "No. It stays focused on readiness and practical value."],
      ["Can this apply to marinas and camps, not just pools?", "Yes. That wider waterfront fit is part of the core positioning."],
    ],
    ctaPath: "/safety-training/",
    ctaLabel: "View Safety Training",
    ctaSubject: "Dive Factor Safety Training Request",
    related: [FEATURED_RESOURCES[1], FEATURED_RESOURCES[3]],
  },
  {
    path: "/resources/scuba-training-options-for-new-divers/",
    title: "Scuba Training Options for New Divers | Dive Factor Resources",
    description:
      "Private lessons, refreshers, and certification-path conversations for new divers who want a calmer start.",
    heroImage: "images/resources/scuba-training-options.jpg",
    readTime: "7 min read",
    eyebrow: "New Resource",
    heroTitle: "Scuba training options for new divers: private lessons, refreshers, and certification paths.",
    toc: [
      ["start", "A better way to start"],
      ["private-lessons", "Why private lessons appeal"],
      ["refreshers", "When refresher-style work matters"],
      ["certification-paths", "How certification-path conversations should sound"],
    ],
    sections: `
      <h2 id="start">A better way to start</h2>
      <p>New divers rarely need more hype. They need a page that calmly explains the choices in plain English and helps them decide whether they want a private start, a group path, or a slower confidence-building approach.</p>
      <h2 id="private-lessons">Why private lessons appeal</h2>
      <p>Private lessons feel more manageable for adults, families, nervous beginners, and people who do not want the first conversation to sound like a crowded course catalog.</p>
      <h2 id="refreshers">When refresher-style work matters</h2>
      <p>Refreshers are not only for long-time divers. Some people need a low-pressure return to gear, breathing, and water confidence before they commit to the next step.</p>
      <h2 id="certification-paths">How certification-path conversations should sound</h2>
      <p>Good public wording uses phrases like scuba certification options and standards review pending where exact agency detail has not yet been verified. That keeps the page readable and safe at the same time.</p>
    `,
    faq: [
      ["Does this page guarantee certification?", "No. It is intentionally written around options and fit, not guarantees."],
      ["Are NAUI details final here?", "No. NAUI-specific standards remain review-pending unless verified from official sources."],
    ],
    ctaPath: "/dive-training/",
    ctaLabel: "View Dive Training",
    ctaSubject: "Dive Factor Dive Training Request",
    related: [FEATURED_RESOURCES[1], FEATURED_RESOURCES[2]],
  },
];

main();

function main() {
  resetPackageDir();
  copySharedAssets();

  writeFileSync(join(PACKAGE_DIR, "index.html"), renderHome(), "utf8");
  for (const page of SERVICE_PAGES) {
    writeRoute(page.path, renderServicePage(page));
  }
  writeRoute("/resources/", renderResourcesIndex());
  for (const article of ARTICLES) {
    writeRoute(article.path, renderArticle(article));
  }
  writeFileSync(join(PACKAGE_DIR, "assets", "site.css"), buildCss(), "utf8");
  writeFileSync(join(PACKAGE_DIR, "assets", "site.js"), buildJs(), "utf8");
  writeFileSync(join(PACKAGE_DIR, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`, "utf8");
  writeFileSync(join(PACKAGE_DIR, "sitemap.xml"), buildSitemap(), "utf8");
}

function resetPackageDir() {
  mkdirSync(PACKAGE_DIR, { recursive: true });
  for (const child of ["aquatic-programs", "aquatic-staff-training", "assets", "dive-training", "images", "resources", "safety-training", "underwater-services", "index.html", "robots.txt", "sitemap.xml"]) {
    const target = join(PACKAGE_DIR, child);
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true });
    }
  }
}

function copySharedAssets() {
  mkdirSync(join(PACKAGE_DIR, "assets"), { recursive: true });
  mkdirSync(join(PACKAGE_DIR, "images"), { recursive: true });
  copyFileSync(LOGO_SOURCE, join(PACKAGE_DIR, "images", "Dive_Factor_Logo.png"));
  cpSync(join(IMAGE_CACHE_DIR, "site"), join(PACKAGE_DIR, "images", "site"), { recursive: true });
  cpSync(join(IMAGE_CACHE_DIR, "resources"), join(PACKAGE_DIR, "images", "resources"), { recursive: true });
}

function writeRoute(sitePath, html) {
  const targetDir = join(PACKAGE_DIR, sitePath.replace(/^\/|\/$/g, ""));
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(join(targetDir, "index.html"), html, "utf8");
}

function renderHome() {
  return renderPage({
    path: "/",
    title: "Dive Factor | Underwater Services, Scuba Training & Aquatic Safety Programs",
    description:
      "Dive Factor delivers underwater services, scuba training, aquatic programs, and safety-minded readiness support for lake and waterfront clients.",
    heroImage: "images/site/home-hero.jpg",
    eyebrow: "Dive Factor",
    heroTitle: "Underwater Services, Scuba Training & Aquatic Safety Programs",
    heroBody:
      "Dive Factor brings underwater skill into practical, real-world work. From dock checks and lost item recovery to dive training, group aquatic programs, and staff readiness, the brand is built to feel local, sharp, and easy to trust.",
    stat: ["Built for the water", "Lake-facing service, training, and readiness lanes under one cleaner brand system."],
    content: `
      ${splitSection(
        "Brand Position",
        "A stronger front door for every Dive Factor lane.",
        "Dive Factor brings underwater service, training, and aquatic readiness under one cleaner brand so lake owners, camps, waterfront teams, and private groups can quickly move toward the right next conversation.",
        `<div class="quote-card"><p>We help lake owners, marinas, camps, and private groups see what is happening below the surface and choose the right next step above it.</p></div>`,
      )}
      ${cardsSection(
        "Main Lanes",
        "Choose the lane that fits the work.",
        [
          laneCard("Underwater Services", "Most below-the-surface questions start with visibility. Dive Factor gives boat owners, dock owners, marinas, and waterfront properties a cleaner look below the waterline.", "/underwater-services/", "Below-waterline checks"),
          laneCard("Scuba Dive Training", "Private lessons, beginner options, refresher-style support, and calmer training conversations for new or returning divers.", "/dive-training/", "Confidence-building"),
          laneCard("Aquatic Programs", "Boutique water-based programming for camps, schools, groups, and private experiences.", "/aquatic-programs/", "Camp and group fit"),
          laneCard("Safety Training", "DAN DFA Pro, CPR, first aid, AED, and oxygen-readiness conversations built for real teams.", "/safety-training/", "Readiness first"),
          laneCard("Aquatic Staff Training", "Waterfront staff support, drills, role clarity, and season-start readiness without bloated claims.", "/aquatic-staff-training/", "Operational support"),
          laneCard("Resources", "Helpful guides that explain service options, training paths, and readiness topics in plain English.", "/resources/", "Readable guidance"),
        ],
      )}
      ${threeUp(
        "Why People Reach Out",
        "Clearer pages make the next step easier.",
        [
          infoBlock("See the issue sooner", "Underwater-service pages focus on the problems owners cannot confirm from shore, dock, or deck."),
          infoBlock("Choose the right fit", "Training, program, and readiness pages are written for real people deciding what kind of help they actually need."),
          infoBlock("Reach the right lane quickly", "Each page is designed to move the reader toward a clearer call, text, or email conversation without clutter."),
        ],
      )}
      ${resourcesStrip("Featured Resources", "Guides that help buyers understand the work before they call.", FEATURED_RESOURCES)}
    `,
    subject: "Dive Factor Website Inquiry",
    ctaLabel: "Explore Underwater Services",
    ctaHref: "/underwater-services/",
    ctaSecondary: ctaButton("Email Dive Factor", mailto("Dive Factor Website Inquiry"), "secondary"),
  });
}

function renderServicePage(page) {
  return renderPage({
    ...page,
    content: `
      ${twoColumnCheck(
        "Who This Is For",
        "Built for practical buyers, not vague traffic.",
        page.whoFor,
        page.problems,
      )}
      ${listSection("What Is Included", "Clear scope keeps the page useful.", page.included, page.excluded)}
      ${processSection("How the Conversation Usually Works", "A better buyer journey feels calm and obvious.", page.process)}
      ${faqSection("Common Questions", page.faqs)}
      ${resourcesStrip("Related Resources", "Relevant reading that supports this service lane.", page.related)}
    `,
    subject: page.subject,
    ctaLabel: page.path === "/underwater-services/" ? "Request Underwater Services" :
      page.path === "/dive-training/" ? "Request Dive Training Info" :
      page.path === "/aquatic-programs/" ? "Request Aquatic Program Info" :
      page.path === "/safety-training/" ? "Request Safety Training Info" :
      "Request Aquatic Staff Training Info",
    ctaSecondary: ctaButton("Email Dive Factor", mailto(page.subject), "secondary"),
  });
}

function renderResourcesIndex() {
  return renderPage({
    path: "/resources/",
    title: "Resources | Dive Factor",
    description: "Readable underwater-service, scuba-training, aquatic-program, and safety-readiness resources from Dive Factor.",
    heroImage: "images/site/home-hero.jpg",
    eyebrow: "Resources",
    heroTitle: "Readable guides for buyers who want clarity before they call.",
    heroBody:
      "The Dive Factor resource hub answers common buyer questions in plain English and helps readers move into the right service, training, or readiness conversation.",
    stat: ["4 Guides", "Built to answer common questions and point readers toward the right lane."],
    content: resourcesStrip("Resource Library", "Four resource pages are live in this redesign pass, including the new scuba training article.", FEATURED_RESOURCES),
    subject: "Dive Factor Website Inquiry",
    ctaLabel: "Call / Text Dive Factor",
    ctaHref: PHONE_LINK,
    ctaSecondary: ctaButton("Email Dive Factor", mailto("Dive Factor Website Inquiry"), "secondary"),
  });
}

function renderArticle(article) {
  return renderPage({
    path: article.path,
    title: article.title,
    description: article.description,
    heroImage: article.heroImage,
    eyebrow: article.eyebrow,
    heroTitle: article.heroTitle,
    heroBody: article.description,
    stat: [article.readTime, "Structured to make a complicated topic easier to understand before the first call."],
    content: `
      ${tocSection(article.toc)}
      <section class="section article-wrap">
        <div class="section-inner">
          <article class="article-card">
            ${article.sections}
          </article>
        </div>
      </section>
      ${faqSection("Frequently Asked Questions", article.faq)}
      ${resourcesStrip("Related Resources", "Keep readers moving through the right adjacent topics.", article.related)}
    `,
    subject: article.ctaSubject,
    ctaLabel: "View Related Service Page",
    ctaHref: article.ctaPath,
    ctaSecondary: ctaButton("Email Dive Factor", mailto(article.ctaSubject), "secondary"),
  });
}

function renderPage(page) {
  const prefix = relativePrefix(page.path);
  const canonicalUrl = `${SITE_URL}${page.path}`;
  const nav = NAV_ITEMS.map((item) => {
    const active = item.href === page.path ? " is-active" : "";
    return `<a class="nav-link${active}" href="${hrefFor(item.href, prefix)}">${escapeHtml(item.label)}</a>`;
  }).join("");
  const footerNav = NAV_ITEMS.map((item) => `<a href="${hrefFor(item.href, prefix)}">${escapeHtml(item.label)}</a>`).join("");
  const heroImage = `${prefix}${page.heroImage}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.description)}">
  <meta property="og:title" content="${escapeHtml(page.title)}">
  <meta property="og:description" content="${escapeHtml(page.description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${SITE_URL}/${page.heroImage}">
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Lato:wght@300;400;700;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${prefix}assets/site.css?v=${ASSET_VERSION}">
</head>
<body>
  <div class="site-shell">
    <div class="ambient-grid" aria-hidden="true"></div>
    <header class="topbar">
      <div class="topbar-inner">
        <a class="brand" href="${hrefFor("/", prefix)}">
          <img src="${prefix}images/Dive_Factor_Logo.png" alt="Dive Factor logo">
          <div class="brand-copy">
            <strong>Dive Factor</strong>
            <span>Underwater Services, Scuba Training &amp; Aquatic Safety Programs</span>
          </div>
        </a>
        <button class="menu-toggle" type="button" data-menu-toggle aria-expanded="false" aria-controls="site-nav">Menu</button>
        <nav class="nav" id="site-nav" data-nav aria-label="Primary">${nav}<a class="nav-button" href="#contact">Contact</a></nav>
      </div>
    </header>
    <main>
      <section class="hero" style="--hero-image:url('${heroImage}')">
        <div class="section-inner hero-grid">
          <div class="hero-copy">
            <p class="eyebrow">${escapeHtml(page.eyebrow)}</p>
            <h1>${page.heroTitle}</h1>
            <p class="hero-body">${page.heroBody}</p>
            <div class="hero-actions">
              ${page.ctaHref ? ctaButton(page.ctaLabel, hrefFor(page.ctaHref, prefix)) : ctaButton(page.ctaLabel, mailto(page.subject))}
              <a class="button-secondary" href="${PHONE_LINK}">Call / Text Dive Factor</a>
            </div>
          </div>
          <aside class="hero-panel">
            <div class="hero-panel-image"><img src="${heroImage}" alt=""></div>
            <div class="hero-panel-copy">
              <span class="mini-label">${page.stat[0]}</span>
              <p>${page.stat[1]}</p>
            </div>
          </aside>
        </div>
      </section>
      ${rewriteInternalLinks(page.content, prefix)}
      <section class="section contact-band-wrap" id="contact">
        <div class="section-inner">
          <div class="contact-band">
            <div>
              <p class="section-label">Direct Contact</p>
              <h2 class="section-title">Call, text, or email the right Dive Factor lane.</h2>
              <p class="section-copy">Reach out directly to talk through fit, scope, scheduling, and the next best step for the service, training, or program you are considering.</p>
              <p class="contact-meta"><strong>Phone/Text:</strong> <a href="${PHONE_LINK}">${PHONE_DISPLAY}</a><br><strong>Email:</strong> <a href="mailto:${EMAIL}">${EMAIL}</a></p>
            </div>
            <div class="button-stack">
              ${page.ctaHref ? ctaButton(page.ctaLabel, hrefFor(page.ctaHref, prefix)) : ctaButton(page.ctaLabel, mailto(page.subject))}
              <a class="button-secondary" href="${PHONE_LINK}">Call / Text Dive Factor</a>
              ${page.ctaSecondary}
            </div>
          </div>
        </div>
      </section>
    </main>
    <footer class="footer">
      <div class="section-inner footer-grid">
        <div class="footer-brand">
          <div class="brand brand-footer">
            <img src="${prefix}images/Dive_Factor_Logo.png" alt="">
            <div class="brand-copy">
              <strong>Dive Factor</strong>
              <span>Underwater Services, Scuba Training &amp; Aquatic Safety Programs</span>
            </div>
          </div>
          <p>Built for Lake Hartwell, Lake Keowee, private groups, camps, waterfront properties, and practical aquatic readiness conversations.</p>
        </div>
        <div class="footer-links">${footerNav}</div>
        <div class="footer-contact">
          <p><strong>Phone/Text:</strong> <a href="${PHONE_LINK}">${PHONE_DISPLAY}</a></p>
          <p><strong>Email:</strong> <a href="mailto:${EMAIL}">${EMAIL}</a></p>
          <p>Direct phone and email contact for service, training, and program inquiries.</p>
        </div>
      </div>
    </footer>
  </div>
  <script src="${prefix}assets/site.js?v=${ASSET_VERSION}"></script>
</body>
</html>`;
}

function splitSection(label, title, copy, right) {
  return `<section class="section"><div class="section-inner split-grid"><div><p class="section-label">${label}</p><h2 class="section-title">${title}</h2><p class="section-copy">${copy}</p></div><div>${right}</div></div></section>`;
}

function cardsSection(label, title, cards) {
  return `<section class="section"><div class="section-inner"><p class="section-label">${label}</p><h2 class="section-title">${title}</h2><div class="lane-grid">${cards.join("")}</div></div></section>`;
}

function laneCard(title, copy, href, tag) {
  return `<article class="lane-card"><span class="card-tag">${tag}</span><h3>${title}</h3><p>${copy}</p><a class="lane-link" href="${href}">Explore ${title}</a></article>`;
}

function infoBlock(title, copy) {
  return `<article class="info-card"><h3>${title}</h3><p>${copy}</p></article>`;
}

function threeUp(label, title, blocks) {
  return `<section class="section"><div class="section-inner"><p class="section-label">${label}</p><h2 class="section-title">${title}</h2><div class="info-grid">${blocks.join("")}</div></div></section>`;
}

function twoColumnCheck(label, title, leftList, rightList) {
  return `<section class="section"><div class="section-inner"><p class="section-label">${label}</p><h2 class="section-title">${title}</h2><div class="check-grid"><div class="check-card"><h3>Who it fits</h3><ul>${leftList.map((item) => `<li>${item}</li>`).join("")}</ul></div><div class="check-card"><h3>What it helps solve</h3><ul>${rightList.map((item) => `<li>${item}</li>`).join("")}</ul></div></div></div></section>`;
}

function listSection(label, title, items, note) {
  return `<section class="section"><div class="section-inner"><p class="section-label">${label}</p><h2 class="section-title">${title}</h2><div class="lane-grid">${items.map((item) => `<article class="lane-card"><h3>${item}</h3><p>Dive Factor keeps this service line direct, visible, and easy to understand for buyers who want a confident next step.</p></article>`).join("")}</div><p class="boundary-note">${note}</p></div></section>`;
}

function processSection(label, title, steps) {
  return `<section class="section"><div class="section-inner"><p class="section-label">${label}</p><h2 class="section-title">${title}</h2><div class="process-list">${steps.map((step, index) => `<article class="process-step"><span>${index + 1}</span><p>${step}</p></article>`).join("")}</div></div></section>`;
}

function faqSection(title, items) {
  return `<section class="section"><div class="section-inner"><h2 class="section-title">${title}</h2><div class="faq-list">${items.map(([q, a]) => `<details class="faq-item"><summary>${q}</summary><p>${a}</p></details>`).join("")}</div></div></section>`;
}

function resourcesStrip(label, title, items) {
  return `<section class="section"><div class="section-inner"><p class="section-label">${label}</p><h2 class="section-title">${title}</h2><div class="resource-grid">${items.map((item) => `<article class="resource-card"><img src="/${item.image}" alt=""><div class="resource-card-copy"><h3>${item.title}</h3><p>${item.excerpt}</p><a class="lane-link" href="${item.path}">Read the guide</a></div></article>`).join("")}</div></div></section>`;
}

function tocSection(items) {
  return `<section class="section"><div class="section-inner"><div class="toc-card"><p class="section-label">On This Page</p><ul>${items.map(([id, label]) => `<li><a href="#${id}">${label}</a></li>`).join("")}</ul></div></div></section>`;
}

function buildSitemap() {
  const urls = ["/", ...SERVICE_PAGES.map((page) => page.path), "/resources/", ...ARTICLES.map((article) => article.path)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((path) => `  <url>\n    <loc>${SITE_URL}${path}</loc>\n  </url>`).join("\n")}\n</urlset>\n`;
}

function ctaButton(label, href, variant = "primary") {
  return `<a class="${variant === "secondary" ? "button-secondary" : "button"}" href="${href}">${label}</a>`;
}

function mailto(subject) {
  return `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}`;
}

function hrefFor(path, prefix) {
  if (/^(?:[a-z]+:|#)/i.test(path)) return path;
  if (path === "/") return prefix || "./";
  return `${prefix}${path.replace(/^\//, "")}`;
}

function relativePrefix(path) {
  if (path === "/") return "";
  const depth = path.replace(/^\/|\/$/g, "").split("/").filter(Boolean).length;
  return "../".repeat(depth);
}

function rewriteInternalLinks(html, prefix) {
  return html.replace(/(href|src)="\/([^"]*)"/g, (_m, attr, path) => `${attr}="${prefix}${path}"`);
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function buildJs() {
  return `const toggle=document.querySelector('[data-menu-toggle]');const nav=document.querySelector('[data-nav]');if(toggle&&nav){toggle.addEventListener('click',()=>{const open=nav.classList.toggle('is-open');toggle.setAttribute('aria-expanded',String(open));});}document.querySelectorAll('a[href^="#"]').forEach(link=>link.addEventListener('click',()=>nav?.classList.remove('is-open')));`;
}

function buildCss() {
  return `:root{
  --bg:#07111a;
  --bg-soft:#0d1a26;
  --panel:rgba(8,18,28,.84);
  --panel-strong:rgba(8,18,28,.94);
  --line:rgba(170,227,62,.22);
  --line-strong:rgba(170,227,62,.42);
  --green:#aae33e;
  --green-soft:rgba(170,227,62,.12);
  --text:#e3edf4;
  --muted:rgba(227,237,244,.76);
  --red:#da3028;
  --silver:#9eb2bf;
  --shadow:0 24px 80px rgba(0,0,0,.36);
  --radius:28px;
  --max:1240px;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  margin:0;
  font-family:"Lato",sans-serif;
  font-weight:400;
  color:var(--text);
  background:
    radial-gradient(circle at top left, rgba(170,227,62,.08), transparent 20%),
    radial-gradient(circle at 80% 0%, rgba(41,103,145,.24), transparent 18%),
    linear-gradient(180deg,#061018 0%,#08141d 38%,#071018 100%);
}
a{color:inherit;text-decoration:none}
img{display:block;max-width:100%}
.site-shell{position:relative;overflow:hidden}
.ambient-grid{
  position:fixed;inset:0;pointer-events:none;opacity:.4;
  background-image:
    linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,.02) 1px,transparent 1px);
  background-size:50px 50px;
  mask-image:linear-gradient(180deg,rgba(0,0,0,.55),transparent 80%);
}
.topbar{
  position:sticky;top:0;z-index:30;
  backdrop-filter:blur(18px);
  background:rgba(4,10,15,.84);
  border-bottom:1px solid var(--line);
}
.topbar-inner,.section-inner{max-width:var(--max);margin:0 auto}
.topbar-inner{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:16px 24px}
.brand{display:flex;align-items:center;gap:14px;min-width:0}
.brand img{width:56px;height:56px;object-fit:contain;filter:drop-shadow(0 0 18px rgba(170,227,62,.28))}
.brand-copy strong{
  display:block;font-family:"Oswald",sans-serif;font-size:1.4rem;
  letter-spacing:.18rem;text-transform:uppercase;color:var(--green)
}
.brand-copy span{
  display:block;margin-top:.18rem;font-size:.72rem;letter-spacing:.18rem;
  text-transform:uppercase;color:var(--silver)
}
.menu-toggle{
  display:none;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--text);
  border-radius:999px;padding:.7rem 1rem;font-family:"Oswald",sans-serif;letter-spacing:.12rem;text-transform:uppercase
}
.nav{display:flex;align-items:center;gap:16px;flex-wrap:wrap;justify-content:flex-end}
.nav-link,.nav-button{
  font-family:"Oswald",sans-serif;font-size:.82rem;letter-spacing:.14rem;text-transform:uppercase;color:var(--silver)
}
.nav-link.is-active,.nav-link:hover,.nav-button:hover{color:var(--green)}
.nav-button,.button,.button-secondary{
  display:inline-flex;align-items:center;justify-content:center;gap:10px;
  min-height:52px;padding:.95rem 1.35rem;clip-path:polygon(10px 0,100% 0,calc(100% - 10px) 100%,0 100%);
  font-family:"Oswald",sans-serif;letter-spacing:.12rem;text-transform:uppercase
}
.nav-button,.button{
  background:linear-gradient(135deg,rgba(170,227,62,.25),rgba(170,227,62,.08));
  color:#f3ffd4;border:1px solid var(--line-strong)
}
.button-secondary{
  background:rgba(255,255,255,.03);color:var(--text);border:1px solid rgba(255,255,255,.1)
}
.hero{
  position:relative;padding:88px 24px 54px;
}
.hero::before{
  content:"";position:absolute;inset:0;
  background:
    linear-gradient(120deg,rgba(7,17,26,.22) 0 46%,rgba(218,48,40,.22) 46.1%,transparent 46.7%),
    linear-gradient(180deg,rgba(4,9,14,.28),rgba(4,9,14,.82));
}
.hero::after{
  content:"";position:absolute;inset:0;
  background:
    linear-gradient(180deg,rgba(0,0,0,.06),rgba(0,0,0,.5)),
    var(--hero-image) center/cover no-repeat;
  mix-blend-mode:screen;opacity:.34;
}
.hero-grid{position:relative;display:grid;grid-template-columns:minmax(0,1.2fr) minmax(320px,.8fr);gap:28px}
.hero-copy,.hero-panel,.lane-card,.info-card,.check-card,.resource-card,.quote-card,.toc-card,.article-card,.contact-band,.process-step{
  position:relative;overflow:hidden;background:var(--panel);border:1px solid rgba(255,255,255,.07);border-radius:var(--radius);box-shadow:var(--shadow)
}
.hero-copy,.hero-panel,.quote-card,.toc-card,.article-card,.contact-band{padding:30px}
.eyebrow,.section-label,.mini-label{
  margin:0;font-family:"Oswald",sans-serif;font-size:.82rem;letter-spacing:.2rem;text-transform:uppercase;color:var(--green)
}
h1,h2,h3{margin:0;font-family:"Oswald",sans-serif;font-weight:600;line-height:.98}
h1{margin-top:1rem;font-size:clamp(2.8rem,7vw,5.6rem);max-width:12ch}
.hero-body,.section-copy,.lane-card p,.info-card p,.check-card li,.resource-card p,.article-card p,.article-card li,.contact-meta,.process-step p,.hero-panel-copy p,.quote-card p{color:var(--muted);line-height:1.75}
.hero-actions,.button-stack{display:flex;flex-wrap:wrap;gap:14px;margin-top:1.7rem}
.hero-panel-image{aspect-ratio:4/5;overflow:hidden;border-radius:22px}
.hero-panel-image img{width:100%;height:100%;object-fit:cover}
.hero-panel-copy{padding-top:18px}
.section{padding:26px 24px 72px;position:relative}
.section-title{margin-top:.7rem;font-size:clamp(2rem,4vw,3.35rem)}
.split-grid,.check-grid,.info-grid,.lane-grid,.resource-grid,.footer-grid{display:grid;gap:22px}
.split-grid{grid-template-columns:minmax(0,1fr) minmax(280px,.85fr);align-items:start}
.info-grid,.check-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.lane-grid,.resource-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
.lane-card,.info-card,.check-card,.resource-card,.process-step{padding:24px}
.lane-card::before,.resource-card::before,.contact-band::before,.article-card::before,.quote-card::before{
  content:"";position:absolute;left:0;right:0;top:0;height:3px;background:linear-gradient(90deg,var(--green),rgba(218,48,40,.9),transparent)
}
.card-tag{
  display:inline-block;padding:.35rem .7rem;background:var(--green-soft);color:var(--green);
  border:1px solid var(--line);border-radius:999px;font-size:.72rem;letter-spacing:.1rem;text-transform:uppercase
}
.lane-card h3,.info-card h3,.check-card h3,.resource-card h3{margin-top:1rem;font-size:1.5rem}
.lane-link{display:inline-flex;margin-top:1rem;color:var(--green);font-family:"Oswald",sans-serif;letter-spacing:.12rem;text-transform:uppercase}
.quote-card p{font-size:1.2rem;color:var(--text);font-weight:700}
.boundary-note{margin-top:1.25rem;padding:1rem 1.1rem;border-left:3px solid var(--red);background:rgba(255,255,255,.03);color:var(--muted)}
.process-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}
.process-step span{
  display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:999px;
  background:var(--green-soft);border:1px solid var(--line);font-family:"Oswald",sans-serif;color:var(--green)
}
.process-step p{margin-top:1rem}
.faq-list{display:grid;gap:14px}
.faq-item{
  border:1px solid rgba(255,255,255,.08);border-radius:22px;background:rgba(255,255,255,.03);padding:1.05rem 1.15rem
}
.faq-item summary{cursor:pointer;font-family:"Oswald",sans-serif;font-size:1.18rem;list-style:none}
.faq-item p{margin:1rem 0 0;color:var(--muted);line-height:1.75}
.resource-card{padding:0}
.resource-card img{width:100%;aspect-ratio:16/10;object-fit:cover}
.resource-card-copy{padding:22px}
.toc-card ul,.article-card ul{padding-left:1.1rem}
.toc-card li,.article-card li{margin-top:.5rem}
.toc-card a{color:var(--green)}
.article-wrap{padding-top:0}
.article-card h2{margin-top:2rem;font-size:2rem}
.article-card h3{margin-top:1.35rem;font-size:1.35rem}
.contact-band{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px}
.contact-meta a,.footer a{color:var(--green)}
.footer{padding:0 24px 40px}
.footer-grid{
  grid-template-columns:minmax(0,1.2fr) minmax(0,.9fr) minmax(220px,.8fr);
  padding:28px;border-radius:var(--radius);background:var(--panel-strong);border:1px solid rgba(255,255,255,.08)
}
.footer-links{display:flex;flex-wrap:wrap;gap:12px 18px;align-content:flex-start}
.footer p{color:var(--muted);line-height:1.7}
.brand-footer img{width:48px;height:48px}
@media (max-width:1100px){
  .hero-grid,.split-grid,.lane-grid,.resource-grid,.process-list,.footer-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width:920px){
  .hero-grid,.split-grid,.lane-grid,.resource-grid,.process-list,.footer-grid,.info-grid,.check-grid,.contact-band{grid-template-columns:1fr}
  .menu-toggle{display:inline-flex}
  .nav{display:none;position:absolute;top:100%;left:0;right:0;padding:16px 24px 24px;background:rgba(4,10,15,.96);border-bottom:1px solid var(--line);flex-direction:column;align-items:stretch}
  .nav.is-open{display:flex}
  .nav-link,.nav-button{width:100%;justify-content:center}
}
@media (max-width:720px){
  .topbar-inner,.hero,.section,.footer{padding-left:18px;padding-right:18px}
  .hero-copy,.hero-panel,.quote-card,.toc-card,.article-card,.contact-band,.lane-card,.info-card,.check-card,.process-step{padding:22px}
  .button,.button-secondary,.nav-button{width:100%}
}`;
}
