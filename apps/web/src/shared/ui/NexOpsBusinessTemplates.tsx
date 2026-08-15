import React from "react";

/**
 * Shared visual structure for primary NexOps business rails. Object modules
 * provide their domain data; this layer owns the familiar page rhythm.
 */
export function NexOpsRosterTemplate(props: {
  eyebrow: string;
  title: string;
  detail: string;
  metrics?: React.ReactNode;
  controls?: React.ReactNode;
  primaryAction?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="nexops-business-template nexops-roster-template">
      <header className="nexops-business-hero">
        <div>
          <p className="nexops-business-eyebrow">{props.eyebrow}</p>
          <h1>{props.title}</h1>
          <p>{props.detail}</p>
        </div>
        {props.primaryAction ? <div className="nexops-business-hero-action">{props.primaryAction}</div> : null}
      </header>
      {props.metrics ? <div className="nexops-business-metrics">{props.metrics}</div> : null}
      {props.controls ? <div className="nexops-business-controls">{props.controls}</div> : null}
      <div className="nexops-business-content">{props.children}</div>
    </section>
  );
}

export function NexOpsDetailTemplate(props: {
  back: React.ReactNode;
  eyebrow: string;
  title: string;
  detail: string;
  status?: React.ReactNode;
  actions?: React.ReactNode;
  navigation?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="nexops-business-template nexops-detail-template">
      <div className="nexops-business-back">{props.back}</div>
      <header className="nexops-business-hero nexops-business-detail-hero">
        <div>
          <p className="nexops-business-eyebrow">{props.eyebrow}</p>
          <h1>{props.title}</h1>
          <p>{props.detail}</p>
          {props.status ? <div className="nexops-business-status-row">{props.status}</div> : null}
        </div>
        {props.actions ? <div className="nexops-business-hero-action">{props.actions}</div> : null}
      </header>
      {props.navigation ? <nav className="nexops-business-nav" aria-label={`${props.title} sections`}>{props.navigation}</nav> : null}
      <div className="nexops-business-content">{props.children}</div>
    </section>
  );
}
