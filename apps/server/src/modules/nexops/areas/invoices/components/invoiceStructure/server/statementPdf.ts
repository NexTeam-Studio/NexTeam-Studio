export interface ClientStatementLine {
  id: string;
  occurredAt: string;
  kind: "invoice" | "payment" | "credit" | "refund";
  label: string;
  detail?: string | undefined;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface ClientStatementSnapshot {
  tenantName: string;
  clientName: string;
  from?: string | undefined;
  to?: string | undefined;
  lines: ClientStatementLine[];
  runningBalance: number;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function dateLabel(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : value;
}

export function renderClientStatementPdf(snapshot: ClientStatementSnapshot): Buffer {
  const lineRows = snapshot.lines.flatMap((line) => ([
    `${dateLabel(line.occurredAt)} ${line.kind.toUpperCase()} ${line.label}`,
    `  Debit ${money(line.debit)} | Credit ${money(line.credit)} | Balance ${money(line.runningBalance)}${line.detail ? ` | ${line.detail}` : ""}`
  ]));
  const textLines = [
    `${snapshot.tenantName} Client Statement`,
    `Client: ${snapshot.clientName}`,
    snapshot.from || snapshot.to
      ? `Range: ${snapshot.from ? dateLabel(snapshot.from) : "Beginning"} - ${snapshot.to ? dateLabel(snapshot.to) : "Today"}`
      : "",
    "",
    ...lineRows,
    "",
    `Running balance: ${money(snapshot.runningBalance)}`
  ].filter(Boolean);
  const content = textLines
    .map((line, index) => {
      const y = 760 - index * 16;
      return `BT /F1 10 Tf 40 ${y} Td (${escapePdfText(line)}) Tj ET`;
    })
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}
