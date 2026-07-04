import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { buildBasicAuthHeader, updateWordPressPost } from "./wordpressApi.js";

const DEFAULT_STATE_PATH = join(process.cwd(), "tmp-proof", "bragi-telegram-approval-state.json");

function defaultState() {
  return {
    pendingDrafts: [],
    history: [],
  };
}

export function getBragiApprovalStatePath() {
  return process.env.BRAGI_APPROVAL_STATE_PATH || DEFAULT_STATE_PATH;
}

export function loadApprovalState(statePath = getBragiApprovalStatePath()) {
  if (!existsSync(statePath)) {
    return defaultState();
  }

  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8"));
    return {
      pendingDrafts: Array.isArray(parsed.pendingDrafts) ? parsed.pendingDrafts : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return defaultState();
  }
}

export function saveApprovalState(state, statePath = getBragiApprovalStatePath()) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return state;
}

export function buildDraftApprovalMessage(draft) {
  const commands = [
    "APPROVE PUBLISH NOW",
    "APPROVE SCHEDULE YYYY-MM-DD HH:MM",
    "REVISE [notes]",
    "PARK",
  ];

  return [
    "Bragi draft ready for review.",
    "",
    `Title: ${draft.title}`,
    `Draft URL: ${draft.draftUrl}`,
    `Post ID: ${draft.postId}`,
    `Status: ${draft.status || "draft"}`,
    `Focus keyphrase: ${draft.focusKeyphrase || "not provided"}`,
    `Summary: ${draft.summary || "not provided"}`,
    "",
    "Reply to this message with one of these commands:",
    ...commands.map((command) => `- ${command}`),
  ].join("\n");
}

export async function sendTelegramMessage({ botToken, chatId, text, replyToMessageId }) {
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  }
  if (!chatId) {
    throw new Error("TELEGRAM_CHRIS_CHAT_ID is not configured.");
  }

  const payload = {
    chat_id: chatId,
    text,
  };

  if (replyToMessageId) {
    payload.reply_to_message_id = replyToMessageId;
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) {
    throw new Error(data?.description || `Telegram sendMessage failed (${response.status}).`);
  }

  return data.result;
}

export function registerPendingDraft(draft, statePath = getBragiApprovalStatePath()) {
  const state = loadApprovalState(statePath);
  const pendingDraft = {
    postId: Number(draft.postId),
    title: draft.title,
    draftUrl: draft.draftUrl,
    status: draft.status || "draft",
    focusKeyphrase: draft.focusKeyphrase || "",
    summary: draft.summary || "",
    createdAt: new Date().toISOString(),
    approvalStatus: "pending",
    revisionNotes: null,
    scheduledFor: null,
    parkedAt: null,
    publishedAt: null,
    telegramMessageId: draft.telegramMessageId || null,
    telegramChatId: draft.telegramChatId || null,
  };

  state.pendingDrafts = state.pendingDrafts.filter((entry) => Number(entry.postId) !== pendingDraft.postId);
  state.pendingDrafts.push(pendingDraft);
  state.history.push({
    event: "draft_registered",
    postId: pendingDraft.postId,
    at: new Date().toISOString(),
  });

  saveApprovalState(state, statePath);
  return pendingDraft;
}

export function attachTelegramMessageToDraft({ postId, messageId, chatId }, statePath = getBragiApprovalStatePath()) {
  const state = loadApprovalState(statePath);
  const draft = state.pendingDrafts.find((entry) => Number(entry.postId) === Number(postId));

  if (!draft) {
    throw new Error(`No pending draft found for post ${postId}.`);
  }

  draft.telegramMessageId = Number(messageId);
  draft.telegramChatId = String(chatId);
  state.history.push({
    event: "telegram_notification_sent",
    postId: draft.postId,
    messageId: draft.telegramMessageId,
    chatId: draft.telegramChatId,
    at: new Date().toISOString(),
  });

  saveApprovalState(state, statePath);
  return draft;
}

export function parseApprovalCommand(text) {
  const normalized = String(text || "").trim();

  if (/^APPROVE PUBLISH NOW$/i.test(normalized)) {
    return { action: "publish_now" };
  }

  const scheduleMatch = normalized.match(/^APPROVE SCHEDULE (\d{4}-\d{2}-\d{2} \d{2}:\d{2})$/i);
  if (scheduleMatch) {
    return { action: "schedule", scheduledFor: scheduleMatch[1] };
  }

  const reviseMatch = normalized.match(/^REVISE\s+(.+)$/i);
  if (reviseMatch) {
    return { action: "revise", notes: reviseMatch[1].trim() };
  }

  if (/^PARK$/i.test(normalized)) {
    return { action: "park" };
  }

  return null;
}

