import { logger } from "@nexteam/core";
import type { SelfRepairService } from "./service.js";

const HOUR_MS = 60 * 60 * 1000;

function enabled(env: NodeJS.ProcessEnv): boolean {
  return env.SELF_REPAIR_HOURLY_ENABLED?.trim().toLowerCase() === "true";
}

/**
 * Opt-in server-side quality review. Each pass looks only at records added
 * since the preceding successful pass, so the owner does not get duplicate
 * findings from the same conversation every hour.
 */
export class HourlySelfRepairScheduler {
  private timer: NodeJS.Timeout | undefined;
  private lastCheckedAt: string | undefined;

  constructor(private readonly deps: {
    service: SelfRepairService;
    tenantId: string;
    env?: NodeJS.ProcessEnv | undefined;
    now?: () => string;
    reportEmail?: string | undefined;
  }) {}

  start(): boolean {
    if (this.timer || !enabled(this.deps.env ?? process.env)) return false;
    void this.tick().catch((error: unknown) => {
      logger.error({ error }, "Hourly self-repair review failed");
    });
    const nextHour = new Date();
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);
    this.timer = setTimeout(() => this.beginHourlyCycle(), nextHour.getTime() - Date.now());
    this.timer.unref();
    return true;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async tick(): Promise<void> {
    const through = (this.deps.now ?? (() => new Date().toISOString()))();
    const recent = await this.deps.service.listLogs(this.deps.tenantId, 1);
    const since = this.lastCheckedAt ?? recent[0]?.windowEnd ?? recent[0]?.createdAt;
    await this.deps.service.run({
      tenantId: this.deps.tenantId,
      ...(since ? { since } : {}),
      through,
      ...(this.deps.reportEmail ? { ownerEmail: this.deps.reportEmail } : {}),
      deliverReport: true
    });
    this.lastCheckedAt = through;
  }

  private beginHourlyCycle(): void {
    void this.tick().catch((error: unknown) => {
      logger.error({ error }, "Hourly self-repair review failed");
    });
    this.timer = setInterval(() => {
      void this.tick().catch((error: unknown) => {
        logger.error({ error }, "Hourly self-repair review failed");
      });
    }, HOUR_MS);
    this.timer.unref();
  }
}
