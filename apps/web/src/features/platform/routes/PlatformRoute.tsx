import React, { useEffect, useState } from "react";
import "../styles/platformRoute.css";
import { renderPlatformSubroute } from "./platformSubroutes";
import { resolvePlatformSubroute } from "./resolvePlatformSubroute";
import { usePathname } from "../../../shared/router/usePathname";
import { NexCommandRoute } from "../../platformOverview/routes/NexCommandRoute";
import { invalidateNexCommandSession } from "../../../shared/auth/authBootstrap";

export function PlatformRoute(): React.ReactElement {
  const pathname = usePathname();
  const subroute = resolvePlatformSubroute(pathname);
  const [profileGate, setProfileGate] = useState<"checking" | "incomplete" | "ready" | "error">("checking");

  useEffect(() => {
    let active = true;
    setProfileGate("checking");
    void fetch("/api/platform/admin/team/me")
      .then(async (response) => {
        if (!response.ok) throw new Error(`NexCommand profile could not be loaded (${response.status}).`);
        return response.json() as Promise<{ user?: { profilePhotoRef?: string } }>;
      })
      .then(({ user }) => {
        if (!active) return;
        if (user?.profilePhotoRef?.trim()) {
          setProfileGate("ready");
          if (pathname === "/platform/profile-completion") navigateToNexCommand();
          return;
        }
        setProfileGate("incomplete");
        if (pathname !== "/platform/profile-completion") navigateToProfileCompletion();
      })
      .catch((error: unknown) => {
        if (!active) return;
        // A rejected platform-profile request means the short-lived console
        // session can no longer authorize this route. Clear only that marker
        // and return to the normal fresh NexCommand sign-in screen.
        if (error instanceof Error && /\(401\)|\(403\)/.test(error.message)) {
          invalidateNexCommandSession();
          window.location.assign("/nexcommand/sign-in");
          return;
        }
        setProfileGate("error");
      });
    return () => { active = false; };
  }, [pathname]);

  if (profileGate === "checking") return <main className="platform-profile-gate" role="status">Checking your NexCommand profile…</main>;
  if (profileGate === "error") return <main className="platform-profile-gate" role="alert">Your NexCommand profile could not be verified. Please try again.</main>;
  if (profileGate === "incomplete") return <PlatformProfileCompletion onCompleted={() => setProfileGate("checking")} />;

  if (pathname === "/platform" || pathname === "/platform/" || pathname.startsWith("/nexcommand")) {
    return <main className="platform-route"><NexCommandRoute /></main>;
  }

  return (
    <main className="platform-route">
      {renderPlatformSubroute(subroute)}
    </main>
  );
}

function navigateToProfileCompletion(): void {
  window.history.replaceState({}, "", "/platform/profile-completion");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function navigateToNexCommand(): void {
  window.history.replaceState({}, "", "/platform");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function PlatformProfileCompletion({ onCompleted }: { onCompleted: () => void }): React.ReactElement {
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "complete">("idle");

  async function completeProfile(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!profilePhoto) {
      setStatus("error");
      return;
    }
    setStatus("saving");
    try {
      const response = await fetch("/api/platform/admin/team/me/profile-photo", {
        method: "POST",
        headers: { "content-type": profilePhoto.type },
        body: profilePhoto
      });
      if (!response.ok) throw new Error("Profile completion was denied.");
      setStatus("complete");
      onCompleted();
      navigateToNexCommand();
    } catch {
      setStatus("error");
    }
  }

  return <main className="platform-profile-completion">
    <section className="platform-profile-completion-card" aria-labelledby="profile-completion-title">
      <p className="platform-profile-completion-eyebrow">Secure profile completion</p>
      <h1 id="profile-completion-title">Add your required profile photo</h1>
      <p>Access to NexCommand is limited until your profile photo is saved.</p>
      <form onSubmit={(event) => void completeProfile(event)}>
        <label htmlFor="platform-profile-photo">Profile photo</label>
        <input id="platform-profile-photo" type="file" aria-describedby="platform-profile-photo-help" onChange={(event) => setProfilePhoto(event.target.files?.[0] ?? null)} required />
        <p className="platform-profile-photo-help" id="platform-profile-photo-help">Browse device files, Drive, Dropbox, or photos. Choose a PNG, JPEG, or WebP image up to 5 MB.</p>
        <button type="submit" disabled={status === "saving"}>{status === "saving" ? "Saving…" : "Complete profile"}</button>
      </form>
      {status === "error" && <p role="alert">We could not complete your profile. Please try again.</p>}
      {status === "complete" && <p role="status">Profile completed.</p>}
    </section>
  </main>;
}
