import React, { Suspense, useEffect, useState } from "react";
import type { Auth, User } from "firebase/auth";
import { PlatformMark, ProductLogo, TenantBrandMark, tenantDisplayName } from "../../../../../shared/branding/ProductBranding";
import { NexOpsSharedMobileBar, NexOpsSharedWebTopbar } from "../../../../nexopsShell/components/NexOpsHeader";
import { buildNewClientPath, buildModulePath, buildWorkspaceSwitchPath, createMenuPresentation, NEXOPS_MOBILE_NAV_GROUPS, NEXOPS_MODULES, NEXTEAM_WORKSPACE_OPTIONS, type NexOpsCreateOption } from "../../../../nexopsShell/domain/nexopsNavigation";
import { nexiActiveApprovalPrompt, nexiConversationOffer, nexiConversationOfferReplyAction, NEXI_FRIENDLY_FAILURE_MESSAGE, formatNexiOperatorDisplayName, nexiIsApprovalPrompt, nexiAddressActionValue, nexiMapsHref, nexiPhoneActionValue, nexiShouldHideRenderedSource, NexiStandaloneLayout, nexiStoredSessionKey, parseNexiStoredSession, sanitizeNexiRenderedText, stringifyNexiStoredSession, type NexiStandalonePendingApproval } from "./NexiStandalonePrimitives";
import { resolveRequestorOriginForNexiMessage } from "../utils/nexiRequestContext";
import { NexOpsCreateMenu } from "../../../../nexopsShell/components/NexOpsCreateMenu";
import { NexOpsNotificationPanel } from "../../../../nexopsShell/components/NexOpsNotificationPanel";
import { NexOpsNavGlyph, formatPhoneActionLabel, mediaUrl, sourceIsPhoto } from "../../../../nexopsShell/workspaceSupport";
import { fileToBase64 } from "../../../../../shared/files/fileEncoding";
import { fallbackOperatorContext, loadOperatorContext } from "../../../../operatorContext/resolveOperatorContext";
import { signOutOperator } from "../../../../../shared/auth/authBootstrap";
import { useNexiVoice } from "../../voice/hooks/useNexiVoice";
import "../styles/chat.css";
import "../../voice/styles/voice.css";

interface Source {
  rail: string;
  ref: string;
  label: string;
}



interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources: Source[];
  createdAt?: string;
  pendingApproval?: NexiStandalonePendingApproval | null;
}



interface NexiResponse {
  ok: boolean;
  answer?: string;
  sources?: Source[];
  conversationId?: string;
  pendingApproval?: NexiStandalonePendingApproval | null;
  error?: string;
}



interface NexiHistoryResponse {
  ok: boolean;
  conversationId?: string;
  pendingApproval?: NexiStandalonePendingApproval | null;
  messages?: ChatMessage[];
  error?: string;
}



interface FieldDocsMediaCommentRecord {
  id: string;
  text: string;
  createdAt: string;
  author?: string;
}



interface FieldDocsMediaAnnotationRecord {
  id: string;
  kind: "path";
  color?: string;
  createdAt: string;
  points: Array<{ x: number; y: number }>;
}



interface FieldDocsMediaRecord {
  id: string;
  type: "photo" | "video" | "pdf";
  clientId?: string;
  jobId?: string;
  visitId?: string;
  propertyId?: string;
  captureBatchId?: string;
  storageRef?: string;
  thumbRef?: string;
  aiTags?: string[];
  manualTags?: string[];
  aiCaption?: string;
  exif?: { gps?: { lat: number; lng: number }; ts?: string };
  comments?: FieldDocsMediaCommentRecord[];
  annotations?: FieldDocsMediaAnnotationRecord[];
  capturedBy?: string;
  hiddenFromClient?: boolean;
  trashedAt?: string;
  purgeAfter?: string;
}



interface UploadMediaResponse {
  ok: boolean;
  media?: FieldDocsMediaRecord;
  error?: string;
}







type TenantRole = "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";







interface OperatorContext {
  tenantId: string;
  tenantUserId: string;
  role: TenantRole;
}



interface OperatorUiTheme {
  tenantId: string;
  name: string;
  colors: {
    shellBackground?: string;
    panelBackground?: string;
    headerBackground?: string;
    accent?: string;
    accentText?: string;
    userBubble?: string;
    assistantBubble?: string;
    text?: string;
  };
  density: "comfortable" | "compact";
  updatedBy?: string;
  updatedAt: string;
}



interface OperatorUiThemeResponse {
  ok: boolean;
  theme?: OperatorUiTheme;
  error?: string;
}



