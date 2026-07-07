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

  listEvents(): BusEvent[] {
    return [...this.events];
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
}
