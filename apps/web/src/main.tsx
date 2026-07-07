import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, type Auth, type User } from "firebase/auth";
import "./styles.css";

interface Source {
  rail: "jobber" | "companycam" | "native" | "gsc" | "gbp" | "email";
  ref: string;
  label: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources: Source[];
}

interface NexiResponse {
  ok: boolean;
  answer?: string;
  sources?: Source[];
  error?: string;
}

interface ScheduledVisit {
  id: string;
  jobId: string;
  title: string;
  start: string;
  end: string;
  assignedTo: string[];
  status: string;
  location?: {
    label: string;
    geo?: { lat: number; lng: number };
    address?: {
      street1: string;
      city: string;
      province: string;
      postalCode: string;
      country: string;
    };
  };
}

interface CalendarResponse {
  ok: boolean;
  visits?: ScheduledVisit[];
  error?: string;
}

interface FirebasePublicConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

interface RuntimeConfigResponse {
  ok: boolean;
  firebase: FirebasePublicConfig;
  firebaseConfigured: boolean;
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
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

const buildTimeFirebaseConfig: FirebasePublicConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string || ""
};

function completeFirebaseConfig(config: FirebasePublicConfig): boolean {
  return Object.values(config).every((value) => value.length > 0);
}

function createFirebaseAuth(config: FirebasePublicConfig): Auth | null {
  if (!completeFirebaseConfig(config)) {
    return null;
  }
  const existingApp = getApps()[0];
  const app = existingApp ?? initializeApp(config);
  return getAuth(app);
}

async function loadFirebaseAuth(): Promise<Auth | null> {
  if (completeFirebaseConfig(buildTimeFirebaseConfig)) {
    return createFirebaseAuth(buildTimeFirebaseConfig);
  }
  const response = await fetch("/api/public/runtime-config");
  const runtime = await response.json() as RuntimeConfigResponse;
  return runtime.ok && runtime.firebaseConfigured ? createFirebaseAuth(runtime.firebase) : null;
}

function sourceThumb(source: Source): React.ReactElement | null {
  if (source.rail !== "companycam" || !source.label.toLowerCase().includes("photo")) {
    return null;
  }
  return <img className="thumb" src={mediaUrl(source)} alt={source.label} loading="lazy" />;
}

function mediaUrl(source: Source): string {
  return `/api/media/${encodeURIComponent(source.ref)}`;
}

function mediaDownloadUrl(source: Source): string {
  return `${mediaUrl(source)}?download=1`;
}

function sourceIsPhoto(source: Source): boolean {
  return source.rail === "companycam" && source.label.toLowerCase().includes("photo");
}

