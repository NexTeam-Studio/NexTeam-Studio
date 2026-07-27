import { useEffect, useRef, useState } from "react";

interface BrowserSpeechRecognitionResult {
  isFinal?: boolean;
  0?: { transcript?: string };
}

interface BrowserSpeechRecognitionEvent {
  resultIndex?: number;
  results: ArrayLike<BrowserSpeechRecognitionResult>;
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;
type VoiceWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

interface VoiceSessionResponse {
  ok: boolean;
  session?: { id: string };
  error?: string;
}

export interface NexiVoiceRuntime {
  handsFree: boolean;
  interimTranscript: string;
  interruptVoice: (reason?: string) => Promise<void>;
  lastVoiceLatencyMs: number | null;
  listening: boolean;
  speakAssistant: (text: string) => Promise<void>;
  speaking: boolean;
  speechSupported: boolean;
  startDictation: (fullDuplex?: boolean) => void;
  toggleHandsFree: () => Promise<void>;
  toggleVoice: () => Promise<void>;
  voiceEnabled: boolean;
  voiceStatus: string;
}

export function useNexiVoice(input: {
  tenantId: string;
  tenantUserId: string;
  onTranscript: (text: string) => Promise<void>;
  onDraftTranscript: (text: string) => void;
}): NexiVoiceRuntime {
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Voice off");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceSessionId, setVoiceSessionId] = useState<string | null>(null);
  const [lastVoiceLatencyMs, setLastVoiceLatencyMs] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const handsFreeRef = useRef(false);
  const voiceSessionRef = useRef<string | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;
  const voiceWindow = window as VoiceWindow;
  const SpeechRecognition = voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
  const speechSupported = Boolean(SpeechRecognition);

  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  useEffect(() => {
    voiceSessionRef.current = voiceSessionId;
  }, [voiceSessionId]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    audioRef.current?.pause();
    ttsAbortRef.current?.abort();
  }, []);

