import { healthResponseSchema, type RailError } from "@nexteam/core";
import { CompanyCamAdapter, JobberAdapter } from "@nexteam/providers";

interface HealthRail {
  ok: boolean;
  configured: boolean;
  provider: string;
  op: string;
  latencyMs: number;
  status?: number;
  detail?: string;
}

async function timeRail(provider: string, op: string, configured: boolean, run: () => Promise<{ ok: boolean; detail: string }>): Promise<HealthRail> {
  const startedAt = Date.now();
  try {
    const result = await run();
    return {
      ok: result.ok,
      configured,
      provider,
      op,
      latencyMs: Date.now() - startedAt,
      detail: result.detail
    };
  } catch (error) {
    const maybeRail = error as Partial<RailError>;
    const status = typeof maybeRail.status === "number" ? maybeRail.status : 500;
    return {
      ok: false,
      configured,
      provider,
      op,
      latencyMs: Date.now() - startedAt,
      status,
      detail: error instanceof Error ? error.message : "Unknown health error"
    };
  }
}

export async function buildHealth(env: NodeJS.ProcessEnv = process.env): Promise<unknown> {
  const jobber = JobberAdapter.fromEnv(env);
  const companyCam = CompanyCamAdapter.fromEnv(env);
  const rails: Record<string, HealthRail> = {};

  rails.jobber = await timeRail("jobber", "graphql_read", jobber.isConfigured(), () => jobber.health());
  rails.companycam = await timeRail("companycam", "projects_read", companyCam.isConfigured(), () => companyCam.health());
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
