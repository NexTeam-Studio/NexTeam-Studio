import type { CrmClient } from "../../../../nexopsShell/contracts/workspaceContracts";

type ClientWithImportMetadata = CrmClient & {
  externalIds?: Record<string, string>;
};

const IMPORTED_HISTORY_CLASSIFICATION = "imported_history";

export function isProtectedLegacyClient(client: ClientWithImportMetadata): boolean {
  return Boolean(
    client.externalIds?.jobber
    || client.customFields?.recordClassification === IMPORTED_HISTORY_CLASSIFICATION
  );
}

export function protectedLegacyClientDeleteMessage(): string {
  return "Imported client history cannot be deleted. It can still be edited and used for new NexOps work.";
}
