import React from "react";

type Tone = "dominant" | "secondary" | "quiet" | "danger" | "success" | "warning" | "blocked";
type EmptyStateKind = "fresh" | "filtered" | "completed" | "blocked" | "offline" | "error";

export function NexopsSectionCard(props: {
  eyebrow?: string;
  title: string;
  detail?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <section className={`nexops-kit-card${props.className ? ` ${props.className}` : ""}`}>
      <header className="nexops-kit-card-header">
        <div>
          {props.eyebrow ? <p className="nexops-kit-eyebrow">{props.eyebrow}</p> : null}
          <h2>{props.title}</h2>
          {props.detail ? <p className="nexops-kit-card-detail">{props.detail}</p> : null}
        </div>
        {props.actions ? <div className="nexops-kit-card-actions">{props.actions}</div> : null}
      </header>
      {props.children}
    </section>
  );
}

export function NexopsActionButton(props: {
  label: string;
  tone?: Tone;
  disabled?: boolean;
  hint?: string;
  type?: "button" | "submit";
  onClick?: () => void;
}): React.ReactElement {
  return (
    <button
      className={`nexops-kit-action nexops-kit-action-${props.tone ?? "secondary"}`}
      disabled={props.disabled}
      type={props.type ?? "button"}
      onClick={props.onClick}
    >
      <span>{props.label}</span>
      {props.hint ? <small>{props.hint}</small> : null}
    </button>
  );
}

export function NexopsActionRail(props: {
  dominant: React.ReactNode;
  secondary?: React.ReactNode;
  utility?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="nexops-kit-action-rail">
      <div className="nexops-kit-action-rail-dominant">{props.dominant}</div>
      {props.secondary ? <div className="nexops-kit-action-rail-secondary">{props.secondary}</div> : null}
      {props.utility ? <div className="nexops-kit-action-rail-utility">{props.utility}</div> : null}
    </div>
  );
}

export function NexopsStatusPill(props: {
  label: string;
  tone?: Tone;
  detail?: string;
}): React.ReactElement {
  return (
    <span className={`nexops-kit-pill nexops-kit-pill-${props.tone ?? "quiet"}`} title={props.detail}>
      {props.label}
    </span>
  );
}

export function NexopsBanner(props: {
  tone?: Tone;
  title: string;
  detail: string;
  action?: React.ReactNode;
}): React.ReactElement {
  return (
    <section className={`nexops-kit-banner nexops-kit-banner-${props.tone ?? "quiet"}`} role="status" aria-live="polite">
      <div>
        <strong>{props.title}</strong>
        <p>{props.detail}</p>
      </div>
      {props.action ? <div>{props.action}</div> : null}
    </section>
  );
}

export function NexopsProgressStrip(props: {
  label: string;
  detail: string;
  percent: number;
}): React.ReactElement {
  const bounded = Math.max(0, Math.min(100, props.percent));
  return (
    <section className="nexops-kit-progress">
      <div className="nexops-kit-progress-copy">
        <strong>{props.label}</strong>
        <span>{props.detail}</span>
      </div>
      <div aria-hidden className="nexops-kit-progress-track">
        <div className="nexops-kit-progress-fill" style={{ width: `${bounded}%` }} />
      </div>
      <small>{bounded}%</small>
    </section>
  );
}

export function NexopsEmptyState(props: {
  title: string;
  detail: string;
  kind: EmptyStateKind;
  action?: React.ReactNode;
}): React.ReactElement {
  return (
    <section className={`nexops-kit-empty nexops-kit-empty-${props.kind}`}>
      <div className="nexops-kit-empty-icon" aria-hidden>{emptyGlyph(props.kind)}</div>
      <div>
        <h3>{props.title}</h3>
        <p>{props.detail}</p>
      </div>
      {props.action ? <div className="nexops-kit-empty-action">{props.action}</div> : null}
    </section>
  );
}

export function NexopsConfirmationPanel(props: {
  title: string;
  detail: string;
  consequence: string;
  tier: "undo" | "standard" | "high" | "financial";
  primaryLabel?: string;
  secondaryLabel?: string;
  tertiaryLabel?: string;
}): React.ReactElement {
  return (
    <section className={`nexops-kit-confirm nexops-kit-confirm-${props.tier}`}>
      <div>
        <p className="nexops-kit-eyebrow">Confirmation tier</p>
        <h3>{props.title}</h3>
        <p>{props.detail}</p>
        <strong>{props.consequence}</strong>
      </div>
      <div className="nexops-kit-confirm-actions">
        <NexopsActionButton label={props.primaryLabel ?? "Yes, do it"} tone={props.tier === "financial" ? "danger" : "dominant"} />
        <NexopsActionButton label={props.secondaryLabel ?? "No"} tone="secondary" />
        <NexopsActionButton label={props.tertiaryLabel ?? "Make changes"} tone="quiet" />
      </div>
    </section>
  );
}

export interface UploadQueueItem {
  id: string;
  label: string;
  detail: string;
  progress: number;
  status: "queued" | "syncing" | "paused" | "failed" | "done";
}

