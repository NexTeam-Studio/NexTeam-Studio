export interface NumberingRule {
  prefix: string;
  separator: string;
  padWidth: number;
  nextValue: number;
}

export interface NumberReservation {
  number: string;
  nextRule: NumberingRule;
}

export function formatDocumentNumber(rule: NumberingRule): string {
  const serial = String(rule.nextValue).padStart(rule.padWidth, "0");
  return rule.prefix.trim() ? `${rule.prefix}${rule.separator}${serial}` : serial;
}

export function advanceDocumentNumber(rule: NumberingRule): NumberReservation {
  return {
    number: formatDocumentNumber(rule),
    nextRule: { ...rule, nextValue: rule.nextValue + 1 }
  };
}
