import React from "react";
import type { PilotSubscriptionPackage } from "../api/platformPlansApi";

export function PlatformPlansPanel(props: { plans: PilotSubscriptionPackage[] }): React.ReactElement {
  return (
    <section className="platform-plan-grid" aria-label="Pilot subscription package">
      {props.plans.map((plan) => (
        <article className="platform-plan-card" key={plan.id}>
          <p className="ui-eyebrow">Pilot onboarding package</p>
          <h2>{plan.name}</h2>
          <p className="platform-plan-card__price">${(plan.priceCents / 100).toFixed(2)}</p>
          <p>Required for this pilot. All approved NexTeam modules are enabled during onboarding.</p>
        </article>
      ))}
    </section>
  );
}