interface TenantBranding {
  tenantId: string;
  displayName: string;
  logo?: {
    storageRef?: string;
    mediaId?: string;
    url?: string;
    mimeType?: "image/png" | "image/jpeg" | "image/webp";
    alt?: string;
    updatedAt?: string;
  };
  colors: {
    primary?: string;
    secondary?: string;
    accent?: string;
    accentText?: string;
    background?: string;
    surface?: string;
    text?: string;
    mutedText?: string;
    userBubble?: string;
    assistantBubble?: string;
  };
  fontFamily?: string;
  source: "default" | "manual" | "extracted";
  updatedBy: string;
  updatedAt: string;
}



interface TenantBrandingResponse {
  ok: boolean;
  branding?: TenantBranding;
  error?: string;
}










interface NexOpsNotificationEntry {
  id: string;
  unread: boolean;
  title: string;
  body: string;
  relativeTime: string;
  target: {
    module: "requests" | "quotes" | "jobs" | "invoices" | "payments";
    objectId: string;
  };
}



interface NexOpsNotificationsResponse {
  ok: boolean;
  unreadCount?: number;
  notifications?: NexOpsNotificationEntry[];
  error?: string;
}






































function sourceThumb(source: Source, tenantId?: string): React.ReactElement | null {
  if (!sourceIsPhoto(source)) {
    return null;
  }
  return <img className="photo-tile-image" src={mediaUrl(source, tenantId)} alt={source.label} loading="lazy" />;
}





function mediaDownloadUrl(source: Source, tenantId?: string): string {
  const url = mediaUrl(source, tenantId);
  return `${url}${url.includes("?") ? "&" : "?"}download=1`;
}









function messageQuickActions(text: string): Array<{ kind: "call" | "maps"; href: string; label: string }> {
  if (nexiIsApprovalPrompt(text)) {
    return [];
  }
  const actions: Array<{ kind: "call" | "maps"; href: string; label: string }> = [];
  const phone = nexiPhoneActionValue(text);
  if (phone) {
    actions.push({
      kind: "call",
      href: `tel:${phone}`,
      label: formatPhoneActionLabel(phone)
    });
  }
  const address = nexiAddressActionValue(text);
  if (address) {
    actions.push({
      kind: "maps",
      href: nexiMapsHref(address),
      label: "Open in Maps"
    });
  }
  return actions;
}



function mediaDownloadName(source: Source): string {
  return `${source.rail}-${source.ref.replace(/[^a-z0-9_-]/gi, "_")}.jpg`;
}



function isOwnerCustomizedOperatorTheme(theme: OperatorUiTheme | null): theme is OperatorUiTheme {
  return Boolean(theme && theme.updatedBy && theme.updatedBy !== "system");
}













function responseQueuedApproval(sources: Source[] | undefined): boolean {
  return (sources ?? []).some((source) => source.ref.startsWith("appr_") || source.label.startsWith("ApprovalQueue "));
}



