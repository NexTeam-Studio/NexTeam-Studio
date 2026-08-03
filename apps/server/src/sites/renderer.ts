import type { GeneratedSite, SiteBlock } from "./schemas.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function galleryImageSrc(item: Extract<SiteBlock, { type: "gallery" }>["items"][number]): string | null {
  if (item.thumbRef.startsWith("/api/media/")) {
    return item.thumbRef;
  }
  if (/^\d{6,}$/.test(item.mediaId)) {
    return `/api/media/${encodeURIComponent(item.mediaId)}`;
  }
  return null;
}

function renderHero(block: Extract<SiteBlock, { type: "hero" }>) {
  return `
    <section class="hero">
      <div class="hero-copy">
        ${block.eyebrow?.trim() ? `<p class="eyebrow">${escapeHtml(block.eyebrow)}</p>` : ""}
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
    <section class="section"${block.id === "services" ? " id=\"services\"" : ""}>
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

function renderContact(block: Extract<SiteBlock, { type: "contact" }>) {
  const phoneHref = `tel:${block.phone.replace(/[^+\d]/g, "")}`;
  return `
    <section class="section contact" id="contact">
      <div>
        <p class="eyebrow">Contact</p>
        <h2>${escapeHtml(block.heading)}</h2>
        <p>${escapeHtml(block.intro)}</p>
      </div>
      <div class="contact-actions">
        <a class="button" href="${escapeHtml(phoneHref)}">Call ${escapeHtml(block.phone)}</a>
        ${block.email ? `<a class="button button-light" href="mailto:${escapeHtml(block.email)}">Email ${escapeHtml(block.email)}</a>` : ""}
        ${block.website ? `<a class="button button-light" href="${escapeHtml(block.website)}" target="_blank" rel="noopener noreferrer">Visit ${escapeHtml(block.website.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>` : ""}
      </div>
    </section>`;
}

function renderServiceArea(block: Extract<SiteBlock, { type: "service_area_map" }>) {
  return `
    <section class="section split">
      <div>
        <p class="eyebrow">Service Area</p>
        <h2>${escapeHtml(block.heading)}</h2>
        <p>Based near ${escapeHtml(block.center)}, serving homes, businesses, and property managers across:</p>
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
        <p class="eyebrow">Our Work</p>
        <h2>${escapeHtml(block.heading)}</h2>
      </div>
      <div class="gallery">
        ${block.items.map((item) => {
          const src = galleryImageSrc(item);
          return `
          <figure>
            ${src
              ? `<img class="photo-tile real-photo" src="${escapeHtml(src)}" alt="${escapeHtml(item.caption)}" loading="lazy" data-media-id="${escapeHtml(item.mediaId)}" />`
              : `<div class="photo-tile" data-media-id="${escapeHtml(item.mediaId)}">${escapeHtml(item.caption.slice(0, 1))}</div>`}
            <figcaption>${escapeHtml(item.caption)}</figcaption>
          </figure>`;
        }).join("")}
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

function renderLeadForm(block: Extract<SiteBlock, { type: "lead_form" }>, site: Omit<GeneratedSite, "html">) {
  return `
    <section class="section lead" id="estimate">
      <div>
        <p class="eyebrow">Get Started</p>
        <h2>${escapeHtml(block.heading)}</h2>
        <p>${escapeHtml(block.intro)}</p>
      </div>
      <form method="post" action="${escapeHtml(block.action)}">
        <label>Name <input name="name" autocomplete="name" required /></label>
        <label>Email <input name="email" type="email" autocomplete="email" /></label>
        <label>Phone <input name="phone" autocomplete="tel" /></label>
        <label>City <input name="city" autocomplete="address-level2" /></label>
        <label>How can we help? <textarea name="message" required></textarea></label>
        <input type="hidden" name="consent.email" value="true" />
        <button type="submit">${site.theme === "pressure_washing" ? "Request an estimate" : "Request leak help"}</button>
      </form>
    </section>`;
}

function textFromBlocks(site: Omit<GeneratedSite, "html">): {
  services: Extract<SiteBlock, { type: "services" }>["services"];
  areas: string[];
  center: string;
} {
  const services = site.blocks.find((block): block is Extract<SiteBlock, { type: "services" }> => block.type === "services")?.services ?? [];
  const serviceArea = site.blocks.find((block): block is Extract<SiteBlock, { type: "service_area_map" }> => block.type === "service_area_map");
  return {
    services,
    areas: serviceArea?.areas ?? [],
    center: serviceArea?.center ?? ""
  };
}

function jsonLdScript(site: Omit<GeneratedSite, "html">): string {
  const extracted = textFromBlocks(site);
  const localBusiness = {
    "@type": "LocalBusiness",
    "@id": `${site.internalUrl}#business`,
    name: site.title,
    url: site.internalUrl,
    areaServed: extracted.areas.map((area) => ({ "@type": "City", name: area })),
    address: extracted.center ? { "@type": "PostalAddress", addressLocality: extracted.center } : undefined
  };
  const services = extracted.services.map((service) => ({
    "@type": "Service",
    "@id": `${site.internalUrl}#service-${service.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    name: service.name,
    description: service.description,
    provider: { "@id": `${site.internalUrl}#business` },
    areaServed: extracted.areas
  }));
  const graph = {
    "@context": "https://schema.org",
    "@graph": [localBusiness, ...services]
  };
  return JSON.stringify(graph).replace(/</g, "\\u003c");
}

function renderBlock(block: SiteBlock, site: Omit<GeneratedSite, "html">) {
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
      return renderLeadForm(block, site);
    case "contact":
      return renderContact(block);
  }
}

