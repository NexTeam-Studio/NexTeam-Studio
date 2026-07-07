import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFParse } from "pdf-parse";
import {
  type AquatraceDocumentExtraction,
  type AquatraceSourceDocument,
  ingestAquatraceReportSet,
  normalizeReportText
} from "../apps/server/src/fielddocs/reportExtraction.js";

const downloadsDir = join(process.env.USERPROFILE ?? "C:\\Users\\Peyto", "Downloads");
const receiptPath = "receipts/m4/report-extraction-schema-receipt.json";

const sampleFilenames = [
  "Exported - Current Aquatrace Swimming Pool Leak Detection Checklist 05-06-2026.pdf",
  "Exported - Current Aquatrace Swimming Pool Leak Detection Checklist 05-12-2026.pdf",
  "Exported - Current Aquatrace Swimming Pool Leak Detection Checklist 05-26-2026.pdf",
  "Exported - Current Aquatrace Swimming Pool Leak Detection Checklist 06-05-2026.pdf",
  "Exported - Current Aquatrace Swimming Pool Leak Detection Checklist 06-16-2026.pdf",
  "Exported - Current Aquatrace Swimming Pool Leak Detection Checklist 06-23-2026.pdf",
  "Moasure Export (8).pdf",
  "Moasure Export (12).pdf",
  "Moasure Export (18).pdf",
  "L3 Campus - Statehouse Arena.pdf",
  "Swimming Pool Evaporation Calculator _ Aquatrace Leak Detection.pdf",
  "Swimming Pool Evaporation Calculator _ Aquatrace Leak Detection (1).pdf"
];

