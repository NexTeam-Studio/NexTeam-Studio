import { z } from "zod";
import type { NexiTool, Source, Tenant } from "@nexteam/core";
import { OpenWeatherMapProvider, type EvaporationWeatherProvider } from "../evaporation/weather.js";
import { distanceProviderFromEnv, type DistanceProvider } from "../shared/addressLocation/distanceService.js";
export {
  GoogleMapsDistanceProvider,
  HeuristicDistanceProvider
} from "../shared/addressLocation/distanceService.js";
export type { DistanceProvider, DistanceResult } from "../shared/addressLocation/distanceService.js";

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
  return env?.TENANT_HOME_BASE_ADDRESS
    || env?.TENANT_HOME_BASE_ADDRESS
    || env?.M6_PHYSICAL_ADDRESS
    || "102 Kate Lane, Fair Play, SC 29643";
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
      description: "Return drive distance and drive time from a provided origin, or the tenant home base when no origin is supplied, to a destination.",
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
