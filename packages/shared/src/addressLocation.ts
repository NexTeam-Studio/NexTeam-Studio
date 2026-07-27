export interface AddressCoordinates {
  lat: number;
  lng: number;
}

export interface Address extends AddressLike {
  street1: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

export interface AddressSuggestion extends Address, AddressCoordinates {
  label: string;
}

export interface AddressLike {
  street1?: string | undefined;
  street2?: string | undefined;
  city?: string | undefined;
  province?: string | undefined;
  postalCode?: string | undefined;
  country?: string | undefined;
}

export interface GoogleGeocodeResult {
  formatted_address?: string | undefined;
  geometry?: { location?: { lat?: number | undefined; lng?: number | undefined } | undefined } | undefined;
  address_components?: Array<{
    long_name?: string | undefined;
    short_name?: string | undefined;
    types?: string[] | undefined;
  }> | undefined;
}

const US_STATE_ABBREVIATIONS: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA",
  michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "district of columbia": "DC"
};

const STREET_SUFFIX_PATTERN = "(?:road|rd|drive|dr|lane|ln|street|st|avenue|ave|court|ct|trail|trl|way|circle|cir|boulevard|blvd|highway|hwy|place|pl|parkway|pkwy)";

export function formatAddress(address?: AddressLike | null): string {
  if (!address) {
    return "";
  }
  return [
    address.street1?.trim(),
    address.street2?.trim(),
    [address.city?.trim(), address.province?.trim(), address.postalCode?.trim()].filter(Boolean).join(", ")
  ].filter(Boolean).join(", ");
}

export function formatNavigationAddress(address?: AddressLike | null): string | undefined {
  if (!address) {
    return undefined;
  }
  const streetLine = [address.street1, address.street2].filter(Boolean).join(" ").trim();
  const locality = [address.city, address.province].filter(Boolean).join(", ").trim();
  const postalLine = [locality, address.postalCode].filter(Boolean).join(" ").trim();
  const country = address.country?.trim();
  return [streetLine, postalLine, country && country !== "US" && country !== "USA" ? country : ""]
    .filter(Boolean)
    .join(", ")
    .replace(/\s+/g, " ")
    .trim() || undefined;
}

export function addressStorageKey(address: AddressLike): string {
  return [address.street1, address.street2, address.city, address.province, address.postalCode, address.country]
    .map((value) => value?.trim().toLowerCase().replace(/[^a-z0-9]/g, "") ?? "")
    .join("|");
}

export function addressFromIntakeFields(
  fieldIndex: Record<string, unknown>,
  country = "US"
): Address | undefined {
  const value = (key: string): string => typeof fieldIndex[key] === "string" ? fieldIndex[key].trim() : "";
  const street1 = value("property_street1");
  const city = value("property_city");
  const province = value("property_province");
  const postalCode = value("property_postal_code");
  if (!street1 || !city || !province || !postalCode) {
    return undefined;
  }
  const street2 = value("property_street2");
  return { street1, ...(street2 ? { street2 } : {}), city, province, postalCode, country };
}

