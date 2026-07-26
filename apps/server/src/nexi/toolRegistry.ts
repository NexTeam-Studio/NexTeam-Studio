import type { Request } from "express";
import { RailError, type NexiTool, type Tenant } from "@nexteam/core";

export interface NexiToolProviderContext {
  env: NodeJS.ProcessEnv;
  req: Request;
  tenant: Tenant;
}

export type NexiToolProvider = (context: NexiToolProviderContext) => Promise<NexiTool[]> | NexiTool[];

export interface NexiToolGroup {
  label: string;
  tools: NexiTool[];
}

export function mergeNexiToolSets(groups: NexiToolGroup[]): NexiTool[] {
  const merged: NexiTool[] = [];
  const seen = new Map<string, string>();
  for (const group of groups) {
    for (const tool of group.tools) {
      const firstGroup = seen.get(tool.name);
      if (firstGroup) {
        throw new RailError(
          `Duplicate Nexi tool registration for "${tool.name}" (${firstGroup}, ${group.label}).`,
          {
            provider: "native",
            op: "nexiToolRegistry",
            status: 500
          }
        );
      }
      seen.set(tool.name, group.label);
      merged.push(tool);
    }
  }
  return merged;
}

export async function resolveNexiTools(
  providers: NexiToolProvider[] | undefined,
  context: NexiToolProviderContext
): Promise<NexiTool[]> {
  if (!providers?.length) {
    return [];
  }
  return (await Promise.all(providers.map((provider) => provider(context)))).flat();
}
