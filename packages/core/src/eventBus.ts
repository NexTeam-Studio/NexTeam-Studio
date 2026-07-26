import type { Firestore } from "firebase-admin/firestore";
import type { BusEvent, EventBus, EventType, ID } from "./types.js";
import { busEventSchema } from "./schemas.js";

function makeId(): ID {
  return `evt_${crypto.randomUUID()}`;
}

export class InMemoryEventBus implements EventBus {
  private readonly events: BusEvent[] = [];
  private readonly handlers = new Map<EventType, Array<{ name: string; h: (e: BusEvent) => Promise<void> }>>();

  async emit(e: Omit<BusEvent, "id" | "ts" | "processedBy">): Promise<void> {
    const event = busEventSchema.parse({
      ...e,
      id: makeId(),
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

  subscribe(type: EventType, handlerName: string, h: (e: BusEvent) => Promise<void>): void {
    const handlers = this.handlers.get(type) ?? [];
    handlers.push({ name: handlerName, h });
    this.handlers.set(type, handlers);
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
  constructor(private readonly db: Firestore) {}

  async emit(e: Omit<BusEvent, "id" | "ts" | "processedBy">): Promise<void> {
    const event = busEventSchema.parse({
      ...e,
      id: makeId(),
      ts: new Date().toISOString(),
      processedBy: []
    }) as BusEvent;
    // @tenant-doc:events busEventSchema requires tenantId before write.
    await this.db.collection("events").doc(event.id).set(event);
  }

  subscribe(type: EventType, handlerName: string, h: (e: BusEvent) => Promise<void>): void {
    this.db.collection("events").where("type", "==", type).onSnapshot((snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type === "removed") {
          continue;
        }
        const parsed = busEventSchema.safeParse(change.doc.data());
        if (!parsed.success) {
          continue;
        }
        const event = parsed.data as BusEvent;
        if (event.processedBy.includes(handlerName)) {
          continue;
        }
        void h(event).then(async () => {
          await change.doc.ref.update({
            processedBy: [...event.processedBy, handlerName]
          });
        });
      }
    });
  }

  async listEvents(input: {
    tenantId?: ID | undefined;
    limit?: number | undefined;
    types?: EventType[] | undefined;
  } = {}): Promise<BusEvent[]> {
    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = this.db.collection("events");
    if (input.tenantId) {
      query = query.where("tenantId", "==", input.tenantId);
    }
    if (input.types?.length === 1) {
      query = query.where("type", "==", input.types[0]);
    }
    query = query.orderBy("ts", "desc");
    if (input.limit && input.limit > 0) {
      query = query.limit(input.limit);
    }
    const snapshot = await query.get();
    const parsed = snapshot.docs
      .map((doc) => busEventSchema.safeParse(doc.data()))
      .filter((result): result is { success: true; data: BusEvent } => result.success)
      .map((result) => result.data);
    if (!input.types?.length || input.types.length === 1) {
      return parsed;
    }
    const typeSet = new Set(input.types);
    return parsed.filter((event) => typeSet.has(event.type));
  }
}