export function sanitizeAddressText(value: string): string {
  return value
    .replace(/\b(?:telephone|phone|mobile|cell|text|email|e-mail)\b[\s\S]*$/i, "")
    .replace(/(?:,?\s*(?:\+?1[\s.-]*)?(?:\(\d{3}\)|\d{3})[\s.-]*\d{3}[\s.-]*\d{4})\s*$/i, "")
    .replace(/[?.!]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeStateProvince(value: string): string | null {
  const normalized = value.trim().replace(/\./g, "").replace(/\s+/g, " ").toLowerCase();
  if (!normalized) {
    return null;
  }
  return /^[a-z]{2}$/i.test(normalized) ? normalized.toUpperCase() : (US_STATE_ABBREVIATIONS[normalized] ?? null);
}

function titleCaseAddressText(value: string): string {
  return value.toLowerCase().replace(/\b([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function parseTrailingStateAndPostalCode(value: string): { head: string; province: string; postalCode: string } | null {
  const zipMatch = value.match(/\s+(\d{5}(?:-\d{4})?)$/);
  const postalCode = zipMatch?.[1]?.trim() ?? "";
  const withoutZip = (zipMatch ? value.slice(0, zipMatch.index) : value).trim().replace(/,\s*$/, "");
  const candidates = Object.keys(US_STATE_ABBREVIATIONS)
    .concat(Object.values(US_STATE_ABBREVIATIONS))
    .sort((left, right) => right.length - left.length);
  const lower = withoutZip.toLowerCase();
  for (const candidate of candidates) {
    if (!lower.endsWith(` ${candidate.toLowerCase()}`) && lower !== candidate.toLowerCase()) {
      continue;
    }
    const province = normalizeStateProvince(candidate);
    const head = withoutZip.slice(0, withoutZip.length - candidate.length).trim().replace(/,\s*$/, "");
    if (province && head) {
      return { head, province, postalCode };
    }
  }
  return null;
}

export function parseAddress(value: string, country = "US"): Address | null {
  const sanitized = sanitizeAddressText(value);
  const explicit = sanitized.match(new RegExp(
    `^(.+?\\b${STREET_SUFFIX_PATTERN})\\.?,?\\s+([^,]+?),?\\s+([A-Za-z]{2}|[A-Za-z]+(?:\\s+[A-Za-z]+)*)(?:\\s+(\\d{5}(?:-\\d{4})?))?$`,
    "i"
  ));
  if (explicit) {
    const province = normalizeStateProvince(explicit[3]!);
    if (province) {
      return {
        street1: titleCaseAddressText(explicit[1]!.trim()),
        city: titleCaseAddressText(explicit[2]!.trim()),
        province,
        postalCode: explicit[4]?.trim() ?? "",
        country
      };
    }
  }
  const trailing = parseTrailingStateAndPostalCode(sanitized);
  if (!trailing) {
    return null;
  }
  const streetAndCity = trailing.head.match(new RegExp(`^(.+?\\b${STREET_SUFFIX_PATTERN})\\.?,?\\s+(.+)$`, "i"));
  if (!streetAndCity?.[1] || !streetAndCity[2]) {
    return null;
  }
  return {
    street1: titleCaseAddressText(streetAndCity[1].trim()),
    city: titleCaseAddressText(streetAndCity[2].trim().replace(/,\s*$/, "")),
    province: trailing.province,
    postalCode: trailing.postalCode,
    country
  };
}

function googleComponent(result: GoogleGeocodeResult, type: string, short = false): string {
  const match = result.address_components?.find((component) => component.types?.includes(type));
  return (short ? match?.short_name : match?.long_name) ?? "";
}

export function mapGoogleGeocodeSuggestion(result: GoogleGeocodeResult): AddressSuggestion | null {
  const street1 = [googleComponent(result, "street_number"), googleComponent(result, "route")].filter(Boolean).join(" ").trim();
  const city = googleComponent(result, "locality")
    || googleComponent(result, "postal_town")
    || googleComponent(result, "administrative_area_level_2");
  const province = googleComponent(result, "administrative_area_level_1", true);
  const postalCode = googleComponent(result, "postal_code");
  const country = googleComponent(result, "country", true) || googleComponent(result, "country");
  const lat = result.geometry?.location?.lat;
  const lng = result.geometry?.location?.lng;
  if (!street1 || !city || !province || !postalCode || !country || typeof lat !== "number" || typeof lng !== "number") {
    return null;
  }
  return {
    label: result.formatted_address ?? `${street1}, ${city}, ${province} ${postalCode}`,
    street1,
    city,
    province,
    postalCode,
    country,
    lat,
    lng
  };
}

export function mapsHref(address: string, userAgent = ""): string {
  const encoded = encodeURIComponent(address.trim());
  return /\b(iPhone|iPad|iPod)\b/i.test(userAgent)
    ? `https://maps.apple.com/?q=${encoded}`
    : `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}
