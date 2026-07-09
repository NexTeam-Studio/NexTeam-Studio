import { gbpReviewInputSchema, type GbpReviewInput } from "./schemas.js";

export interface GbpPollResult {
  configured: boolean;
  reviews: GbpReviewInput[];
  blocker?: string | undefined;
  provider: "gbp" | "gbp-fixture" | "not-configured";
}

export interface GbpReviewProvider {
  pollReviews(tenantId: string): Promise<GbpPollResult>;
}

function parseFixtureReviews(value: string | undefined): GbpReviewInput[] {
  if (!value?.trim()) {
    return [];
  }
  const parsed = JSON.parse(value) as unknown;
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  return entries.map((entry) => gbpReviewInputSchema.parse(entry) as GbpReviewInput);
}

export class EnvGbpReviewProvider implements GbpReviewProvider {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  async pollReviews(_tenantId: string): Promise<GbpPollResult> {
    const fixtureReviews = parseFixtureReviews(this.env.M7_GBP_REVIEW_FIXTURE_JSON);
    if (fixtureReviews.length > 0) {
      return { configured: false, reviews: fixtureReviews, provider: "gbp-fixture" };
    }

    const hasOAuthShape = Boolean(
      this.env.GBP_OAUTH_CLIENT_ID
      && this.env.GBP_OAUTH_CLIENT_SECRET
      && this.env.GBP_REFRESH_TOKEN
      && this.env.GBP_ACCOUNT_ID
      && this.env.GBP_LOCATION_ID
    );
    if (!hasOAuthShape) {
      return {
        configured: false,
        reviews: [],
        provider: "not-configured",
        blocker: "GBP OAuth credentials and location identifiers are not configured in staging."
      };
    }

    return {
      configured: true,
      reviews: [],
      provider: "gbp",
      blocker: "GBP review polling adapter is ready for the owner OAuth credential pass, but live review fetch remains receipt-blocked until GBP OAuth is confirmed."
    };
  }
}
