import { z } from "zod";
import type { NexiTool, Source, Tenant } from "@nexteam/core";
import { OpenWeatherMapProvider, type EvaporationWeatherProvider } from "../evaporation/weather.js";

const getCurrentTimeInputSchema = z.object({
  timezone: z.string().optional()
});

const getCurrentWeatherInputSchema = z.object({
  location: z.string().min(1)
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

export function createContextNexiTools(input: {
  env?: NodeJS.ProcessEnv | undefined;
  weatherProvider?: EvaporationWeatherProvider | undefined;
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
    }
  ];
}
