import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { User } from "firebase/auth";
import type { ChatMessage, Source } from "../../../shared/contracts/nexi";
import { recordBrowserEvent } from "../../../shared/telemetry/browserTelemetry";
import { fetchJobDeskHealth, sendNexiMessage } from "../api/nexiApi";

interface UseNexiChatInput {
  tenantId: string;
  user: User | null;
}

const welcomeMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  text: "Nexi Job Desk is ready. Ask about schedule, job details, photos, or the Camp Mikell SiteJobBlueprint.",
  sources: []
};

export function useNexiChat(input: UseNexiChatInput): {
  activeMedia: Source | null;
  draft: string;
  health: "checking" | "green" | "red";
  messages: ChatMessage[];
  sendMessage: () => Promise<void>;
  setActiveMedia: Dispatch<SetStateAction<Source | null>>;
  setDraft: Dispatch<SetStateAction<string>>;
  working: boolean;
} {
  const [activeMedia, setActiveMedia] = useState<Source | null>(null);
  const [conversationId] = useState(() => `web-${crypto.randomUUID()}`);
  const [draft, setDraft] = useState("");
  const [health, setHealth] = useState<"checking" | "green" | "red">("checking");
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchJobDeskHealth()
      .then((ok) => {
        if (!cancelled) {
          setHealth(ok ? "green" : "red");
        }
      })
      .catch((error) => {
        recordBrowserEvent("nexi.health_failed", {
          error: error instanceof Error ? error.message : "unknown"
        });
        if (!cancelled) {
          setHealth("red");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function sendMessage(): Promise<void> {
    const text = draft.trim();
    if (!text || working || !input.user) {
      return;
    }
    setDraft("");
    setWorking(true);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text, sources: [] }]);
    try {
      const body = await sendNexiMessage({
        user: input.user,
        tenantId: input.tenantId,
        conversationId,
        message: text
      });
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: body.ok ? body.answer ?? "I do not have an answer yet." : body.error ?? "Nexi could not answer that.",
          sources: body.sources ?? []
        }
      ]);
    } catch (error) {
      recordBrowserEvent("nexi.message_failed", {
        error: error instanceof Error ? error.message : "unknown"
      });
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Nexi could not reach the authenticated Job Desk API.",
          sources: []
        }
      ]);
    } finally {
      setWorking(false);
    }
  }

  return {
    activeMedia,
    draft,
    health,
    messages,
    sendMessage,
    setActiveMedia,
    setDraft,
    working
  };
}
