import {
  RailError,
  type Client,
  type CRMProvider,
  type Job,
  type JobDetail,
  type JobStatus
} from "@nexteam/core";
import { asArray, asRecord, numberValue, railFetchJson, text } from "../railFetch.js";

const JOBBER_GRAPHQL_ENDPOINT = "https://api.getjobber.com/api/graphql";
const JOBBER_OAUTH_TOKEN_ENDPOINT = "https://api.getjobber.com/api/oauth/token";
const DEFAULT_JOBBER_GRAPHQL_VERSION = "2026-03-10";

const JOBS_QUERY = `
  query NexTeamJobs($first: Int!, $after: String) {
    jobs(first: $first, after: $after) {
      nodes {
        id
        jobNumber
        title
        jobStatus
        startAt
        endAt
        createdAt
        updatedAt
        instructions
        total
        client { id name firstName lastName companyName emails { address } phones { number } }
        property { id street1 street2 city province postalCode country }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const CLIENTS_QUERY = `
  query NexTeamClients($first: Int!, $after: String) {
    clients(first: $first, after: $after) {
      nodes {
        id
        name
        firstName
        lastName
        companyName
        emails { address }
        phones { number }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const PRODUCTS_QUERY = `
  query NexTeamProducts($first: Int!, $after: String, $searchTerm: String) {
    products(first: $first, after: $after, searchTerm: $searchTerm) {
      nodes {
        id
        name
        description
        category
        defaultUnitCost
        internalUnitCost
        markup
        taxable
        visible
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export interface JobberAdapterConfig {
  tenantId: string;
  clientId: string | undefined;
  clientSecret: string | undefined;
  refreshToken: string | undefined;
  accessToken: string | undefined;
  accessTokenExpiresAt: number | undefined;
  graphqlVersion: string | undefined;
}

interface JobberTokenState {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
}

export interface JobberProductOrService {
  id: string;
  name: string;
  description: string;
  category: string;
  defaultUnitCost: number;
  internalUnitCost: number | null;
  markup: number | null;
  taxable: boolean | null;
  visible: boolean | null;
}

function normalizeJobStatus(status: string): JobStatus {
  const lower = status.toLowerCase();
  if (lower.includes("complete")) return "complete";
  if (lower.includes("invoice")) return "invoiced";
  if (lower.includes("paid")) return "paid";
  if (lower.includes("progress")) return "in_progress";
  if (lower.includes("schedule")) return "scheduled";
  if (lower.includes("quote")) return "quoted";
  return "lead";
}

function readConnection(payload: unknown, key: string): { nodes: unknown[]; hasNextPage: boolean; endCursor: string } {
  const data = asRecord(asRecord(payload).data);
  const connection = asRecord(data[key]);
  const pageInfo = asRecord(connection.pageInfo);
  return {
    nodes: asArray(connection.nodes),
    hasNextPage: pageInfo.hasNextPage === true,
    endCursor: text(pageInfo.endCursor)
  };
}

function mapClient(raw: unknown, tenantId: string): Client {
  const record = asRecord(raw);
  const id = text(record.id) || `jobber_client_${crypto.randomUUID()}`;
  const name = text(record.name) || [text(record.firstName), text(record.lastName)].filter(Boolean).join(" ") || text(record.companyName) || "Unknown client";
  const client: Client = {
    id,
    tenantId,
    name,
    emails: asArray(record.emails).map((email) => text(asRecord(email).address)).filter(Boolean),
    phones: asArray(record.phones).map((phone) => text(asRecord(phone).number)).filter(Boolean),
    tags: [],
    consent: { email: false, sms: false },
    externalIds: { jobber: id }
  };
  const company = text(record.companyName);
  if (company) {
    client.company = company;
  }
  return client;
}

function mapClients(nodes: unknown[], tenantId: string): Client[] {
  return nodes.map((node) => mapClient(node, tenantId));
}

function mapJob(raw: unknown, tenantId: string): JobDetail {
  const record = asRecord(raw);
  const client = mapClient(record.client, tenantId);
  const property = asRecord(record.property);
  const id = text(record.id) || `jobber_job_${crypto.randomUUID()}`;
  const total = numberValue(record.total);
  const job: JobDetail = {
    id,
    tenantId,
    clientId: client.id,
    status: normalizeJobStatus(text(record.jobStatus)),
    title: text(record.title) || `Job ${text(record.jobNumber) || id}`,
    lineItems: [],
    totals: { subtotal: total, tax: 0, total },
    externalIds: { jobber: id },
    client,
    notes: text(record.instructions)
  };
  const propertyId = text(property.id);
  if (propertyId) {
    const address = {
      street1: text(property.street1),
      city: text(property.city),
      province: text(property.province),
      postalCode: text(property.postalCode),
      country: text(property.country) || "US"
    };
    const street2 = text(property.street2);
    if (street2) {
      Object.assign(address, { street2 });
    }
    job.propertyId = propertyId;
    job.property = {
      id: propertyId,
      tenantId,
      clientId: client.id,
      address,
      assets: [],
      externalIds: { jobber: propertyId }
    };
  }
  return job;
}

function mapProductOrService(raw: unknown): JobberProductOrService {
  const record = asRecord(raw);
  return {
    id: text(record.id),
    name: text(record.name),
    description: text(record.description),
    category: text(record.category),
    defaultUnitCost: numberValue(record.defaultUnitCost),
    internalUnitCost: record.internalUnitCost === null || record.internalUnitCost === undefined ? null : numberValue(record.internalUnitCost),
    markup: record.markup === null || record.markup === undefined ? null : numberValue(record.markup),
    taxable: typeof record.taxable === "boolean" ? record.taxable : null,
    visible: typeof record.visible === "boolean" ? record.visible : null
  };
}

function matchJob(job: JobDetail, ref: { id?: string; nameQuery?: string }): number {
  if (ref.id && (job.id === ref.id || job.externalIds?.jobber === ref.id)) {
    return 100;
  }
  const query = text(ref.nameQuery).toLowerCase();
  if (!query) {
    return 0;
  }
  const haystack = [job.title, job.client?.name, job.client?.company, job.property?.address.street1, job.property?.address.city]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query) ? 20 : 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class JobberAdapter implements CRMProvider {
  private tokenState: JobberTokenState;
  private readonly graphqlVersion: string;

  constructor(private readonly config: JobberAdapterConfig) {
    this.tokenState = {
      accessToken: config.accessToken ?? "",
      refreshToken: config.refreshToken ?? "",
      accessTokenExpiresAt: config.accessTokenExpiresAt ?? 0
    };
    this.graphqlVersion = config.graphqlVersion ?? DEFAULT_JOBBER_GRAPHQL_VERSION;
  }

  static fromEnv(env: NodeJS.ProcessEnv, tenantId = env.TENANT_ID || "aquatrace"): JobberAdapter {
    return new JobberAdapter({
      tenantId,
      clientId: env.JOBBER_CLIENT_ID,
      clientSecret: env.JOBBER_CLIENT_SECRET,
      refreshToken: env.JOBBER_REFRESH_TOKEN,
      accessToken: env.JOBBER_ACCESS_TOKEN || env.JOBBER_API_TOKEN,
      accessTokenExpiresAt: Number(env.JOBBER_ACCESS_TOKEN_EXPIRES_AT || env.JOBBER_EXPIRES_AT || 0),
      graphqlVersion: env.JOBBER_GRAPHQL_VERSION
    });
  }

  isConfigured(): boolean {
    return Boolean(this.tokenState.accessToken || (this.config.clientId && this.config.clientSecret && this.tokenState.refreshToken));
  }

  async getClients(q: string): Promise<Client[]> {
    const clients = await this.listClients();
    const query = q.trim().toLowerCase();
    return query ? clients.filter((client) => [client.name, client.company ?? ""].join(" ").toLowerCase().includes(query)) : clients;
  }

  async getJobs(range: { from: string; to: string }): Promise<Job[]> {
    const jobs = await this.listJobs();
    const from = Date.parse(range.from);
    const to = Date.parse(range.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      return jobs;
    }
    return jobs.filter((job) => {
      const raw = job.notes ?? "";
      if (!raw) return true;
      return true;
    });
  }

  async getJobDetail(ref: { id?: string; nameQuery?: string }): Promise<JobDetail> {
    const jobs = await this.listJobs();
    const ranked = jobs.map((job) => ({ job, score: matchJob(job, ref) })).sort((left, right) => right.score - left.score);
    const best = ranked[0];
    if (!best || best.score <= 0) {
      throw new RailError("No matching Jobber job was found.", { provider: "jobber", op: "getJobDetail", status: 404 });
    }
    return best.job;
  }

  async health(): Promise<{ ok: boolean; detail: string }> {
    if (!this.isConfigured()) {
      return { ok: true, detail: "Jobber not configured; skipped." };
    }
    await this.graphql(JOBS_QUERY, { first: 1, after: null });
    return { ok: true, detail: "Jobber GraphQL read succeeded." };
  }

  async getProductsAndServices(searchTerm?: string, pageLimit = 25): Promise<JobberProductOrService[]> {
    const products: JobberProductOrService[] = [];
    let after: string | null = null;
    let pages = 0;
    do {
      const payload = await this.graphql(PRODUCTS_QUERY, { first: 100, after, searchTerm: searchTerm?.trim() || null });
      const connection = readConnection(payload, "products");
      products.push(...connection.nodes.map(mapProductOrService));
      after = connection.hasNextPage ? connection.endCursor : null;
      pages += 1;
    } while (after && pages < pageLimit);
    return products;
  }

  private async listJobs(): Promise<JobDetail[]> {
    const jobs: JobDetail[] = [];
    let after: string | null = null;
    let pages = 0;
    do {
      const payload = await this.graphql(JOBS_QUERY, { first: 25, after });
      const connection = readConnection(payload, "jobs");
      jobs.push(...connection.nodes.map((node) => mapJob(node, this.config.tenantId)));
      after = connection.hasNextPage ? connection.endCursor : null;
      pages += 1;
    } while (after && pages < 25);
    return jobs;
  }

  private async listClients(): Promise<Client[]> {
    const clients: Client[] = [];
    let after: string | null = null;
    let pages = 0;
    do {
      const payload = await this.graphql(CLIENTS_QUERY, { first: 25, after });
      const connection = readConnection(payload, "clients");
      clients.push(...mapClients(connection.nodes, this.config.tenantId));
      after = connection.hasNextPage ? connection.endCursor : null;
      pages += 1;
    } while (after && pages < 25);
    return clients;
  }

  private async ensureAccessToken(): Promise<string> {
    if (this.tokenState.accessToken && (!this.tokenState.accessTokenExpiresAt || Date.now() < this.tokenState.accessTokenExpiresAt - 60_000)) {
      return this.tokenState.accessToken;
    }
    if (!this.config.clientId || !this.config.clientSecret || !this.tokenState.refreshToken) {
      throw new RailError("Jobber is missing access token or refresh-token configuration.", {
        provider: "jobber",
        op: "auth",
        status: 400
      });
    }
    await this.refreshAccessToken();
    return this.tokenState.accessToken;
  }

  private async refreshAccessToken(): Promise<void> {
    const params = new URLSearchParams({
      client_id: this.config.clientId ?? "",
      client_secret: this.config.clientSecret ?? "",
      grant_type: "refresh_token",
      refresh_token: this.tokenState.refreshToken
    });
    const payload = await railFetchJson(JOBBER_OAUTH_TOKEN_ENDPOINT, {
      provider: "jobber",
      op: "refreshAccessToken",
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: params.toString()
    }, asRecord);
    const accessToken = text(payload.access_token);
    if (!accessToken) {
      throw new RailError("Jobber refresh response did not include an access token.", { provider: "jobber", op: "refreshAccessToken" });
    }
    this.tokenState = {
      accessToken,
      refreshToken: text(payload.refresh_token) || this.tokenState.refreshToken,
      accessTokenExpiresAt: Date.now() + numberValue(payload.expires_in || 3600) * 1000
    };
  }

  private async graphql(query: string, variables: Record<string, unknown>): Promise<unknown> {
    const accessToken = await this.ensureAccessToken();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await railFetchJson(JOBBER_GRAPHQL_ENDPOINT, {
          provider: "jobber",
          op: "graphql",
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
            "X-JOBBER-GRAPHQL-VERSION": this.graphqlVersion
          },
          body: JSON.stringify({ query, variables }),
          retry401: async () => {
            await this.refreshAccessToken();
          }
        }, (payload) => {
          const record = asRecord(payload);
          const errors = asArray(record.errors);
          if (errors.length > 0) {
            const detail = errors
              .map((error) => text(asRecord(error).message))
              .filter(Boolean)
              .slice(0, 3)
              .join("; ");
            const retryable = detail.toLowerCase().includes("throttled");
            throw new RailError(`Jobber GraphQL returned errors${detail ? `: ${detail}` : ""}.`, {
              provider: "jobber",
              op: "graphql",
              status: 400,
              retryable
            });
          }
          return payload;
        });
      } catch (error) {
        if (error instanceof RailError && error.retryable && attempt < 4) {
          await sleep(1_500 * (attempt + 1));
          continue;
        }
        throw error;
      }
    }
    throw new RailError("Jobber GraphQL retry loop exited unexpectedly.", { provider: "jobber", op: "graphql", status: 500 });
  }
}
