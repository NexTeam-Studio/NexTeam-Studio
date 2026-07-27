import { RailError } from "@nexteam/core";
import { mapGoogleGeocodeSuggestion, type AddressSuggestion, type GoogleGeocodeResult } from "@nexteam/shared";

interface GoogleGeocodeResponse {
  status?: string | undefined;
  results?: GoogleGeocodeResult[] | undefined;
  error_message?: string | undefined;
}

export async function fetchAddressSuggestions(
  query: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<AddressSuggestion[]> {
  if (query.trim().length < 3 || !apiKey.trim()) {
    return [];
  }
  const params = new URLSearchParams({ address: query.trim(), key: apiKey.trim() });
  const response = await fetchFn(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);
  const body = await response.json() as GoogleGeocodeResponse;
  if (!response.ok) {
    throw new RailError(body.error_message ?? "Address suggestions are unavailable right now.", {
      provider: "native",
      op: "addressSuggestions",
      status: response.status
    });
  }
  if (body.status && !["OK", "ZERO_RESULTS"].includes(body.status)) {
    throw new RailError(body.error_message ?? `Google geocode returned ${body.status}.`, {
      provider: "native",
      op: "addressSuggestions",
      status: 502
    });
  }
  return (body.results ?? [])
    .map(mapGoogleGeocodeSuggestion)
    .filter((result): result is AddressSuggestion => Boolean(result))
    .slice(0, 5);
}
