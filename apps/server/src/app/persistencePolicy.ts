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
  if (env.ALLOW_IN_MEMORY_PERSISTENCE?.trim().toLowerCase() === "true") {
    return;
  }
  throw new Error(
    `Durable persistence is required for ${unavailable.join(", ")}. `
      + "Set ALLOW_IN_MEMORY_PERSISTENCE=true only for an explicitly non-production runtime."
  );
}

/**
 * A named tenant is customer data.  It must never silently fall back to an
 * in-memory repository: doing so makes a healthy signed-in user appear to
 * have an empty business.  Test processes can still exercise memory-backed
 * fixtures by declaring NODE_ENV=test.
 */
export function assertTenantRuntimePersistence(
  env: NodeJS.ProcessEnv,
  durablePersistenceAvailable: boolean
): void {
  const tenantId = env.TENANT_ID?.trim();
  if (!tenantId || env.NODE_ENV === "test" || durablePersistenceAvailable) {
    return;
  }
  throw new Error(
    `Firebase durable persistence is required before starting the ${tenantId} tenant runtime. `
      + "Refusing to use an empty in-memory database for a customer tenant."
  );
}
