export const LIVE_DOMAIN = "https://nexteam-studio-production.up.railway.app";

export const OAUTH_CALLBACKS = {
  jobber: `${LIVE_DOMAIN}/api/jobber/oauth/callback`,
  companycam: `${LIVE_DOMAIN}/api/companycam/oauth/callback`,
  gbp: `${LIVE_DOMAIN}/api/gbp/oauth/callback`,
  meta: `${LIVE_DOMAIN}/api/meta/oauth/callback`
} as const;

export function assertOAuthCallback(provider: keyof typeof OAUTH_CALLBACKS, value: string): void {
  if (OAUTH_CALLBACKS[provider] !== value) {
    throw new Error(`OAuth callback mismatch for ${provider}: expected ${OAUTH_CALLBACKS[provider]}.`);
  }
}

