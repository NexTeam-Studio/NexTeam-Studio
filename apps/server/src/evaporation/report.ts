import { randomUUID } from "node:crypto";
import { calculateEvaporation, evaporationRunInputSchema, toImperialInches } from "./calculator.js";
import type { EvaporationReportRecord, EvaporationRepository } from "./repository.js";
import type { EvaporationWeatherProvider } from "./weather.js";

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function line(label: string, value: string | number | null | undefined): string {
  return `${label}: ${value ?? "not provided"}`;
}

function reportLines(report: EvaporationReportRecord): string[] {
  const result = report.result;
  return [
    "Aquatrace Swimming Pool Evaporation Report",
    line("Report ID", report.id),
    line("Client", report.clientName),
    line("Address", report.address),
    line("Generated", report.createdAt),
    "",
    "Pool Inputs",
    line("Surface area", `${report.surfaceAreaFt2} sq ft`),
    line("Water temp", `${report.waterTempF} F`),
    line("Gallons per inch", result.gallonsPerInch.toFixed(1)),
    line("Observed loss", toImperialInches(result.observedLossInchesPerDay)),
    "",
    "Weather",
    line("Location", report.currentWeather.city),
    line("Air temp", `${report.currentWeather.airTempF.toFixed(1)} F`),
    line("Relative humidity", `${report.currentWeather.relativeHumidityPct}%`),
    line("Wind", `${(report.windMphOverride ?? report.currentWeather.windMph).toFixed(1)} mph`),
    "",
    "Results",
    line("Expected evaporation", `${toImperialInches(result.evapInchesPerDay)} / ${result.evapGallonsPerDay.toFixed(0)} gal per day`),
    line("Leak loss after evap", result.leakInchesPerDay === null ? null : `${toImperialInches(result.leakInchesPerDay)} / ${result.leakGallonsPerDay?.toFixed(0)} gal per day`),
    line("Total loss", result.totalLossInchesPerDay === null ? null : `${toImperialInches(result.totalLossInchesPerDay)} / ${result.totalLossGallonsPerDay?.toFixed(0)} gal per day`),
    line("24-hour forecast evap", result.projected24HourEvapInches === null ? null : `${toImperialInches(result.projected24HourEvapInches)} / ${result.projected24HourEvapGallons?.toFixed(0)} gal`),
    line("Severity", result.severity.replace(/_/g, " ")),
    `Note: ${result.note}`,
    "",
    "Forecast Table",
    ...result.forecast.slice(0, 8).map((slot) => `${slot.at}: ${slot.airTempF.toFixed(0)} F, RH ${slot.relativeHumidityPct}%, wind ${slot.windMph.toFixed(1)} mph, evap ${slot.evapInchesForThreeHours.toFixed(3)} in / ${slot.evapGallonsForThreeHours.toFixed(1)} gal`),
    "",
    "This report is generated for owner review and can be attached to approval-gated outbound messages."
  ];
}

export function renderEvaporationReportPdf(report: EvaporationReportRecord): Buffer {
  const content = reportLines(report)
    .slice(0, 42)
    .map((text, index) => `BT /F1 9 Tf 45 ${760 - index * 16} Td (${escapePdfText(text)}) Tj ET`)
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

export async function createEvaporationReport(input: {
  tenantId: string;
  body: unknown;
  repository: EvaporationRepository;
  weatherProvider: EvaporationWeatherProvider;
}): Promise<EvaporationReportRecord> {
  const parsed = evaporationRunInputSchema.parse(input.body);
  const tenantId = parsed.tenantId ?? input.tenantId;
  const weather = await input.weatherProvider.getWeather({ address: parsed.address, zip: parsed.zip });
  const result = calculateEvaporation({
    surfaceAreaFt2: parsed.surfaceAreaFt2,
    waterTempF: parsed.waterTempF,
    currentWeather: weather.current,
    forecast: weather.forecast,
    observedLoss: parsed.observedLoss,
    windMphOverride: parsed.windMphOverride
  });
  const id = `evap_${randomUUID()}`;
  const report: EvaporationReportRecord = {
    id,
    tenantId,
    ...(parsed.jobId ? { jobId: parsed.jobId } : {}),
    ...(parsed.clientName ? { clientName: parsed.clientName } : {}),
    address: parsed.address,
    ...(parsed.zip ?? weather.current.zip ? { zip: parsed.zip ?? weather.current.zip } : {}),
    surfaceAreaFt2: parsed.surfaceAreaFt2,
    waterTempF: parsed.waterTempF,
    createdAt: new Date().toISOString(),
    currentWeather: weather.current,
    forecast: weather.forecast,
    ...(parsed.windMphOverride !== undefined ? { windMphOverride: parsed.windMphOverride } : {}),
    result,
    pdfRef: `native://tenants/${tenantId}/evaporationReports/${id}.pdf`,
    status: "posted"
  };
  return input.repository.saveReport(report);
}

export function evaporationAttachmentFor(report: EvaporationReportRecord): { filename: string; mime: "application/pdf"; storageRef: string } {
  const name = report.clientName?.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || report.id;
  return {
    filename: `aquatrace-evaporation-${name}.pdf`,
    mime: "application/pdf",
    storageRef: report.pdfRef
  };
}
