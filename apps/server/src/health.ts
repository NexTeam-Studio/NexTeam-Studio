import { healthResponseSchema } from "@nexteam/core";
import { createCommsRailFromEnv } from "./comms/gmailRegistry.js";

interface HealthRail {
  ok: boolean;
  configured: boolean;
  provider: string;
  op: string;
  latencyMs: number;
  status?: number;
  detail?: string;
}



export async function buildHealth(env: NodeJS.ProcessEnv = process.env): Promise<unknown> {
  const comms = createCommsRailFromEnv(env);
  const rails: Record<string, HealthRail> = {};

  rails.comms = {
    ok: comms.readAdapters.size > 0 || Boolean(comms.sendAdapter),
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

  return healthResponseSchema.parse({
    ok: Object.values(rails).every((rail) => rail.ok),
    checkedAt: new Date().toISOString(),
    rails
  });
}
