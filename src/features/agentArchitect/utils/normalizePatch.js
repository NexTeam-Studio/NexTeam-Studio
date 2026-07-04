const ARRAY_FIELDS = new Set(["existing_tools", "agent_recommendation", "missingFields"]);

function normalizeString(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function normalizeArray(value) {
  const list = Array.isArray(value) ? value : [value];
  const normalized = list
    .map((item) => normalizeString(item))
    .filter(Boolean);

  return normalized.length ? [...new Set(normalized)] : undefined;
}

export function normalizePatch(patch = {}) {
  if (!patch || typeof patch !== "object") return {};

  return Object.fromEntries(
    Object.entries(patch)
      .map(([key, value]) => {
        if (ARRAY_FIELDS.has(key)) {
          return [key, normalizeArray(value)];
        }

        if (typeof value === "string") {
          return [key, normalizeString(value)];
        }

        return [key, value];
      })
      .filter(([, value]) => value !== undefined && value !== null)
  );
}
