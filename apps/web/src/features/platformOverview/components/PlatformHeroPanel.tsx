import React from "react";
import { PlatformMark } from "../../../shared/branding/ProductBranding";

export function PlatformHeroPanel(props: {
  signedInAs: string;
  onSignOut: () => void;
}): React.ReactElement {
  return (
    <section className="platform-hero">
      <div className="platform-hero__identity">
        <PlatformMark className="platform-hero__mark" decorative />
        <div>
          <p className="ui-eyebrow">NexTeam Admin</p>
          <h1>Tenant Administration</h1>
          <p className="platform-hero__signed-in">{props.signedInAs}</p>
        </div>
      </div>
      <button className="platform-hero__sign-out" type="button" onClick={props.onSignOut}>
        Sign out
      </button>
    </section>
  );
}
