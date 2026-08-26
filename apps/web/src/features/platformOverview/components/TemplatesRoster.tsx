import React from "react";

export type TemplateNavigationNode = {
  id: string;
  label: string;
  description?: string;
  rosterHref?: string;
  href?: string;
  disabled?: boolean;
  children?: TemplateNavigationNode[];
};

const templatesRoot: TemplateNavigationNode = {
  id: "templates",
  label: "Templates",
  children: [{
    id: "design",
    label: "Design",
    description: "Reusable product design elements and application foundations.",
    rosterHref: "/nexcommand?area=templates&template=design",
    children: [{
      id: "nexsuite",
      label: "NexSuite",
      description: "Shared NexSuite design and layout parts.",
      rosterHref: "/nexcommand?area=templates&template=nexsuite",
      children: [{
        id: "global",
        label: "Global",
        description: "Global layout parts used across NexSuite products.",
        rosterHref: "/nexcommand?area=templates&template=global",
        children: [{
          id: "header",
          label: "Header",
          description: "Reusable tenant and internal Header review.",
          href: "/design-system/layout-parts/header"
        }, {
          id: "sidebar",
          label: "Sidebar",
          description: "Reusable NexSuite Sidebar Layout Part.",
          href: "/design-system/layout-parts/sidebar"
        }, {
          id: "module-hero-card",
          label: "Module Hero Card",
          description: "Shared Page introduction Layout Part.",
          href: "/design-system/layout-parts/module-hero-card"
        }, {
          id: "application-shell",
          label: "Application Shell",
          description: "Shared Page Template with the Hero slot.",
          href: "/design-system/page-templates/application-shell"
        }, {
          id: "nexops-roster-template",
          label: "NexOps Roster Template",
          description: "Shared roster Page Template.",
          href: "/design-system/page-templates/nexops-roster-template"
        }, {
          id: "nexops-detail-template",
          label: "NexOps Detail Template",
          description: "Shared detail Page Template.",
          href: "/design-system/page-templates/nexops-detail-template"
        }, {
          id: "footer",
          label: "Footer",
          description: "Future Global review item.",
          disabled: true
        }]
      }, {
        id: "nexops",
        label: "NexOps",
        description: "NexOps Page Templates and current Page-owned Layout Parts.",
        rosterHref: "/nexcommand?area=templates&template=nexops",
        children: [{
          id: "nexops-roster-template",
          label: "NexOps Roster Template",
          description: "Shared roster Page Template review.",
          href: "/design-system/page-templates/nexops-roster-template"
        }, {
          id: "nexops-detail-template",
          label: "NexOps Detail Template",
          description: "Shared single-record Page Template review.",
          href: "/design-system/page-templates/nexops-detail-template"
        }, {
          id: "quote-search-filter",
          label: "Quote Search and Filter",
          description: "Quotes Roster Page Layout Part: search, Filter accordion, statuses, and result tally.",
          href: "/nexops/quotes#quote-search-filter"
        }, {
          id: "quote-results-roster",
          label: "Quote Results Roster",
          description: "Quotes Roster Page Layout Part: centered result banner and white roster body.",
          href: "/nexops/quotes#quote-results-roster"
        }, {
          id: "expandable-quote-roster-record",
          label: "Expandable Quote Roster Record",
          description: "Quotes Roster Page Layout Part: one-at-a-time expandable quote record and Open Quote action.",
          href: "/nexops/quotes#expandable-quote-roster-record"
        }]
      }]
    }]
  }]
};

function findNode(node: TemplateNavigationNode, id: string): TemplateNavigationNode | null {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const match = findNode(child, id);
    if (match) return match;
  }
  return null;
}

function findTrail(node: TemplateNavigationNode, id: string, trail: TemplateNavigationNode[] = []): TemplateNavigationNode[] | null {
  const next = [...trail, node];
  if (node.id === id) return next;
  for (const child of node.children ?? []) {
    const match = findTrail(child, id, next);
    if (match) return match;
  }
  return null;
}

export function TemplatesRoster(props: { rosterId: string | null }): React.ReactElement {
  const roster = props.rosterId ? findNode(templatesRoot, props.rosterId) ?? templatesRoot : templatesRoot;
  const trail = findTrail(templatesRoot, roster.id) ?? [templatesRoot];
  return <section className="nexcommand__panel nexcommand__templates-roster">
    <p className="ui-eyebrow">NexSuite design inventory</p>
    <h2>{roster.label}</h2>
    <p>{roster.id === "templates" ? "Browse template categories and reusable design elements." : `Browse ${roster.label} design elements.`}</p>
    <nav className="nexcommand__template-breadcrumb" aria-label="Template location">{trail.map((node, index) => node.rosterHref && index < trail.length - 1 ? <a key={node.id} href={node.rosterHref}>{node.label}</a> : <span key={node.id}>{node.label}</span>)}</nav>
    <ul className="nexcommand__template-roster-list">{(roster.children ?? []).map((node) => <li key={node.id}>{node.disabled ? <span aria-disabled="true">{node.label}<small>{node.description}</small></span> : <a href={node.href ?? node.rosterHref}>{node.label}<small>{node.description}</small></a>}</li>)}</ul>
  </section>;
}
