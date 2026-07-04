import { assertNoSecretsInDocument } from "../services/secretGuard.js";
import { assertSafeTenantId } from "../services/tenantPathUtils.js";
import {
  isHexColor,
  isIsoDateString,
  isNonEmptyString,
  isOptionalString,
  isPlainObject,
  isStringArray,
  isValidEmail,
  isValidPhone,
  isValidUrl,
  pushIfInvalid,
  uniqueStringList,
} from "./schemaUtils.js";

export const INTAKE_PACKET_DOCUMENT_TYPE = "tenant-intake-packet";
export const INTAKE_PACKET_STATUSES = {
  RECEIVED: "received",
  REVIEWED: "reviewed",
  NORMALIZED: "normalized",
  ARCHIVED: "archived",
};

function buildPacketId() {
  return `intake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @typedef {Object} RawIntakePacket
 * @property {string} documentType
 * @property {number} schemaVersion
 * @property {string} packetId
 * @property {string} tenantId
 * @property {string} submittedAt
 * @property {{channel: string, capturedBy: string, notes: string}} source
 * @property {Object} intake
 * @property {Object} meta
 */

export function createRawIntakePacket(overrides = {}) {
  const source = overrides.source || {};
  const intake = overrides.intake || {};
  const primaryContact = intake.primaryContact || {};
  const branding = intake.branding || {};
  const meta = overrides.meta || {};

  return {
    documentType: INTAKE_PACKET_DOCUMENT_TYPE,
    schemaVersion: 1,
    packetId: overrides.packetId || buildPacketId(),
    tenantId: overrides.tenantId || "tenant-required",
    submittedAt: overrides.submittedAt || new Date().toISOString(),
    source: {
      channel: source.channel || "operator",
      capturedBy: source.capturedBy || "system",
      notes: source.notes || "",
    },
    intake: {
      businessName: intake.businessName || "",
      currentUrl: intake.currentUrl || "",
      desiredUrl: intake.desiredUrl || "",
      primaryContact: {
        name: primaryContact.name || "",
        role: primaryContact.role || "",
        email: primaryContact.email || "",
        phone: primaryContact.phone || "",
      },
      emailProvider: intake.emailProvider || "",
      branding: {
        primaryColor: branding.primaryColor || "",
        secondaryColor: branding.secondaryColor || "",
        logoUrl: branding.logoUrl || "",
        headingFont: branding.headingFont || "",
        bodyFont: branding.bodyFont || "",
      },
      services: uniqueStringList(intake.services || []),
      targetCustomers: uniqueStringList(intake.targetCustomers || []),
      accountsToConnect: uniqueStringList(intake.accountsToConnect || []),
      competitors: uniqueStringList(intake.competitors || []),
      doRules: uniqueStringList(intake.doRules || []),
      dontRules: uniqueStringList(intake.dontRules || []),
      notes: intake.notes || "",
    },
    meta: {
      status: meta.status || INTAKE_PACKET_STATUSES.RECEIVED,
      submittedByUserId: meta.submittedByUserId || "",
      versionLabel: meta.versionLabel || "v1",
    },
  };
}

export function validateRawIntakePacket(packet) {
  const errors = [];

  try {
    assertNoSecretsInDocument(packet, "raw intake packet");
  } catch (error) {
    errors.push(error.message);
  }

  pushIfInvalid(errors, isPlainObject(packet), "Packet must be a plain object.");
  if (errors.length) return errors;

  pushIfInvalid(errors, packet.documentType === INTAKE_PACKET_DOCUMENT_TYPE, "Invalid intake packet documentType.");
  pushIfInvalid(errors, packet.schemaVersion === 1, "Unsupported intake packet schemaVersion.");
  pushIfInvalid(errors, isNonEmptyString(packet.packetId, 6), "packetId must be present.");
  pushIfInvalid(errors, isNonEmptyString(packet.tenantId, 3), "tenantId is required.");
  if (isNonEmptyString(packet.tenantId, 3)) {
    try {
      assertSafeTenantId(packet.tenantId);
    } catch (error) {
      errors.push(error.message);
    }
  }

  pushIfInvalid(errors, isIsoDateString(packet.submittedAt), "submittedAt must be an ISO-8601 string.");
  pushIfInvalid(errors, isPlainObject(packet.source), "source must be present.");
  pushIfInvalid(errors, isPlainObject(packet.intake), "intake must be present.");
  pushIfInvalid(errors, isPlainObject(packet.meta), "meta must be present.");
  if (errors.length) return errors;

  pushIfInvalid(errors, isNonEmptyString(packet.source.channel, 2), "source.channel is required.");
  pushIfInvalid(errors, isNonEmptyString(packet.source.capturedBy, 2), "source.capturedBy is required.");
  pushIfInvalid(errors, isOptionalString(packet.source.notes), "source.notes must be a string.");

  pushIfInvalid(errors, isNonEmptyString(packet.intake.businessName, 2), "intake.businessName is required.");
  pushIfInvalid(errors, isValidUrl(packet.intake.currentUrl, { allowEmpty: true }), "intake.currentUrl must be a valid URL.");
  pushIfInvalid(errors, isValidUrl(packet.intake.desiredUrl, { allowEmpty: true }), "intake.desiredUrl must be a valid URL.");
  pushIfInvalid(errors, isPlainObject(packet.intake.primaryContact), "intake.primaryContact must be present.");
  if (isPlainObject(packet.intake.primaryContact)) {
    const contact = packet.intake.primaryContact;
    pushIfInvalid(errors, isNonEmptyString(contact.name, 2), "intake.primaryContact.name is required.");
    pushIfInvalid(errors, isNonEmptyString(contact.role, 2), "intake.primaryContact.role is required.");
    pushIfInvalid(errors, isValidEmail(contact.email), "intake.primaryContact.email must be valid.");
    pushIfInvalid(errors, isValidPhone(contact.phone, { allowEmpty: true }), "intake.primaryContact.phone must be phone-like.");
  }
  pushIfInvalid(errors, isNonEmptyString(packet.intake.emailProvider, 2), "intake.emailProvider is required.");
  pushIfInvalid(errors, isPlainObject(packet.intake.branding), "intake.branding must be present.");
  if (isPlainObject(packet.intake.branding)) {
    const branding = packet.intake.branding;
    pushIfInvalid(errors, isHexColor(branding.primaryColor, { allowEmpty: true }), "intake.branding.primaryColor must be a #RRGGBB color.");
    pushIfInvalid(errors, isHexColor(branding.secondaryColor, { allowEmpty: true }), "intake.branding.secondaryColor must be a #RRGGBB color.");
    pushIfInvalid(errors, isValidUrl(branding.logoUrl, { allowEmpty: true }), "intake.branding.logoUrl must be a valid URL.");
    pushIfInvalid(errors, isOptionalString(branding.headingFont), "intake.branding.headingFont must be a string.");
    pushIfInvalid(errors, isOptionalString(branding.bodyFont), "intake.branding.bodyFont must be a string.");
  }

  pushIfInvalid(errors, isStringArray(packet.intake.services, { minItems: 1 }), "intake.services must contain at least one service.");
  pushIfInvalid(errors, isStringArray(packet.intake.targetCustomers, { minItems: 1 }), "intake.targetCustomers must contain at least one target customer.");
  pushIfInvalid(errors, isStringArray(packet.intake.accountsToConnect), "intake.accountsToConnect must be a string array.");
  pushIfInvalid(errors, isStringArray(packet.intake.competitors), "intake.competitors must be a string array.");
  pushIfInvalid(errors, isStringArray(packet.intake.doRules), "intake.doRules must be a string array.");
  pushIfInvalid(errors, isStringArray(packet.intake.dontRules), "intake.dontRules must be a string array.");
  pushIfInvalid(errors, isOptionalString(packet.intake.notes), "intake.notes must be a string.");

  pushIfInvalid(
    errors,
    Object.values(INTAKE_PACKET_STATUSES).includes(packet.meta.status),
    `meta.status must be one of: ${Object.values(INTAKE_PACKET_STATUSES).join(", ")}.`
  );
  pushIfInvalid(errors, isOptionalString(packet.meta.submittedByUserId), "meta.submittedByUserId must be a string.");
  pushIfInvalid(errors, isOptionalString(packet.meta.versionLabel), "meta.versionLabel must be a string.");

  return errors;
}

export function assertValidRawIntakePacket(packet) {
  const errors = validateRawIntakePacket(packet);
  if (errors.length) {
    throw new Error(`Invalid raw intake packet. ${errors.join(" ")}`);
  }
}
