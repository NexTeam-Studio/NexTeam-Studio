export interface Source {
  rail: "jobber" | "companycam" | "native" | "gsc" | "gbp" | "email";
  ref: string;
  label: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources: Source[];
}

export interface NexiResponse {
  ok: boolean;
  answer?: string;
  sources?: Source[];
  error?: string;
}
