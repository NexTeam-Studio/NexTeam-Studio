export const requiredDurableRepositories = ["ApprovalQueue", "Content", "Scheduling"] as const;

export type RequiredDurableRepository = (typeof requiredDurableRepositories)[number];

export function assertRequiredPersistence(
  env: NodeJS.ProcessEnv,
  availability: Readonly<Record<RequiredDurableRepository, boolean>>
): void {
  const unavailable = requiredDurableRepositories.filter((name) => !availability[name]);
  if (unavailable.length === 0) {
    return;
  }
  if (isExplicitIsolatedMemoryRuntime(env)) {
    return;
  }
  throw new Error(
    `Durable persistence is required for ${unavailable.join(", ")}. `
      + "Use ALLOW_IN_MEMORY_PERSISTENCE=true only with RUNTIME_MODE=isolated, NODE_ENV=test/development, and a local- or test- tenant ID."
  );
}

/**
 * A named tenant is customer data.  It must never silently fall back to an
 * in-memory repository: doing so makes a healthy signed-in user appear to
 * have an empty business.  Test processes can still exercise memory-backed
 * fixtures only when they explicitly identify an isolated local/test runtime.
 */
export function assertTenantRuntimePersistence(
  env: NodeJS.ProcessEnv,
  durablePersistenceAvailable: boolean
): void {
  const identity = inspectRuntimeIdentity(env, durablePersistenceAvailable);
  try {
    assertRuntimeIdentity(identity);
  } catch (error) {
    if (identity.tenantId && !durablePersistenceAvailable && !identity.isolatedMemoryMode) {
      throw new Error(`${error instanceof Error ? error.message : String(error)} Refusing to use an empty in-memory database for a customer tenant.`);
    }
    throw error;
  }
}
import { assertRuntimeIdentity, inspectRuntimeIdentity, isExplicitIsolatedMemoryRuntime } from "./runtimeIdentity.js";
