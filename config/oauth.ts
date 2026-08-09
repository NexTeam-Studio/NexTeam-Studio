/** The only approved production callback host. Staging callbacks must never use this host. */
export const PRODUCTION_DOMAIN = "https://nexapp.nexteam.studio";
export const STAGING_DOMAIN = "https://nexstage.nexteam.studio";

export const OAUTH_CALLBACKS = {
  jobber: `${PRODUCTION_DOMAIN}/api/jobber/oauth/callback`,
  companycam: `${PRODUCTION_DOMAIN}/api/companycam/oauth/callback`,
  gbp: `${PRODUCTION_DOMAIN}/api/gbp/oauth/callback`,
  meta: `${PRODUCTION_DOMAIN}/api/meta/oauth/callback`
} as const;

export function assertOAuthCallback(provider: keyof typeof OAUTH_CALLBACKS, value: string): void {
  if (OAUTH_CALLBACKS[provider] !== value) {
    throw new Error(`OAuth callback mismatch for ${provider}: expected ${OAUTH_CALLBACKS[provider]}.`);
  }
}

