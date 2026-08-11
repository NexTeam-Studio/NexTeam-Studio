import React, { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { NexiIdentityMark, ProductLogo, type ProductBrand } from "../branding/ProductBranding";
import { useAuthSession } from "./AuthSessionProvider";
import { usePathname } from "../router/usePathname";
import "./auth.css";

interface AuthProduct {
  brand: ProductBrand;
  path: "/nexi" | "/nexops" | "/nexcommand";
  workspaceName: string;
  signInDescription: string;
}

function authProductForPath(pathname: string): AuthProduct {
  if (pathname.startsWith("/platform") || pathname.startsWith("/nexcommand")) {
    return {
      brand: "nexops",
      path: "/nexcommand",
      workspaceName: "NexCommand",
      signInDescription: "Sign in with your authorized NexTeam platform account to open NexCommand."
    };
  }
  if (pathname.startsWith("/nexops")) return { brand: "nexops", path: "/nexops", workspaceName: "NexOps", signInDescription: "Sign in with your NexSuite account to open the NexOps workspace." };
  return {
    brand: "nexi",
    path: "/nexi",
    workspaceName: "Nexi",
    signInDescription: "Sign in with your NexSuite account to open Nexi."
  };
}

export function AuthGate(props: { children: React.ReactNode }): React.ReactElement {
  const { auth, authReady, localAuthEnabled, localProfiles, signIn, user } = useAuthSession();
  const product = authProductForPath(usePathname());
  const ownerInviteComplete = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("ownerInvite") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [resetMessage, setResetMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (working) return;
    setWorking(true);
    setError("");
    setResetMessage("");
    try {
      await signIn(email.trim(), password);
    } catch {
      setError(localAuthEnabled ? "We couldn't sign you in with that local profile." : "We couldn't sign you in. Check your email and password, or reset your password.");
    } finally {
      setWorking(false);
    }
  }

  async function handleForgotPassword(): Promise<void> {
    if (working || localAuthEnabled || !auth) return;
    if (!email.trim()) {
      setError("");
      setResetMessage("Enter your email first, then select Forgot password again.");
      return;
    }
    setWorking(true);
    setError("");
    try {
      await sendPasswordResetEmail(auth, email.trim(), {
        url: `${window.location.origin}${product.path}/sign-in?passwordReset=1`,
        handleCodeInApp: false
      });
    } catch {
      // Keep the response identical so this screen does not reveal whether an account exists.
    } finally {
      setResetMessage("If this email has an account, a password-reset link has been sent.");
      setWorking(false);
    }
  }

  if (!authReady) return <AccessCard product={product} title="Checking session" body="Loading operator access." />;
  if (user) return <>{props.children}</>;

  if (localAuthEnabled) {
    return (
      <main className="shell">
        <section className="auth-card">
          <ProductLogo product={product.brand} className="auth-card-brand" alt={product.workspaceName} />
          <h1>{product.workspaceName} Sign-In</h1>
          <p>Use a configured local staff profile to unlock this tenant workspace for testing. Owner, office-admin, and technician sessions stay role-scoped after sign-in.</p>
          <AuthForm email={email} password={password} localAuthEnabled working={working} error={error} resetMessage={resetMessage} onEmail={setEmail} onPassword={setPassword} onSubmit={handleSubmit} onForgotPassword={handleForgotPassword} />
          <ProductSwitch product={product} />
          <div className="auth-profile-hints" aria-label="Available local role accounts">
            {localProfiles.map((profile) => <article key={profile.id}><strong>{profile.label}</strong><span>{profile.email}</span></article>)}
          </div>
        </section>
      </main>
    );
  }

  if (!auth) return <AccessCard product={product} title="Firebase config missing" body={`${product.workspaceName} is locked until the Firebase web config is present in staging runtime variables.`} />;

  return (
    <main className="shell">
      <section className="auth-card">
        <AuthProductMark product={product} />
        <h1>{product.workspaceName} Sign-In</h1>
        <p>{product.signInDescription}</p>
        {ownerInviteComplete ? <p className="auth-welcome-message">Your password is set. Sign in to open your NexTeam workspace.</p> : null}
        <AuthForm email={email} password={password} localAuthEnabled={false} working={working} error={error} resetMessage={resetMessage} onEmail={setEmail} onPassword={setPassword} onSubmit={handleSubmit} onForgotPassword={handleForgotPassword} />
        <ProductSwitch product={product} />
      </section>
    </main>
  );
}

function AuthProductMark(props: { product: AuthProduct }): React.ReactElement {
  if (props.product.brand === "nexi") {
    return <NexiIdentityMark className="auth-card-brand" />;
  }
  return <ProductLogo product={props.product.brand} className="auth-card-brand" alt={props.product.workspaceName} />;
}

function AccessCard(props: { product: AuthProduct; title: string; body: string }): React.ReactElement {
  return (
    <main className="shell">
      <section className="auth-card">
        <AuthProductMark product={props.product} />
        <h1>{props.title}</h1>
        <p>{props.body}</p>
        <ProductSwitch product={props.product} />
      </section>
    </main>
  );
}

function ProductSwitch(props: { product: AuthProduct }): React.ReactElement {
  if (props.product.path === "/nexcommand") return <></>;
  const alternate = props.product.path === "/nexops"
    ? { path: "/nexi", label: "Open Nexi" }
    : { path: "/nexops", label: "Open NexOps" };
  return <a className="auth-product-link" href={alternate.path}>{alternate.label}</a>;
}

function AuthForm(props: {
  email: string;
  password: string;
  localAuthEnabled: boolean;
  working: boolean;
  error: string;
  resetMessage: string;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onForgotPassword: () => void;
}): React.ReactElement {
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <form className="auth-form" onSubmit={props.onSubmit}>
      <label>Email<input autoComplete="email" inputMode="email" value={props.email} onChange={(event) => props.onEmail(event.target.value)} /></label>
      {!props.localAuthEnabled ? (
        <label>
          Password
          <span className="auth-password-field">
            <input autoComplete="current-password" type={passwordVisible ? "text" : "password"} value={props.password} onChange={(event) => props.onPassword(event.target.value)} />
            <button
              className="auth-password-visibility"
              type="button"
              aria-label={passwordVisible ? "Hide password" : "Show password"}
              aria-pressed={passwordVisible}
              onClick={() => setPasswordVisible((visible) => !visible)}
            >
              <EyeIcon hidden={passwordVisible} />
            </button>
          </span>
        </label>
      ) : null}
      {props.error ? <p className="auth-error">{props.error}</p> : null}
      {props.resetMessage ? <p className="auth-reset-message">{props.resetMessage}</p> : null}
      <button type="submit" disabled={props.working || !props.email.trim() || (!props.localAuthEnabled && !props.password)}>{props.working ? "Signing in..." : "Sign In"}</button>
      {!props.localAuthEnabled ? <button className="auth-forgot-password" type="button" disabled={props.working} onClick={props.onForgotPassword}>Forgot password?</button> : null}
    </form>
  );
}

function EyeIcon(props: { hidden: boolean }): React.ReactElement {
  return props.hidden ? (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 5.1A10.8 10.8 0 0 1 12 4.9c5.2 0 8.8 4.2 9.8 7.1a.9.9 0 0 1 0 .6 12.1 12.1 0 0 1-3.1 4.4M6.2 6.2A12.1 12.1 0 0 0 2.2 12a.9.9 0 0 0 0 .6c1 2.9 4.6 6.5 9.8 6.5a11 11 0 0 0 2.8-.4" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.2 12a.9.9 0 0 1 0-.6C3.2 8.5 6.8 4.9 12 4.9s8.8 3.6 9.8 6.5a.9.9 0 0 1 0 .6c-1 2.9-4.6 6.5-9.8 6.5S3.2 14.9 2.2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
  );
}
