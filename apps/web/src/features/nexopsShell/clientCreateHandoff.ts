/**
 * A client-profile Create action may only carry a client that is present in the
 * tenant-scoped client list already loaded by the workspace. This is UI
 * routing context, not a new relationship or an authorization decision.
 */
export function resolveClientScopedCreateId(selectedClientId: string, tenantClientIds: readonly string[]): string {
  return selectedClientId && tenantClientIds.includes(selectedClientId) ? selectedClientId : "";
}
