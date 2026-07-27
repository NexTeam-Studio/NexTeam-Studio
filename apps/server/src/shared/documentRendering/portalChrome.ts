import { escapeDocumentHtml as escapeHtml } from "./htmlEngine.js";

export interface PortalNavLink {
  href: string;
  label: string;
  active?: boolean | undefined;
}

export interface PortalChromeOptions {
  badge?: string | undefined;
  title?: string | undefined;
  subtitle?: string | undefined;
  backHref?: string | undefined;
  backLabel?: string | undefined;
  navLinks?: PortalNavLink[] | undefined;
  statusMessage?: string | undefined;
}

export const NEXPORTAL_LOGO_SRC = "/assets/brand/nexportal-logo.png";

export function renderPortalChrome(chrome?: PortalChromeOptions | undefined): string {
  if (!chrome) return "";
  const links = (chrome.navLinks ?? [])
    .map((link) => `<a class="${link.active ? "active" : ""}" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`)
    .join("");
  return `<section class="portal-chrome">
    <div class="portal-chrome-head">
      <div class="portal-chrome-lockup">
        <img class="portal-chrome-product-mark" src="${NEXPORTAL_LOGO_SRC}" alt="NexPortal" />
        <div>
        ${chrome.badge ? `<p class="portal-chrome-badge">${escapeHtml(chrome.badge)}</p>` : ""}
        ${chrome.title ? `<h2>${escapeHtml(chrome.title)}</h2>` : ""}
        ${chrome.subtitle ? `<p class="portal-chrome-copy">${escapeHtml(chrome.subtitle)}</p>` : ""}
        </div>
      </div>
      ${chrome.backHref ? `<a class="portal-chrome-back" href="${escapeHtml(chrome.backHref)}">${escapeHtml(chrome.backLabel ?? "Back")}</a>` : ""}
    </div>
    ${links ? `<nav class="portal-chrome-nav" aria-label="Portal navigation">${links}</nav>` : ""}
    ${chrome.statusMessage ? `<p class="portal-chrome-status">${escapeHtml(chrome.statusMessage)}</p>` : ""}
  </section>`;
}

export function portalChromeStyles(): string {
  return `
    .portal-chrome { border: 1px solid rgba(16,32,39,.12); border-radius: 24px; background: rgba(255,255,255,.96); padding: 18px 20px; display: grid; gap: 14px; }
    .portal-chrome-head { display: flex; justify-content: space-between; gap: 16px; align-items: start; }
    .portal-chrome-lockup { display: inline-flex; align-items: center; gap: 14px; }
    .portal-chrome-product-mark { width: 136px; max-height: 38px; object-fit: contain; }
    .portal-chrome-badge { margin: 0 0 6px; color: #0b5860; font-size: .82rem; letter-spacing: .18em; text-transform: uppercase; }
    .portal-chrome-head h2 { margin: 0; font-size: 1.35rem; }
    .portal-chrome-copy { margin: 6px 0 0; color: #56747c; }
    .portal-chrome-back { align-self: center; text-decoration: none; border-radius: 999px; padding: 10px 14px; color: #0b5860; border: 1px solid rgba(7,120,118,.18); background: #eff8f8; font-weight: 700; }
    .portal-chrome-nav { display: flex; flex-wrap: wrap; gap: 10px; }
    .portal-chrome-nav a { text-decoration: none; color: #0b5860; border: 1px solid rgba(7,120,118,.18); background: #fff; border-radius: 999px; padding: 10px 14px; font-weight: 600; }
    .portal-chrome-nav a.active { background: #09d9e7; color: #072d34; border-color: transparent; }
    .portal-chrome-status { margin: 0; padding: 12px 14px; border-radius: 16px; background: rgba(9,217,231,.12); color: #0b5860; }
    .success-banner { border: 1px solid rgba(20,198,144,.24); background: rgba(20,198,144,.1); color: #0b6b52; border-radius: 20px; padding: 16px 18px; }
    .pay-form { display: grid; gap: 14px; margin-top: 18px; }
    .tip-presets { display: flex; flex-wrap: wrap; gap: 10px; }
    .tip-preset { border: 1px solid rgba(16,32,39,.14); border-radius: 999px; background: #fff; color: #15333a; padding: 8px 12px; font-weight: 600; cursor: pointer; }
    .tip-preset.active { background: rgba(9,217,231,.14); border-color: rgba(9,217,231,.28); color: #072d34; }
    .fine-print { margin: 0; color: #56747c; font-size: .92rem; }
  `;
}
