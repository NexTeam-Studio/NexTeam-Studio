export type IntakeSurface = "request" | "quote" | "job" | "visit" | "invoice";

export interface IntakeFieldVisibilityLike {
  request: boolean;
  quote: boolean;
  job: boolean;
  visit: boolean;
  invoice: boolean;
}

export interface IntakeFieldValueLike {
  key: string;
  label: string;
  value: string | number | boolean | string[];
  visibility: IntakeFieldVisibilityLike;
  group?: string | undefined;
  prominent?: boolean | undefined;
}

export interface IntakeSnapshotLike {
  narrative?: string | undefined;
  fieldValues: IntakeFieldValueLike[];
  fieldIndex: Record<string, string | number | boolean | string[]>;
}

export interface IntakeFact {
  key: string;
  label: string;
  text: string;
}

const ALWAYS_VISIBLE_KEYS = [
  "gate_code",
  "pet_present",
  "pet_name",
  "request_summary",
  "additional_information",
  "site_contact_name",
  "site_contact_phone",
  "site_contact_email",
  "referral_source",
  "promo_code",
  "pool_ground_type",
  "pool_residential_commercial",
  "pool_commercial_subtype",
  "pool_spa_integration",
  "pool_construction_type",
  "water_loss_rate"
] as const;

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function intakeFieldText(value: string | number | boolean | string[]): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value ?? "").trim();
}

export function visibleIntakeFields(
  snapshot: IntakeSnapshotLike | undefined,
  surface: IntakeSurface
): IntakeFieldValueLike[] {
  if (!snapshot) {
    return [];
  }
  return snapshot.fieldValues.filter((field) => field.visibility[surface]);
}

export function prominentIntakeFacts(
  snapshot: IntakeSnapshotLike | undefined,
  surface: IntakeSurface
): IntakeFact[] {
  if (!snapshot) {
    return [];
  }
  const visible = visibleIntakeFields(snapshot, surface);
  const facts: IntakeFact[] = [];
  if (snapshot.narrative?.trim()) {
    facts.push({
      key: "narrative",
      label: "Problem",
      text: compactText(snapshot.narrative)
    });
  }
  for (const field of visible) {
    if (!field.prominent && !ALWAYS_VISIBLE_KEYS.includes(field.key as (typeof ALWAYS_VISIBLE_KEYS)[number])) {
      continue;
    }
    const text = intakeFieldText(field.value);
    if (!text || text === "No") {
      continue;
    }
    facts.push({
      key: field.key,
      label: field.label,
      text: compactText(text)
    });
  }
  return dedupeFacts(facts);
}

export function intakeDetailFacts(
  snapshot: IntakeSnapshotLike | undefined,
  surface: IntakeSurface,
  limit = 8
): IntakeFact[] {
  if (!snapshot) {
    return [];
  }
  const facts = visibleIntakeFields(snapshot, surface)
    .map((field) => ({
      key: field.key,
      label: field.label,
      text: compactText(intakeFieldText(field.value))
    }))
    .filter((fact) => fact.text.length > 0 && fact.text !== "No");
  return dedupeFacts(facts).slice(0, limit);
}

function dedupeFacts(facts: IntakeFact[]): IntakeFact[] {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const signature = `${fact.key}:${fact.text}`;
    if (seen.has(signature)) {
      return false;
    }
    seen.add(signature);
    return true;
  });
}
