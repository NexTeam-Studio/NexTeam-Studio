import React, { useState } from "react";
import "./nexSuiteSidebar.css";

export type NexSuiteSidebarItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  active?: boolean;
  onSelect?: () => void;
  children?: NexSuiteSidebarItem[];
};

/**
 * Global Sidebar Layout Part. Its visual structure and responsive drawer
 * behavior are duplicated from the current NexCommand sidebar. A consumer
 * supplies its own feature navigation and actions.
 */
export function NexSuiteSidebar(props: { items: NexSuiteSidebarItem[]; header?: React.ReactNode; open?: boolean; id?: string; onClose?: () => void; onSelect?: () => void }): React.ReactElement {
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  return <nav className={`nexsuite-sidebar ${props.open ? "nexsuite-sidebar--open" : ""}`} id={props.id} aria-label="Workspace navigation">{props.header ? <div className="nexsuite-sidebar__header">{props.header}</div> : null}{props.onClose ? <button className="nexsuite-sidebar__close" type="button" aria-label="Close navigation" onClick={props.onClose}><svg aria-hidden="true" viewBox="0 0 20 20"><path d="M11.5 4.5 6 10l5.5 5.5M6 10h8" /></svg></button> : null}{props.items.map((item) => {
    const children = item.children ?? [];
    const isGroup = children.length > 0;
    const expanded = expandedGroups.includes(item.id);
    const active = Boolean(item.active || children.some((child) => child.active));
    if (isGroup) {
      return <section className="nexsuite-sidebar__group" key={item.id}><button className={active ? "is-active" : ""} type="button" aria-expanded={expanded} onClick={() => setExpandedGroups((current) => expanded ? current.filter((id) => id !== item.id) : [...current, item.id])}><i aria-hidden="true">{item.icon}</i><span>{item.label}</span><b className="nexsuite-sidebar__group-chevron" aria-hidden="true">⌄</b></button>{expanded ? <div className="nexsuite-sidebar__group-items">{children.map((child) => <button key={child.id} className={child.active ? "is-active" : ""} type="button" onClick={() => { child.onSelect?.(); props.onSelect?.(); }}><i aria-hidden="true">{child.icon}</i><span>{child.label}</span>{child.trailing}</button>)}</div> : null}</section>;
    }
    return <button key={item.id} className={active ? "is-active" : ""} type="button" onClick={() => { item.onSelect?.(); props.onSelect?.(); }}><i aria-hidden="true">{item.icon}</i><span>{item.label}</span>{item.trailing}</button>;
  })}</nav>;
}
