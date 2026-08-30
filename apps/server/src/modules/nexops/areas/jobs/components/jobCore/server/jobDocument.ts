import type { DocumentDesignSettings, Job } from "@nexteam/core";
import { resolveDocumentDesign } from "../../../../../../../shared/documentRendering/documentDesign.js";
import { renderTextPdf } from "../../../../../../../shared/documentRendering/pdfEngine.js";

export function renderJobPdf(job: Job, settings?: Partial<DocumentDesignSettings>): Buffer {
  const design = resolveDocumentDesign(settings);
  return renderTextPdf([
    "NexTeam Studio Job",
    "Style: " + design.style.headerLayout + " / " + design.style.headerStyle + " / " + design.style.themeColor,
    job.number ? "Job Number: " + job.number : "",
    "Job: " + job.title,
    "Client: " + job.clientId,
    "Status: " + job.status,
    ...job.lineItems.map((item) => item.code + " " + item.name + " x" + item.quantity + ": $" + item.total.toFixed(2)),
    design.job.disclaimer ? "Disclaimer: " + design.job.disclaimer : "",
    design.job.showSignatureLine ? "Client signature: ______________________________" : "",
    "Footer font size: " + design.style.footerFontSize
  ].filter(Boolean));
}
