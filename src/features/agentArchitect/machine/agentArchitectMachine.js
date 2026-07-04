import { assign, createMachine } from "xstate";

export const agentArchitectMachine = createMachine({
  id: "agentArchitect",
  context: {
    avatarState: "idle"
  },
  initial: "idle",
  states: {
    idle: {
      entry: assign({
        avatarState: "idle"
      }),
      on: {
        BOOT: "booting"
      }
    },
    booting: {
      entry: assign({
        avatarState: "thinking"
      }),
      on: {
        BOOT_SUCCESS: "collecting",
        BOOT_FAILURE: "error"
      }
    },
    collecting: {
      entry: assign({
        avatarState: "speaking"
      }),
      on: {
        SUBMIT_TURN: "submitting_turn",
        READY_FOR_INPUT: "awaiting_user",
        FAIL: "error"
      }
    },
    awaiting_user: {
      entry: assign({
        avatarState: "listening"
      }),
      on: {
        SUBMIT_TURN: "submitting_turn",
        REVIEW: "reviewing",
        FAIL: "error"
      }
    },
    submitting_turn: {
      entry: assign({
        avatarState: "thinking"
      }),
      on: {
        TURN_ACCEPTED: "streaming_reply",
        SUBMIT_FAILURE: "error"
      }
    },
    streaming_reply: {
      entry: assign({
        avatarState: "speaking"
      }),
      on: {
        STREAM_COMPLETE: "extracting_patch",
        READY_FOR_INPUT: "awaiting_user",
        STREAM_FAILURE: "error"
      }
    },
    extracting_patch: {
      entry: assign({
        avatarState: "thinking"
      }),
      on: {
        PATCH_EXTRACTED: "persisting_patch",
        EXTRACTION_FAILURE: "error"
      }
    },
    persisting_patch: {
      entry: assign({
        avatarState: "thinking"
      }),
      on: {
        PATCH_PERSISTED: "awaiting_user",
        READY_TO_REVIEW: "reviewing",
        PERSIST_FAILURE: "error"
      }
    },
    reviewing: {
      entry: assign({
        avatarState: "speaking"
      }),
      on: {
        RESUME_COLLECTION: "awaiting_user",
        READY_FOR_INPUT: "awaiting_user",
        COMPLETE: "completed",
        FAIL: "error"
      }
    },
    completed: {
      entry: assign({
        avatarState: "react_positive"
      }),
      on: {
        READY_FOR_INPUT: "idle",
        BOOT: "booting",
        RESET: "idle"
      }
    },
    error: {
      entry: assign({
        avatarState: "react_negative"
      }),
      on: {
        READY_FOR_INPUT: "idle",
        RETRY: "booting",
        RESET: "idle"
      }
    }
  }
});
