import React from "react";
import { PlatformMark } from "../branding/ProductBranding";
import { NexOpsNavGlyph } from "../../features/nexopsShell/workspaceSupport";
import { ModuleHeroCard, NexOpsCreationTemplate, NexOpsDetailTemplate, NexOpsRosterTemplate } from "./NexOpsBusinessTemplates";
import { NexSuiteSidebar, type NexSuiteSidebarItem } from "./NexSuiteSidebar";
import { NexTeamApplicationShell } from "./NexTeamApplicationShell";
import { NexTeamProductHeader } from "./NexTeamProductHeader";
import "./templateReview.css";

function ReviewChrome(props: { sourceFile: string; level: "Layout Part" | "Page Template"; title: string; detail: string; children: React.ReactNode }): React.ReactElement {
  return <NexTeamApplicationShell className="template-review-chrome" navigationLabel="NexSuite design navigation" mobileNavigationMode="collapse" header={<NexTeamProductHeader className="template-review-chrome__topbar" ariaLabel="NexSuite design Header" brand={<div className="template-review-chrome__brand"><PlatformMark decorative /><span>NexSuite Design</span></div>} context={<span>Templates review</span>} />} navigation={<nav className="template-review-chrome__navigation"><a href="/nexcommand?area=templates&template=global">Templates</a></nav>}><section className="template-review-page"><header className="template-review-page__intro"><p className="ui-eyebrow">NexSuite design system · {props.level}</p><h1>{props.sourceFile}</h1><h2>{props.title}</h2><p>{props.detail}</p></header>{props.children}</section></NexTeamApplicationShell>;
}

export function ModuleHeroCardReviewPage(): React.ReactElement {
  return <ReviewChrome sourceFile="NexOpsBusinessTemplates.tsx" level="Layout Part" title="ModuleHeroCard" detail="The shared Page introduction Layout Part. This live specimen uses the current component directly."><section className="template-review-page__specimen"><ModuleHeroCard eyebrow="NexOps commercial" title="Quotes" detail="Build clear client-ready proposals, keep pricing in one place, and move approved work forward." icon={<NexOpsNavGlyph module="quotes" />} primaryAction={<button className="nexops-hero-primary-button" type="button">New Quote</button>} secondaryActions={<><button type="button">Import CSV</button><button type="button">Refresh</button></>} /></section></ReviewChrome>;
}

export function NexOpsRosterTemplateReviewPage(): React.ReactElement {
  return <ReviewChrome sourceFile="NexOpsBusinessTemplates.tsx" level="Page Template" title="NexOpsRosterTemplate" detail="The shared roster Page Template, rendered with representative data and the actual current Hero Layout Part."><NexOpsRosterTemplate eyebrow="NexOps client manager" title="Clients" detail="Find, review, and act on client records from one connected roster." icon={<NexOpsNavGlyph module="clients" />} primaryAction={<button className="nexops-hero-primary-button" type="button">New Client</button>} secondaryActions={<button type="button">Refresh</button>} metrics={<><article className="template-review-metric"><span>Active clients</span><strong>24</strong></article><article className="template-review-metric"><span>Leads</span><strong>3</strong></article></>} controls={<div className="template-review-controls"><button type="button">All clients</button><button type="button">Active</button><input aria-label="Search clients" placeholder="Search clients" /></div>}><article className="template-review-content-card"><h2>Client roster content</h2><p>Representative Page content begins below the shared Hero, metrics, and controls.</p></article></NexOpsRosterTemplate></ReviewChrome>;
}

export function NexOpsCreationTemplateReviewPage(): React.ReactElement {
  return <ReviewChrome sourceFile="NexOpsBusinessTemplates.tsx" level="Page Template" title="NexOpsCreationTemplate" detail="The shared creation Page Template. It renders the current creation Hero, back action, and creation content frame directly."><NexOpsCreationTemplate title="Create Quote" detail="Choose the client, build the work, and review the price." icon={<NexOpsNavGlyph module="quotes" />} backAction={<button className="nexops-hero-primary-button" type="button">← Quotes</button>} heroClassName="module-hero-card--quote"><section className="template-review-page__specimen"><article className="template-review-content-card"><h2>Select Client</h2><p>Consumer Page content chooses and saves the client inside this shared creation content region.</p><div className="template-review-controls"><button type="button">Add New</button><button type="button">Existing</button></div></article><article className="template-review-content-card"><h2>Quote Builder</h2><p>Consumer Page content supplies the creation workflow, fields, and actions without changing this Page Template.</p></article></section></NexOpsCreationTemplate></ReviewChrome>;
}

export function NexOpsDetailTemplateReviewPage(): React.ReactElement {
  return <ReviewChrome sourceFile="NexOpsBusinessTemplates.tsx" level="Page Template" title="NexOpsDetailTemplate" detail="The shared single-record Page Template, rendered directly with representative record data."><NexOpsDetailTemplate back={<button type="button">Back to Clients</button>} eyebrow="NexOps client manager" title="Harbor & Hearth Services" detail="Client detail workspace for records, correspondence, and operational history." status={<span className="template-review-status">Active</span>} actions={<button type="button">Edit Client</button>} navigation={<><button type="button" className="active">Overview</button><button type="button">Activity</button><button type="button">Documents</button></>}><article className="template-review-content-card"><h2>Client overview content</h2><p>Representative detail content begins below the shared back action, Hero, navigation, and action region.</p></article></NexOpsDetailTemplate></ReviewChrome>;
}

const shellItems: NexSuiteSidebarItem[] = [
  { id: "home", label: "Home", icon: "⌂", active: true, onSelect: () => undefined },
  { id: "clients", label: "Clients", icon: "◫", onSelect: () => undefined },
  { id: "quotes", label: "Quotes", icon: "▤", onSelect: () => undefined }
];

export function ApplicationShellReviewPage(): React.ReactElement {
  return <section className="template-review-application-shell"><header className="template-review-page__intro"><p className="ui-eyebrow">NexSuite design system · Page Template</p><h1>NexTeamApplicationShell.tsx</h1><h2>Application Shell and Hero slot</h2><p>This Page directly renders the shared Application Shell, including its Header, Sidebar, workspace, and first-element Hero slot.</p></header><NexTeamApplicationShell className="template-review-shell-specimen" navigationLabel="Representative workspace navigation" header={<NexTeamProductHeader className="template-review-shell-specimen__topbar" ariaLabel="Representative application Header" brand={<div className="template-review-chrome__brand"><PlatformMark decorative /><span>NexSuite</span></div>} context={<span>Review workspace</span>} utilities={<button type="button">Sign Out</button>} />} navigation={<NexSuiteSidebar items={shellItems} />} hero={<ModuleHeroCard title="Page title" detail="The Hero Layout Part occupies the Application Shell's first workspace element." icon={<NexOpsNavGlyph module="home" />} />}><section className="template-review-shell-specimen__content"><h2>Page content area</h2><p>Representative Page content follows the supplied Hero slot without changing the Header or Sidebar Layout Parts.</p></section></NexTeamApplicationShell></section>;
}
