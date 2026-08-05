import { createCommsRailFromEnv } from "./comms/gmailRegistry.js";
import { getAdminDb } from "./firebase.js";
import { inspectRuntimeIdentity, type RuntimeIdentity } from "./app/runtimeIdentity.js";

interface HealthRail {
  ok: boolean;
  configured: boolean;
  provider: string;
  op: string;
  latencyMs: number;
  status?: number;
  detail?: string;
}



export async function buildHealth(
  env: NodeJS.ProcessEnv = process.env,
  runtime: RuntimeIdentity = inspectRuntimeIdentity(env, Boolean(getAdminDb(env)))
): Promise<{ ok: boolean; checkedAt: string; rails: Record<string, HealthRail>; runtime: RuntimeIdentity }> {
  const comms = createCommsRailFromEnv(env);
  const rails: Record<string, HealthRail> = {};
  const firebaseConfigured = runtime.crmRepositoryDriver === "firestore";

  rails.firebase = {
    ok: runtime.configurationStatus === "valid" && (runtime.isolatedMemoryMode || firebaseConfigured),
    configured: firebaseConfigured,
    provider: "firebase",
    op: "admin_persistence_configured_no_data_read",
    latencyMs: 0,
    detail: firebaseConfigured
      ? "Firebase Admin persistence is configured."
      : runtime.isolatedMemoryMode
        ? "Firebase Admin persistence is intentionally absent for this isolated memory runtime."
        : runtime.tenantId
        ? "Firebase Admin persistence is missing; tenant startup is blocked."
        : "Firebase Admin persistence is not configured for this non-customer runtime."
  };

  rails.comms = {
    ok: runtime.isolatedMemoryMode || comms.readAdapters.size > 0 || Boolean(comms.sendAdapter),
    configured: comms.readAdapters.size > 0 || Boolean(comms.sendAdapter),
    provider: "gmail",
    op: "configured_no_secret_values",
    latencyMs: 0,
    detail: `tenantId=${comms.tenantId}; readMailboxes=${comms.readAdapters.size}; sendConfigured=${Boolean(comms.sendAdapter)}; operatorEmailConfigured=${Boolean(comms.operatorEmail)}`
  };
  rails.anthropic = {
    ok: true,
    configured: Boolean(env.ANTHROPIC_API_KEY?.trim()),
    provider: "anthropic",
    op: "configured_no_spend",
    latencyMs: 0,
    detail: env.ANTHROPIC_API_KEY?.trim()
      ? "Configured; live message call skipped by no-spend overnight limit."
      : "Anthropic not configured; skipped."
  };

  return {
    ok: Object.values(rails).every((rail) => rail.ok),
    checkedAt: new Date().toISOString(),
    rails,
    runtime
  };
}
