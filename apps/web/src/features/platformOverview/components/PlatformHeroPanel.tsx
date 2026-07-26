import React from "react";

export function PlatformHeroPanel(props: {
  signedInAs: string;
  onSignOut: () => void;
}): React.ReactElement {
  return (
    <section className="platform-hero">
      <div>
        <p className="ui-eyebrow">M13 Platform</p>
        <h1>Tenant Command Center</h1>
        <p className="platform-hero__signed-in">{props.signedInAs}</p>
      </div>
      <button className="platform-hero__sign-out" type="button" onClick={props.onSignOut}>
        Sign out
      </button>
    </section>
  );
}
