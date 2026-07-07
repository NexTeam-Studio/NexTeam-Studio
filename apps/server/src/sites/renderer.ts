import type { GeneratedSite, SiteBlock } from "./schemas.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderHero(block: Extract<SiteBlock, { type: "hero" }>) {
  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${escapeHtml(block.eyebrow)}</p>
        <h1>${escapeHtml(block.headline)}</h1>
        <p class="subhead">${escapeHtml(block.subhead)}</p>
        <a class="button" href="${escapeHtml(block.primaryCta.href)}">${escapeHtml(block.primaryCta.label)}</a>
      </div>
      <div class="proof-card">
        ${block.proofPoints.map((point) => `<span>${escapeHtml(point)}</span>`).join("")}
      </div>
    </section>`;
}

function renderServices(block: Extract<SiteBlock, { type: "services" }>) {
  return `
    <section class="section" id="services">
      <div class="section-heading">
        <p class="eyebrow">Services</p>
        <h2>${escapeHtml(block.heading)}</h2>
      </div>
      <div class="cards">
        ${block.services.map((service) => `
          <article class="card">
            <h3>${escapeHtml(service.name)}</h3>
            <p>${escapeHtml(service.description)}</p>
            ${service.startingAt ? `<strong>${escapeHtml(service.startingAt)}</strong>` : ""}
          </article>`).join("")}
      </div>
    </section>`;
}

function renderServiceArea(block: Extract<SiteBlock, { type: "service_area_map" }>) {
  return `
    <section class="section split">
      <div>
        <p class="eyebrow">Service Area</p>
        <h2>${escapeHtml(block.heading)}</h2>
        <p>Based near ${escapeHtml(block.center)}, serving pool owners, builders, and property managers across:</p>
      </div>
      <div class="map-card">
        ${block.areas.map((area) => `<span>${escapeHtml(area)}</span>`).join("")}
      </div>
    </section>`;
}

function renderGallery(block: Extract<SiteBlock, { type: "gallery" }>) {
  return `
    <section class="section" id="gallery">
      <div class="section-heading">
        <p class="eyebrow">Field Proof</p>
        <h2>${escapeHtml(block.heading)}</h2>
      </div>
      <div class="gallery">
        ${block.items.map((item) => `
          <figure>
            <div class="photo-tile" data-media-id="${escapeHtml(item.mediaId)}">${escapeHtml(item.caption.slice(0, 1))}</div>
            <figcaption>${escapeHtml(item.caption)}</figcaption>
          </figure>`).join("")}
      </div>
    </section>`;
}

function renderReviews(block: Extract<SiteBlock, { type: "reviews" }>) {
  return `
    <section class="section warm">
      <div class="section-heading">
        <p class="eyebrow">Reviews</p>
        <h2>${escapeHtml(block.heading)}</h2>
      </div>
      <div class="reviews">
        ${block.reviews.map((review) => `
          <blockquote>
            <p>${escapeHtml(review.quote)}</p>
            <cite>${escapeHtml(review.attribution)}</cite>
          </blockquote>`).join("")}
      </div>
    </section>`;
}

function renderCompliance(block: Extract<SiteBlock, { type: "compliance_badges" }>) {
  return `
    <section class="badges" aria-label="${escapeHtml(block.heading)}">
      ${block.badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}
    </section>`;
}

function renderArticles(block: Extract<SiteBlock, { type: "article_index" }>) {
  return `
    <section class="section">
      <div class="section-heading">
        <p class="eyebrow">Guides</p>
        <h2>${escapeHtml(block.heading)}</h2>
      </div>
      <div class="article-list">
        ${block.articles.map((article) => `
          <a href="${escapeHtml(article.href)}">
            <strong>${escapeHtml(article.title)}</strong>
            <span>${escapeHtml(article.excerpt)}</span>
          </a>`).join("")}
      </div>
    </section>`;
}

function renderLeadForm(block: Extract<SiteBlock, { type: "lead_form" }>) {
  return `
    <section class="section lead" id="estimate">
      <div>
        <p class="eyebrow">Start Here</p>
        <h2>${escapeHtml(block.heading)}</h2>
        <p>${escapeHtml(block.intro)}</p>
      </div>
      <form method="post" action="${escapeHtml(block.action)}">
        <label>Name <input name="name" autocomplete="name" required /></label>
        <label>Email <input name="email" type="email" autocomplete="email" /></label>
        <label>Phone <input name="phone" autocomplete="tel" /></label>
        <label>City <input name="city" autocomplete="address-level2" /></label>
        <label>What are you seeing? <textarea name="message" required></textarea></label>
        <input type="hidden" name="consent.email" value="true" />
        <button type="submit">Request leak help</button>
      </form>
    </section>`;
}

function renderBlock(block: SiteBlock) {
  switch (block.type) {
    case "hero":
      return renderHero(block);
    case "services":
      return renderServices(block);
    case "service_area_map":
      return renderServiceArea(block);
    case "gallery":
      return renderGallery(block);
    case "reviews":
      return renderReviews(block);
    case "compliance_badges":
      return renderCompliance(block);
    case "article_index":
      return renderArticles(block);
    case "lead_form":
      return renderLeadForm(block);
  }
}

export function renderStaticSite(site: Omit<GeneratedSite, "html">) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(site.title)}</title>
    <meta name="description" content="Swimming pool leak detection, pressure testing, dye testing, and field documentation." />
    <style>
      :root {
        --ink: #14231f;
        --deep: #0f393d;
        --water: #4eb8c7;
        --foam: #effaf8;
        --sand: #efe2c8;
        --coral: #d56a4a;
        --card: rgba(255, 255, 255, 0.82);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        color: var(--ink);
        background:
          radial-gradient(circle at 18% 12%, rgba(78, 184, 199, 0.28), transparent 32rem),
          linear-gradient(135deg, #f7f0df 0%, #e8f8f5 48%, #fef8ed 100%);
      }
      header, main, footer { width: min(1120px, calc(100% - 32px)); margin: 0 auto; }
      header { padding: 26px 0; display: flex; justify-content: space-between; gap: 16px; align-items: center; }
      nav a { color: var(--deep); text-decoration: none; margin-left: 18px; font-weight: 700; }
      .brand { font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; }
      .hero {
        min-height: 72vh;
        display: grid;
        grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.7fr);
        gap: 34px;
        align-items: center;
        padding: 54px 0 76px;
      }
      .eyebrow { color: var(--coral); text-transform: uppercase; letter-spacing: 0.14em; font: 800 0.78rem system-ui, sans-serif; }
      h1, h2, h3 { line-height: 0.96; margin: 0; }
      h1 { font-size: clamp(3.8rem, 10vw, 8.4rem); max-width: 9ch; }
      h2 { font-size: clamp(2.4rem, 5vw, 4.8rem); }
      h3 { font-size: 1.45rem; }
      p, label, span, a, button, textarea, input { font-family: ui-sans-serif, system-ui, sans-serif; }
      .subhead { font-size: clamp(1.1rem, 2.1vw, 1.45rem); max-width: 58ch; }
      .button, button {
        display: inline-flex;
        border: 0;
        border-radius: 999px;
        background: var(--deep);
        color: white;
        padding: 14px 22px;
        text-decoration: none;
        font-weight: 800;
        cursor: pointer;
      }
      .proof-card, .card, .map-card, blockquote, form {
        background: var(--card);
        border: 1px solid rgba(15, 57, 61, 0.16);
        box-shadow: 0 26px 80px rgba(15, 57, 61, 0.14);
        border-radius: 28px;
      }
      .proof-card { padding: 24px; display: grid; gap: 14px; transform: rotate(2deg); }
      .proof-card span, .badges span, .map-card span {
        display: inline-flex;
        width: fit-content;
        border-radius: 999px;
        background: white;
        padding: 10px 13px;
        font-weight: 800;
      }
      .section { padding: 72px 0; }
      .section-heading { margin-bottom: 24px; }
      .cards, .gallery, .reviews { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
      .card { padding: 24px; min-height: 220px; }
      .card strong { color: var(--coral); }
      .split, .lead { display: grid; grid-template-columns: 0.85fr 1.15fr; gap: 24px; align-items: start; }
      .map-card, form { padding: 24px; display: flex; flex-wrap: wrap; gap: 10px; }
      .photo-tile {
        min-height: 190px;
        border-radius: 26px;
        display: grid;
        place-items: center;
        color: white;
        font-size: 4rem;
        font-weight: 900;
        background: linear-gradient(135deg, var(--deep), var(--water));
      }
      figure { margin: 0; }
      figcaption { padding: 10px 4px; font: 700 0.95rem ui-sans-serif, system-ui, sans-serif; }
      .warm { background: rgba(239, 226, 200, 0.42); margin-inline: calc(50% - 50vw); padding-inline: calc(50vw - 50%); }
      blockquote { margin: 0; padding: 24px; }
      blockquote p { font-size: 1.05rem; }
      cite { font-style: normal; font-weight: 900; }
      .badges { display: flex; gap: 12px; flex-wrap: wrap; padding: 34px 0; }
      .article-list { display: grid; gap: 12px; }
      .article-list a { display: grid; gap: 4px; color: var(--ink); text-decoration: none; border-bottom: 1px solid rgba(20, 35, 31, 0.18); padding: 16px 0; }
      form { display: grid; }
      label { display: grid; gap: 6px; font-weight: 800; width: 100%; }
      input, textarea { border: 1px solid rgba(15, 57, 61, 0.28); border-radius: 14px; padding: 12px; font: inherit; background: white; }
      textarea { min-height: 130px; }
      footer { padding: 42px 0 60px; color: rgba(20, 35, 31, 0.72); }
      @media (max-width: 760px) {
        header { align-items: flex-start; flex-direction: column; }
        nav a { margin: 0 14px 0 0; }
        .hero, .split, .lead, .cards, .gallery, .reviews { grid-template-columns: 1fr; }
        .proof-card { transform: none; }
      }
    </style>
  </head>
  <body>
    <header>
      <div class="brand">${escapeHtml(site.title)}</div>
      <nav>
        <a href="#services">Services</a>
        <a href="#gallery">Proof</a>
        <a href="#estimate">Estimate</a>
      </nav>
    </header>
    <main>
      ${site.blocks.map(renderBlock).join("\n")}
    </main>
    <footer>
      <strong>${escapeHtml(site.title)}</strong><br />
      Internal NexTeam staging build. Custom domain and SSL are pending owner Cloudflare setup.
    </footer>
  </body>
</html>`;
}
