import { RailError } from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import type { FieldDocsService } from "../fielddocs/fieldDocsService.js";
import type { MediaRepository } from "../fielddocs/mediaRepository.js";
import type { SchedulingRepository } from "../scheduling/repository.js";
import type { evaporationRunInputSchema } from "./calculator.js";
import type { EvaporationReportRecord } from "./record.js";
import type { z } from "zod";

export interface EvaporationFieldContextDeps {
  crmRepository?: NativeCrmRepository | undefined;
  schedulingRepository?: SchedulingRepository | undefined;
  fieldDocsService?: Pick<FieldDocsService, "getChecklist" | "updateChecklist"> | undefined;
  mediaRepository?: Pick<MediaRepository, "getNexDocsDocument"> | undefined;
}

export async function resolveEvaporationFieldContext(
  input: z.infer<typeof evaporationRunInputSchema>,
  deps: EvaporationFieldContextDeps,
  tenantId: string
) {
  if (input.tenantId && input.tenantId !== tenantId) {
    throw new RailError("The requested tenant does not match the authorized evaporation context.", {
      provider: "native", op: "runEvaporationReport", status: 403
    });
  }
  if (!input.jobId) {
    if (input.propertyId || input.visitId || input.checklistId) {
      throw new RailError("A job is required when attaching an evaporation report to a property, visit, or checklist.", {
        provider: "native", op: "runEvaporationReport", status: 400
      });
    }
    return { ...input, tenantId };
  }
  if (!deps.crmRepository) {
    throw new RailError("Job context verification is not configured for evaporation reports.", {
      provider: "native", op: "runEvaporationReport", status: 503
    });
  }
  const job = (await deps.crmRepository.listJobs(tenantId)).find((candidate) => candidate.id === input.jobId);
  if (!job) {
    throw new RailError("The selected job was not found.", { provider: "native", op: "runEvaporationReport", status: 404 });
  }
  const propertyId = input.propertyId ?? job.propertyId;
  if (input.propertyId && input.propertyId !== job.propertyId) {
    throw new RailError("The selected property does not belong to this job.", { provider: "native", op: "runEvaporationReport", status: 400 });
  }
  if (input.visitId) {
    if (!deps.schedulingRepository) {
      throw new RailError("Visit context verification is not configured for evaporation reports.", {
        provider: "native", op: "runEvaporationReport", status: 503
      });
    }
    const visit = await deps.schedulingRepository.getVisit(tenantId, input.visitId);
    if (!visit || visit.jobId !== job.id) {
      throw new RailError("The selected visit does not belong to this job.", { provider: "native", op: "runEvaporationReport", status: 400 });
    }
  }
  if (input.checklistId) {
    if (!deps.fieldDocsService) {
      throw new RailError("Checklist context verification is not configured for evaporation reports.", {
        provider: "native", op: "runEvaporationReport", status: 503
      });
    }
    const checklist = await deps.fieldDocsService.getChecklist(tenantId, input.checklistId);
    if (!checklist || checklist.tenantId !== tenantId || checklist.jobId !== job.id || (input.visitId && checklist.visitId !== input.visitId) || (propertyId && checklist.propertyId && checklist.propertyId !== propertyId)) {
      throw new RailError("The selected checklist does not belong to this job context.", { provider: "native", op: "runEvaporationReport", status: 400 });
    }
  }
  if (input.measurementDocumentId) {
    if (!deps.mediaRepository) {
      throw new RailError("Measurement-document verification is not configured for evaporation reports.", {
        provider: "native", op: "runEvaporationReport", status: 503
      });
    }
    const document = await deps.mediaRepository.getNexDocsDocument(tenantId, input.measurementDocumentId);
    if (!document || document.clientId !== job.clientId || document.jobId !== job.id || (input.visitId && document.visitId !== input.visitId) || (propertyId && document.propertyId !== propertyId)) {
      throw new RailError("The selected measurement document does not belong to this visit context.", {
        provider: "native", op: "runEvaporationReport", status: 400
      });
    }
  }
  return { ...input, tenantId, ...(propertyId ? { propertyId } : {}) };
}

export async function applyEvaporationToChecklist(
  report: EvaporationReportRecord,
  deps: EvaporationFieldContextDeps
): Promise<void> {
  if (!report.checklistId || !deps.fieldDocsService) return;
  const checklist = await deps.fieldDocsService.getChecklist(report.tenantId, report.checklistId);
  if (!checklist) return;
  const updates = checklist.fields.flatMap((field) => {
    if (field.label === "Daily evaporation index") {
      return [{ fieldId: field.fieldId, numberValue: report.result.evapInchesPerDay }];
    }
    if (field.label === "Reported daily water loss" && report.result.observedLossInchesPerDay !== null) {
      return [{ fieldId: field.fieldId, numberValue: report.result.observedLossInchesPerDay }];
    }
    if (field.label === "Pool surface area" || field.label === "Pool/spa surface area") {
      return [{ fieldId: field.fieldId, numberValue: report.surfaceAreaFt2 }];
    }
    if (field.label === "Water temperature") {
      return [{ fieldId: field.fieldId, numberValue: report.waterTempF }];
    }
    return [];
  });
  if (updates.length) {
    await deps.fieldDocsService.updateChecklist({ tenantId: report.tenantId, checklistId: report.checklistId, updates });
  }
}