function findPendingDraftForReply(message, state) {
  const replyMessageId = message?.reply_to_message?.message_id;
  const replyChatId = message?.chat?.id;

  if (!replyMessageId || !replyChatId) {
    return null;
  }

  return state.pendingDrafts.find(
    (entry) =>
      Number(entry.telegramMessageId) === Number(replyMessageId) &&
      String(entry.telegramChatId) === String(replyChatId) &&
      entry.approvalStatus === "pending"
  );
}

function getWordPressScheduleFields(scheduledFor) {
  const localValue = `${scheduledFor.replace(" ", "T")}:00`;
  return {
    status: "future",
    date: localValue,
  };
}

async function executeApprovedAction({ action, draft, credentials, parsedCommand }) {
  const siteUrl = credentials.siteUrl || "https://aquatraceleak.com";
  const authHeader = buildBasicAuthHeader(credentials.apiUsername, credentials.apiPassword);

  if (action === "publish_now") {
    return updateWordPressPost({
      siteUrl,
      authHeader,
      postId: draft.postId,
      fields: { status: "publish" },
    });
  }

  if (action === "schedule") {
    return updateWordPressPost({
      siteUrl,
      authHeader,
      postId: draft.postId,
      fields: getWordPressScheduleFields(parsedCommand.scheduledFor),
    });
  }

  return null;
}

function buildResultConfirmation({ action, draft, parsedCommand, wordpressResult }) {
  if (action === "publish_now") {
    return `Bragi update: post ${draft.postId} is now published.\n${wordpressResult?.link || draft.draftUrl}`;
  }

  if (action === "schedule") {
    return `Bragi update: post ${draft.postId} is scheduled for ${parsedCommand.scheduledFor}.\n${wordpressResult?.link || draft.draftUrl}`;
  }

  if (action === "revise") {
    return `Bragi update: post ${draft.postId} is staying in draft and marked for revision.\nNotes: ${parsedCommand.notes}`;
  }

  return `Bragi update: post ${draft.postId} is parked and staying unpublished.`;
}

export async function handleTelegramApproval({
  message,
  botToken,
  expectedChatId,
  credentials,
  statePath = getBragiApprovalStatePath(),
}) {
  if (!message?.chat?.id || String(message.chat.id) !== String(expectedChatId)) {
    throw new Error("Telegram message did not come from the configured Chris chat.");
  }

  const parsedCommand = parseApprovalCommand(message.text);
  if (!parsedCommand) {
    const warning = "Command not accepted. Reply to the Bragi draft message with: APPROVE PUBLISH NOW, APPROVE SCHEDULE YYYY-MM-DD HH:MM, REVISE [notes], or PARK.";
    await sendTelegramMessage({
      botToken,
      chatId: expectedChatId,
      text: warning,
      replyToMessageId: message.message_id,
    });
    return { ok: false, action: "ignored", reason: "unrecognized_command" };
  }

  const state = loadApprovalState(statePath);
  const draft = findPendingDraftForReply(message, state);

  if (!draft) {
    const warning = "I could not match that approval to a pending Bragi draft. Please reply directly to the draft notification message.";
    await sendTelegramMessage({
      botToken,
      chatId: expectedChatId,
      text: warning,
      replyToMessageId: message.message_id,
    });
    return { ok: false, action: parsedCommand.action, reason: "pending_draft_not_matched" };
  }

  let wordpressResult = null;
  if (parsedCommand.action === "publish_now" || parsedCommand.action === "schedule") {
    wordpressResult = await executeApprovedAction({
      action: parsedCommand.action,
      draft,
      credentials,
      parsedCommand,
    });
  }

  draft.approvalStatus = parsedCommand.action;
  if (parsedCommand.action === "revise") {
    draft.revisionNotes = parsedCommand.notes;
  }
  if (parsedCommand.action === "park") {
    draft.parkedAt = new Date().toISOString();
  }
  if (parsedCommand.action === "schedule") {
    draft.scheduledFor = parsedCommand.scheduledFor;
  }
  if (parsedCommand.action === "publish_now") {
    draft.publishedAt = new Date().toISOString();
  }

  state.history.push({
    event: "approval_processed",
    postId: draft.postId,
    action: parsedCommand.action,
    at: new Date().toISOString(),
  });
  saveApprovalState(state, statePath);

  const confirmation = buildResultConfirmation({
    action: parsedCommand.action,
    draft,
    parsedCommand,
    wordpressResult,
  });

  const confirmationMessage = await sendTelegramMessage({
    botToken,
    chatId: expectedChatId,
    text: confirmation,
    replyToMessageId: message.message_id,
  });

  return {
    ok: true,
    action: parsedCommand.action,
    postId: draft.postId,
    wordpressResult,
    confirmationMessageId: confirmationMessage.message_id,
  };
}
