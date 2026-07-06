import type { Address, Visit } from "@nexteam/core";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface ScheduleLocation {
  label: string;
  address?: Address | undefined;
  geo?: GeoPoint | undefined;
}

export interface ScheduledVisit extends Visit {
  title: string;
  location: ScheduleLocation;
  status: "scheduled" | "pending_approval" | "complete";
}

export interface SlotSearchInput {
  tenantId: string;
  jobId: string;
  title: string;
  location: ScheduleLocation;
  from: string;
  to: string;
  durationMinutes: number;
  existingVisits: ScheduledVisit[];
  technicians?: string[] | undefined;
}

export interface SlotSuggestion {
  start: string;
  end: string;
  driveMinutes: number;
  conflictCount: number;
  reasoning: string[];
  previousVisitId?: string | undefined;
  nextVisitId?: string | undefined;
}

export interface DriveTimeProvider {
  estimateMinutes(origin: ScheduleLocation, destination: ScheduleLocation): Promise<number>;
}

function dateAtLocalHour(day: Date, hour: number): Date {
  const next = new Date(day);
  next.setUTCHours(hour, 0, 0, 0);
  return next;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && startB < endA;
}

function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

function visitStart(visit: ScheduledVisit): Date {
  return new Date(visit.start);
}

function visitEnd(visit: ScheduledVisit): Date {
  return new Date(visit.end);
}

function nearbyVisits(visits: ScheduledVisit[], start: Date): ScheduledVisit[] {
  return visits
    .filter((visit) => sameDay(visitStart(visit), start))
    .sort((a, b) => visitStart(a).getTime() - visitStart(b).getTime());
}

function nearestBefore(visits: ScheduledVisit[], start: Date): ScheduledVisit | undefined {
  return [...visits].reverse().find((visit) => visitEnd(visit) <= start);
}

function nearestAfter(visits: ScheduledVisit[], end: Date): ScheduledVisit | undefined {
  return visits.find((visit) => visitStart(visit) >= end);
}

function haversineMiles(a: GeoPoint, b: GeoPoint): number {
  const radiusMiles = 3958.8;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radiusMiles * Math.asin(Math.sqrt(h));
}

export class HeuristicDriveTimeProvider implements DriveTimeProvider {
  async estimateMinutes(origin: ScheduleLocation, destination: ScheduleLocation): Promise<number> {
    if (origin.geo && destination.geo) {
      return Math.max(10, Math.round(haversineMiles(origin.geo, destination.geo) / 45 * 60));
    }
    return 30;
  }
}

export class GoogleMapsDriveTimeProvider implements DriveTimeProvider {
  constructor(private readonly apiKey: string, private readonly fetchFn: typeof fetch = fetch) {}

  async estimateMinutes(origin: ScheduleLocation, destination: ScheduleLocation): Promise<number> {
    const originText = locationQuery(origin);
    const destinationText = locationQuery(destination);
    if (!originText || !destinationText) {
      return new HeuristicDriveTimeProvider().estimateMinutes(origin, destination);
    }
    const params = new URLSearchParams({
      origins: originText,
      destinations: destinationText,
      units: "imperial",
      key: this.apiKey
    });
    const response = await this.fetchFn(`https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`);
    const body = await response.json() as {
      rows?: Array<{ elements?: Array<{ status?: string; duration?: { value?: number } }> }>;
    };
    const seconds = body.rows?.[0]?.elements?.[0]?.duration?.value;
    return typeof seconds === "number" ? Math.ceil(seconds / 60) : new HeuristicDriveTimeProvider().estimateMinutes(origin, destination);
  }
}

export function driveTimeProviderFromEnv(env: NodeJS.ProcessEnv = process.env, fetchFn: typeof fetch = fetch): DriveTimeProvider {
  return env.GOOGLE_MAPS_API_KEY ? new GoogleMapsDriveTimeProvider(env.GOOGLE_MAPS_API_KEY, fetchFn) : new HeuristicDriveTimeProvider();
}

function locationQuery(location: ScheduleLocation): string {
  if (location.address) {
    return [
      location.address.street1,
      location.address.city,
      location.address.province,
      location.address.postalCode
    ].filter(Boolean).join(", ");
  }
  if (location.geo) {
    return `${location.geo.lat},${location.geo.lng}`;
  }
  return location.label;
}

async function scoreSlot(input: SlotSearchInput, start: Date, driveTimeProvider: DriveTimeProvider): Promise<SlotSuggestion> {
  const end = addMinutes(start, input.durationMinutes);
  const dayVisits = nearbyVisits(input.existingVisits, start);
  const conflicts = dayVisits.filter((visit) => overlaps(start, end, visitStart(visit), visitEnd(visit)));
  const previous = nearestBefore(dayVisits, start);
  const next = nearestAfter(dayVisits, end);
  const previousDrive = previous ? await driveTimeProvider.estimateMinutes(previous.location, input.location) : 0;
  const nextDrive = next ? await driveTimeProvider.estimateMinutes(input.location, next.location) : 0;
  const driveMinutes = previousDrive + nextDrive;
  const reasoning = [
    conflicts.length === 0 ? "No calendar conflict in this slot." : `${conflicts.length} overlapping visit(s) would need review.`,
    previous ? `Drive from previous visit ${previous.title}: ${previousDrive} min.` : "No previous same-day drive leg.",
    next ? `Drive to next visit ${next.title}: ${nextDrive} min.` : "No next same-day drive leg."
  ];
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    driveMinutes,
    conflictCount: conflicts.length,
    reasoning,
    previousVisitId: previous?.id,
    nextVisitId: next?.id
  };
}

export async function suggestSlots(input: SlotSearchInput, driveTimeProvider: DriveTimeProvider): Promise<SlotSuggestion[]> {
  const from = new Date(input.from);
  const to = new Date(input.to);
  const suggestions: SlotSuggestion[] = [];
  for (let day = dateAtLocalHour(from, 8); day <= to; day = addMinutes(day, 24 * 60)) {
    for (let slot = new Date(day); slot < dateAtLocalHour(day, 17); slot = addMinutes(slot, 30)) {
      const end = addMinutes(slot, input.durationMinutes);
      if (end > dateAtLocalHour(day, 17) || slot < from || end > to) {
        continue;
      }
      suggestions.push(await scoreSlot(input, slot, driveTimeProvider));
    }
  }
  return suggestions
    .sort((a, b) => a.conflictCount - b.conflictCount || a.driveMinutes - b.driveMinutes || a.start.localeCompare(b.start))
    .slice(0, 5);
}

export function detectConflicts(visits: ScheduledVisit[], candidate: Pick<ScheduledVisit, "start" | "end" | "assignedTo">): ScheduledVisit[] {
  const start = new Date(candidate.start);
  const end = new Date(candidate.end);
  const assigned = new Set(candidate.assignedTo);
  return visits.filter((visit) =>
    visit.assignedTo.some((tech) => assigned.has(tech))
    && overlaps(start, end, visitStart(visit), visitEnd(visit))
  );
}
