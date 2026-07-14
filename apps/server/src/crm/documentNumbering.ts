import type { DocumentNumberingRule, DocumentSequenceKind } from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";

export function formatDocumentNumber(rule: DocumentNumberingRule): string {
  const serial = String(rule.nextValue).padStart(rule.padWidth, "0");
  return rule.prefix.trim() ? `${rule.prefix}${rule.separator}${serial}` : serial;
}

export async function reserveDocumentNumber(
  repository: Pick<NativeCrmRepository, "reserveDocumentNumber">,
  tenantId: string,
  kind: DocumentSequenceKind
): Promise<string> {
  return repository.reserveDocumentNumber(tenantId, kind);
}

export async function ensureDocumentNumbers<T extends { id: string; number?: string | undefined }>(
  records: T[],
  options: {
    tenantId: string;
    kind: DocumentSequenceKind;
    reserve: (tenantId: string, kind: DocumentSequenceKind) => Promise<string>;
    update: (id: string, patch: Partial<T>) => Promise<T>;
  }
): Promise<T[]> {
  const next = [...records];
  for (let index = 0; index < next.length; index += 1) {
    const record = next[index];
    if (!record || record.number) {
      continue;
    }
    const number = await options.reserve(options.tenantId, options.kind);
    next[index] = await options.update(record.id, { number } as Partial<T>);
  }
  return next;
}
