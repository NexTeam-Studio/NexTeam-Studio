import React from "react";

/**
 * Shared Layout Part for roster Pages. Consumers supply their own module
 * icon, copy, and actions; this component owns the shared hero structure.
 */
export function ModuleHeroCard(props: {
  eyebrow?: string;
  title: string;
  detail: string;
  icon: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <header className={`nexops-business-hero module-hero-card${props.className ? ` ${props.className}` : ""}`}>
      <div className="module-hero-card__copy">
        {props.eyebrow ? <p className="nexops-business-eyebrow">{props.eyebrow}</p> : null}
        <div className="module-hero-card__title">
          <span className="module-hero-card__icon" aria-hidden="true">{props.icon}</span>
          <h1>{props.title}</h1>
        </div>
        <p>{props.detail}</p>
      </div>
      {props.primaryAction || props.secondaryActions ? (
        <div className="nexops-business-hero-action module-hero-card__actions">
          {props.primaryAction}
          {props.secondaryActions}
        </div>
      ) : null}
    </header>
  );
}

/**
 * Shared visual structure for primary NexOps business rails. Object modules
 * provide their domain data; this Page Template owns the roster rhythm.
 */
export function NexOpsRosterTemplate(props: {
  eyebrow?: string;
  title: string;
  detail: string;
  icon?: React.ReactNode;
  metrics?: React.ReactNode;
  controls?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  heroClassName?: string;
  showHero?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="nexops-business-template nexops-roster-template">
      {props.showHero === false ? null : <ModuleHeroCard
        eyebrow={props.eyebrow}
        title={props.title}
        detail={props.detail}
        icon={props.icon ?? null}
        primaryAction={props.primaryAction}
        secondaryActions={props.secondaryActions}
        className={props.heroClassName}
      />}
      {props.metrics ? <div className="nexops-business-metrics">{props.metrics}</div> : null}
      {props.controls ? <div className="nexops-business-controls">{props.controls}</div> : null}
      <div className="nexops-business-content">{props.children}</div>
    </section>
  );
}

/**
 * Shared Layout Part for the interactive portion of a roster Page.  Every
 * consumer supplies domain data and actions only; this component owns the
 * Search, Filter, and Results hierarchy used by the approved Quotes roster.
 */
export function NexOpsRosterSurface(props: {
  ariaLabel: string;
  searchTitle: string;
  search: React.ReactNode;
  filter: React.ReactNode;
  filterOptions?: React.ReactNode;
  resultCount: number;
  resultNoun: string;
  children: React.ReactNode;
  empty?: React.ReactNode;
}): React.ReactElement {
  return (
    <>
      <section className="nexops-business-hero module-hero-card--quote nexops-quote-roster-filters" aria-label={props.ariaLabel}>
        <h2>{props.searchTitle}</h2>
        {props.search}
        {props.filter}
        {props.filterOptions}
      </section>
      <section className="nexops-quote-filtered-roster" aria-label={`${props.resultNoun} results`}>
        <div className="nexops-quote-filtered-roster-heading">
          <h2>{props.resultCount} {props.resultCount === 1 ? "Result" : "Results"}</h2>
        </div>
        <div className="nexops-quote-filtered-table">
          <div className="nexops-quote-filtered-list">{props.children}</div>
          {props.empty}
        </div>
      </section>
    </>
  );
}

/**
 * Shared Page Template for create/composer Pages. Consumers supply their
 * domain workflow as children while this template owns the creation Hero,
 * back action region, and creation content frame.
 */
export function NexOpsCreationTemplate(props: {
  eyebrow?: string;
  title: string;
  detail: string;
  icon?: React.ReactNode;
  backAction: React.ReactNode;
  heroClassName?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="nexops-business-template nexops-creation-template">
      <ModuleHeroCard
        eyebrow={props.eyebrow}
        title={props.title}
        detail={props.detail}
        icon={props.icon ?? null}
        primaryAction={props.backAction}
        className={props.heroClassName}
      />
      <div className="nexops-creation-content">{props.children}</div>
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
