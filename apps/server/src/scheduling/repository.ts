import type { ID } from "@nexteam/core";
import type { ScheduledVisit } from "./schedulingEngine.js";

export interface SchedulingRepository {
  listVisits(tenantId: ID, range: { from?: string; to?: string }): Promise<ScheduledVisit[]>;
  saveVisit(visit: ScheduledVisit): Promise<ScheduledVisit>;
  getVisit(tenantId: ID, visitId: ID): Promise<ScheduledVisit | null>;
}

export class InMemorySchedulingRepository implements SchedulingRepository {
  private readonly visits = new Map<ID, ScheduledVisit>();

  async listVisits(tenantId: ID, range: { from?: string; to?: string } = {}): Promise<ScheduledVisit[]> {
    const from = range.from ? new Date(range.from) : null;
    const to = range.to ? new Date(range.to) : null;
    return [...this.visits.values()]
      .filter((visit) => visit.tenantId === tenantId)
      .filter((visit) => !from || new Date(visit.end) >= from)
      .filter((visit) => !to || new Date(visit.start) <= to)
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  async saveVisit(visit: ScheduledVisit): Promise<ScheduledVisit> {
    this.visits.set(visit.id, visit);
    return visit;
  }

  async getVisit(tenantId: ID, visitId: ID): Promise<ScheduledVisit | null> {
    const visit = this.visits.get(visitId);
    return visit?.tenantId === tenantId ? visit : null;
  }
}
