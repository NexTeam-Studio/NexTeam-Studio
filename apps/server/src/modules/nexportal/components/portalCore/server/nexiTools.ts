import { RailError, type NexiTool, type Tenant } from "@nexteam/core";
import type { z } from "zod";
import type { CrmToolContext } from "../../../../nexops/runtime/nexiToolRuntime.js";
import { clientPortalActivityInputSchema, sendPortalLinkInputSchema, sendStatementToolInputSchema, statementToolInputSchema } from "./toolSchemas.js";
import { reviewSequenceActionInputSchema, reviewSequenceStatusInputSchema, startReviewSequenceToolInputSchema } from "../../../../../reputation/reviewSequenceToolSchemas.js";
import { resolveJobForAction } from "../../../../nexops/areas/jobs/components/jobCore/server/toolSupport.js";
import { resolveExactClientId } from "../../../../nexops/shared/tools/clientResolution.js";
import type { JobLifecycleService } from "../../../../nexops/areas/jobs/components/jobCore/server/jobLifecycleService.js";
import type { ReviewSequenceService } from "../../../../../reputation/reviewSequenceService.js";

async function resolveReviewSequenceIdForAction(
  tenantId: string,
  input: z.infer<typeof reviewSequenceActionInputSchema>,
  reviewSequenceService: ReviewSequenceService,
  jobLifecycleService: JobLifecycleService
): Promise<string> {
  if (input.reviewSequenceId?.trim()) return input.reviewSequenceId.trim();
  const job = await resolveJobForAction(tenantId, { jobId: input.jobId, query: input.jobQuery }, jobLifecycleService);
  const status = await reviewSequenceService.listStatus(tenantId, { jobId: job.id });
  if (status.sequences.length !== 1) {
    throw new RailError("I need one exact review sequence for that job before I can continue.", {
      provider: "native",
      op: "reviewSequenceAction",
      status: 400
    });
  }
  return status.sequences[0]!.id;
}

