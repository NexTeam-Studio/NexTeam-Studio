import type { ApprovalItem, ArtifactKind, ID } from "./types.js";
import { approvalItemSchema } from "./schemas.js";
import { RailError } from "./errors.js";

export interface CreateApprovalItemInput {
  tenantId: ID;
  kind: ArtifactKind;
  preview: ApprovalItem["preview"];
  execute: ApprovalItem["execute"];
  createdBy: ApprovalItem["createdBy"];
}

export interface ApprovalQueueRepository {
  create(item: ApprovalItem): Promise<ApprovalItem>;
  get(id: ID): Promise<ApprovalItem | null>;
  update(id: ID, patch: Partial<ApprovalItem>): Promise<ApprovalItem>;
  listPending(tenantId: ID): Promise<ApprovalItem[]>;
}

export interface ApprovalExecutor {
  execute(item: ApprovalItem): Promise<unknown>;
}

export class InMemoryApprovalQueueRepository implements ApprovalQueueRepository {
  private readonly items = new Map<ID, ApprovalItem>();

  async create(item: ApprovalItem): Promise<ApprovalItem> {
    this.items.set(item.id, item);
    return item;
  }

  async get(id: ID): Promise<ApprovalItem | null> {
    return this.items.get(id) ?? null;
  }

  async update(id: ID, patch: Partial<ApprovalItem>): Promise<ApprovalItem> {
    const existing = this.items.get(id);
    if (!existing) {
      throw new RailError(`Approval item ${id} was not found.`, { provider: "approval", op: "update", status: 404 });
    }
    const next = approvalItemSchema.parse({ ...existing, ...patch }) as ApprovalItem;
    this.items.set(id, next);
    return next;
  }

  async listPending(tenantId: ID): Promise<ApprovalItem[]> {
    return [...this.items.values()].filter((item) => item.tenantId === tenantId && item.status === "pending");
  }
}

export class DryRunApprovalExecutor implements ApprovalExecutor {
  async execute(item: ApprovalItem): Promise<unknown> {
    return {
      dryRun: true,
      service: item.execute.service,
      op: item.execute.op,
      message: "Outbound execution is parked in approval queue."
    };
  }
}

export class ApprovalQueueService {
  constructor(
    private readonly repository: ApprovalQueueRepository,
    private readonly executor: ApprovalExecutor = new DryRunApprovalExecutor()
  ) {}

  async create(input: CreateApprovalItemInput): Promise<ApprovalItem> {
    const item = approvalItemSchema.parse({
      id: `appr_${crypto.randomUUID()}`,
      tenantId: input.tenantId,
      kind: input.kind,
      preview: input.preview,
      execute: input.execute,
      status: "pending",
      createdBy: input.createdBy
    }) as ApprovalItem;
    return this.repository.create(item);
  }

  async approve(id: ID): Promise<ApprovalItem> {
    const item = await this.repository.get(id);
    if (!item) {
      throw new RailError(`Approval item ${id} was not found.`, { provider: "approval", op: "approve", status: 404 });
    }
    return this.repository.update(id, { status: "approved", decidedAt: new Date().toISOString() });
  }

  async executeApproved(id: ID): Promise<{ item: ApprovalItem; result: unknown }> {
    const item = await this.repository.get(id);
    if (!item || item.status !== "approved") {
      throw new RailError(`Approval item ${id} is not approved.`, { provider: "approval", op: "execute", status: 409 });
    }
    const result = await this.executor.execute(item);
    const executed = await this.repository.update(id, { status: "executed" });
    return { item: executed, result };
  }

  listPending(tenantId: ID): Promise<ApprovalItem[]> {
    return this.repository.listPending(tenantId);
  }
}