  async function startVoiceSession(): Promise<string | null> {
    if (voiceSessionRef.current) return voiceSessionRef.current;
    try {
      const response = await fetch("/api/voice/session/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: input.tenantId, tenantUserId: input.tenantUserId })
      });
      const body = await response.json() as VoiceSessionResponse;
      if (!body.ok || !body.session) throw new Error(body.error ?? "Voice session did not start.");
      setVoiceSessionId(body.session.id);
      voiceSessionRef.current = body.session.id;
      return body.session.id;
    } catch {
      setVoiceStatus("Voice session did not start. Basic voice still works.");
      return null;
    }
  }

  async function updateVoiceSession(path: string, body?: unknown): Promise<void> {
    const sessionId = voiceSessionRef.current;
    if (!sessionId) return;
    await fetch(`/api/voice/session/${encodeURIComponent(sessionId)}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? "{}" : JSON.stringify(body)
    }).catch(() => undefined);
  }

  function finishSpokenReply(status = "Voice ready"): void {
    setSpeaking(false);
    ttsAbortRef.current = null;
    if (handsFreeRef.current) {
      void updateVoiceSession("/listen");
      setVoiceStatus("Listening for the next question");
      startDictation(true);
      return;
    }
    setVoiceStatus(status);
  }

  async function speakAssistantWithBrowserVoice(text: string): Promise<boolean> {
    if (typeof SpeechSynthesisUtterance === "undefined" || !window.speechSynthesis) return false;
    return new Promise<boolean>((resolve) => {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        utterance.rate = 1;
        utterance.pitch = 1;
        const voices = window.speechSynthesis.getVoices();
        utterance.voice = voices.find((voice) => /aria|samantha|jenny|ava|zira/i.test(voice.name))
          ?? voices.find((voice) => /^en(?:-|_)/i.test(voice.lang))
          ?? voices[0];
        utterance.onend = () => { finishSpokenReply("Voice ready (device voice)"); resolve(true); };
        utterance.onerror = () => { setSpeaking(false); ttsAbortRef.current = null; setVoiceStatus("Voice playback blocked"); resolve(false); };
        window.speechSynthesis.speak(utterance);
      } catch {
        resolve(false);
      }
    });
  }

  function stopVoicePlayback(): void {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }

  async function interruptVoice(reason = "operator_started_talking"): Promise<void> {
    stopVoicePlayback();
    await updateVoiceSession("/interrupt", { reason });
    setVoiceStatus("Stopped. Listening.");
    if (handsFreeRef.current) startDictation(true);
  }

  async function speakAssistant(text: string): Promise<void> {
    if (!voiceEnabled || !text.trim()) return;
    setSpeaking(true);
    setVoiceStatus("Nexi is speaking");
    const startedAt = performance.now();
    const controller = new AbortController();
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = controller;
    try {
      audioRef.current?.pause();
      recognitionRef.current?.stop();
      const response = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: input.tenantId, text }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error("TTS unavailable");
      const audioBlob = await response.blob();
      const firstAudioLatencyMs = Math.round(performance.now() - startedAt);
      setLastVoiceLatencyMs(firstAudioLatencyMs);
      await updateVoiceSession("/turn", {
        firstAudioLatencyMs,
        estimatedCostUsd: Number(response.headers.get("x-voice-estimated-cost-usd") ?? 0),
        characterCount: Number(response.headers.get("x-voice-character-count") ?? 0),
        audioBytes: Number(response.headers.get("x-voice-audio-bytes") ?? audioBlob.size)
      });
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); finishSpokenReply(); };
      audio.onerror = () => { URL.revokeObjectURL(url); setSpeaking(false); ttsAbortRef.current = null; setVoiceStatus("Voice playback failed"); };
      await audio.play();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError") && await speakAssistantWithBrowserVoice(text)) return;
      setSpeaking(false);
      ttsAbortRef.current = null;
      setVoiceStatus(error instanceof DOMException && error.name === "AbortError" ? "Stopped." : "Voice playback blocked");
    }
  }

  async function toggleVoice(): Promise<void> {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    setVoiceStatus(next ? "Voice ready" : "Voice off");
    if (!next) {
      stopVoicePlayback();
      recognitionRef.current?.stop();
      setListening(false);
      setHandsFree(false);
      setInterimTranscript("");
      return;
    }
    await startVoiceSession();
    if (speechSupported) startDictation(false);
    else setVoiceStatus("Mic not supported here");
  }

  async function toggleHandsFree(): Promise<void> {
    if (handsFree) {
      setHandsFree(false);
      handsFreeRef.current = false;
      recognitionRef.current?.stop();
      setListening(false);
      setInterimTranscript("");
      setVoiceStatus("Hands-free paused.");
      return;
    }
    if (!speechSupported) {
      setVoiceStatus("Mic not supported here");
      return;
    }
    setVoiceEnabled(true);
    setHandsFree(true);
    handsFreeRef.current = true;
    await startVoiceSession();
    startDictation(true);
  }

  function startDictation(fullDuplex = false): void {
    if (!SpeechRecognition || listening) {
      setVoiceStatus("Mic not supported here");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = fullDuplex;
    recognition.interimResults = fullDuplex;
    recognition.onresult = (event) => {
      const finalParts: string[] = [];
      const interimParts: string[] = [];
      for (let index = event.resultIndex ?? 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim() ?? "";
        if (!transcript) continue;
        (result?.isFinal || !fullDuplex ? finalParts : interimParts).push(transcript);
      }
      setInterimTranscript(interimParts.join(" "));
      const transcript = finalParts.join(" ").trim();
      if (!transcript) return;
      if (fullDuplex) {
        recognition.stop();
        setListening(false);
        setInterimTranscript("");
        setVoiceStatus("Heard you. Checking now.");
        void inputRef.current.onTranscript(transcript);
        return;
      }
      inputRef.current.onDraftTranscript(transcript);
      setVoiceStatus("Dictation captured");
    };
    recognition.onerror = () => { setListening(false); setVoiceStatus("Mic capture failed"); };
    recognition.onend = () => { setListening(false); recognitionRef.current = null; };
    recognitionRef.current = recognition;
    setListening(true);
    setVoiceStatus("Listening");
    recognition.start();
  }

  return { handsFree, interimTranscript, interruptVoice, lastVoiceLatencyMs, listening, speakAssistant, speaking, speechSupported, startDictation, toggleHandsFree, toggleVoice, voiceEnabled, voiceStatus };
}
