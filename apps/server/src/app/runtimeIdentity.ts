export type CrmRepositoryDriver = "firestore" | "memory";
export type RuntimeConfigurationStatus = "valid" | "invalid";

export interface RuntimeIdentity {
  environment: string;
  tenantId: string | null;
  crmRepositoryDriver: CrmRepositoryDriver;
  configurationStatus: RuntimeConfigurationStatus;
  missingRequiredVariables: string[];
  isolatedMemoryMode: boolean;
}

const isolatedEnvironmentNames = new Set(["development", "test"]);

function hasFirebaseAdminConfiguration(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.FIREBASE_SERVICE_ACCOUNT?.trim()) || Boolean(
    env.FIREBASE_ADMIN_PROJECT_ID?.trim()
      && env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim()
      && env.FIREBASE_ADMIN_PRIVATE_KEY?.trim()
  );
}

export function isExplicitIsolatedMemoryRuntime(env: NodeJS.ProcessEnv): boolean {
  const tenantId = env.TENANT_ID?.trim() ?? "";
  return env.ALLOW_IN_MEMORY_PERSISTENCE?.trim().toLowerCase() === "true"
    && env.RUNTIME_MODE?.trim().toLowerCase() === "isolated"
    && isolatedEnvironmentNames.has(env.NODE_ENV?.trim().toLowerCase() ?? "")
    && /^(local|test)-/.test(tenantId);
}

export function inspectRuntimeIdentity(
  env: NodeJS.ProcessEnv,
  durablePersistenceAvailable = hasFirebaseAdminConfiguration(env)
): RuntimeIdentity {
  const tenantId = env.TENANT_ID?.trim() || null;
  const isolatedMemoryMode = !durablePersistenceAvailable && isExplicitIsolatedMemoryRuntime(env);
  const missingRequiredVariables: string[] = [];

  if (!tenantId) {
    missingRequiredVariables.push("TENANT_ID");
  }
  if (!durablePersistenceAvailable && !isolatedMemoryMode) {
    missingRequiredVariables.push(
      "FIREBASE_SERVICE_ACCOUNT",
      "FIREBASE_ADMIN_PROJECT_ID",
      "FIREBASE_ADMIN_CLIENT_EMAIL",
      "FIREBASE_ADMIN_PRIVATE_KEY"
    );
  }

  return {
    environment: env.NODE_ENV?.trim() || "unknown",
    tenantId,
    crmRepositoryDriver: durablePersistenceAvailable ? "firestore" : "memory",
    configurationStatus: missingRequiredVariables.length === 0 ? "valid" : "invalid",
    missingRequiredVariables,
    isolatedMemoryMode
  };
}

export function assertRuntimeIdentity(identity: RuntimeIdentity): void {
  if (identity.configurationStatus === "valid") {
    return;
  }
  throw new Error(`Durable persistence is required. Required runtime configuration is missing: ${identity.missingRequiredVariables.join(", ")}.`);
}
