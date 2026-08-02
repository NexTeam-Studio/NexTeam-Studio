import { quoteSchema, type Quote } from "@nexteam/core";

type LegacyQuoteRecord = Record<string, unknown>;

const legacyApprovalRules = {
  requireSignature: true,
  requireDeposit: false,
  requireCardOnFile: false
};

function stringValue(record: LegacyQuoteRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

/**
 * Converts the former signed quote state into the current client-approved
 * lifecycle state while retaining the historical signer and signature facts.
 */
export function legacyQuoteCompatibilityPatch(record: LegacyQuoteRecord): LegacyQuoteRecord | null {
  if (record.status !== "signed") {
    return null;
  }

  const signedAt = stringValue(record, "signedAt");
  const signedBy = stringValue(record, "signedBy");
  const signatureIp = stringValue(record, "signatureIp");
  const portalTokenHash = stringValue(record, "portalTokenHash");

  return {
    status: "approved",
    ...(record.approvalRules ? {} : { approvalRules: legacyApprovalRules }),
    ...(stringValue(record, "approvedAt") || !signedAt ? {} : { approvedAt: signedAt }),
    ...(stringValue(record, "approvedBy") || !signedBy ? {} : { approvedBy: signedBy }),
    ...(record.approvedByRole ? {} : { approvedByRole: "client" }),
    ...(record.signature || !signedAt ? {} : {
      signature: {
        mode: "typed",
        signedAt,
        ipAddress: signatureIp ?? "legacy",
        ...(signedBy ? { typedName: signedBy } : {})
      }
    }),
    ...(record.portal || !portalTokenHash ? {} : { portal: { tokenHash: portalTokenHash } })
  };
}

export function normalizeQuoteRecord(record: LegacyQuoteRecord): Quote {
  return quoteSchema.parse({ ...record, ...legacyQuoteCompatibilityPatch(record) }) as Quote;
}
