import React, { useEffect, useRef, useState } from "react";
import { mapsHref } from "@nexteam/shared";
import { PlatformMark } from "../../../../../shared/branding/ProductBranding";

export interface NexiStandaloneSource {
  rail: string;
  ref: string;
  label: string;
}

export interface NexiStandaloneMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources: NexiStandaloneSource[];
  createdAt?: string;
  pendingApproval?: NexiStandalonePendingApproval | null;
}

export interface NexiStandalonePendingApproval {
  approvalId: string;
  awaitingChanges: boolean;
  revisableClientCreate: boolean;
  revisableQuoteCreate: boolean;
  revisableJobCreate: boolean;
  revisableJobAction: boolean;
  revisableJobVisitSeries: boolean;
  revisableVisitShift: boolean;
  revisableLedgerAction: boolean;
  revisableInvoiceCompose: boolean;
  revisableInvoiceSend: boolean;
  revisableCollectPayment: boolean;
  revisableReceiptReview: boolean;
  revisableContentDraft: boolean;
}

export interface NexiStandaloneStoredSession {
  conversationId: string;
  pendingApproval: NexiStandalonePendingApproval | null;
}

export const NEXI_FRIENDLY_FAILURE_MESSAGE = "I couldn't pull that up just now - the check failed on my end and I've logged it to fix. Give me a moment and try again.";

const RAW_NEXI_ERROR_PATTERN = /\b(?:tools:\s*tool names must be unique|duplicate nexi tool registration|unknown tool:|anthropic_api_key|typeerror:|referenceerror:|syntaxerror:|cannot read properties of|zoderror|stack trace)\b/i;
const APPROVAL_SOURCE_PATTERN = /\bappr_[a-z0-9_-]+\b/i;
const APPROVAL_PROMPT_PATTERN = /(?:Do the [A-Za-z ]+ Details look correct\?|Is this correct\?)$/i;
const LABELED_PHONE_PATTERN = /\b(?:phone(?:\s+number)?(?:\s+on\s+file)?(?:\s+for\s+.+?)?\s*(?:is|=|:)|phone:)\s*([+()\d][+()\d\s.-]{6,})/i;
const ADDRESS_LEAD_PATTERN = /\b(?:address(?:\s+on\s+file)?(?:\s+for\s+.+?)?\s*(?:is|=|:)|service address(?:\s+for\s+.+?)?\s*(?:is|=|:)|billing address(?:\s+for\s+.+?)?\s*(?:is|=|:))\s*(.+)$/i;
const STREET_ADDRESS_PATTERN = /\b\d{1,6}\s+[A-Za-z0-9.' -]+?\s+(?:road|rd|drive|dr|lane|ln|street|st|avenue|ave|court|ct|trail|trl|way|circle|cir|boulevard|blvd|highway|hwy|place|pl|parkway|pkwy)\b(?:\s+[A-Za-z.'-]+){0,6}(?:\s+\d{5}(?:-\d{4})?)?/i;
const CALL_OFFER_PATTERN = /\bwould you like me to call(?:\s+(?:him|her|them))?\s+now\??/i;
const MAPS_OFFER_PATTERN = /\bwould you like directions(?:\s+or should i open it in maps)?\??|\bwould you like me to open it in maps\??/i;
const ACTION_CONFIRM_PATTERN = /^(?:yes|yep|yeah|sure|ok|okay|please|please do|do it|go ahead)\b/i;
const ACTION_DECLINE_PATTERN = /^(?:no|nope|not now|cancel|don't|do not|no thanks|no thank you)\b/i;

export function nexiNeedsFriendlyFailure(text: string): boolean {
  return RAW_NEXI_ERROR_PATTERN.test(text);
}

export function sanitizeNexiRenderedText(text: string): string {
  return nexiNeedsFriendlyFailure(text) ? NEXI_FRIENDLY_FAILURE_MESSAGE : text;
}

export function formatNexiMessageTimestamp(value: string | undefined): string {
  const parsed = value ? new Date(value) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

export function formatNexiOperatorDisplayName(displayName: string | null | undefined, email: string | null | undefined): string {
  const preferred = displayName?.trim();
  if (preferred) {
    return preferred;
  }
  const mailbox = email?.split("@")[0]?.trim() ?? "";
  const normalized = mailbox
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "Operator";
  }
  const firstToken = normalized.split(" ")[0] ?? normalized;
  return firstToken.charAt(0).toUpperCase() + firstToken.slice(1).toLowerCase();
}

export function nexiShouldHideRenderedSource(source: { ref: string; label: string }): boolean {
  return source.ref.startsWith("appr_")
    || APPROVAL_SOURCE_PATTERN.test(source.ref)
    || APPROVAL_SOURCE_PATTERN.test(source.label)
    || source.label.startsWith("ApprovalQueue ")
    || source.label.startsWith("Approval queue ");
}

export function nexiIsApprovalPrompt(text: string): boolean {
  return APPROVAL_PROMPT_PATTERN.test(text);
}

export function nexiActiveApprovalPrompt(
  messages: NexiStandaloneMessage[],
  fallbackPendingApproval: NexiStandalonePendingApproval | null | undefined
): { messageId: string | null; pendingApproval: NexiStandalonePendingApproval | null } {
  for (const message of [...messages].reverse()) {
    if (message.role !== "assistant" || !nexiIsApprovalPrompt(message.text)) {
      continue;
    }
    return {
      messageId: message.id,
      pendingApproval: message.pendingApproval?.approvalId ? message.pendingApproval : (fallbackPendingApproval ?? null)
    };
  }
  return {
    messageId: null,
    pendingApproval: null
  };
}

export function nexiPhoneActionValue(text: string): string | undefined {
  const labeled = text.match(LABELED_PHONE_PATTERN)?.[1];
  if (!labeled) {
    return undefined;
  }
  const digits = labeled.replace(/[^\d+]/g, "").trim();
  return digits || undefined;
}

function keyedMessageLine(text: string, label: string): string | undefined {
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().startsWith(`${label.toLowerCase()}:`))
    ?.split(":")
    .slice(1)
    .join(":")
    .trim();
}

