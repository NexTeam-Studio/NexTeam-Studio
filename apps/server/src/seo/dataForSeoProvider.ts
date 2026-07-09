import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { RailError } from "@nexteam/core";
import { type SeoKeyword, type SeoRankSnapshot, seoRankSnapshotSchema } from "./schemas.js";

export interface RankSnapshotRequest {
  tenantId: string;
  targetDomain?: string | undefined;
  keywords: SeoKeyword[];
  now?: string | undefined;
}

export interface RankProvider {
  fetchSnapshots(request: RankSnapshotRequest): Promise<SeoRankSnapshot[]>;
}

function normalizeDomain(value: string | undefined): string {
  return (value ?? "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .toLowerCase()
    .trim();
}

function snapshot(input: {
  tenantId: string;
  keyword: SeoKeyword;
  provider: SeoRankSnapshot["provider"];
  checkedAt: string;
  configured: boolean;
  rank: number | null;
  targetDomain?: string | undefined;
  url?: string | undefined;
  blocker?: string | undefined;
}): SeoRankSnapshot {
  const record: SeoRankSnapshot = {
    id: `seo_rank_${randomUUID()}`,
    tenantId: input.tenantId,
    keyword: input.keyword.keyword,
    geo: input.keyword.geo,
    device: input.keyword.device,
    provider: input.provider,
    rank: input.rank,
    configured: input.configured,
    checkedAt: input.checkedAt
  };
  if (input.targetDomain) {
    record.targetDomain = input.targetDomain;
  }
  if (input.url) {
    record.url = input.url;
  }
  if (input.blocker) {
    record.blocker = input.blocker;
  }
  return seoRankSnapshotSchema.parse(record) as SeoRankSnapshot;
}

function fixtureSnapshots(env: NodeJS.ProcessEnv, request: RankSnapshotRequest): SeoRankSnapshot[] | null {
  const raw = env.M9_DATAFORSEO_FIXTURE_JSON;
  if (!raw) {
    return null;
  }
  const checkedAt = request.now ?? new Date().toISOString();
  const parsed = JSON.parse(raw) as Array<Partial<SeoRankSnapshot> & { keyword: string; geo: string; rank: number | null }>;
  return parsed.map((entry, index) => {
    const keyword = request.keywords[index] ?? {
      keyword: entry.keyword,
      geo: entry.geo,
      device: entry.device ?? "desktop"
    };
    return snapshot({
      tenantId: request.tenantId,
      keyword,
      provider: "fixture",
      checkedAt,
      configured: true,
      rank: entry.rank,
      targetDomain: request.targetDomain,
      url: entry.url
    });
  });
}

function dataForSeoPayload(request: RankSnapshotRequest) {
  return request.keywords.map((keyword) => ({
    keyword: keyword.keyword,
    location_name: keyword.geo,
    language_code: "en",
    device: keyword.device,
    depth: 100
  }));
}

function rankFromResult(result: unknown, targetDomain: string): { rank: number | null; url?: string | undefined } {
  if (!targetDomain || !result || typeof result !== "object") {
    return { rank: null };
  }
  const tasks = Array.isArray((result as Record<string, unknown>).tasks)
    ? (result as Record<string, unknown>).tasks as Array<Record<string, unknown>>
    : [];
  for (const task of tasks) {
    const results = Array.isArray(task.result) ? task.result as Array<Record<string, unknown>> : [];
    for (const serp of results) {
      const items = Array.isArray(serp.items) ? serp.items as Array<Record<string, unknown>> : [];
      for (const item of items) {
        const url = typeof item.url === "string" ? item.url : "";
        const domain = normalizeDomain(url);
        if (!domain.includes(targetDomain)) {
          continue;
        }
        const rank = Number(item.rank_absolute ?? item.rank_group);
        return { rank: Number.isInteger(rank) && rank > 0 ? rank : null, url };
      }
    }
  }
  return { rank: null };
}

export class DataForSeoRankProvider implements RankProvider {
  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  async fetchSnapshots(request: RankSnapshotRequest): Promise<SeoRankSnapshot[]> {
    const fixture = fixtureSnapshots(this.env, request);
    if (fixture) {
      return fixture;
    }

    const checkedAt = request.now ?? new Date().toISOString();
    const login = this.env.DATAFORSEO_LOGIN?.trim();
    const password = this.env.DATAFORSEO_PASSWORD?.trim();
    if (!login || !password) {
      return request.keywords.map((keyword) => snapshot({
        tenantId: request.tenantId,
        keyword,
        provider: "unconfigured",
        checkedAt,
        configured: false,
        rank: null,
        targetDomain: request.targetDomain,
        blocker: "DATAFORSEO_LOGIN/PASSWORD are not configured in staging."
      }));
    }

    const response = await this.fetchFn("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(dataForSeoPayload(request))
    });
    const payload = await response.json() as unknown;
    if (!response.ok) {
      throw new RailError("DataForSEO rank snapshot failed.", {
        provider: "native",
        op: "rankSnapshot",
        status: response.status,
        retryable: response.status >= 500
      });
    }

    const targetDomain = normalizeDomain(request.targetDomain);
    return request.keywords.map((keyword) => {
      const found = rankFromResult(payload, targetDomain);
      return snapshot({
        tenantId: request.tenantId,
        keyword,
        provider: "dataforseo",
        checkedAt,
        configured: true,
        rank: found.rank,
        targetDomain: request.targetDomain,
        url: found.url
      });
    });
  }
}
