import { RailError } from "@nexteam/core";
import type { MobileScheduleJob } from "@nexteam/mobile";
import type { AccessContext } from "../auth/accessContext.js";

export function assertMobileDayScheduleAccess(access: AccessContext, requestedTechnicianId: string): string {
  if (access.accessKind === "job_link") {
    throw new RailError("Job links can open one assigned job, not the full day schedule.", {
      provider: "native",
      op: "mobileDaySchedule",
      status: 403
    });
  }
  if (access.role === "TECHNICIAN" && requestedTechnicianId !== access.tenantUserId) {
    throw new RailError("Technicians can only cache their own assigned day.", {
      provider: "native",
      op: "mobileDaySchedule",
      status: 403
    });
  }
  return requestedTechnicianId;
}

export function assertMobileJobAccess(access: AccessContext, job: MobileScheduleJob, op = "mobileJobAccess"): MobileScheduleJob {
  if (access.tenantId !== job.tenantId) {
    throw new RailError("That job belongs to a different tenant.", { provider: "native", op, status: 403 });
  }
  if (access.accessKind === "job_link") {
    if (access.jobAccessLinkId && job.jobAccessLinkIds.includes(access.jobAccessLinkId)) {
      return job;
    }
    throw new RailError("That job link is not allowed to open this job.", { provider: "native", op, status: 403 });
  }
  if (access.role === "OWNER" || access.role === "OFFICE_ADMIN") {
    return job;
  }
  if (job.technicianIds.includes(access.tenantUserId)) {
    return job;
  }
  throw new RailError("That job is not assigned to this user.", { provider: "native", op, status: 403 });
}
