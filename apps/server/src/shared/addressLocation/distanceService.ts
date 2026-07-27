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

function metersToMiles(meters: number): number {
  return Number((meters / 1609.344).toFixed(1));
}

export class HeuristicDistanceProvider implements DistanceProvider {
  async getDistance(input: { origin: string; destination: string }): Promise<DistanceResult> {
    return { origin: input.origin, destination: input.destination, driveMinutes: 30, provider: "heuristic" };
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
      rows?: Array<{ elements?: Array<{
        status?: string | undefined;
        duration?: { value?: number | undefined; text?: string | undefined } | undefined;
        distance?: { value?: number | undefined; text?: string | undefined } | undefined;
      }> | undefined }> | undefined;
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

export function distanceProviderFromEnv(env: NodeJS.ProcessEnv | undefined): DistanceProvider {
  const apiKey = env?.GOOGLE_MAPS_API_KEY?.trim();
  return apiKey ? new GoogleMapsDistanceProvider(apiKey) : new HeuristicDistanceProvider();
}
