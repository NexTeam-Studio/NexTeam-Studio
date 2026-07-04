import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, "../../../../tmp-proof/vgb-controlled-campaign-state.json");
const VGB_CAMPAIGN_ID = "vgb-controlled-campaign";
const CONTROLLED_BATCH_LIMIT = 3;

const DEFAULT_REPLY_TRACKING = {
  stateExists: true,
  inboundReplyCaptureWired: false,
  lastReplyAt: null,
  blocker: "Inbound reply capture is not wired yet; reply state exists but must be updated manually until a mailbox/reply ingest path is added.",
};

function ensureStateDir() {
  const dir = dirname(STATE_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function createDefaultState() {
  return {
    campaignId: VGB_CAMPAIGN_ID,
    mode: "controlled",
    approvalRequired: true,
    approvedByChris: false,
    approvedAt: null,
    dryRunOnlyUntilApproved: true,
    controlledBatchLimit: CONTROLLED_BATCH_LIMIT,
    draft: {
      subject: "",
      bodyPreview: "",
      contactCount: 0,
      updatedAt: null,
    },
    lastDryRun: null,
    lastRealSend: null,
    events: [],
    contacts: {},
    tracking: {
      sendLoggingEnabled: true,
      messageIdsLogged: true,
      followUpTrackingStateExists: true,
      replyTracking: { ...DEFAULT_REPLY_TRACKING },
    },
  };
}

export function getVgbCampaignStatePath() {
  return STATE_PATH;
}

export function loadVgbCampaignState() {
  ensureStateDir();
  if (!existsSync(STATE_PATH)) {
    return createDefaultState();
  }

  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH, "utf8"));
    return {
      ...createDefaultState(),
      ...parsed,
      tracking: {
        ...createDefaultState().tracking,
        ...(parsed.tracking || {}),
        replyTracking: {
          ...DEFAULT_REPLY_TRACKING,
          ...(parsed.tracking?.replyTracking || {}),
        },
      },
      draft: {
        ...createDefaultState().draft,
        ...(parsed.draft || {}),
      },
      contacts: parsed.contacts || {},
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch {
    return createDefaultState();
  }
}

export function saveVgbCampaignState(nextState) {
  ensureStateDir();
  writeFileSync(STATE_PATH, JSON.stringify(nextState, null, 2), "utf8");
  return nextState;
}

function upsertContactState(existingContacts, contact) {
  const contactId = contact.contactId || contact.id || contact.email || `contact-${Date.now()}`;
  const current = existingContacts[contactId] || {
    contactId,
    email: contact.email || null,
    propertyName: contact.propertyName || null,
    sent: false,
    sentAt: null,
    lastMessageId: null,
    replied: false,
    repliedAt: null,
    followUpNeeded: false,
    followUpDueAt: null,
  };

  return {
    ...existingContacts,
    [contactId]: {
      ...current,
      email: contact.email || current.email,
      propertyName: contact.propertyName || current.propertyName,
    },
  };
}

function pushEvent(state, event) {
  state.events = [
    ...state.events,
    {
      at: new Date().toISOString(),
      ...event,
    },
  ].slice(-50);
}

export function prepareVgbDraft({ subject, bodyPreview, contacts = [] }) {
  const state = loadVgbCampaignState();
  const nextState = {
    ...state,
    draft: {
      subject: subject || state.draft.subject,
      bodyPreview: bodyPreview || state.draft.bodyPreview,
      contactCount: Array.isArray(contacts) ? contacts.length : state.draft.contactCount,
      updatedAt: new Date().toISOString(),
    },
  };

  for (const contact of contacts) {
    nextState.contacts = upsertContactState(nextState.contacts, contact);
  }

  pushEvent(nextState, {
    type: "draft-updated",
    subject: nextState.draft.subject,
    contactCount: nextState.draft.contactCount,
  });

  return saveVgbCampaignState(nextState);
}

export function approveVgbCampaign({ approvedBy = "Chris" } = {}) {
  const state = loadVgbCampaignState();
  const nextState = {
    ...state,
    approvedByChris: true,
    approvedAt: new Date().toISOString(),
  };

  pushEvent(nextState, {
    type: "approval-granted",
    approvedBy,
  });

  return saveVgbCampaignState(nextState);
}

export function buildVgbDryRun({ contacts = [], subject, bodyPreview } = {}) {
  const prepared = prepareVgbDraft({ subject, bodyPreview, contacts });
  const limitedContacts = contacts.slice(0, CONTROLLED_BATCH_LIMIT).map((contact) => ({
    contactId: contact.contactId || contact.id || contact.email,
    email: contact.email || null,
    propertyName: contact.propertyName || null,
  }));

  const nextState = {
    ...prepared,
    lastDryRun: {
      at: new Date().toISOString(),
      requestedCount: contacts.length,
      allowedBatchSize: CONTROLLED_BATCH_LIMIT,
      previewCount: limitedContacts.length,
      previewRecipients: limitedContacts,
      blockedBulk: contacts.length > CONTROLLED_BATCH_LIMIT,
      approvedByChris: prepared.approvedByChris,
      dryRunOnly: true,
    },
  };

  pushEvent(nextState, {
    type: "dry-run",
    requestedCount: contacts.length,
    previewCount: limitedContacts.length,
    blockedBulk: contacts.length > CONTROLLED_BATCH_LIMIT,
  });

  saveVgbCampaignState(nextState);
  return nextState.lastDryRun;
}

export function verifyControlledSendProtection({ requestedCount = 0 } = {}) {
  const state = loadVgbCampaignState();

  if (!state.approvedByChris) {
    return {
      ok: false,
      blocked: true,
      reason: "Chris approval is required before any controlled campaign send.",
    };
  }

  if (requestedCount > CONTROLLED_BATCH_LIMIT) {
    return {
      ok: false,
      blocked: true,
      reason: `Requested batch exceeds the controlled batch limit of ${CONTROLLED_BATCH_LIMIT}.`,
    };
  }

  return {
    ok: true,
    blocked: false,
    reason: "Controlled send is eligible if explicitly triggered.",
  };
}

export function logVgbSendResult({ contactId, email, propertyName, messageId, sentAt, subject }) {
  const state = loadVgbCampaignState();
  const nextState = {
    ...state,
    contacts: upsertContactState(state.contacts, { contactId, email, propertyName }),
    lastRealSend: {
      contactId,
      email,
      propertyName: propertyName || null,
      messageId,
      sentAt,
      subject,
    },
  };

  nextState.contacts[contactId] = {
    ...nextState.contacts[contactId],
    sent: true,
    sentAt,
    lastMessageId: messageId,
    followUpNeeded: true,
    followUpDueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  };

  pushEvent(nextState, {
    type: "real-send",
    contactId,
    email,
    messageId,
  });

  return saveVgbCampaignState(nextState);
}