function stableId(filename: string): string {
  return filename.toLowerCase().replace(/\.pdf$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function extractPdfText(path: string): Promise<{ text: string; byteLength: number }> {
  const buffer = await readFile(path);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return { text: normalizeReportText(result.text), byteLength: buffer.byteLength };
  } finally {
    await parser.destroy();
  }
}

function documentSummary(document: AquatraceDocumentExtraction): Record<string, unknown> {
  const base = {
    id: document.source.id,
    label: document.source.label,
    type: document.documentType,
    flags: document.flags
  };
  if (document.documentType === "job_report") {
    return {
      ...base,
      clientDisplayName: document.clientDisplayName ?? null,
      serviceDateKey: document.serviceDateKey ?? null,
      technicians: document.technicians,
      totalGallons: document.measurement.totalGallons ?? null,
      surfaceAreaSqFt: document.measurement.surfaceAreaSqFt ?? null,
      gallonsPerInch: document.measurement.gallonsPerInch ?? null,
      findingsPreview: document.findings ? `${document.findings.slice(0, 220).trim()}${document.findings.length > 220 ? "..." : ""}` : null
    };
  }
  if (document.documentType === "moasure_export") {
    return {
      ...base,
      titleClientHint: document.titleClientHint ?? null,
      createdDateKey: document.createdDateKey ?? null,
      perimeterFt: document.perimeterFt ?? null,
      areaSqFt: document.areaSqFt ?? null,
      edgeCount: document.edges.length
    };
  }
  if (document.documentType === "evap_calc") {
    return {
      ...base,
      generatedDateKey: document.generatedDateKey ?? null,
      zipCode: document.zipCode ?? null,
      surfaceAreaSqFt: document.surfaceAreaSqFt ?? null,
      observedDailyLossInchesPerDay: document.observedDailyLoss?.inchesPerDay ?? null,
      evapEstimateInchesPerDay: document.evapEstimate?.inchesPerDay ?? null,
      leakLossAfterEvapInchesPerDay: document.leakLossAfterEvap?.inchesPerDay ?? null,
      totalDailyLossInchesPerDay: document.totalDailyLoss?.inchesPerDay ?? null
    };
  }
  return base;
}

async function main(): Promise<void> {
  const documents: AquatraceSourceDocument[] = [];
  const fileReceipts: Array<{ filename: string; byteLength: number; ok: boolean; error?: string }> = [];
  for (const filename of sampleFilenames) {
    const path = join(downloadsDir, filename);
    try {
      const extracted = await extractPdfText(path);
      documents.push({
        id: stableId(filename),
        label: filename,
        text: extracted.text
      });
      fileReceipts.push({ filename, byteLength: extracted.byteLength, ok: true });
    } catch (error) {
      fileReceipts.push({
        filename,
        byteLength: 0,
        ok: false,
        error: error instanceof Error ? error.message : "PDF read failed"
      });
    }
  }

  const set = ingestAquatraceReportSet({
    documents,
    jobberHierarchyCandidates: [
      {
        clientName: "L3 Campus",
        propertyName: "Statehouse Arena",
        tierPath: ["L3 Campus", "Statehouse Arena"]
      },
      {
        clientName: "Sandals Luxury Pools and Spas",
        propertyName: "Mehl Residence",
        tierPath: ["Sandals Luxury Pools and Spas", "Mehl Residence"]
      }
    ]
  });

  const visits = set.visits.map((visit) => ({
    visitKey: visit.visitKey,
    clientDisplayName: visit.clientDisplayName ?? null,
    serviceDateKey: visit.serviceDateKey ?? null,
    sourceDocumentIds: visit.sourceDocumentIds,
    hierarchy: visit.hierarchy ?? null,
    selectedFields: {
      cityState: visit.fields.cityState ?? null,
      technicians: visit.fields.technicians ?? null,
      serviceDate: visit.fields.serviceDate ?? null,
      poolGallons: visit.fields.poolGallons ?? null,
      surfaceAreaSqFt: visit.fields.surfaceAreaSqFt ?? null,
      moasureAreaSqFt: visit.fields.moasureAreaSqFt ?? null,
      gallonsPerInch: visit.fields.gallonsPerInch ?? null,
      gallonsPerInchAuthority: visit.fields.gallonsPerInchAuthority ?? null,
      checklistEvapIndexInchesPerDay: visit.fields.checklistEvapIndexInchesPerDay ?? null,
      observedDailyLossInchesPerDay: visit.fields.observedDailyLossInchesPerDay ?? null,
      evapEstimateInchesPerDay: visit.fields.evapEstimateInchesPerDay ?? null,
      leakLossAfterEvapInchesPerDay: visit.fields.leakLossAfterEvapInchesPerDay ?? null,
      totalDailyLossInchesPerDay: visit.fields.totalDailyLossInchesPerDay ?? null,
      structureResultStatus: visit.fields.structureResultStatus ?? null,
      plumbingResultStatus: visit.fields.plumbingResultStatus ?? null,
      filtrationResultStatus: visit.fields.filtrationResultStatus ?? null
    },
    flags: visit.flags,
    findingsPreview: typeof visit.fields.reportFindings === "string"
      ? `${visit.fields.reportFindings.slice(0, 260).trim()}${visit.fields.reportFindings.length > 260 ? "..." : ""}`
      : null
  }));

  const r3ConflictVisits = visits.filter((visit) => visit.flags.some((flag) => flag.startsWith("evap_pdf_overrides_checklist_delta_inches")));
  const r4ProofVisits = visits.filter((visit) => visit.selectedFields.observedDailyLossInchesPerDay === 2.5);
  const r3Synthetic = ingestAquatraceReportSet({
    documents: [{
      id: "r3-synthetic-checklist",
      label: "R3 synthetic checklist fixture",
      text: 'Summary Summary R3 Fixture Client Name Test City City / State Chris Sears Aquatrace Technician Name(s) Tuesday, June 16th, 2026 Project Service Date 1:00pm Project Service Completion Time Conditions Upon Arrival Daily Evaporation Index 0 1/4" Reported Daily Loss Unknown Pool/Spa Overview Measurements Square Footage (Surface Area) 1000ft² Estimated Approximate Total Gallons 30,000 Gallons'
    }, {
      id: "r3-synthetic-evap",
      label: "R3 synthetic evap fixture",
      text: 'Pool Evaporation Report Generated: June 16, 2026 ZIP Code 30537 Water Temp 83°F Surface Area 1000 ft² EVAPORATION ESTIMATE 0 3/4" inches / day 400 gallons / day'
    }]
  });
  const r3SyntheticVisit = r3Synthetic.visits[0];
  const receipt = {
    ok: fileReceipts.every((file) => file.ok),
    generatedAt: new Date().toISOString(),
    corpus: {
      requestedMinimumPdfCount: 9,
      attachedPdfCount: sampleFilenames.length,
      parsedPdfCount: documents.length,
      additionalClientSetIncluded: "L3 Campus - Statehouse Arena",
      fullPdfTextStored: false,
      files: fileReceipts
    },
    documentSummaries: set.parsedDocuments.map(documentSummary),
    counts: {
      jobReports: set.parsedDocuments.filter((document) => document.documentType === "job_report").length,
      moasureExports: set.parsedDocuments.filter((document) => document.documentType === "moasure_export").length,
      evapCalcs: set.parsedDocuments.filter((document) => document.documentType === "evap_calc").length,
      visits: visits.length,
      unresolvedDocs: set.unresolvedDocs.length
    },
    lockedRules: {
      r1MoasureDateMatch: visits
        .filter((visit) => visit.flags.includes("moasure_linked_by_date_match"))
        .map((visit) => ({ visitKey: visit.visitKey, sourceDocumentIds: visit.sourceDocumentIds })),
      r3EvapPdfWins: r3ConflictVisits.map((visit) => ({
        visitKey: visit.visitKey,
        flags: visit.flags.filter((flag) => flag.startsWith("evap_pdf_overrides_checklist_delta_inches")),
        checklistEvapIndexInchesPerDay: visit.selectedFields.checklistEvapIndexInchesPerDay,
        evapPdfEstimateInchesPerDay: visit.selectedFields.evapEstimateInchesPerDay,
        authoritativeSource: "evap_pdf"
      })),
      r3SyntheticConflictProof: r3SyntheticVisit ? {
        realSampleConflictPresent: r3ConflictVisits.length > 0,
        reason: "The attached real sample PDFs did not contain a parsed checklist/evap conflict; this deterministic fixture proves the conflict path without altering source data.",
        visitKey: r3SyntheticVisit.visitKey,
        checklistEvapIndexInchesPerDay: r3SyntheticVisit.fields.checklistEvapIndexInchesPerDay ?? null,
        evapPdfEstimateInchesPerDay: r3SyntheticVisit.fields.evapEstimateInchesPerDay ?? null,
        flags: r3SyntheticVisit.flags.filter((flag) => flag.startsWith("evap_pdf_overrides_checklist_delta_inches")),
        authoritativeSource: "evap_pdf"
      } : null,
      r4LossNotation: r4ProofVisits.map((visit) => ({
        visitKey: visit.visitKey,
        observedDailyLossInchesPerDay: visit.selectedFields.observedDailyLossInchesPerDay
      })),
      r8NamingAnomalies: visits
        .filter((visit) => visit.flags.includes("companycam_generated_filename_without_client"))
        .map((visit) => visit.visitKey),
      r9GallonsPerInchFormula: visits.map((visit) => ({
        visitKey: visit.visitKey,
        moasureAreaSqFt: visit.selectedFields.moasureAreaSqFt,
        gallonsPerInch: visit.selectedFields.gallonsPerInch,
        formula: "sq ft * 0.625"
      })),
      unresolvedDocsParkedForReview: set.unresolvedDocs
    },
    visits,
    liveTranscript: []
  };

  await mkdir("receipts/m4", { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    ok: receipt.ok,
    receiptPath,
    counts: receipt.counts,
    r3ConflictCount: r3ConflictVisits.length,
    r4ProofCount: r4ProofVisits.length
  }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
