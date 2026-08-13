import React, { useEffect, useState } from "react";
import { ClientsRoute } from "../../clients/routes/ClientsRoute";
import { InvoicesRoute } from "../../invoices/routes/InvoicesRoute";
import { JobsRoute } from "../../jobs/routes/JobsRoute";
import { PlatformOverviewRoute } from "../../platformOverview/routes/PlatformOverviewRoute";
import { QuotesRoute } from "../../quotes/routes/QuotesRoute";
import { SettingsRoute } from "../../settings/routes/SettingsRoute";
import type { PlatformSubroute } from "./resolvePlatformSubroute";

export function renderPlatformSubroute(subroute: PlatformSubroute): React.ReactElement {
  switch (subroute) {
    case "clients":
      return <ClientsRoute />;
    case "quotes":
      return <QuotesRoute />;
    case "jobs":
      return <JobsRoute />;
    case "settings":
      return <PlatformSettingsRoute />;
    case "invoices":
      return <InvoicesRoute />;
    case "overview":
    default:
      return <PlatformOverviewRoute />;
  }
}

type PlatformProfile = {
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
};

function PlatformSettingsRoute(): React.ReactElement {
  const [profile, setProfile] = useState<PlatformProfile | null>(null);
  const [profileStatus, setProfileStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    void fetch("/api/platform/admin/team/me")
      .then(async (response) => {
        if (!response.ok) throw new Error("NexCommand profile could not be loaded.");
        return response.json() as Promise<{ user?: PlatformProfile }>;
      })
      .then(({ user }) => {
        if (!active) return;
        setProfile(user ?? null);
        setProfileStatus("ready");
      })
      .catch(() => { if (active) setProfileStatus("error"); });
    return () => { active = false; };
  }, []);

  return <>
    <section className="platform-owner-profile" aria-labelledby="platform-owner-profile-title">
      <p className="platform-owner-profile__eyebrow">NexCommand Owner profile</p>
      <h1 id="platform-owner-profile-title">Protected identity</h1>
      <p id="platform-owner-profile-maintenance">Your Owner email and legal name are code-controlled. Contact NexTeam support for controlled maintenance; these fields cannot be changed from Settings.</p>
      {profileStatus === "loading" && <p role="status">Loading protected profile…</p>}
      {profileStatus === "error" && <p role="alert">Your protected profile could not be loaded. Please try again.</p>}
      {profileStatus === "ready" && <div className="platform-owner-profile__fields">
        <label htmlFor="platform-owner-email">Email<input id="platform-owner-email" type="email" value={profile?.email ?? ""} disabled aria-describedby="platform-owner-profile-maintenance" /></label>
        <label htmlFor="platform-owner-first-name">First name<input id="platform-owner-first-name" value={profile?.firstName ?? ""} disabled aria-describedby="platform-owner-profile-maintenance" /></label>
        <label htmlFor="platform-owner-last-name">Last name<input id="platform-owner-last-name" value={profile?.lastName ?? ""} disabled aria-describedby="platform-owner-profile-maintenance" /></label>
      </div>}
    </section>
    <SettingsRoute />
  </>;
}