export function NexopsUploadQueue(props: { items: UploadQueueItem[] }): React.ReactElement {
  return (
    <section className="nexops-kit-upload-queue" aria-label="Upload queue">
      {props.items.map((item) => (
        <article key={item.id} className="nexops-kit-upload-row">
          <div>
            <strong>{item.label}</strong>
            <p>{item.detail}</p>
          </div>
          <div className="nexops-kit-upload-meta">
            <NexopsStatusPill label={item.status} tone={uploadTone(item.status)} />
            <div aria-hidden className="nexops-kit-upload-track">
              <div className="nexops-kit-upload-fill" style={{ width: `${Math.max(0, Math.min(100, item.progress))}%` }} />
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

export function NexopsConflictCard(props: {
  title: string;
  localVersion: string;
  serverVersion: string;
  consequence: string;
}): React.ReactElement {
  return (
    <section className="nexops-kit-conflict" aria-live="polite">
      <div>
        <p className="nexops-kit-eyebrow">Conflict check</p>
        <h3>{props.title}</h3>
        <p>{props.consequence}</p>
      </div>
      <div className="nexops-kit-conflict-columns">
        <article>
          <strong>Saved on this device</strong>
          <p>{props.localVersion}</p>
        </article>
        <article>
          <strong>Newest on the server</strong>
          <p>{props.serverVersion}</p>
        </article>
      </div>
      <div className="nexops-kit-conflict-actions">
        <NexopsActionButton label="Keep mine" tone="secondary" />
        <NexopsActionButton label="Use server version" tone="quiet" />
        <NexopsActionButton label="Compare changes" tone="dominant" />
      </div>
    </section>
  );
}

export function NexopsFieldCommandHeader(props: {
  customer: string;
  address: string;
  status: string;
  arrivalWindow: string;
  actions?: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="nexops-kit-field-header" aria-label="Field command header">
      <div className="nexops-kit-field-header-copy">
        <div>
          <span>Customer</span>
          <strong>{props.customer}</strong>
        </div>
        <div>
          <span>Address</span>
          <strong>{props.address}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{props.status}</strong>
        </div>
        <div>
          <span>Arrival</span>
          <strong>{props.arrivalWindow}</strong>
        </div>
      </div>
      <div className="nexops-kit-field-header-actions">
        {props.actions ?? (
          <>
            <NexopsActionButton label="Call" tone="secondary" />
            <NexopsActionButton label="Directions" tone="secondary" />
            <NexopsActionButton label="Primary action" tone="dominant" />
          </>
        )}
      </div>
    </section>
  );
}

export function NexopsModalFrame(props: {
  title: string;
  detail: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="nexops-kit-modal-demo" aria-label={props.title}>
      <header>
        <div>
          <h3>{props.title}</h3>
          <p>{props.detail}</p>
        </div>
        <button type="button" className="nexops-kit-close-button" aria-label="Close modal">x</button>
      </header>
      <div className="nexops-kit-modal-body">{props.children}</div>
      {props.footer ? <footer>{props.footer}</footer> : null}
    </section>
  );
}

export function NexopsDrawerFrame(props: {
  title: string;
  detail: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="nexops-kit-drawer-demo" aria-label={props.title}>
      <header>
        <h3>{props.title}</h3>
        <p>{props.detail}</p>
      </header>
      <div>{props.children}</div>
    </section>
  );
}

export function NexopsTabSet(props: {
  tabs: Array<{ id: string; label: string; active?: boolean }>;
}): React.ReactElement {
  return (
    <div className="nexops-kit-tabs" role="tablist" aria-label="Pattern tabs">
      {props.tabs.map((tab) => (
        <button key={tab.id} type="button" role="tab" aria-selected={tab.active} className={tab.active ? "active" : ""}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function NexopsAccessibleList(props: {
  title: string;
  items: Array<{ id: string; title: string; detail: string; state: string }>;
}): React.ReactElement {
  return (
    <section className="nexops-kit-list" aria-label={props.title}>
      {props.items.map((item) => (
        <article key={item.id}>
          <div>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
          </div>
          <NexopsStatusPill label={item.state} tone={item.state === "Blocked" ? "blocked" : "quiet"} />
        </article>
      ))}
    </section>
  );
}

export function NexopsHomeShell(props: {
  now: React.ReactNode;
  needsAttention: React.ReactNode;
  upcoming: React.ReactNode;
  businessOverview: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="nexops-kit-home-shell">
      <div className="nexops-kit-home-zone">
        <p className="nexops-kit-eyebrow">Now</p>
        {props.now}
      </div>
      <div className="nexops-kit-home-zone">
        <p className="nexops-kit-eyebrow">Needs attention</p>
        {props.needsAttention}
      </div>
      <div className="nexops-kit-home-zone">
        <p className="nexops-kit-eyebrow">Upcoming</p>
        {props.upcoming}
      </div>
      <div className="nexops-kit-home-zone">
        <p className="nexops-kit-eyebrow">Business overview</p>
        {props.businessOverview}
      </div>
    </section>
  );
}

export function NexopsHomeZoneCard(props: {
  title: string;
  summary: string;
  dominantLabel?: string;
  tone?: Tone;
  onAction?: (() => void) | undefined;
}): React.ReactElement {
  return (
    <article className="nexops-kit-home-card">
      <div>
        <h3>{props.title}</h3>
        <p>{props.summary}</p>
      </div>
      {props.dominantLabel ? <NexopsActionButton label={props.dominantLabel} tone={props.tone ?? "dominant"} onClick={props.onAction} /> : <NexopsStatusPill label="Waiting to sync" tone="warning" />}
    </article>
  );
}

function emptyGlyph(kind: EmptyStateKind): string {
  switch (kind) {
    case "fresh":
      return "+";
    case "filtered":
      return "/";
    case "completed":
      return "OK";
    case "blocked":
      return "!";
    case "offline":
      return "~";
    case "error":
      return "x";
    default:
      return ".";
  }
}

function uploadTone(status: UploadQueueItem["status"]): Tone {
  switch (status) {
    case "done":
      return "success";
    case "failed":
      return "danger";
    case "paused":
      return "warning";
    case "syncing":
      return "dominant";
    case "queued":
    default:
      return "quiet";
  }
}
