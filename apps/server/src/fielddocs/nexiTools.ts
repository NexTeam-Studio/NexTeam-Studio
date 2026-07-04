import { z } from "zod";
import type { NexiTool, Source, Tenant } from "@nexteam/core";
import type { MediaRepository } from "./mediaRepository.js";
import { searchMediaByMetadata } from "./photoSearch.js";

const photoSearchInputSchema = z.object({
  query: z.string(),
  limit: z.number().int().min(1).max(25).optional()
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
        const hits = searchMediaByMetadata(media, input.query, input.limit ?? 10);
        return {
          result: { hits },
          sources: hits.map((hit) => source(hit.media.id, `Native media ${hit.media.id}`))
        };
      }
    }
  ];
}
