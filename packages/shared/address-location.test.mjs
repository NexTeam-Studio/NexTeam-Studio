import test from "node:test";
import assert from "node:assert/strict";
import {
  addressFromIntakeFields,
  addressStorageKey,
  formatAddress,
  formatNavigationAddress,
  mapGoogleGeocodeSuggestion,
  mapsHref,
  parseAddress,
  sanitizeAddressText
} from "./dist/addressLocation.js";

test("shared Address/Location parses, formats, and keys one canonical address contract", () => {
  const parsed = parseAddress("6020 frest dr seneca south carolina 29672 phone 8645550100");
  assert.deepEqual(parsed, {
    street1: "6020 Frest Dr",
    city: "Seneca",
    province: "SC",
    postalCode: "29672",
    country: "US"
  });
  assert.equal(sanitizeAddressText("6020 Frest Dr Seneca SC 29672 telephone 8645550100"), "6020 Frest Dr Seneca SC 29672");
  assert.equal(formatAddress(parsed), "6020 Frest Dr, Seneca, SC, 29672");
  assert.equal(formatNavigationAddress(parsed), "6020 Frest Dr, Seneca, SC 29672");
  assert.equal(addressStorageKey(parsed), addressStorageKey({ ...parsed, street1: "6020 FREST DR" }));
});

test("shared Address/Location builds intake and Google suggestion contracts", () => {
  assert.deepEqual(addressFromIntakeFields({
    property_street1: "6020 Frest Dr",
    property_city: "Seneca",
    property_province: "SC",
    property_postal_code: "29672"
  }), {
    street1: "6020 Frest Dr",
    city: "Seneca",
    province: "SC",
    postalCode: "29672",
    country: "US"
  });
  const suggestion = mapGoogleGeocodeSuggestion({
    formatted_address: "6020 Frest Dr, Seneca, SC 29672, USA",
    geometry: { location: { lat: 34.6851, lng: -82.9532 } },
    address_components: [
      { long_name: "6020", types: ["street_number"] },
      { long_name: "Frest Dr", types: ["route"] },
      { long_name: "Seneca", types: ["locality"] },
      { long_name: "South Carolina", short_name: "SC", types: ["administrative_area_level_1"] },
      { long_name: "29672", types: ["postal_code"] },
      { long_name: "United States", short_name: "US", types: ["country"] }
    ]
  });
  assert.equal(suggestion?.street1, "6020 Frest Dr");
  assert.equal(suggestion?.lat, 34.6851);
  assert.equal(suggestion?.country, "US");
});

test("shared Address/Location chooses the native mobile maps URL without owning UI", () => {
  assert.match(mapsHref("6020 Frest Dr", "Mozilla/5.0 (iPhone)"), /^https:\/\/maps\.apple\.com/);
  assert.match(mapsHref("6020 Frest Dr", "Mozilla/5.0 (Linux; Android 15)"), /^https:\/\/www\.google\.com\/maps/);
});
