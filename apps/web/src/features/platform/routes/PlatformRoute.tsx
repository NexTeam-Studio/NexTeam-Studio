import React, { useState } from "react";
import "../styles/platformRoute.css";
import { renderPlatformSubroute } from "./platformSubroutes";
import { resolvePlatformSubroute } from "./resolvePlatformSubroute";
import { usePathname } from "../../../shared/router/usePathname";
import { NexCommandRoute } from "../../platformOverview/routes/NexCommandRoute";

export function PlatformRoute(): React.ReactElement {
  const pathname = usePathname();
  const subroute = resolvePlatformSubroute(pathname);

  if (pathname === "/platform/profile-completion") return <PlatformProfileCompletion />;

  if (pathname === "/platform" || pathname === "/platform/" || pathname.startsWith("/nexcommand")) {
    return <main className="platform-route"><NexCommandRoute /></main>;
  }

  return (
    <main className="platform-route">
      {renderPlatformSubroute(subroute)}
    </main>
  );
}

function PlatformProfileCompletion(): React.ReactElement {
  const [profilePhotoRef, setProfilePhotoRef] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "complete">("idle");

  async function completeProfile(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStatus("saving");
    try {
      const response = await fetch("/api/platform/admin/team/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profilePhotoRef })
      });
      if (!response.ok) throw new Error("Profile completion was denied.");
      setStatus("complete");
      window.history.replaceState({}, "", "/platform");
      window.dispatchEvent(new PopStateEvent("popstate"));
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
        <label htmlFor="platform-profile-photo">Profile photo reference</label>
        <input id="platform-profile-photo" value={profilePhotoRef} onChange={(event) => setProfilePhotoRef(event.target.value)} required />
        <button type="submit" disabled={status === "saving"}>{status === "saving" ? "Saving…" : "Complete profile"}</button>
      </form>
      {status === "error" && <p role="alert">We could not complete your profile. Please try again.</p>}
      {status === "complete" && <p role="status">Profile completed.</p>}
    </section>
  </main>;
}
