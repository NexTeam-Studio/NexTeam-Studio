import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, type Auth, type User } from "firebase/auth";
import "./styles.css";

interface Source {
  rail: "jobber" | "companycam" | "native" | "gsc" | "gbp";
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

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined
};

function createFirebaseAuth(): Auth | null {
  if (Object.values(firebaseConfig).some((value) => !value)) {
    return null;
  }
  const existingApp = getApps()[0];
  const app = existingApp ?? initializeApp(firebaseConfig);
  return getAuth(app);
}

const firebaseAuth = createFirebaseAuth();

function sourceThumb(source: Source): React.ReactElement | null {
  if (source.rail !== "companycam" || !source.label.toLowerCase().includes("photo")) {
    return null;
  }
  return <img className="thumb" src={`/api/media/${encodeURIComponent(source.ref)}`} alt={source.label} loading="lazy" />;
}

function AuthGate(props: { user: User | null; authReady: boolean; onSignedIn: (user: User | null) => void }): React.ReactElement {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!firebaseAuth || working) {
      return;
    }
    setWorking(true);
    setError("");
    try {
      const result = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      props.onSignedIn(result.user);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Firebase sign-in failed.");
    } finally {
      setWorking(false);
    }
  }

  if (!firebaseAuth) {
    return (
      <main className="shell">
        <section className="auth-card">
          <p className="eyebrow">Nexi access</p>
          <h1>Firebase config missing</h1>
          <p>The chat is locked until the `VITE_FIREBASE_*` staging variables are present in the web build.</p>
        </section>
      </main>
    );
  }

  if (!props.authReady) {
    return (
      <main className="shell">
        <section className="auth-card">
          <p className="eyebrow">Nexi access</p>
          <h1>Checking session</h1>
          <p>Looking for a verified Firebase operator session.</p>
        </section>
      </main>
    );
  }

  if (props.user) {
    return <Chat user={props.user} />;
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

function Chat(props: { user: User }): React.ReactElement {
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
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: body.ok ? body.answer ?? "I do not have an answer yet." : body.error ?? "Nexi could not answer that.",
          sources: body.sources ?? []
        }
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: "Nexi could not reach the authenticated Job Desk API.", sources: [] }
      ]);
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="shell">
      <section className="phone">
        <header className="topbar">
          <div>
            <p className="eyebrow">Aquatrace ops</p>
            <h1>Nexi Job Desk</h1>
            <p className="signed-in">{props.user.email ?? "Firebase operator"}</p>
          </div>
          <div className="top-actions">
            <span className={`health ${health}`} aria-label={`Health ${health}`} />
            <button className="sign-out" type="button" onClick={() => firebaseAuth ? void signOut(firebaseAuth) : undefined}>Sign out</button>
          </div>
        </header>

        <div className="thread" aria-live="polite">
          {messages.map((message) => (
            <article className={`bubble ${message.role}`} key={message.id}>
              <p>{message.text}</p>
              {message.sources.length > 0 ? (
                <div className="sources">
                  {message.sources.map((source) => (
                    <span className="source" key={`${source.rail}:${source.ref}`}>
                      {sourceThumb(source)}
                      <span>{source.label}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          {working ? <div className="typing">Nexi is checking the rails...</div> : null}
        </div>

        <form className="composer" onSubmit={sendMessage}>
          <input
            aria-label="Message Nexi"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask: What is on today's schedule?"
          />
          <button type="submit" disabled={working || !draft.trim()}>Send</button>
        </form>
      </section>
    </main>
  );
}

function App(): React.ReactElement {
  const [user, setUser] = useState<User | null>(firebaseAuth?.currentUser ?? null);
  const [authReady, setAuthReady] = useState(!firebaseAuth);

  useEffect(() => {
    if (!firebaseAuth) {
      return;
    }
    return onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
  }, []);

  return <AuthGate user={user} authReady={authReady} onSignedIn={setUser} />;
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
