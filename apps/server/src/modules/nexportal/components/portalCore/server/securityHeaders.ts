import type { Response } from "express";

/**
 * Portal pages can be reached from one-time links. Keep their contents and
 * their original link out of browser caches and downstream referrers.
 */
export function applyPortalSecurityHeaders(response: Pick<Response, "setHeader">): void {
  response.setHeader("cache-control", "no-store, private");
  response.setHeader("pragma", "no-cache");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
}
