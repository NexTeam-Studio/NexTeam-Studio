export function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function isNonEmptyString(value, minLength = 1) {
  return typeof value === "string" && value.trim().length >= minLength;
}

export function isOptionalString(value) {
  return value == null || typeof value === "string";
}

export function isOptionalNonEmptyString(value, minLength = 1) {
  return value == null || isNonEmptyString(value, minLength);
}

export function isBoolean(value) {
  return typeof value === "boolean";
}

export function isStringArray(value, { minItems = 0 } = {}) {
  return (
    Array.isArray(value) &&
    value.length >= minItems &&
    value.every((entry) => typeof entry === "string" && entry.trim().length > 0)
  );
}

export function isIsoDateString(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

export function isValidUrl(value, { allowEmpty = false } = {}) {
  if (value == null || value === "") return allowEmpty;
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function isValidEmail(value, { allowEmpty = false } = {}) {
  if (value == null || value === "") return allowEmpty;
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidPhone(value, { allowEmpty = false } = {}) {
  if (value == null || value === "") return allowEmpty;
  return typeof value === "string" && /^[0-9+().\-\s]{7,}$/.test(value.trim());
}

export function isHexColor(value, { allowEmpty = false } = {}) {
  if (value == null || value === "") return allowEmpty;
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim());
}

export function pushIfInvalid(errors, condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

export function uniqueStringList(values = []) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}
