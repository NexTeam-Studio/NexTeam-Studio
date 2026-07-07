import { RailError } from "@nexteam/core";
import type { ForecastSlot, WeatherSnapshot } from "./calculator.js";

export interface EvaporationWeatherProvider {
  getWeather(input: { address: string; zip?: string | undefined }): Promise<{ current: WeatherSnapshot; forecast: ForecastSlot[] }>;
}

interface OpenWeatherGeo {
  name?: string;
  state?: string;
  country?: string;
  lat?: number;
  lon?: number;
  zip?: string;
}

interface OpenWeatherCurrent {
  name?: string;
  coord?: { lat?: number; lon?: number };
  main?: { temp?: number; humidity?: number };
  wind?: { speed?: number };
}

interface OpenWeatherForecast {
  list?: Array<{
    dt?: number;
    main?: { temp?: number; humidity?: number };
    wind?: { speed?: number };
  }>;
  city?: { name?: string; coord?: { lat?: number; lon?: number } };
}

function openWeatherKey(env: NodeJS.ProcessEnv): string {
  const key = env.OPENWEATHER_API_KEY?.trim() || env.OPENWEATHERMAP_API_KEY?.trim();
  if (!key) {
    throw new RailError("OPENWEATHER_API_KEY is not configured in this runtime.", { provider: "native", op: "openWeather", status: 503 });
  }
  return key;
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function zipFromText(value: string): string | null {
  return value.match(/\b\d{5}\b/)?.[0] ?? null;
}

async function openWeatherJson<T>(url: URL): Promise<T> {
  const response = await fetch(url);
  const data = await response.json() as { message?: string };
  if (!response.ok) {
    throw new RailError(data.message ?? "OpenWeather request failed.", { provider: "native", op: "openWeather", status: response.status });
  }
  return data as T;
}

function weatherFromCurrent(data: OpenWeatherCurrent, fallbackCity: string, zip?: string | undefined): WeatherSnapshot {
  return {
    city: data.name || fallbackCity,
    airTempF: readNumber(data.main?.temp, 70),
    relativeHumidityPct: readNumber(data.main?.humidity, 50),
    windMph: readNumber(data.wind?.speed, 0),
    fetchedAt: new Date().toISOString(),
    ...(zip ? { zip } : {}),
    ...(typeof data.coord?.lat === "number" ? { lat: data.coord.lat } : {}),
    ...(typeof data.coord?.lon === "number" ? { lon: data.coord.lon } : {})
  };
}

function forecastFromResponse(data: OpenWeatherForecast): ForecastSlot[] {
  return (data.list ?? []).slice(0, 8).map((slot) => ({
    at: typeof slot.dt === "number" ? new Date(slot.dt * 1000).toISOString() : new Date().toISOString(),
    airTempF: readNumber(slot.main?.temp, 70),
    relativeHumidityPct: readNumber(slot.main?.humidity, 50),
    windMph: readNumber(slot.wind?.speed, 0)
  }));
}

export class OpenWeatherMapProvider implements EvaporationWeatherProvider {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  async getWeather(input: { address: string; zip?: string | undefined }): Promise<{ current: WeatherSnapshot; forecast: ForecastSlot[] }> {
    const key = openWeatherKey(this.env);
    const zip = input.zip ?? zipFromText(input.address);
    if (zip) {
      const currentUrl = new URL("https://api.openweathermap.org/data/2.5/weather");
      currentUrl.searchParams.set("zip", `${zip},us`);
      currentUrl.searchParams.set("appid", key);
      currentUrl.searchParams.set("units", "imperial");
      const forecastUrl = new URL("https://api.openweathermap.org/data/2.5/forecast");
      forecastUrl.searchParams.set("zip", `${zip},us`);
      forecastUrl.searchParams.set("appid", key);
      forecastUrl.searchParams.set("units", "imperial");
      forecastUrl.searchParams.set("cnt", "8");
      const [current, forecast] = await Promise.all([
        openWeatherJson<OpenWeatherCurrent>(currentUrl),
        openWeatherJson<OpenWeatherForecast>(forecastUrl)
      ]);
      return { current: weatherFromCurrent(current, zip, zip), forecast: forecastFromResponse(forecast) };
    }

    const geoUrl = new URL("https://api.openweathermap.org/geo/1.0/direct");
    geoUrl.searchParams.set("q", input.address);
    geoUrl.searchParams.set("limit", "1");
    geoUrl.searchParams.set("appid", key);
    const [geo] = await openWeatherJson<OpenWeatherGeo[]>(geoUrl);
    if (typeof geo?.lat !== "number" || typeof geo.lon !== "number") {
      throw new RailError("OpenWeather could not geocode that address.", { provider: "native", op: "openWeatherGeocode", status: 404 });
    }

    const currentUrl = new URL("https://api.openweathermap.org/data/2.5/weather");
    currentUrl.searchParams.set("lat", String(geo.lat));
    currentUrl.searchParams.set("lon", String(geo.lon));
    currentUrl.searchParams.set("appid", key);
    currentUrl.searchParams.set("units", "imperial");
    const forecastUrl = new URL("https://api.openweathermap.org/data/2.5/forecast");
    forecastUrl.searchParams.set("lat", String(geo.lat));
    forecastUrl.searchParams.set("lon", String(geo.lon));
    forecastUrl.searchParams.set("appid", key);
    forecastUrl.searchParams.set("units", "imperial");
    forecastUrl.searchParams.set("cnt", "8");
    const [current, forecast] = await Promise.all([
      openWeatherJson<OpenWeatherCurrent>(currentUrl),
      openWeatherJson<OpenWeatherForecast>(forecastUrl)
    ]);
    const fallbackCity = [geo.name, geo.state, geo.country].filter(Boolean).join(", ") || input.address;
    return { current: weatherFromCurrent(current, fallbackCity), forecast: forecastFromResponse(forecast) };
  }
}
