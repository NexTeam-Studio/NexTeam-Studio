import React from "react";
import type { PlatformPlan } from "../../../shared/contracts/platform";

export function PlatformPlansPanel(props: { plans: PlatformPlan[] }): React.ReactElement {
  return (
    <section className="platform-plan-grid" aria-label="Platform plans">
      {props.plans.map((plan) => (
        <article className="platform-plan-card" key={plan.id}>
          <p className="ui-eyebrow">{plan.id}</p>
          <h2>{plan.name}</h2>
          <p className="platform-plan-card__price">${plan.monthlyUsd}/mo</p>
          <p>{plan.modules.join(", ")}</p>
        </article>
      ))}
    </section>
  );
}
