function escapePdfText(value: string): string {
  return value.replace(/[()\\]/g, (match) => `\\${match}`);
}

export function buildSeoReportPdf(input: {
  title: string;
  lines: string[];
}): Buffer {
  const content = [
    "BT",
    "/F1 18 Tf",
    "72 740 Td",
    `(${escapePdfText(input.title)}) Tj`,
    "/F1 11 Tf",
    ...input.lines.flatMap((line) => ["0 -20 Td", `(${escapePdfText(line)}) Tj`]),
    "ET"
  ].join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(content)} >> stream\n${content}\nendstream endobj`
  ];
  const header = "%PDF-1.4\n";
  let offset = Buffer.byteLength(header);
  const offsets = [0];
  const body = objects.map((object) => {
    offsets.push(offset);
    offset += Buffer.byteLength(`${object}\n`);
    return `${object}\n`;
  }).join("");
  const xrefStart = offset;
  const xref = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((entry) => `${entry.toString().padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefStart),
    "%%EOF"
  ].join("\n");
  return Buffer.from(`${header}${body}${xref}\n`);
}
