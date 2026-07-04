import { z } from "zod";
import type { NexiTool, Source, Tenant } from "@nexteam/core";
import type { MediaRepository } from "./mediaRepository.js";
import { pairBeforeAfter, searchMediaWithVisionFallback } from "./photoSearch.js";

const photoSearchInputSchema = z.object({
  query: z.string(),
  limit: z.number().int().min(1).max(25).optional()
});
const beforeAfterInputSchema = z.object({
  jobId: z.string().optional()
});

function source(ref: string, label: string): Source {
  return { rail: "native", ref, label };
}

export function createFieldDocsReadTools(repository: MediaRepository): NexiTool[] {
  return [
    {
      name: "photoSearch",
      description: "Search native imported media metadata by natural language.",
      inputSchema: photoSearchInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        const input = photoSearchInputSchema.parse(args);
        const media = await repository.listMedia(tenant.id);
        const hits = await searchMediaWithVisionFallback(media, input.query, input.limit ?? 10);
        return {
          result: { hits },
          sources: hits.map((hit) => source(hit.media.id, `Native media ${hit.media.id}`))
        };
      }
    },
    {
      name: "beforeAfterPairs",
      description: "Find native before/after photo pairs by job.",
      inputSchema: beforeAfterInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        const input = beforeAfterInputSchema.parse(args);
        const media = await repository.listMedia(tenant.id);
        const pairs = pairBeforeAfter(media).filter((pair) => input.jobId ? pair.jobId === input.jobId : true);
        return {
          result: { pairs },
          sources: pairs.flatMap((pair) => [
            source(pair.before.id, `Before media ${pair.before.id}`),
            source(pair.after.id, `After media ${pair.after.id}`)
          ])
        };
      }
    }
  ];
}
