import { z } from "zod";
import type { NexiTool, Source, Tenant } from "@nexteam/core";
import { OpenWeatherMapProvider, type EvaporationWeatherProvider } from "../evaporation/weather.js";

const getCurrentTimeInputSchema = z.object({
  timezone: z.string().optional()
});

const getCurrentWeatherInputSchema = z.object({
  location: z.string().min(1)
});

const getDistanceInputSchema = z.object({
  destination: z.string().min(1),
  origin: z.string().min(1).optional()
});

export interface DistanceResult {
  origin: string;
  destination: string;
  driveMinutes: number;
  distanceMiles?: number | undefined;
  distanceText?: string | undefined;
  provider: "google_maps" | "heuristic";
}

export interface DistanceProvider {
  getDistance(input: { origin: string; destination: string }): Promise<DistanceResult>;
}

function source(ref: string, label: string): Source {
  return { rail: "native", ref, label };
}

function safeTimeZone(value: string | undefined): string {
  const candidate = value?.trim() || "America/New_York";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "America/New_York";
  }
}

function localTime(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(now);
}

function homeBaseAddress(env: NodeJS.ProcessEnv | undefined): string {
  return env?.AQUATRACE_HOME_BASE_ADDRESS
    || env?.TENANT_HOME_BASE_ADDRESS
    || env?.M6_PHYSICAL_ADDRESS
    || "102 Kate Lane, Bryson City, NC 28713";
}

function metersToMiles(meters: number): number {
  return Number((meters / 1609.344).toFixed(1));
}

export class HeuristicDistanceProvider implements DistanceProvider {
  async getDistance(input: { origin: string; destination: string }): Promise<DistanceResult> {
    return {
      origin: input.origin,
      destination: input.destination,
      driveMinutes: 30,
      provider: "heuristic"
    };
  }
}

export class GoogleMapsDistanceProvider implements DistanceProvider {
  constructor(private readonly apiKey: string, private readonly fetchFn: typeof fetch = fetch) {}

  async getDistance(input: { origin: string; destination: string }): Promise<DistanceResult> {
    const params = new URLSearchParams({
      origins: input.origin,
      destinations: input.destination,
      units: "imperial",
      key: this.apiKey
    });
    const response = await this.fetchFn(`https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`);
    const body = await response.json() as {
      rows?: Array<{ elements?: Array<{ status?: string; duration?: { value?: number; text?: string }; distance?: { value?: number; text?: string } }> }>;
    };
    const element = body.rows?.[0]?.elements?.[0];
    const seconds = element?.status === "OK" ? element.duration?.value : undefined;
    if (typeof seconds !== "number") {
      return new HeuristicDistanceProvider().getDistance(input);
    }
    const distanceValue = element?.distance?.value;
    const distanceText = element?.distance?.text;
    return {
      origin: input.origin,
      destination: input.destination,
      driveMinutes: Math.ceil(seconds / 60),
      ...(typeof distanceValue === "number" ? { distanceMiles: metersToMiles(distanceValue) } : {}),
      ...(distanceText ? { distanceText } : {}),
      provider: "google_maps"
    };
  }
}

function distanceProviderFromEnv(env: NodeJS.ProcessEnv | undefined): DistanceProvider {
  const apiKey = env?.GOOGLE_MAPS_API_KEY?.trim();
  return apiKey ? new GoogleMapsDistanceProvider(apiKey) : new HeuristicDistanceProvider();
}

export function createContextNexiTools(input: {
  env?: NodeJS.ProcessEnv | undefined;
  weatherProvider?: EvaporationWeatherProvider | undefined;
  distanceProvider?: DistanceProvider | undefined;
  now?: () => Date;
} = {}): NexiTool[] {
  return [
    {
      name: "getCurrentTime",
      description: "Return the current tenant-local date and time.",
      inputSchema: getCurrentTimeInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        const parsed = getCurrentTimeInputSchema.parse(args);
        const timezone = safeTimeZone(parsed.timezone ?? tenant.timezone);
        const now = input.now?.() ?? new Date();
        return {
          result: {
            timezone,
            iso: now.toISOString(),
            local: localTime(now, timezone)
          },
          sources: [source("current-time", "Current tenant-local time")]
        };
      }
    },
    {
      name: "getCurrentWeather",
      description: "Return the current weather for a city, ZIP code, or address using OpenWeather.",
      inputSchema: getCurrentWeatherInputSchema,
      handler: async (_tenant: Tenant, args: unknown) => {
        const parsed = getCurrentWeatherInputSchema.parse(args);
        const provider = input.weatherProvider ?? new OpenWeatherMapProvider(input.env ?? process.env);
        const weather = await provider.getWeather({ address: parsed.location });
        return {
          result: { location: parsed.location, current: weather.current },
          sources: [source("openweather-current", `Current weather for ${parsed.location}`)]
        };
      }
    },
    {
      name: "getDistance",
      description: "Return drive distance and drive time from the tenant home base or a provided origin to a destination.",
      inputSchema: getDistanceInputSchema,
      handler: async (_tenant: Tenant, args: unknown) => {
        const parsed = getDistanceInputSchema.parse(args);
        const origin = parsed.origin ?? homeBaseAddress(input.env);
        const provider = input.distanceProvider ?? distanceProviderFromEnv(input.env ?? process.env);
        const distance = await provider.getDistance({ origin, destination: parsed.destination });
        const sourceRef = distance.provider === "google_maps" ? "google-maps-distance" : "distance-heuristic";
        const sourceLabel =
          distance.provider === "google_maps"
            ? `Google Maps drive time from ${distance.origin} to ${distance.destination}`
            : `Estimated drive time from ${distance.origin} to ${distance.destination}`;
        return {
          result: distance,
          sources: [source(sourceRef, sourceLabel)]
        };
      }
    }
  ];
}
