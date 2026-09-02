import type { Firestore } from "firebase-admin/firestore";
import type { BusEvent, EventBus, EventType, ID } from "./types.js";
import { boundedTenantQuery, DEFAULT_FIRESTORE_READ_LIMIT, recordFirestoreRead } from "./firestoreReadSafety.js";
import { busEventSchema } from "./schemas.js";

const DEFAULT_EVENT_LIST_LIMIT = DEFAULT_FIRESTORE_READ_LIMIT;

function makeId(): ID {
  return `evt_${crypto.randomUUID()}`;
}

export class InMemoryEventBus implements EventBus {
  private readonly events: BusEvent[] = [];
  private readonly handlers = new Map<EventType, Array<{ name: string; h: (e: BusEvent) => Promise<void> }>>();

  async emit(e: Omit<BusEvent, "id" | "ts" | "processedBy">): Promise<void> {
    await this.emitWithId(makeId(), e);
  }

  async emitOnce(idempotencyKey: ID, e: Omit<BusEvent, "id" | "ts" | "processedBy">): Promise<void> {
    const id = `evt_${idempotencyKey}`;
    if (this.events.some((event) => event.id === id)) return;
    await this.emitWithId(id, e);
  }

  private async emitWithId(id: ID, e: Omit<BusEvent, "id" | "ts" | "processedBy">): Promise<void> {
    const event = busEventSchema.parse({
      ...e,
      id,
      ts: new Date().toISOString(),
      processedBy: []
    }) as BusEvent;
    this.events.push(event);
    const handlers = this.handlers.get(event.type) ?? [];
    for (const handler of handlers) {
      if (!event.processedBy.includes(handler.name)) {
        await handler.h(event);
        event.processedBy.push(handler.name);
      }
    }
  }

  subscribe(type: EventType, handlerName: string, h: (e: BusEvent) => Promise<void>): () => void {
    const handlers = this.handlers.get(type) ?? [];
    const handler = { name: handlerName, h };
    handlers.push(handler);
    this.handlers.set(type, handlers);
    return () => {
      const current = this.handlers.get(type) ?? [];
      this.handlers.set(type, current.filter((registered) => registered !== handler));
    };
  }

  async listEvents(input: {
    tenantId?: ID | undefined;
    limit?: number | undefined;
    types?: EventType[] | undefined;
  } = {}): Promise<BusEvent[]> {
    const typeSet = input.types?.length ? new Set(input.types) : null;
    const filtered = this.events
      .filter((event) => !input.tenantId || event.tenantId === input.tenantId)
      .filter((event) => !typeSet || typeSet.has(event.type))
      .sort((left, right) => right.ts.localeCompare(left.ts));
    return input.limit ? filtered.slice(0, input.limit) : filtered;
  }
}

export class FirestoreEventBus implements EventBus {
  private readonly handlers = new Map<EventType, Array<{ name: string; h: (e: BusEvent) => Promise<void> }>>();

  constructor(private readonly db: Firestore) {}

  async emit(e: Omit<BusEvent, "id" | "ts" | "processedBy">): Promise<void> {
    await this.emitWithId(makeId(), e);
  }

  async emitOnce(idempotencyKey: ID, e: Omit<BusEvent, "id" | "ts" | "processedBy">): Promise<void> {
    await this.emitWithId(`evt_${idempotencyKey}`, e);
  }

  private async emitWithId(id: ID, e: Omit<BusEvent, "id" | "ts" | "processedBy">): Promise<void> {
    const event = busEventSchema.parse({
      ...e,
      id,
      ts: new Date().toISOString(),
      processedBy: []
    }) as BusEvent;
    const ref = this.db.collection("events").doc(event.id);
    await this.db.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);
      if (existing.exists) {
        const current = busEventSchema.parse(existing.data()) as BusEvent;
        if (current.tenantId !== event.tenantId) {
          throw new Error(`Event ${event.id} belongs to another tenant.`);
        }
        return;
      }
      transaction.set(ref, event);
    });
    await this.dispatch(event);
  }

  private async dispatch(event: BusEvent): Promise<void> {
    for (const handler of this.handlers.get(event.type) ?? []) {
      if (event.processedBy.includes(handler.name)) continue;
      await handler.h(event);
      await this.db.runTransaction(async (transaction) => {
        const ref = this.db.collection("events").doc(event.id);
        const latest = await transaction.get(ref);
        if (!latest.exists) return;
        const current = busEventSchema.parse(latest.data()) as BusEvent;
        if (current.tenantId !== event.tenantId) {
          throw new Error(`Event ${event.id} tenant changed before acknowledgement.`);
        }
        transaction.set(ref, {
          ...current,
          processedBy: [...new Set([...current.processedBy, handler.name])]
        });
      });
    }
  }

  subscribe(type: EventType, handlerName: string, h: (e: BusEvent) => Promise<void>): () => void {
    const handlers = this.handlers.get(type) ?? [];
    const handler = { name: handlerName, h };
    handlers.push(handler);
    this.handlers.set(type, handlers);
    return () => {
      const current = this.handlers.get(type) ?? [];
      this.handlers.set(type, current.filter((registered) => registered !== handler));
    };
  }

  async listEvents(input: {
    tenantId?: ID | undefined;
    limit?: number | undefined;
    types?: EventType[] | undefined;
  } = {}): Promise<BusEvent[]> {
    if (!input.tenantId) {
      throw new Error("Firestore event reads require a tenantId.");
    }
    const requestedLimit = Math.min(input.limit && input.limit > 0 ? input.limit : DEFAULT_EVENT_LIST_LIMIT, DEFAULT_EVENT_LIST_LIMIT);
    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = boundedTenantQuery(this.db, "events", input.tenantId, { limit: requestedLimit });
    if (input.types?.length === 1) {
      query = query.where("type", "==", input.types[0]);
    }
    query = query.orderBy("ts", "desc");
    query = query.limit(requestedLimit);
    let snapshot: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;
    try {
      snapshot = await query.get();
    } catch (error) {
      const missingIndex = error instanceof Error
        && (error.message.includes("requires an index") || error.message.includes("FAILED_PRECONDITION"));
      if (!missingIndex) {
        throw error;
      }
      // A newly provisioned tenant can briefly be missing the optional read index.
      // Keep the activity surface available until the declarative index deployment catches up.
      snapshot = await boundedTenantQuery(this.db, "events", input.tenantId, { limit: requestedLimit }).get();
    }
    recordFirestoreRead({ collection: "events", operation: "event-list", tenantId: input.tenantId, returnedDocumentCount: snapshot.docs.length, limit: requestedLimit, filters: input.types?.length === 1 ? ["tenantId", "type"] : ["tenantId"] });
    const parsed = snapshot.docs
      .map((doc) => busEventSchema.safeParse(doc.data()))
      .filter((result): result is { success: true; data: BusEvent } => result.success)
      .map((result) => result.data)
      .filter((event) => !input.types?.length || input.types.includes(event.type))
      .sort((left, right) => right.ts.localeCompare(left.ts));
    return parsed.slice(0, requestedLimit);
  }
}