function renderPressureWashingSite(site: Omit<GeneratedSite, "html">) {
  const hero = site.blocks.find((block): block is Extract<SiteBlock, { type: "hero" }> => block.type === "hero");
  const services = site.blocks.find((block): block is Extract<SiteBlock, { type: "services" }> => block.type === "services" && block.id === "services")?.services ?? [];
  const packages = site.blocks.find((block): block is Extract<SiteBlock, { type: "services" }> => block.type === "services" && block.id === "packages")?.services ?? [];
  const area = site.blocks.find((block): block is Extract<SiteBlock, { type: "service_area_map" }> => block.type === "service_area_map");
  const serviceAreas = area?.areas ?? [];
  const badges = site.blocks.find((block): block is Extract<SiteBlock, { type: "compliance_badges" }> => block.type === "compliance_badges")?.badges ?? [];
  const contact = site.blocks.find((block): block is Extract<SiteBlock, { type: "contact" }> => block.type === "contact");
  const logo = hero?.imageSrc;
  const favicon = hero?.faviconSrc ?? logo;
  const logoAlt = hero?.imageAlt ?? `${site.title} logo`;
  const phone = contact?.phone ?? hero?.proofPoints.find((point) => /\d{3}/.test(point)) ?? "";
  const phoneHref = `tel:${phone.replace(/[^+\d]/g, "")}`;
  const email = contact?.email;
  const website = contact?.website;
  const logoMarkup = logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(logoAlt)}" width="1200" height="600" />` : `<strong>${escapeHtml(site.title)}</strong>`;
  const serviceIcon = (index: number) => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16M7 17v-4l5-7 5 7v4M9 17h6M12 6v11"/><circle cx="18" cy="6" r="2"/></svg>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Owens Bluewater Wash | Exterior Cleaning &amp; Pressure Washing</title>
  <meta name="description" content="Owens Bluewater Wash provides professional house washing, roof soft washing, driveway cleaning, gutter cleaning, commercial washing, and exterior cleaning services. Call 864-934-7278 for an estimate." />
  <meta property="og:title" content="Owens Bluewater Wash | Exterior Cleaning &amp; Pressure Washing" />
  <meta property="og:description" content="Cleaner surfaces. Better impressions." />
  ${logo ? `<meta property="og:image" content="${escapeHtml(logo)}" />` : ""}
  ${favicon ? `<link rel="icon" href="${escapeHtml(favicon)}" />` : ""}
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "HomeAndConstructionBusiness", name: site.title, telephone: phone, url: website, description: "Professional residential and commercial exterior cleaning.", makesOffer: services.map((service) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: service.name } })) }).replace(/</g, "\\u003c")}</script>
  <style>
    :root { --color-navy-950:#030B14; --color-navy-900:#06172B; --color-navy-800:#0A2947; --color-navy-700:#0C3B68; --color-blue-700:#004F9E; --color-blue-600:#0068C9; --color-blue-500:#008FE8; --color-blue-400:#14B8FF; --color-blue-300:#62D4FF; --color-white:#fff; --color-ice:#EAF7FF; --color-silver-100:#EEF3F7; --color-silver-300:#C3CFDA; --color-silver-500:#8797A6; --color-charcoal:#111820; --color-black:#05080C; --color-warning:#F3B51B; --brand:linear-gradient(135deg,#004F9E 0%,#008FE8 55%,#14B8FF 100%); --dark:linear-gradient(135deg,#030B14 0%,#06172B 52%,#0A2947 100%); }
    *{box-sizing:border-box} html{scroll-behavior:smooth} body{margin:0;color:var(--color-navy-950);font-family:Inter,Arial,Helvetica,sans-serif;background:#f5fafd} a{color:inherit} .shell{width:min(1240px,calc(100% - 48px));margin:auto}.site-header{position:sticky;top:0;z-index:20;background:rgba(3,11,20,.97);border-bottom:1px solid rgba(255,255,255,.1);box-shadow:0 8px 30px rgba(0,0,0,.16)}.header-row{min-height:92px;display:flex;align-items:center;justify-content:space-between;gap:24px}.logo-link{display:block;line-height:0}.logo-link img{display:block;width:220px;height:82px;object-fit:contain;object-position:left center}.main-nav{display:flex;align-items:center;gap:26px}.main-nav a{font-weight:600;color:var(--color-silver-100);text-decoration:none}.main-nav a:hover{color:var(--color-blue-300)}.header-call,.button{min-height:52px;display:inline-flex;align-items:center;justify-content:center;padding:0 28px;border-radius:10px;background:var(--brand);color:#fff;text-decoration:none;font-weight:800;border:0;box-shadow:0 9px 28px rgba(0,143,232,.27);transition:transform .2s ease,filter .2s ease}.header-call:hover,.button:hover{transform:translateY(-2px);filter:brightness(1.1)}.menu-button{display:none;min-width:48px;min-height:48px;border:1px solid rgba(255,255,255,.25);border-radius:9px;background:transparent;color:#fff;font-size:1.45rem}.hero{background:var(--dark);color:#fff;overflow:hidden;position:relative}.hero::before{content:"";position:absolute;inset:auto -10% -25% 42%;height:600px;background:radial-gradient(ellipse,rgba(0,143,232,.32),transparent 62%);pointer-events:none}.hero-grid{min-height:670px;display:grid;grid-template-columns:1.05fr .95fr;gap:48px;align-items:center;position:relative}.eyebrow{margin:0 0 14px;color:var(--color-blue-300);font-size:.82rem;font-weight:800;letter-spacing:.16em}.hero h1,.section-heading h2,.contact-copy h2{margin:0;font-family:"Barlow Condensed","Arial Narrow",Impact,sans-serif;text-transform:uppercase;font-weight:800;letter-spacing:-.02em;line-height:.88}.hero h1{font-size:clamp(3rem,7vw,6.25rem);max-width:8ch}.hero-copy>p:not(.eyebrow){font-size:clamp(1rem,1.4vw,1.2rem);line-height:1.55;max-width:58ch;color:var(--color-silver-300);margin:24px 0}.hero-actions{display:flex;flex-wrap:wrap;gap:14px}.button.secondary{background:transparent;border:2px solid var(--color-blue-400);box-shadow:none}.button.secondary:hover{background:var(--color-blue-300);color:var(--color-navy-950)}.trust-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:26px}.trust-row span{border-left:2px solid var(--color-blue-500);padding-left:10px;color:var(--color-silver-100);font-size:.9rem;font-weight:700}.hero-logo{display:grid;place-items:center;min-height:340px}.hero-logo img{display:block;width:min(100%,560px);height:auto;object-fit:contain;filter:drop-shadow(0 22px 32px rgba(0,0,0,.44))}.section{padding:112px 0}.section-heading{max-width:760px;margin-bottom:38px}.section-heading h2,.contact-copy h2{font-size:clamp(2.4rem,5vw,4.25rem)}.section-heading>p:not(.eyebrow){line-height:1.55;color:#435463}.service-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.service-card{background:#fff;border:1px solid #d7e3ec;border-radius:18px;padding:28px;min-height:254px;display:flex;flex-direction:column;align-items:flex-start;box-shadow:0 14px 35px rgba(3,11,20,.05);transition:transform .2s ease,box-shadow .2s ease}.service-card:hover{transform:translateY(-4px);box-shadow:0 22px 42px rgba(3,11,20,.11)}.service-card.has-photo{position:relative;isolation:isolate;overflow:hidden;color:var(--color-white);background:var(--color-navy-900);border-color:rgba(98,212,255,.56)}.service-card.has-photo::before{content:"";position:absolute;inset:0;z-index:-2;background:var(--service-photo) center/cover no-repeat}.service-card.has-photo::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(135deg,rgba(3,11,20,.94),rgba(6,23,43,.7))}.service-card.has-photo p{color:var(--color-silver-100)}.service-card.has-photo .price{color:var(--color-white);text-shadow:0 2px 8px rgba(0,0,0,.65)}.service-card.has-photo .service-icon{color:var(--color-white);background:rgba(0,79,158,.7);border:1px solid rgba(255,255,255,.22)}.service-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:10px;background:var(--color-ice);color:var(--color-blue-500);margin-bottom:20px}.service-icon svg{width:24px;height:24px}.service-card h3{margin:0;font-family:"Barlow Condensed","Arial Narrow",Impact,sans-serif;font-size:clamp(1.55rem,2.3vw,2rem);line-height:1.05}.service-card p{color:#526270;font-size:.94rem;line-height:1.5;margin:10px 0 18px}.price{margin-top:auto;color:var(--color-blue-600);font-weight:800;font-size:1.25rem}.fine-print{margin:26px 0 0;color:#657585;font-size:.93rem;line-height:1.5}.packages{background:var(--dark);color:#fff}.packages .section-heading>p:not(.eyebrow){color:var(--color-silver-300)}.package-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:stretch}.package-card{position:relative;border:1px solid rgba(20,184,255,.72);border-radius:20px;padding:30px;background:rgba(10,41,71,.65);display:flex;flex-direction:column}.package-card:nth-child(3){transform:translateY(-10px);background:linear-gradient(180deg,rgba(0,79,158,.65),rgba(6,23,43,.92))}.best-value{position:absolute;top:-13px;right:20px;border-radius:999px;background:var(--color-warning);color:var(--color-navy-950);padding:6px 11px;font-size:.72rem;font-weight:800;letter-spacing:.06em}.package-card h3{margin:0;font-family:"Barlow Condensed","Arial Narrow",Impact,sans-serif;font-size:2rem}.package-price{font-weight:800;color:var(--color-blue-300);font-size:2rem;margin:14px 0}.package-card ul{padding-left:19px;line-height:1.75;color:var(--color-silver-100);flex:1}.package-card .button{margin-top:16px}.area-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.audience-card{background:#fff;border:1px solid #d7e3ec;border-radius:18px;padding:28px}.audience-card h3{font-family:"Barlow Condensed","Arial Narrow",Impact,sans-serif;font-size:1.8rem;margin:0 0 8px}.audience-card p{margin:0;color:#526270;line-height:1.5}.tag-list{display:flex;flex-wrap:wrap;gap:10px;margin-top:26px}.tag-list span{background:var(--color-ice);border:1px solid #c9e8fa;border-radius:999px;padding:10px 14px;color:var(--color-navy-800);font-size:.9rem;font-weight:700}.contact{background:var(--dark);color:#fff}.contact-grid{display:grid;grid-template-columns:1fr auto;gap:36px;align-items:center}.contact-copy>p:not(.eyebrow){color:var(--color-silver-300);line-height:1.55;max-width:55ch}.contact-actions{display:flex;flex-wrap:wrap;gap:14px}.button.light{background:transparent;border:2px solid var(--color-blue-400);box-shadow:none}.footer{background:var(--color-navy-950);color:var(--color-silver-300);padding:64px 0 92px}.footer-grid{display:grid;grid-template-columns:1fr auto;gap:32px;align-items:start}.footer-logo img{display:block;width:210px;height:110px;object-fit:contain;object-position:left center}.footer p{margin:12px 0;line-height:1.55}.footer a{color:#fff;text-decoration:none}.footer nav{display:grid;gap:10px;text-align:right}.copyright{margin-top:34px;color:var(--color-silver-500);font-size:.85rem}.mobile-call{display:none}@media(max-width:900px){.main-nav{gap:16px}.header-call{padding:0 18px}}@media(max-width:760px){.shell{width:min(100% - 44px,1240px)}.header-row{min-height:76px}.logo-link img{width:165px;height:62px}.menu-button{display:grid;place-items:center}.main-nav{position:absolute;top:76px;left:0;right:0;display:none;flex-direction:column;align-items:stretch;background:#06172b;padding:18px 22px 24px;border-bottom:1px solid rgba(255,255,255,.1)}.main-nav.is-open{display:flex}.main-nav a{padding:12px 0}.main-nav .header-call{display:inline-flex}.header-row>.header-call{display:none}.hero-grid{min-height:620px;grid-template-columns:1fr;gap:20px;padding:70px 0 62px}.hero-logo{min-height:0;order:-1}.hero-logo img{width:min(100%,320px)}.hero h1{font-size:clamp(3rem,14vw,3.7rem)}.section{padding:78px 0}.service-grid,.package-grid,.area-grid,.contact-grid,.footer-grid{grid-template-columns:1fr}.service-card{min-height:0}.package-card:nth-child(3){transform:none}.footer nav{text-align:left;grid-template-columns:1fr 1fr}.mobile-call{display:flex;position:fixed;z-index:19;left:16px;right:16px;bottom:16px;min-height:54px;border-radius:10px;background:var(--brand);color:#fff;text-decoration:none;align-items:center;justify-content:center;font-weight:800;box-shadow:0 12px 28px rgba(0,79,158,.35)}body{padding-bottom:76px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*:before,*:after{transition:none!important;animation:none!important}}
    .hero .eyebrow { color: var(--color-white); }
    .service-card.has-photo::after { background: linear-gradient(135deg, rgba(3,11,20,.7), rgba(6,23,43,.52)); }
  </style>
</head>
<body id="top">
  <header class="site-header"><div class="shell header-row"><a class="logo-link" href="#top" aria-label="Owens Bluewater Wash home">${logoMarkup}</a><button class="menu-button" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open menu">☰</button><nav class="main-nav" id="site-nav"><a href="#services">Services</a><a href="#packages">Packages</a><a href="#service-area">Service Area</a><a href="#contact">Contact</a><a class="header-call" href="${escapeHtml(phoneHref)}">Call ${escapeHtml(phone)}</a></nav><a class="header-call" href="${escapeHtml(phoneHref)}">Call ${escapeHtml(phone)}</a></div></header>
  <main>
    <section class="hero"><div class="shell hero-grid"><div class="hero-copy">${hero?.eyebrow?.trim() ? `<p class="eyebrow">${escapeHtml(hero.eyebrow)}</p>` : ""}<h1>${escapeHtml(hero?.headline ?? "Tough work. Clean results.")}</h1><p>${escapeHtml(hero?.subhead ?? "Professional residential and commercial exterior cleaning.")}</p><div class="hero-actions"><a class="button" href="${escapeHtml(phoneHref)}">Call for an Estimate</a><a class="button secondary" href="#services">View Services</a></div><div class="trust-row">${(hero?.proofPoints ?? []).slice(0,3).map((point) => `<span>${escapeHtml(point)}</span>`).join("")}</div></div><div class="hero-logo">${logoMarkup}</div></div></section>
    <section class="section" id="services"><div class="shell"><div class="section-heading"><p class="eyebrow">Services</p><h2>Exterior Cleaning That Makes the Whole Property Look Cared For</h2><p>Professional exterior cleaning for residential and commercial properties, from the driveway to the roofline.</p></div><div class="service-grid">${services.map((service, index) => `<article class="service-card${service.backgroundImage ? " has-photo" : ""}"${service.backgroundImage ? ` style="--service-photo:url('${escapeHtml(service.backgroundImage)}')"` : ""}><span class="service-icon">${serviceIcon(index)}</span><h3>${escapeHtml(service.name)}</h3><p>${escapeHtml(service.description)}</p><strong class="price">${escapeHtml(service.startingAt ?? "Call for pricing")}</strong></article>`).join("")}</div><p class="fine-print">Starting prices may vary based on property size, surface condition, accessibility, and the services requested. Final pricing is confirmed after reviewing the project.</p></div></section>
    <section class="packages" id="packages"><div class="shell section"><div class="section-heading"><p class="eyebrow">Package Deals</p><h2>Popular Exterior Cleaning Packages</h2><p>Bundle the work that makes the biggest visual difference.</p></div><div class="package-grid">${packages.map((pack, index) => { const items = pack.description.split(/\s+and\s+|,\s*/).filter(Boolean); return `<article class="package-card">${index === 2 ? '<span class="best-value">BEST VALUE</span>' : ""}<h3>${escapeHtml(pack.name)}</h3><strong class="package-price">${escapeHtml(pack.startingAt ?? "")}</strong><ul>${items.map((item) => `<li>${escapeHtml(item.replace(/\.$/, ""))}</li>`).join("")}</ul><a class="button" href="${escapeHtml(phoneHref)}">Call to Book</a></article>`; }).join("")}</div></div></section>
    <section class="section" id="service-area"><div class="shell"><div class="section-heading"><p class="eyebrow">Service Area</p><h2>A Cleaner Property Starts With One Good Call</h2><p>Owens Bluewater Wash serves homeowners, businesses, property managers, and commercial properties throughout its local service region.</p></div><div class="area-grid"><article class="audience-card"><h3>Residential Properties</h3><p>Exterior cleaning that helps your home look well cared for.</p></article><article class="audience-card"><h3>Commercial Properties</h3><p>Professional cleaning for businesses, storefronts, and exterior surfaces.</p></article><article class="audience-card"><h3>Property Managers</h3><p>Clear, dependable service for the properties you oversee.</p></article></div>${serviceAreas.length ? `<div class="tag-list" aria-label="Service counties">${serviceAreas.map((place) => `<span>${escapeHtml(place)}</span>`).join("")}</div>` : ""}<div class="tag-list" aria-label="Services available">${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}</div></div></section>
    <section class="contact" id="contact"><div class="shell section contact-grid"><div class="contact-copy"><p class="eyebrow">Contact</p><h2>${escapeHtml(contact?.heading ?? "Ready for a Cleaner Property?")}</h2><p>${escapeHtml(contact?.intro ?? `Call ${phone} to talk through your project and request an estimate.`)}</p></div><div class="contact-actions"><a class="button" href="${escapeHtml(phoneHref)}">Call ${escapeHtml(phone)}</a>${email ? `<a class="button light" href="mailto:${escapeHtml(email)}">Email Us</a>` : ""}${website ? `<a class="button light" href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer">Visit ${escapeHtml(website.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>` : ""}</div></div></section>
  </main>
  <footer class="footer"><div class="shell"><div class="footer-grid"><div><a class="footer-logo" href="#top" aria-label="Owens Bluewater Wash home">${logoMarkup}</a><p><strong>${escapeHtml(site.title)}</strong><br />Cleaner surfaces. Better impressions.</p><p><a href="${escapeHtml(phoneHref)}">${escapeHtml(phone)}</a><br />${email ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a><br />` : ""}${website ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(website.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>` : ""}</p></div><nav aria-label="Footer navigation"><a href="#services">Services</a><a href="#packages">Packages</a><a href="#service-area">Service Area</a><a href="#contact">Contact</a></nav></div><p class="copyright">© ${new Date().getFullYear()} ${escapeHtml(site.title)}. All rights reserved.</p></div></footer>
  <a class="mobile-call" href="${escapeHtml(phoneHref)}">Call ${escapeHtml(phone)} for an Estimate</a>
  <script>const button=document.querySelector('.menu-button'),nav=document.querySelector('.main-nav');button?.addEventListener('click',()=>{const open=nav.classList.toggle('is-open');button.setAttribute('aria-expanded',String(open));button.textContent=open?'×':'☰'});nav?.querySelectorAll('a').forEach((link)=>link.addEventListener('click',()=>{nav.classList.remove('is-open');button?.setAttribute('aria-expanded','false');if(button)button.textContent='☰'}));</script>
</body></html>`;
}

export function renderStaticSite(site: Omit<GeneratedSite, "html">) {
  if (site.theme === "pressure_washing") {
    return renderPressureWashingSite(site);
  }
  const description = "Swimming pool leak detection, pressure testing, dye testing, and field documentation.";
  const themeCss = `--ink: #14231f; --deep: #0f393d; --water: #4eb8c7; --foam: #effaf8; --sand: #efe2c8; --coral: #d56a4a; --card: rgba(255, 255, 255, 0.82);`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(site.title)}</title>
    <meta name="description" content="${description}" />
    <script type="application/ld+json">${jsonLdScript(site)}</script>
    <style>
      :root {
        ${themeCss}
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
      .brand { font-weight: 900; letter-spacing: 0.045em; text-transform: uppercase; }
      .hero {
        min-height: 72vh;
        display: grid;
        grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.7fr);
        gap: 34px;
        align-items: center;
        padding: 54px 0 76px;
      }
      .hero-copy::after { content: ""; display: block; width: 128px; height: 5px; margin-top: 30px; border-radius: 999px; background: linear-gradient(90deg, var(--water), var(--coral)); }
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
      .split, .lead, .contact { display: grid; grid-template-columns: 0.85fr 1.15fr; gap: 24px; align-items: start; }
      .contact-actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
      .button-light { background: white; color: var(--deep); border: 2px solid var(--deep); }
      .map-card, form { padding: 24px; display: flex; flex-wrap: wrap; gap: 10px; }
      .photo-tile {
        width: 100%;
        min-height: 190px;
        border-radius: 26px;
        display: grid;
        place-items: center;
        color: white;
        font-size: 4rem;
        font-weight: 900;
        background: linear-gradient(135deg, var(--deep), var(--water));
      }
      .real-photo { height: 220px; object-fit: cover; }
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
        .hero, .split, .lead, .contact, .cards, .gallery, .reviews { grid-template-columns: 1fr; }
        .proof-card { transform: none; }
      }
    </style>
  </head>
  <body>
    <header>
      <div class="brand">${escapeHtml(site.title)}</div>
      <nav>
        <a href="#services">Services</a>
        ${site.blocks.some((block) => block.type === "gallery") ? `<a href="#gallery">Proof</a>` : ""}
        <a href="#estimate">Estimate</a>
      </nav>
    </header>
    <main>
      ${site.blocks.map((block) => renderBlock(block, site)).join("\n")}
    </main>
    <footer>
      <strong>${escapeHtml(site.title)}</strong><br />
      Clear answers. Better next steps.
    </footer>
  </body>
</html>`;
}
