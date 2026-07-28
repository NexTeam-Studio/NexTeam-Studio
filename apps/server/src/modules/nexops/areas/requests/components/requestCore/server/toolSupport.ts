import type { ServiceRequest, Source } from "@nexteam/core";
import type { z } from "zod";
import { availableRequestFields } from "./requestFoundation.js";
import type { createRequestToolInputSchema } from "./toolSchemas.js";

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function requestQueryValue(request: ServiceRequest, key: string): string | number | boolean | string[] | undefined {
  return request.intake.fieldIndex[key];
}

export function findRequestFieldLabel(key: string): string {
  return availableRequestFields().find((field) => field.key === key)?.label ?? key;
}

export function requestFieldText(request: ServiceRequest, key: string): string | undefined {
  const value = requestQueryValue(request, key);
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) return value.length ? value.join(", ") : undefined;
  return typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
}

export function requestSource(ref: string, label: string): Source {
  return { rail: "native", ref, label };
}

function simplifiedRequestQuery(value: string): string {
  return value
    .replace(/[?.!]+$/g, " ")
    .replace(/\b(?:is|what|tell|show|me|the|details?|request|pool|spa|gate|code|pet|name|combo|only|plus|and|or|losing|daily|water|loss)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function requestMatchesQuery(request: ServiceRequest, query: string): boolean {
  const needles = [normalized(query), normalized(simplifiedRequestQuery(query))].filter(Boolean);
  return !needles.length || [
    request.clientName,
    request.subject,
    request.email,
    request.phone,
    request.narrative,
    ...request.intake.fieldValues.map((field) => `${field.label} ${String(field.value)}`)
  ].filter(Boolean).map((value) => normalized(String(value)))
    .some((value) => needles.some((needle) => value.includes(needle)));
}

function parseLooseCreateRequestInput(text: string): z.input<typeof createRequestToolInputSchema> {
  const email = text.match(/\b[\w.+-]+@[\w.-]+\.\w+\b/)?.[0];
  const phone = text.match(/(?:\+?1[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}\b/)?.[0];
  const clientName = text.match(/\b(?:create|add|new)\s+(?:a\s+)?request\s+for\s+(.+?)(?=\s+(?:at|phone|email|pool|gate|pet|losing|issue|because|summary)\b|[.!?]|$)/i)?.[1]?.trim().replace(/[,\s]+$/g, "");
  const explicitAddress = text.match(/\b(\d+\s+[a-z0-9.' -]+,\s*[^,]+,\s*[a-z]{2}\s+\d{5}(?:-\d{4})?)\b/i)?.[1]?.trim();
  const address = explicitAddress ?? text.match(/\bat\s+(.+?)(?=\s+(?:phone|email|pool|gate|pet|losing|issue|summary)\b|[.!?]|$)/i)?.[1]?.trim();
  const poolConfiguration = /\b(?:pool\s*\+\s*spa|pool\s+and\s+spa|pool\/spa|combo)\b/i.test(text)
    ? "pool_and_spa"
    : /\bspa\s+only\b/i.test(text) ? "spa_only" : /\bpool\s+only\b/i.test(text) ? "pool_only" : undefined;
  const poolType = text.match(/\b(vinyl|fiberglass|gunite|plaster|commercial|residential|custom)\b/i)?.[1]?.toLowerCase();
  const gateCode = text.match(/\bgate\s+code\s+(?:is|=|:)?\s*([a-z0-9-]+)/i)?.[1];
  const petName = text.match(/\bpet\s+(?:name\s+is|named)\s+([a-z0-9' -]+)/i)?.[1]?.trim();
  const petPresent = /\bpet\b/i.test(text) ? true : undefined;
  const waterLossRate = text.match(/\b(?:losing|loss(?:ing)?\s+about|water\s+loss(?:\s+is)?)\s+(.+?)(?=\s+(?:a\s+day|daily|per\s+day)\b|[.!?]|$)/i)?.[1]?.trim();
  return {
    rawText: text,
    ...(clientName ? { clientName } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(address ? { address } : {}),
    ...(poolConfiguration ? { poolConfiguration } : {}),
    ...(poolType ? { poolType } : {}),
    ...(gateCode ? { gateCode } : {}),
    ...(petPresent !== undefined ? { petPresent } : {}),
    ...(petName ? { petName } : {}),
    ...(waterLossRate ? { waterLossRate } : {}),
    issueSummary: text.trim()
  };
}

export function mergedCreateRequestInput(input: z.infer<typeof createRequestToolInputSchema>): z.infer<typeof createRequestToolInputSchema> {
  const loose = input.rawText.trim() ? parseLooseCreateRequestInput(input.rawText) : { rawText: input.rawText };
  return {
    rawText: input.rawText.trim() || loose.rawText || "",
    clientName: input.clientName ?? loose.clientName,
    email: input.email ?? loose.email,
    phone: input.phone ?? loose.phone,
    address: input.address ?? loose.address,
    poolConfiguration: input.poolConfiguration ?? loose.poolConfiguration,
    poolType: input.poolType ?? loose.poolType,
    gateCode: input.gateCode ?? loose.gateCode,
    petPresent: input.petPresent ?? loose.petPresent,
    petName: input.petName ?? loose.petName,
    waterLossRate: input.waterLossRate ?? loose.waterLossRate,
    issueSummary: input.issueSummary ?? loose.issueSummary
  };
}
