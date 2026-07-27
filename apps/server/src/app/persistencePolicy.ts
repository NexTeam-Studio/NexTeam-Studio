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