export function NexiStandaloneChat(props: { auth: Auth | null; user: User }): React.ReactElement {
  const [operatorContext, setOperatorContext] = useState<OperatorContext>(() => fallbackOperatorContext(props.user));
  const [operatorTheme, setOperatorTheme] = useState<OperatorUiTheme | null>(null);
  const [tenantBranding, setTenantBranding] = useState<TenantBranding | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<NexiStandalonePendingApproval | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [working, setWorking] = useState(false);
  const [activeMedia, setActiveMedia] = useState<Source | null>(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NexOpsNotificationEntry[]>([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [notificationStatus, setNotificationStatus] = useState("");
  const [moduleSwitcherOpen, setModuleSwitcherOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const {
    handsFree,
    interimTranscript,
    interruptVoice,
    lastVoiceLatencyMs,
    listening,
    speakAssistant,
    speaking,
    speechSupported,
    startDictation,
    toggleHandsFree,
    toggleVoice,
    voiceEnabled,
    voiceStatus
  } = useNexiVoice({
    tenantId: operatorContext.tenantId,
    tenantUserId: operatorContext.tenantUserId,
    onTranscript: sendTextMessage,
    onDraftTranscript: (transcript) => setDraft((current) => [current, transcript].filter(Boolean).join(" ").trim())
  });
  const storedSessionKey = nexiStoredSessionKey(operatorContext.tenantId, props.user.uid);

  useEffect(() => {
    let cancelled = false;
    loadOperatorContext(props.user)
      .then((context) => {
        if (!cancelled) {
          setOperatorContext(context);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOperatorContext(fallbackOperatorContext(props.user));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [props.user]);

  useEffect(() => {
    let cancelled = false;
    props.user.getIdToken()
      .then((idToken) => fetch(`/api/sites/operator-ui?tenantId=${encodeURIComponent(operatorContext.tenantId)}`, {
        headers: { authorization: `Bearer ${idToken}` }
      }))
      .then((response) => response.json() as Promise<OperatorUiThemeResponse>)
      .then((body) => {
        if (!cancelled && body.ok && body.theme) {
          setOperatorTheme(body.theme);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOperatorTheme(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [operatorContext.tenantId, props.user]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/tenant-branding?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
      .then((response) => response.json() as Promise<TenantBrandingResponse>)
      .then((body) => {
        if (!cancelled && body.ok && body.branding) {
          setTenantBranding(body.branding);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTenantBranding(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [operatorContext.tenantId]);

  useEffect(() => {
    document.body.classList.toggle("nexops-mobile-nav-open", mobileNavOpen);
    return () => {
      document.body.classList.remove("nexops-mobile-nav-open");
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const restored = parseNexiStoredSession(window.localStorage.getItem(storedSessionKey));
    if (!restored) {
      setConversationId(null);
      setPendingApproval(null);
      setMessages([]);
      setHistoryLoaded(true);
      return;
    }
    setConversationId(restored.conversationId);
    setPendingApproval(restored.pendingApproval);
    setHistoryLoaded(false);
    let cancelled = false;
    props.user.getIdToken()
      .then((idToken) => fetch(`/api/nexi/history?tenantId=${encodeURIComponent(operatorContext.tenantId)}&conversationId=${encodeURIComponent(restored.conversationId)}`, {
        headers: { authorization: `Bearer ${idToken}` }
      }))
      .then((response) => response.json() as Promise<NexiHistoryResponse>)
      .then((body) => {
        if (cancelled) {
          return;
        }
        if (!body.ok) {
          setHistoryLoaded(true);
          return;
        }
        setConversationId(body.conversationId ?? restored.conversationId);
        setPendingApproval(body.pendingApproval ?? restored.pendingApproval);
        setMessages(Array.isArray(body.messages) ? body.messages : []);
        setHistoryLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setHistoryLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [operatorContext.tenantId, props.user, storedSessionKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !historyLoaded || !conversationId) {
      return;
    }
    window.localStorage.setItem(storedSessionKey, stringifyNexiStoredSession({
      conversationId,
      pendingApproval
    }));
  }, [conversationId, historyLoaded, pendingApproval, storedSessionKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !historyLoaded || conversationId) {
      return;
    }
    window.localStorage.removeItem(storedSessionKey);
  }, [conversationId, historyLoaded, storedSessionKey]);

  useEffect(() => {
    void loadNotifications();
    const reloadNotifications = () => void loadNotifications();
    window.addEventListener("nexops:crm-mutated", reloadNotifications);
    window.addEventListener("nexops:approval-queued", reloadNotifications);
    return () => {
      window.removeEventListener("nexops:crm-mutated", reloadNotifications);
      window.removeEventListener("nexops:approval-queued", reloadNotifications);
    };
  }, [operatorContext.tenantId]);

  async function loadNotifications(): Promise<void> {
    try {
      const body = await fetch(`/api/crm/notifications?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
        .then((response) => response.json() as Promise<NexOpsNotificationsResponse>);
      if (!body.ok) {
        setNotifications([]);
        setNotificationUnreadCount(0);
        setNotificationStatus(body.error ?? "Notifications are unavailable right now.");
        return;
      }
      setNotifications(body.notifications ?? []);
      setNotificationUnreadCount(body.unreadCount ?? 0);
      setNotificationStatus("");
    } catch {
      setNotifications([]);
      setNotificationUnreadCount(0);
      setNotificationStatus("Notifications API unreachable.");
    }
  }

  function closeShellPanels(): void {
    setMobileNavOpen(false);
    setNotificationsOpen(false);
    setCreateMenuOpen(false);
    setModuleSwitcherOpen(false);
  }

  function navigateTo(path: string): void {
    closeShellPanels();
    window.location.assign(path);
  }



  function toggleNotifications(): void {
    setMobileNavOpen(false);
    setCreateMenuOpen(false);
    setModuleSwitcherOpen(false);
    setNotificationsOpen((current) => !current);
  }

  function toggleModuleSwitcher(): void {
    setMobileNavOpen(false);
    setCreateMenuOpen(false);
    setNotificationsOpen(false);
    setModuleSwitcherOpen((current) => !current);
  }

  function openWorkspaceProduct(product: "nexops" | "nexcam" | "nexdocs" | "nexportal" | "nexreach"): void {
    navigateTo(buildWorkspaceSwitchPath(product, operatorContext.tenantId));
  }

  function handleCreateSelection(option: NexOpsCreateOption): void {
    if (option.workflow.kind === "client-page" || option.workflow.kind === "drawer") {
      navigateTo(buildNewClientPath());
      return;
    }
    navigateTo(buildModulePath(option.workflow.module));
  }

  async function openNotification(entry: NexOpsNotificationEntry): Promise<void> {
    try {
      if (entry.unread) {
        await fetch("/api/crm/notifications/read", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tenantId: operatorContext.tenantId, notificationId: entry.id })
        });
      }
    } finally {
      navigateTo(buildModulePath(entry.target.module));
    }
  }

  async function markAllNotificationsRead(): Promise<void> {
    await fetch("/api/crm/notifications/read-all", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: operatorContext.tenantId })
    });
    void loadNotifications();
  }

  async function sendTextMessage(rawText: string, approvalContextOverride?: NexiStandalonePendingApproval | null): Promise<void> {
    const text = rawText.trim();
    if (!text || working) {
      return;
    }
    const activeApprovalPrompt = nexiActiveApprovalPrompt(messages, pendingApproval);
    const effectivePendingApproval = approvalContextOverride ?? activeApprovalPrompt.pendingApproval ?? pendingApproval ?? null;
    const latestAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant");
    const conversationOffer = !effectivePendingApproval && latestAssistantMessage
      ? nexiConversationOffer(
        latestAssistantMessage.text,
        typeof navigator !== "undefined" ? navigator.userAgent : undefined
      )
      : null;
    const offerReply = nexiConversationOfferReplyAction(text, conversationOffer);
    if (conversationOffer && offerReply !== "none") {
      const assistantText = offerReply === "confirm"
        ? conversationOffer.kind === "call"
          ? "Opening the phone dialer now."
          : "Opening directions in Maps now."
        : conversationOffer.kind === "call"
          ? "Okay, I won't place the call right now."
          : "Okay, I won't open Maps right now.";
      setDraft("");
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "user", text, sources: [], createdAt: new Date().toISOString() },
        { id: crypto.randomUUID(), role: "assistant", text: assistantText, sources: [], createdAt: new Date().toISOString() }
      ]);
      if (offerReply === "confirm") {
        if (conversationOffer.kind === "maps") {
          window.open(conversationOffer.href, "_blank", "noopener,noreferrer");
        } else {
          window.location.assign(conversationOffer.href);
        }
      }
      void speakAssistant(assistantText);
      return;
    }
    const actorDisplayName = formatNexiOperatorDisplayName(props.user.displayName, props.user.email);
    const requestorOrigin = await resolveRequestorOriginForNexiMessage(
      text,
      typeof navigator !== "undefined" ? navigator.geolocation : undefined
    );
    setDraft("");
    setWorking(true);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text, sources: [], createdAt: new Date().toISOString() }]);
    try {
      const idToken = await props.user.getIdToken();
      const response = await fetch("/api/nexi/message", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          conversationId,
          pendingApproval: effectivePendingApproval,
          actorDisplayName,
          ...(requestorOrigin ? { requestorOrigin } : {}),
          message: text
        })
      });
      const body = await response.json() as NexiResponse;
      const assistantText = sanitizeNexiRenderedText(
        body.ok
          ? body.answer ?? "I do not have an answer yet."
          : body.error ?? NEXI_FRIENDLY_FAILURE_MESSAGE
      );
      const nextPendingApproval = body.ok ? (body.pendingApproval ?? null) : null;
      if (body.ok) {
        setConversationId(body.conversationId ?? conversationId ?? null);
        setPendingApproval(nextPendingApproval);
      }
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: assistantText,
          sources: body.sources ?? [],
          createdAt: new Date().toISOString(),
          pendingApproval: body.ok && nextPendingApproval && nexiIsApprovalPrompt(assistantText) ? nextPendingApproval : null
        }
      ]);
      if (body.ok && responseQueuedApproval(body.sources)) {
        window.dispatchEvent(new CustomEvent("nexops:approval-queued"));
      }
      void speakAssistant(assistantText);
    } catch {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: NEXI_FRIENDLY_FAILURE_MESSAGE, sources: [], createdAt: new Date().toISOString() }
      ]);
      void speakAssistant(NEXI_FRIENDLY_FAILURE_MESSAGE);
    } finally {
      setWorking(false);
    }
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await sendTextMessage(draft);
  }

  async function uploadJobDeskFile(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file || uploading) {
      return;
    }
    setUploading(true);
    setUploadStatus(`Uploading ${file.name}...`);
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        text: `Upload ${file.name}`,
        sources: []
      }
    ]);
    try {
      const fileBase64 = await fileToBase64(file);
      const mime = file.type || "application/octet-stream";
      const isImage = mime.startsWith("image/");
      const response = await fetch("/api/fielddocs/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          filename: file.name,
          mime,
          fileBase64,
          tags: ["job-desk-upload"],
          capturedBy: operatorContext.tenantUserId,
          ...(isImage ? { imageBase64: fileBase64, imageMime: mime } : {})
        })
      });
      const body = await response.json() as UploadMediaResponse;
      if (!response.ok || !body.ok || !body.media) {
        throw new Error(body.error ?? "Upload failed");
      }
      const mediaSource: Source = {
        rail: "native",
        ref: body.media.id,
        label: `Uploaded ${body.media.type} ${file.name}`
      };
      const assistantText = `Uploaded ${file.name} to the shared tenant media rail.`;
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: assistantText,
          sources: [mediaSource]
        }
      ]);
      setUploadStatus("Upload saved.");
      void speakAssistant(assistantText);
    } catch {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: NEXI_FRIENDLY_FAILURE_MESSAGE, sources: [] }
      ]);
      setUploadStatus("Upload failed.");
      void speakAssistant(NEXI_FRIENDLY_FAILURE_MESSAGE);
    } finally {
      setUploading(false);
    }
  }

  const brandColors = tenantBranding?.colors;
  const customOperatorTheme = isOwnerCustomizedOperatorTheme(operatorTheme) ? operatorTheme : null;
  const themeStyle = {
    "--jobdesk-shell-background": customOperatorTheme?.colors.shellBackground ?? brandColors?.background,
    "--jobdesk-panel-background": customOperatorTheme?.colors.panelBackground ?? brandColors?.surface,
    "--jobdesk-header-background": customOperatorTheme?.colors.headerBackground ?? brandColors?.primary,
    "--jobdesk-accent": customOperatorTheme?.colors.accent ?? brandColors?.accent,
    "--jobdesk-accent-text": customOperatorTheme?.colors.accentText ?? brandColors?.accentText,
    "--jobdesk-user-bubble": customOperatorTheme?.colors.userBubble ?? brandColors?.userBubble,
    "--jobdesk-assistant-bubble": customOperatorTheme?.colors.assistantBubble ?? brandColors?.assistantBubble,
    "--jobdesk-text": customOperatorTheme?.colors.text ?? brandColors?.text,
    "--jobdesk-muted-text": brandColors?.mutedText,
    "--jobdesk-font-family": tenantBranding?.fontFamily
  } as React.CSSProperties;
  const tenantName = tenantDisplayName(tenantBranding, operatorContext.tenantId);
  const liveStatus = [
    voiceStatus,
    uploadStatus,
    interimTranscript ? `Heard: ${interimTranscript}` : "",
    lastVoiceLatencyMs !== null ? `Audio start ${(lastVoiceLatencyMs / 1000).toFixed(1)}s` : ""
  ].filter(Boolean).join(" | ");

  function renderMessageSources(message: ChatMessage): React.ReactNode {
    const photoSources = message.sources.filter(sourceIsPhoto);
    // A single tool call can be carried through several gateway passes. Show
    // its human-facing source once, never as a stack of identical labels.
    const seenSourceLabels = new Set<string>();
    const textSources = message.sources.filter((source) => {
      if (sourceIsPhoto(source) || nexiShouldHideRenderedSource(source)) {
        return false;
      }
      const key = `${source.rail}:${source.ref}:${source.label}`;
      if (seenSourceLabels.has(key)) {
        return false;
      }
      seenSourceLabels.add(key);
      return true;
    });
    const actions = message.role === "assistant" ? messageQuickActions(message.text) : [];
    const activeApprovalPrompt = nexiActiveApprovalPrompt(messages, pendingApproval);
    const showConfirmationButtons = message.role === "assistant"
      && activeApprovalPrompt.messageId === message.id
      && Boolean(activeApprovalPrompt.pendingApproval);
    return (
      <>
        {photoSources.length > 0 ? (
          <div className="photo-strip" aria-label="Photos from this answer">
            {photoSources.map((source) => (
              <figure className="photo-tile" key={`${source.rail}:${source.ref}`}>
                <button
                  aria-label={`Open full-size ${source.label}`}
                  className="photo-open"
                  type="button"
                  onClick={() => setActiveMedia(source)}
                >
                  {sourceThumb(source, operatorContext.tenantId)}
                </button>
                <figcaption className="photo-caption">
                  <span>{source.label}</span>
                  <a href={mediaDownloadUrl(source, operatorContext.tenantId)} download={mediaDownloadName(source)}>
                    Save
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : null}
        {textSources.length > 0 ? (
          <div className="sources">
            {textSources.map((source) => (
              <span className="source" key={`${source.rail}:${source.ref}`}>
                <span>{source.label}</span>
              </span>
            ))}
          </div>
        ) : null}
        {actions.length > 0 ? (
          <div className="nexi-message-actions" aria-label="Quick actions from this answer">
            {actions.map((action) => (
              <a
                className={`nexi-message-action ${action.kind}`}
                href={action.href}
                key={`${action.kind}:${action.href}`}
                rel="noreferrer"
                target={action.kind === "maps" ? "_blank" : undefined}
              >
                {action.label}
              </a>
            ))}
          </div>
        ) : null}
        {showConfirmationButtons ? (
          <div className="nexi-confirmation-actions" aria-label="Approval choices">
            <button
              className="nexi-confirmation-button yes"
              disabled={working}
              type="button"
              onClick={() => void sendTextMessage("yes", activeApprovalPrompt.pendingApproval)}
            >
              Yes
            </button>
            <button
              className="nexi-confirmation-button no"
              disabled={working}
              type="button"
              onClick={() => void sendTextMessage("no", activeApprovalPrompt.pendingApproval)}
            >
              No
            </button>
            <button
              className="nexi-confirmation-button edit"
              disabled={working}
              type="button"
              onClick={() => void sendTextMessage("I need to make changes.", activeApprovalPrompt.pendingApproval)}
            >
              Edit
            </button>
          </div>
        ) : null}
      </>
    );
  }

  function renderCreateMenu(): React.ReactElement | null {
    if (!createMenuOpen) {
      return null;
    }
    return (
      <Suspense fallback={<section className="nexops-create-menu nexops-create-menu-flyout" role="dialog" aria-label="Create a new record"><p className="nexops-module-status">Loading create menu...</p></section>}>
        <NexOpsCreateMenu
          presentation={createMenuPresentation(window.innerWidth)}
          activeContextLabel="Pick the object you want to create. Nexi will route you into the matching NexOps workspace."
          onClose={() => setCreateMenuOpen(false)}
          onSelect={handleCreateSelection}
        />
      </Suspense>
    );
  }

  function renderNotificationPanel(): React.ReactElement | null {
    if (!notificationsOpen) {
      return null;
    }
    return (
      <Suspense fallback={<section className="nexops-notification-panel" role="dialog" aria-label="Notifications"><p className="nexops-module-status">Loading notifications...</p></section>}>
        <>
          <button className="nexops-overlay-backdrop" type="button" aria-label="Close notifications" onClick={() => setNotificationsOpen(false)} />
          <NexOpsNotificationPanel
            notificationStatus={notificationStatus}
            notifications={notifications}
            onMarkAllRead={markAllNotificationsRead}
            onOpenNotification={openNotification}
            onClose={() => setNotificationsOpen(false)}
          />
        </>
      </Suspense>
    );
  }

  function renderModuleSwitcher(): React.ReactElement | null {
    if (!moduleSwitcherOpen) {
      return null;
    }
    return (
      <>
        <button className="nexops-overlay-backdrop" type="button" aria-label="Close module switcher" onClick={() => setModuleSwitcherOpen(false)} />
        <section className="nexops-workspace-switcher" role="dialog" aria-label="Switch NexTeam modules">
          <div className="nexops-workspace-switcher-head">
            <div>
              <p className="eyebrow">Modules</p>
              <h2>Move across the platform</h2>
            </div>
            <button type="button" onClick={() => setModuleSwitcherOpen(false)}>Close</button>
          </div>
          <div className="nexops-workspace-switcher-grid">
            {NEXTEAM_WORKSPACE_OPTIONS.map((option) => (
              <button className={option.id === "nexops" ? "active" : ""} key={option.id} type="button" onClick={() => openWorkspaceProduct(option.id)}>
                <ProductLogo product={option.id === "nexportal" ? "nexportal" : option.id} className="nexops-workspace-switcher-logo" alt={option.label} />
                <div>
                  <strong>{option.label}</strong>
                  <p>{option.detail}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      </>
    );
  }

  function renderMobileNav(): React.ReactElement | null {
    if (!mobileNavOpen) {
      return null;
    }
    return (
      <div className="nexops-mobile-nav-layer" role="presentation">
        <button className="nexops-mobile-nav-backdrop" type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />
        <aside className="nexops-mobile-nav-sheet" id="nexops-mobile-nav" role="dialog" aria-modal="true" aria-label="Nexi navigation">
          <div className="nexops-mobile-nav-header">
            <div className="nexops-mobile-brand-stack">
              <div className="nexops-mobile-brand">
                <div className="nexops-mobile-brand-lockup">
                  <PlatformMark className="nexops-mobile-platform-mark" alt="NexTeam" />
                  <ProductLogo product="nexi" className="nexops-mobile-product-logo" alt="Nexi" />
                </div>
              </div>
              <TenantBrandMark branding={tenantBranding} tenantId={operatorContext.tenantId} className="nexops-mobile-tenant-mark" />
            </div>
            <button className="nexops-mobile-close-button" type="button" onClick={() => setMobileNavOpen(false)}>Close</button>
          </div>
          <div className="nexops-mobile-nav-quick-actions">
            <button className="nexops-create-button mobile" type="button" onClick={() => {
              setMobileNavOpen(false);
              setCreateMenuOpen(true);
            }}>
              Create
            </button>
            <button type="button" onClick={() => {
              setMobileNavOpen(false);
              toggleModuleSwitcher();
            }}>
              Modules
            </button>
          </div>
          <div className="nexops-mobile-nav-utility-grid" aria-label="Mobile quick tools">
            <button type="button" onClick={() => navigateTo("/nexcam")}>
              <NexOpsNavGlyph module="capture" />
              <span>NexCam</span>
            </button>
            <button type="button" onClick={() => {
              setMobileNavOpen(false);
              toggleNotifications();
            }}>
              <span className="nexops-mobile-nav-utility-icon nexops-notification-button" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="none">
                  <path d="M10 3.7a3.1 3.1 0 0 0-3.1 3.1v1.3c0 .8-.3 1.6-.8 2.2l-.9 1v.8h9.6v-.8l-.9-1c-.5-.6-.8-1.4-.8-2.2V6.8A3.1 3.1 0 0 0 10 3.7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M8.3 14.7a1.8 1.8 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                {notificationUnreadCount ? <span className="nexops-notification-badge">{notificationUnreadCount}</span> : null}
              </span>
              <span>Notifications</span>
            </button>
            <button type="button" onClick={() => navigateTo("/nexops/settings")}>
              <NexOpsNavGlyph module="settings" />
              <span>Settings</span>
            </button>
            <button type="button" onClick={() => void signOutOperator(props.auth)}>
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                <path d="M12 4.5h2a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 14 15.5h-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M9 13.5 12.5 10 9 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 10H4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <span>Sign out</span>
            </button>
          </div>
          {NEXOPS_MOBILE_NAV_GROUPS.map((group) => (
            <section className="nexops-mobile-nav-group" key={group.title} aria-label={group.title}>
              <p>{group.title}</p>
              <div className="nexops-mobile-nav-grid">
                {group.items.map((moduleId) => {
                  const module = NEXOPS_MODULES.find((entry) => entry.id === moduleId);
                  if (!module || module.hidden) {
                    return null;
                  }
                  return (
                    <button type="button" key={module.id} onClick={() => navigateTo(buildModulePath(module.id))}>
                      <NexOpsNavGlyph module={module.id} />
                      <span>{module.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          <div className="nexops-mobile-nav-footer">
            <button
              className="nexops-mobile-profile-button"
              type="button"
              onClick={() => navigateTo("/nexops/users")}
              aria-label={`Open ${formatNexiOperatorDisplayName(props.user.displayName, props.user.email)}'s profile`}
            >
              <span className="nexops-mobile-profile-avatar" aria-hidden="true">
                {formatNexiOperatorDisplayName(props.user.displayName, props.user.email)
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")
                  .toUpperCase() || "OP"}
              </span>
              <span className="nexops-mobile-profile-copy">
                <strong>{formatNexiOperatorDisplayName(props.user.displayName, props.user.email)}</strong>
                <span>View profile</span>
              </span>
            </button>
            <button className="nexops-mobile-footer-sign-out" type="button" onClick={() => void signOutOperator(props.auth)}>
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                <path d="M12 4.5h2a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 14 15.5h-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M9 13.5 12.5 10 9 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 10H4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <span>Sign out</span>
            </button>
          </div>
        </aside>
      </div>
    );
  }

  const header = (
    <>
      <NexOpsSharedMobileBar
        product="nexi"
        tenantBranding={tenantBranding}
        tenantId={operatorContext.tenantId}
        onBrandClick={() => navigateTo(buildModulePath("home"))}
        brandAriaLabel="Return to NexOps home"
        rightControls={(
          <div className="nexi-mobile-header-controls">
            <div className="nexi-mobile-header-icons">
              <button className="nexops-mobile-icon-button nexi-header-control" type="button" aria-label="Open camera capture" onClick={() => navigateTo("/nexcam")}>
                <NexOpsNavGlyph module="capture" />
              </button>
              <button className="nexops-mobile-icon-button nexi-header-control" type="button" aria-expanded={mobileNavOpen} aria-controls="nexops-mobile-nav" aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"} onClick={() => setMobileNavOpen((current) => !current)}>
                <span className="nexops-mobile-menu-glyph" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </button>
            </div>
            <button
              className={`nexi-voice-toggle ${voiceEnabled ? "on" : ""}`}
              type="button"
              role="switch"
              aria-checked={voiceEnabled}
              aria-label={voiceEnabled ? "Turn Nexi Voice off" : "Turn Nexi Voice on"}
              onClick={() => void toggleVoice()}
            >
              <span className="nexi-voice-toggle-label" aria-hidden="true">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                  <rect x="7.2" y="3.6" width="5.6" height="9.4" rx="2.8" stroke="currentColor" strokeWidth="1.9" />
                  <path d="M5.2 10.6c0 3.4 2.6 6 4.8 6s4.8-2.6 4.8-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                  <path d="M10 16.6v3.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                  <path d="M7.3 19.8h5.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                  <path d="M16.8 8.2c1 .7 1.6 1.7 1.6 2.8 0 1.2-.6 2.2-1.6 2.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M19.3 6.3c1.5 1.1 2.4 2.8 2.4 4.7 0 1.9-.9 3.6-2.4 4.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
              <span className="nexi-voice-toggle-switch" aria-hidden="true">
                <span className="nexi-voice-toggle-thumb">
                  <span className="nexi-voice-toggle-mark" aria-hidden="true">{voiceEnabled ? "✓" : "✕"}</span>
                </span>
              </span>
            </button>
          </div>
        )}
      />
      {renderMobileNav()}
      <NexOpsSharedWebTopbar
        product="nexi"
        tenantName={tenantName}
        moduleTitle="Nexi"
        moduleSwitcherOpen={moduleSwitcherOpen}
        onToggleModuleSwitcher={toggleModuleSwitcher}
        accountTools={(
          <>
            <button className="nexops-web-icon-button nexi-header-control" type="button" aria-label="Open camera capture" onClick={() => navigateTo("/nexcam")}>
              <NexOpsNavGlyph module="capture" />
            </button>
            <button className="nexops-web-icon-button nexi-header-control" type="button" aria-label="Open navigation menu" onClick={() => setMobileNavOpen((current) => !current)}>
              <span className="nexops-mobile-menu-glyph" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>
            <span>{props.user.email ?? "Operator"}</span>
            <button type="button" onClick={() => void signOutOperator(props.auth)}>Sign out</button>
          </>
        )}
      />
    </>
  );

  const overlays = (
    <>
      {renderModuleSwitcher()}
      {renderCreateMenu()}
      {renderNotificationPanel()}
      {activeMedia ? (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={activeMedia.label} onClick={() => setActiveMedia(null)}>
          <div className="lightbox-card" onClick={(event) => event.stopPropagation()}>
            <img src={mediaUrl(activeMedia, operatorContext.tenantId)} alt={activeMedia.label} />
            <div className="lightbox-actions">
              <a href={mediaDownloadUrl(activeMedia, operatorContext.tenantId)} download={mediaDownloadName(activeMedia)}>
                Save full-size
              </a>
              <button type="button" onClick={() => setActiveMedia(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  return (
    <NexiStandaloneLayout
      className={`density-${customOperatorTheme?.density ?? "comfortable"}`}
      style={themeStyle}
      header={header}
      overlays={overlays}
      statusLiveText={liveStatus}
      messages={messages}
      working={working}
      draft={draft}
      uploading={uploading}
      speechSupported={speechSupported}
      listening={listening}
      speaking={speaking}
      onDraftChange={setDraft}
      onSubmit={sendMessage}
      onAttachFiles={(event) => void uploadJobDeskFile(event)}
      onMicClick={() => {
        if (speaking) {
          void interruptVoice();
          return;
        }
        if (handsFree) {
          void toggleHandsFree();
          return;
        }
        startDictation(false);
      }}
      renderMessageSources={renderMessageSources}
    />
  );
}
