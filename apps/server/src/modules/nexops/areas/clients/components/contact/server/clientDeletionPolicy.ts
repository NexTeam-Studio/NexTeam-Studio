import type { Client } from "@nexteam/core";

const IMPORTED_HISTORY_CLASSIFICATION = "imported_history";

/**
 * Imported customer history is never removed through NexTeam. A client with
 * no legacy provider identity is a NexTeam-native record and may be deleted
 * only after the route's linked-work checks succeed.
 */
export function isProtectedLegacyClient(client: Client): boolean {
  return Boolean(
    client.externalIds?.jobber
    || client.customFields?.recordClassification === IMPORTED_HISTORY_CLASSIFICATION
  );
}

export function legacyClientDeleteMessage(): string {
  return "Imported client history cannot be deleted. It can still be edited and used for new NexOps work.";
}

/** Preserve imported-history protection when an imported record is edited. */
export function preserveLegacyClientClassification(
  client: Client,
  nextCustomFields: Client["customFields"]
): Client["customFields"] {
  if (client.customFields?.recordClassification !== IMPORTED_HISTORY_CLASSIFICATION) {
    return nextCustomFields;
  }
  return {
    ...(nextCustomFields ?? {}),
    recordClassification: IMPORTED_HISTORY_CLASSIFICATION
  };
}
