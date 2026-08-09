import type { PlatformSubscriptionPackage } from "@nexteam/core";

/** Temporary internal package. Its assignment is mandatory; its $0 price is not a future commercial promise. */
export const ALL_ACCESS_TEST_PACKAGE: PlatformSubscriptionPackage = {
  id: "all-access-test",
  version: "2026-08-09",
  name: "NexTeam All Access Test",
  priceCents: 0,
  currency: "USD",
  includedModules: ["nexi", "crm", "fielddocs", "scheduling", "content", "campaigns", "reputation", "comms", "voice", "platform", "evaporation", "seo", "sites"],
  active: true
};

export function activeSubscriptionPackages(): PlatformSubscriptionPackage[] {
  return [ALL_ACCESS_TEST_PACKAGE];
}