function dayRange(day: string, view: "day" | "week" | "map"): { from: string; to: string } {
  const from = new Date(`${day}T00:00:00.000Z`);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + (view === "week" ? 7 : 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

function formatVisitTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function SchedulePanel(): React.ReactElement {
  const [view, setView] = useState<"day" | "week" | "map">("day");
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [visits, setVisits] = useState<ScheduledVisit[]>([]);
  const [status, setStatus] = useState("Loading schedule...");

  useEffect(() => {
    let cancelled = false;
    const range = dayRange(day, view);
    setStatus("Loading schedule...");
    fetch(`/api/scheduling/calendar?tenantId=aquatrace&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`)
      .then((response) => response.json() as Promise<CalendarResponse>)
      .then((body) => {
        if (cancelled) {
          return;
        }
        if (!body.ok) {
          setStatus(body.error ?? "Schedule unavailable.");
          setVisits([]);
          return;
        }
        setVisits(body.visits ?? []);
        setStatus((body.visits ?? []).length ? "" : "No native visits in this window yet.");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("Schedule API unreachable.");
          setVisits([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [day, view]);

  return (
    <aside className="schedule-card">
      <div className="schedule-heading">
        <div>
          <p className="eyebrow">M3 Scheduling</p>
          <h2>Calendar Board</h2>
        </div>
        <input aria-label="Schedule date" type="date" value={day} onChange={(event) => setDay(event.target.value)} />
      </div>
      <div className="view-tabs" aria-label="Calendar views">
        {(["day", "week", "map"] as const).map((candidate) => (
          <button
            className={candidate === view ? "active" : ""}
            key={candidate}
            type="button"
            onClick={() => setView(candidate)}
          >
            {candidate}
          </button>
        ))}
      </div>
      {status ? <p className="schedule-status">{status}</p> : null}
      <div className={`visit-list ${view}`}>
        {visits.map((visit) => (
          <article className="visit-card" key={visit.id}>
            <div>
              <p className="visit-time">{formatVisitTime(visit.start)} - {formatVisitTime(visit.end)}</p>
              <h3>{visit.title}</h3>
              <p>{visit.location?.label ?? "No location label"} - {visit.assignedTo.join(", ") || "Unassigned"}</p>
            </div>
            <span className="visit-status">{visit.status}</span>
            {view === "map" ? (
              <p className="map-line">
                {visit.location?.geo ? `${visit.location.geo.lat.toFixed(4)}, ${visit.location.geo.lng.toFixed(4)}` : "No coordinates yet"}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </aside>
  );
}

function AuthGate(props: { auth: Auth | null; user: User | null; authReady: boolean; onSignedIn: (user: User | null) => void }): React.ReactElement {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!props.auth || working) {
      return;
    }
    setWorking(true);
    setError("");
    try {
      const result = await signInWithEmailAndPassword(props.auth, email.trim(), password);
      props.onSignedIn(result.user);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Firebase sign-in failed.");
    } finally {
      setWorking(false);
    }
  }

  if (!props.authReady) {
    return (
      <main className="shell">
        <section className="auth-card">
          <p className="eyebrow">Nexi access</p>
          <h1>Checking session</h1>
          <p>Loading Firebase operator access.</p>
        </section>
      </main>
    );
  }

  if (!props.auth) {
    return (
      <main className="shell">
        <section className="auth-card">
          <p className="eyebrow">Nexi access</p>
          <h1>Firebase config missing</h1>
          <p>The chat is locked until the Firebase web config is present in staging runtime variables.</p>
        </section>
      </main>
    );
  }

  if (props.user) {
    return <Chat auth={props.auth} user={props.user} />;
  }

  return (
    <main className="shell">
      <section className="auth-card">
        <p className="eyebrow">Aquatrace ops</p>
        <h1>Nexi Sign-In</h1>
        <p>Use your Firebase operator account to unlock the Job Desk.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button type="submit" disabled={working || !email.trim() || !password}>
            {working ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </section>
    </main>
  );
}

function Chat(props: { auth: Auth; user: User }): React.ReactElement {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Nexi Job Desk is ready. Ask about schedule, job details, photos, or the Camp Mikell SiteJobBlueprint.",
      sources: []
    }
  ]);
  const [draft, setDraft] = useState("");
  const [conversationId] = useState(() => `web-${crypto.randomUUID()}`);
  const [working, setWorking] = useState(false);
  const [health, setHealth] = useState<"checking" | "green" | "red">("checking");
  const [activeMedia, setActiveMedia] = useState<Source | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Voice off");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceWindow = window as VoiceWindow;
  const SpeechRecognition = voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
  const speechSupported = Boolean(SpeechRecognition);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((response) => response.json() as Promise<{ ok?: boolean }>)
      .then((body) => {
        if (!cancelled) {
          setHealth(body.ok ? "green" : "red");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHealth("red");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    audioRef.current?.pause();
  }, []);

  async function speakAssistant(text: string): Promise<void> {
    if (!voiceEnabled || !text.trim()) {
      return;
    }
    setSpeaking(true);
    setVoiceStatus("Nexi is speaking");
    try {
      audioRef.current?.pause();
      const response = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text })
      });
      if (!response.ok) {
        throw new Error("TTS unavailable");
      }
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setSpeaking(false);
        setVoiceStatus("Voice ready");
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setSpeaking(false);
        setVoiceStatus("Voice playback failed");
      };
      await audio.play();
    } catch {
      setSpeaking(false);
      setVoiceStatus("Voice playback blocked");
    }
  }

  function toggleVoice(): void {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    setVoiceStatus(next ? "Voice ready" : "Voice off");
    if (!next) {
      audioRef.current?.pause();
      recognitionRef.current?.stop();
      setListening(false);
      setSpeaking(false);
    }
  }

  function startDictation(): void {
    if (!SpeechRecognition || listening) {
      setVoiceStatus("Mic not supported here");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? "";
      if (transcript) {
        setDraft((current) => [current, transcript].filter(Boolean).join(" ").trim());
        setVoiceStatus("Dictation captured");
      }
    };
    recognition.onerror = () => {
      setListening(false);
      setVoiceStatus("Mic capture failed");
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setListening(true);
    setVoiceStatus("Listening");
    recognition.start();
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const text = draft.trim();
    if (!text || working) {
      return;
    }
    setDraft("");
    setWorking(true);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text, sources: [] }]);
    try {
      const idToken = await props.user.getIdToken();
      const response = await fetch("/api/nexi/message", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ tenantId: "aquatrace", conversationId, message: text })
      });
      const body = await response.json() as NexiResponse;
      const assistantText = body.ok ? body.answer ?? "I do not have an answer yet." : body.error ?? "Nexi could not answer that.";
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: assistantText,
          sources: body.sources ?? []
        }
      ]);
      void speakAssistant(assistantText);
    } catch {
      const fallback = "Nexi could not reach the authenticated Job Desk API.";
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: fallback, sources: [] }
      ]);
      void speakAssistant(fallback);
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="shell ops-shell">
      <div className="ops-grid">
      <section className="phone">
        <header className="topbar">
          <div>
            <p className="eyebrow">Aquatrace ops</p>
            <h1>Nexi Job Desk</h1>
            <p className="signed-in">{props.user.email ?? "Firebase operator"}</p>
          </div>
          <div className="top-actions">
            <span className={`health ${health}`} aria-label={`Health ${health}`} />
            <button className={`voice-toggle ${voiceEnabled ? "on" : ""}`} type="button" onClick={toggleVoice}>
              {voiceEnabled ? "Voice on" : "Enable voice"}
            </button>
            <button className="sign-out" type="button" onClick={() => void signOut(props.auth)}>Sign out</button>
          </div>
        </header>

        <div className="thread" aria-live="polite">
          {messages.map((message) => (
            <article className={`bubble ${message.role}`} key={message.id}>
              <p>{message.text}</p>
              {message.sources.length > 0 ? (
                <div className="sources">
                  {message.sources.map((source) => (
                    <span className={`source ${sourceIsPhoto(source) ? "source-photo" : ""}`} key={`${source.rail}:${source.ref}`}>
                      {sourceIsPhoto(source) ? (
                        <button
                          aria-label={`Open full-size ${source.label}`}
                          className="thumb-button"
                          type="button"
                          onClick={() => setActiveMedia(source)}
                        >
                          {sourceThumb(source)}
                        </button>
                      ) : null}
                      <span>{source.label}</span>
                      {sourceIsPhoto(source) ? (
                        <a className="save-link" href={mediaDownloadUrl(source)} download={`companycam-${source.ref}.jpg`}>
                          Save
                        </a>
                      ) : null}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          {working ? <div className="typing">Nexi is checking the rails...</div> : null}
        </div>

        <div className="voice-strip" aria-live="polite">
          <span className={`voice-dot ${listening ? "listening" : speaking ? "speaking" : voiceEnabled ? "ready" : ""}`} />
          <span>{voiceStatus}</span>
          {!speechSupported ? <span className="voice-note">Speech input unsupported in this browser</span> : null}
        </div>

        <form className="composer" onSubmit={sendMessage}>
          <button
            aria-label="Dictate message"
            className={`mic ${listening ? "active" : ""}`}
            disabled={!speechSupported || working}
            type="button"
            onClick={startDictation}
          >
            Mic
          </button>
          <input
            aria-label="Message Nexi"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask: What is on today's schedule?"
          />
          <button type="submit" disabled={working || !draft.trim()}>Send</button>
        </form>
      </section>
      <SchedulePanel />
      </div>
      {activeMedia ? (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={activeMedia.label} onClick={() => setActiveMedia(null)}>
          <div className="lightbox-card" onClick={(event) => event.stopPropagation()}>
            <img src={mediaUrl(activeMedia)} alt={activeMedia.label} />
            <div className="lightbox-actions">
              <a href={mediaDownloadUrl(activeMedia)} download={`companycam-${activeMedia.ref}.jpg`}>
                Save full-size
              </a>
              <button type="button" onClick={() => setActiveMedia(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function App(): React.ReactElement {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    loadFirebaseAuth()
      .then((nextAuth) => {
        if (cancelled) {
          return;
        }
        setAuth(nextAuth);
        if (!nextAuth) {
          setAuthReady(true);
          return;
        }
        unsubscribe = onAuthStateChanged(nextAuth, (nextUser) => {
          setUser(nextUser);
          setAuthReady(true);
        });
      })
      .catch(() => {
        if (!cancelled) {
          setAuthReady(true);
        }
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return <AuthGate auth={auth} user={user} authReady={authReady} onSignedIn={setUser} />;
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
