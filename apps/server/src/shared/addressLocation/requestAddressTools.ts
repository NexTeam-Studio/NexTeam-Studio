import { parseAddress, sanitizeAddressText } from "@nexteam/core";

export function normalizedPhone(value: string): string {
  return value.replace(/\D+/g, "");
}

export function parseRequestAddress(value: string): { street1: string; city: string; province: string; postalCode: string } | null {
  const parsed = parseAddress(value);
  if (!parsed) {
    return null;
  }
  const {
    ...address
  } = parsed;
  return address;
}

export function sanitizeRequestAddress(value: string): string {
  return sanitizeAddressText(value);
}
