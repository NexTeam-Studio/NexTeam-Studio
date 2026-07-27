import type { DocumentSequenceKind } from "@nexteam/core";
import { formatDocumentNumber } from "@nexteam/shared";
import type { NativeCrmRepository } from "@nexteam/providers";

export { advanceDocumentNumber, formatDocumentNumber } from "@nexteam/shared";

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

export function previewDocumentNumber(
  settings: { tenantId: string; documentNumbering: Record<DocumentSequenceKind, Parameters<typeof formatDocumentNumber>[0]> },
  tenantId: string,
  kind: DocumentSequenceKind
): string {
  if (settings.tenantId !== tenantId) {
    throw new Error("Numbering settings do not belong to the requested tenant.");
  }
  return formatDocumentNumber(settings.documentNumbering[kind]);
}