export function createPortalCoreNexiTools(context: CrmToolContext, _includeWrites: boolean): NexiTool[] {
  const {
    RailError,
    options,
    provider,
    source,
  } = context;
  return [
    ...[{
      name: "sendPortalLink",
      description: "Generate and send a NexPortal client hub magic link for a client or a single property view.",
      inputSchema: sendPortalLinkInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.portalHubService) {
          throw new RailError("Client hub tools are not wired for this tenant yet.", { provider: "native", op: "sendPortalLink", status: 501 });
        }
        const input = sendPortalLinkInputSchema.parse(args);
        const clientId = await resolveExactClientId(provider, input.clientId, input.clientQuery, "sendPortalLink");
        const sent = await options.portalHubService.issueMagicLink({
          tenantId: tenant.id,
          clientId,
          ...(input.propertyId ? { propertyId: input.propertyId } : {}),
          ...(input.target?.trim() ? { target: input.target.trim() } : {}),
          ...(input.preferredChannel ? { preferredChannel: input.preferredChannel } : {}),
          ...(input.sourceObjectType ? { sourceObjectType: input.sourceObjectType } : {}),
          ...(input.sourceObjectId?.trim() ? { sourceObjectId: input.sourceObjectId.trim() } : {})
        });
        return {
          result: {
            clientId,
            sessionId: sent.session.id,
            url: sent.url,
            delivery: sent.delivery,
            target: sent.target
          },
          sources: [
            source(clientId, `Portal client ${clientId}`),
            source(sent.session.id, `Portal session ${sent.session.id}`)
          ]
        };
      }
    }],
    ...[{
      name: "getClientPortalActivity",
      description: "Read the portal activity trail for a client so staff can see viewed, confirmed, paid, and statement events.",
      inputSchema: clientPortalActivityInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.portalHubService) {
          throw new RailError("Client hub tools are not wired for this tenant yet.", { provider: "native", op: "getClientPortalActivity", status: 501 });
        }
        const input = clientPortalActivityInputSchema.parse(args);
        const clientId = await resolveExactClientId(provider, input.clientId, input.clientQuery, "getClientPortalActivity");
        const activity = await options.portalHubService.listPortalActivity({
          tenantId: tenant.id,
          clientId,
          ...(input.propertyId ? { propertyId: input.propertyId } : {})
        });
        return {
          result: {
            clientId,
            activity
          },
          sources: activity.length
            ? activity.map((entry) => source(entry.id, `Portal activity ${entry.title}`))
            : [source(clientId, "Client portal activity")]
        };
      }
    }],
    ...[{
      name: "generateStatement",
      description: "Generate a client statement snapshot with invoices, payments, credits, and running balance.",
      inputSchema: statementToolInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.portalHubService) {
          throw new RailError("Statement tools are not wired for this tenant yet.", { provider: "native", op: "generateStatement", status: 501 });
        }
        const input = statementToolInputSchema.parse(args);
        const clientId = await resolveExactClientId(provider, input.clientId, input.clientQuery, "generateStatement");
        const statement = await options.portalHubService.generateStatementSnapshot({
          tenantId: tenant.id,
          clientId,
          ...(input.from ? { from: input.from } : {}),
          ...(input.to ? { to: input.to } : {})
        });
        return {
          result: {
            clientId,
            statement
          },
          sources: [source(clientId, `Client statement ${clientId}`)]
        };
      }
    }],
    ...[{
      name: "sendStatement",
      description: "Send a client statement by email or text using the shared statement_send template category.",
      inputSchema: sendStatementToolInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.portalHubService) {
          throw new RailError("Statement tools are not wired for this tenant yet.", { provider: "native", op: "sendStatement", status: 501 });
        }
        const input = sendStatementToolInputSchema.parse(args);
        const clientId = await resolveExactClientId(provider, input.clientId, input.clientQuery, "sendStatement");
        const sent = await options.portalHubService.sendStatement({
          tenantId: tenant.id,
          clientId,
          ...(input.from ? { from: input.from } : {}),
          ...(input.to ? { to: input.to } : {}),
          ...(input.target?.trim() ? { target: input.target.trim() } : {}),
          actorId: "nexi"
        });
        return {
          result: {
            clientId,
            url: sent.url,
            target: sent.target
          },
          sources: [source(clientId, `Client statement ${clientId}`)]
        };
      }
    }],
    ...[{
      name: "getReviewSequenceStatus",
      description: "Read the review follow-up sequence state for a client or a job.",
      inputSchema: reviewSequenceStatusInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.reviewSequenceService) {
          throw new RailError("Review-sequence tools are not wired for this tenant yet.", { provider: "native", op: "getReviewSequenceStatus", status: 501 });
        }
        const input = reviewSequenceStatusInputSchema.parse(args);
        const filters: { clientId?: string; jobId?: string } = {};
        if (input.clientId || input.clientQuery?.trim()) {
          filters.clientId = await resolveExactClientId(provider, input.clientId, input.clientQuery, "getReviewSequenceStatus");
        }
        if (input.jobId || input.jobQuery?.trim()) {
          if (!options.jobLifecycleService) {
            throw new RailError("Job lookup is not wired for review status queries yet.", { provider: "native", op: "getReviewSequenceStatus", status: 501 });
          }
          const job = await resolveJobForAction(tenant.id, { jobId: input.jobId, query: input.jobQuery }, options.jobLifecycleService);
          filters.jobId = job.id;
        }
        const status = await options.reviewSequenceService.listStatus(tenant.id, filters);
        return {
          result: status,
          sources: status.sequences.length
            ? status.sequences.map((sequence) => source(sequence.id, `Review sequence ${sequence.id}`))
            : [source(filters.jobId ?? filters.clientId ?? "review-sequences", "Review follow-up status")]
        };
      }
    }],
    ...[{
      name: "stopReviewSequence",
      description: "Stop a review follow-up sequence manually so no more review nudges go out for that job.",
      inputSchema: reviewSequenceActionInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.reviewSequenceService || !options.jobLifecycleService) {
          throw new RailError("Review-sequence tools are not wired for this tenant yet.", { provider: "native", op: "stopReviewSequence", status: 501 });
        }
        const input = reviewSequenceActionInputSchema.parse(args);
        const reviewSequenceId = await resolveReviewSequenceIdForAction(tenant.id, input, options.reviewSequenceService, options.jobLifecycleService);
        const sequence = await options.reviewSequenceService.stopSequence({
          tenantId: tenant.id,
          reviewSequenceId,
          reason: "manual"
        });
        return {
          result: { sequence },
          sources: [source(sequence.id, `Review sequence ${sequence.id}`)]
        };
      }
    }],
    ...[{
      name: "markReviewed",
      description: "Mark a review sequence complete once the client has left the review, stopping all future nudges.",
      inputSchema: reviewSequenceActionInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.reviewSequenceService || !options.jobLifecycleService) {
          throw new RailError("Review-sequence tools are not wired for this tenant yet.", { provider: "native", op: "markReviewed", status: 501 });
        }
        const input = reviewSequenceActionInputSchema.parse(args);
        const reviewSequenceId = await resolveReviewSequenceIdForAction(tenant.id, input, options.reviewSequenceService, options.jobLifecycleService);
        const sequence = await options.reviewSequenceService.markReviewed({
          tenantId: tenant.id,
          reviewSequenceId
        });
        return {
          result: { sequence },
          sources: [source(sequence.id, `Review sequence ${sequence.id}`)]
        };
      }
    }],
    ...[{
      name: "startReviewSequence",
      description: "Manually start a review follow-up sequence for a closed and fully paid job that should now enter the review rail.",
      inputSchema: startReviewSequenceToolInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.reviewSequenceService || !options.jobLifecycleService) {
          throw new RailError("Review-sequence tools are not wired for this tenant yet.", { provider: "native", op: "startReviewSequence", status: 501 });
        }
        const input = startReviewSequenceToolInputSchema.parse(args);
        const job = await resolveJobForAction(tenant.id, { jobId: input.jobId, query: input.jobQuery }, options.jobLifecycleService);
        const sequence = await options.reviewSequenceService.maybeStartForJob({
          tenantId: tenant.id,
          jobId: job.id,
          source: "manual"
        });
        return {
          result: sequence
            ? { started: true, sequence }
            : { started: false, sequence: null, note: "Review follow-up starts only after the job is closed, final payment is settled, and review defaults are enabled." },
          sources: [source(job.id, `Native job ${job.title}`)]
        };
      }
    }]
  ];
}