export function nexiAddressActionValue(text: string): string | undefined {
  const directLine = keyedMessageLine(text, "Address");
  const city = keyedMessageLine(text, "City");
  const state = keyedMessageLine(text, "State");
  const zip = keyedMessageLine(text, "ZIP");
  if (directLine) {
    const joined = [directLine, city, state, zip].filter(Boolean).join(", ").replace(/\s+,/g, ",").trim();
    return joined || undefined;
  }
  const leadingLine = text.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => ADDRESS_LEAD_PATTERN.test(line));
  const leading = leadingLine?.match(ADDRESS_LEAD_PATTERN)?.[1]?.trim();
  if (leading) {
    return leading.replace(/[.]+$/g, "").trim() || undefined;
  }
  return text.match(STREET_ADDRESS_PATTERN)?.[0]?.trim();
}

export function nexiMapsHref(address: string, userAgent?: string): string {
  const ua = userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  return mapsHref(address, ua);
}

export interface NexiConversationOffer {
  kind: "call" | "maps";
  href: string;
  label: string;
}

export function nexiConversationOffer(text: string, userAgent?: string): NexiConversationOffer | null {
  if (nexiIsApprovalPrompt(text)) {
    return null;
  }
  const phone = nexiPhoneActionValue(text);
  if (phone && CALL_OFFER_PATTERN.test(text)) {
    return {
      kind: "call",
      href: `tel:${phone}`,
      label: phone
    };
  }
  const address = nexiAddressActionValue(text);
  if (address && MAPS_OFFER_PATTERN.test(text)) {
    return {
      kind: "maps",
      href: nexiMapsHref(address, userAgent),
      label: address
    };
  }
  return null;
}

export function nexiConversationOfferReplyAction(
  reply: string,
  offer: NexiConversationOffer | null
): "confirm" | "decline" | "none" {
  if (!offer) {
    return "none";
  }
  const trimmed = reply.trim().toLowerCase();
  if (!trimmed) {
    return "none";
  }
  if (ACTION_DECLINE_PATTERN.test(trimmed)) {
    return "decline";
  }
  if (offer.kind === "call" && /\bcall\b/.test(trimmed)) {
    return "confirm";
  }
  if (offer.kind === "maps" && /\b(?:map|maps|direction|directions|navigate|navigation|route|open)\b/.test(trimmed)) {
    return "confirm";
  }
  if (ACTION_CONFIRM_PATTERN.test(trimmed)) {
    return "confirm";
  }
  return "none";
}

export function nexiStoredSessionKey(tenantId: string, userId: string): string {
  return `nexi-standalone-session:${tenantId}:${userId}`;
}

export function parseNexiStoredSession(raw: string | null): NexiStandaloneStoredSession | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<NexiStandaloneStoredSession>;
    if (typeof parsed.conversationId !== "string" || !parsed.conversationId.trim()) {
      return null;
    }
    return {
      conversationId: parsed.conversationId.trim(),
      pendingApproval: parsed.pendingApproval && typeof parsed.pendingApproval === "object"
        ? parsed.pendingApproval as NexiStandalonePendingApproval
        : null
    };
  } catch {
    return null;
  }
}

