import { createActor, createMachine } from "xstate";
import type { CampaignContact, SequenceStep } from "./schemas.js";

export interface PlannedCampaignSend {
  id: string;
  contactId: string;
  stepId: string;
  channel: SequenceStep["channel"];
  sendAt: string;
  stopOnReply: boolean;
  stopOnUnsubscribe: boolean;
}

export const campaignSequenceMachine = createMachine({
  id: "campaignSequence",
  initial: "draft",
  states: {
    draft: {
      on: { PLAN: "planning" }
    },
    planning: {
      on: {
        QUEUE: "approvalQueued",
        BLOCK: "blocked",
        SUPPRESS: "suppressed"
      }
    },
    approvalQueued: {
      on: {
        TRACK_OPEN: "engaged",
        TRACK_CLICK: "engaged",
        UNSUBSCRIBE: "suppressed",
        COMPLETE: "completed"
      }
    },
    engaged: {
      on: {
        UNSUBSCRIBE: "suppressed",
        COMPLETE: "completed"
      }
    },
    suppressed: {
      type: "final"
    },
    blocked: {
      type: "final"
    },
    completed: {
      type: "final"
    }
  }
});

export function sequenceStateAfter(events: string[]): string {
  const actor = createActor(campaignSequenceMachine);
  actor.start();
  for (const event of events) {
    actor.send({ type: event });
  }
  const value = actor.getSnapshot().value;
  actor.stop();
  return String(value);
}

export function planSequenceSends(input: {
  campaignId: string;
  contacts: CampaignContact[];
  sequence: SequenceStep[];
  now?: Date | string | undefined;
}): PlannedCampaignSend[] {
  const startedAt = input.now instanceof Date ? input.now : new Date(input.now ?? Date.now());
  return input.contacts.flatMap((contact) =>
    input.sequence.map((step) => {
      const sendAt = new Date(startedAt.getTime() + step.delayHours * 60 * 60 * 1000);
      return {
        id: `send_${input.campaignId}_${contact.id}_${step.id}`,
        contactId: contact.id,
        stepId: step.id,
        channel: step.channel,
        sendAt: sendAt.toISOString(),
        stopOnReply: step.stopOnReply,
        stopOnUnsubscribe: step.stopOnUnsubscribe
      };
    })
  );
}
