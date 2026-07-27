import React, { useState } from "react";
import { NexiIdentityMark, ProductLogo } from "../branding/ProductBranding";
import { useAuthSession } from "./AuthSessionProvider";
import "./auth.css";

export function AuthGate(props: { children: React.ReactNode }): React.ReactElement {
  const { auth, authReady, localAuthEnabled, localProfiles, signIn, user } = useAuthSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (working) return;
    setWorking(true);
    setError("");
    try {
      await signIn(email.trim(), password);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : localAuthEnabled ? "Local sign-in failed." : "Firebase sign-in failed.");
    } finally {
      setWorking(false);
    }
  }

  if (!authReady) return <AccessCard title="Checking session" body="Loading operator access." />;
  if (user) return <>{props.children}</>;

  if (localAuthEnabled) {
    return (
      <main className="shell">
        <section className="auth-card">
          <ProductLogo product="nexops" className="auth-card-brand" alt="NexOps" />
          <p className="eyebrow">Tenant staff access</p>
          <h1>NexOps Sign-In</h1>
          <p>Use a configured local staff profile to unlock this tenant workspace for testing. Owner, office-admin, and technician sessions stay role-scoped after sign-in.</p>
          <AuthForm email={email} password={password} localAuthEnabled working={working} error={error} onEmail={setEmail} onPassword={setPassword} onSubmit={handleSubmit} />
          <div className="auth-profile-hints" aria-label="Available local role accounts">
            {localProfiles.map((profile) => <article key={profile.id}><strong>{profile.label}</strong><span>{profile.email}</span></article>)}
          </div>
        </section>
      </main>
    );
  }

  if (!auth) return <AccessCard title="Firebase config missing" body="The chat is locked until the Firebase web config is present in staging runtime variables." />;

  return (
    <main className="shell">
      <section className="auth-card">
        <NexiIdentityMark className="auth-card-brand" caption="Nexi" />
        <p className="eyebrow">Tenant operations</p>
        <h1>Nexi Sign-In</h1>
        <p>Use your Firebase operator account to unlock the Job Desk.</p>
        <AuthForm email={email} password={password} localAuthEnabled={false} working={working} error={error} onEmail={setEmail} onPassword={setPassword} onSubmit={handleSubmit} />
      </section>
    </main>
  );
}

function AccessCard(props: { title: string; body: string }): React.ReactElement {
  return <main className="shell"><section className="auth-card"><NexiIdentityMark className="auth-card-brand" caption="Nexi" /><p className="eyebrow">Nexi access</p><h1>{props.title}</h1><p>{props.body}</p></section></main>;
}

function AuthForm(props: {
  email: string;
  password: string;
  localAuthEnabled: boolean;
  working: boolean;
  error: string;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}): React.ReactElement {
  return (
    <form className="auth-form" onSubmit={props.onSubmit}>
      <label>Email<input autoComplete="email" inputMode="email" value={props.email} onChange={(event) => props.onEmail(event.target.value)} /></label>
      {!props.localAuthEnabled ? <label>Password<input autoComplete="current-password" type="password" value={props.password} onChange={(event) => props.onPassword(event.target.value)} /></label> : null}
      {props.error ? <p className="auth-error">{props.error}</p> : null}
      <button type="submit" disabled={props.working || !props.email.trim() || (!props.localAuthEnabled && !props.password)}>{props.working ? "Signing in..." : "Sign In"}</button>
    </form>
  );
}