export function stringifyNexiStoredSession(session: NexiStandaloneStoredSession): string {
  return JSON.stringify(session);
}

export function shouldAutoScrollNexiThread(input: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  threshold?: number;
}): boolean {
  const threshold = input.threshold ?? 56;
  return input.scrollTop + input.clientHeight >= input.scrollHeight - threshold;
}

export interface NexiStandaloneLayoutProps {
  header: React.ReactNode;
  overlays?: React.ReactNode;
  floatingAction?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  statusLiveText?: string;
  messages: NexiStandaloneMessage[];
  working: boolean;
  draft: string;
  uploading?: boolean;
  speechSupported: boolean;
  listening: boolean;
  speaking: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
  onAttachFiles: (event: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  onMicClick: () => void;
  renderMessageSources?: (message: NexiStandaloneMessage) => React.ReactNode;
}

export function NexiStandaloneLayout(props: NexiStandaloneLayoutProps): React.ReactElement {
  const threadRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

  useEffect(() => {
    const node = threadRef.current;
    if (!node || !stickToBottom) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [props.messages, props.working, stickToBottom]);

  function handleThreadScroll(): void {
    const node = threadRef.current;
    if (!node) {
      return;
    }
    setStickToBottom(shouldAutoScrollNexiThread({
      scrollTop: node.scrollTop,
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight
    }));
  }

  return (
    <main className={["nexi-standalone-app", props.className ?? ""].filter(Boolean).join(" ")} style={props.style}>
      {props.header}
      {props.overlays ?? null}
      {props.floatingAction ?? null}
      <section className="nexi-standalone-shell">
        {props.statusLiveText ? <p className="sr-only" aria-live="polite">{props.statusLiveText}</p> : null}
        <div className="nexi-standalone-thread" ref={threadRef} onScroll={handleThreadScroll} aria-live="polite">
          {props.messages.map((message) => (
            <article className={`nexi-standalone-bubble ${message.role}`} key={message.id}>
              <p>{sanitizeNexiRenderedText(message.text)}</p>
              {props.renderMessageSources ? props.renderMessageSources(message) : null}
              <time className="nexi-message-timestamp" dateTime={message.createdAt ?? undefined}>
                {formatNexiMessageTimestamp(message.createdAt)}
              </time>
            </article>
          ))}
          {props.working ? <div className="nexi-standalone-typing">Nexi is checking...</div> : null}
        </div>

        <form className="nexi-standalone-composer" onSubmit={props.onSubmit}>
          <label className={`nexi-standalone-attach ${props.uploading ? "disabled" : ""}`} aria-label="Attach a file">
            <PlatformMark className="nexi-standalone-attach-mark" decorative />
            <span className="nexi-standalone-attach-plus" aria-hidden="true">+</span>
            <span className="sr-only">Attach a file</span>
            <input disabled={props.uploading} type="file" onChange={props.onAttachFiles} />
          </label>
          <input
            aria-label="Message Nexi"
            className="nexi-standalone-draft"
            placeholder="Ask Nexi anything about the work."
            value={props.draft}
            onChange={(event) => props.onDraftChange(event.target.value)}
          />
          <button
            className={`nexi-standalone-mic ${props.listening ? "active" : ""}`}
            disabled={!props.speechSupported}
            type="button"
            aria-label={props.speaking ? "Stop voice playback" : props.listening ? "Stop listening" : "Start voice input"}
            onClick={props.onMicClick}
          >
            {props.speaking ? (
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                <rect x="6" y="6" width="8" height="8" rx="1.5" fill="currentColor" />
              </svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                <rect x="7.1" y="3.6" width="5.8" height="8.7" rx="2.9" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5.2 9.5a4.8 4.8 0 1 0 9.6 0M10 14.7v2.1M7.7 16.8h4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </button>
          <button
            className="nexi-standalone-send"
            disabled={!props.draft.trim() || props.working}
            type="submit"
            aria-label="Send message"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
              <path d="M4 10.2 15.2 4.7c.7-.3 1.4.4 1.1 1.1L10.8 17c-.3.7-1.3.6-1.5-.1l-1.2-4.2-4.2-1.2c-.7-.2-.8-1.2-.1-1.5Z" fill="currentColor" />
            </svg>
          </button>
        </form>
      </section>
    </main>
  );
}
