import React from "react";
import "./nexSuiteSidebar.css";

export type NexSuiteSidebarItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  active?: boolean;
  onSelect: () => void;
};

/**
 * Global Sidebar Layout Part. Its visual structure and responsive drawer
 * behavior are duplicated from the current NexCommand sidebar. A consumer
 * supplies its own feature navigation and actions.
 */
export function NexSuiteSidebar(props: { items: NexSuiteSidebarItem[]; open?: boolean; id?: string; onClose?: () => void; onSelect?: () => void }): React.ReactElement {
  return <nav className={`nexsuite-sidebar ${props.open ? "nexsuite-sidebar--open" : ""}`} id={props.id} aria-label="Workspace navigation">{props.onClose ? <button className="nexsuite-sidebar__close" type="button" aria-label="Close navigation" onClick={props.onClose}><svg aria-hidden="true" viewBox="0 0 20 20"><path d="M11.5 4.5 6 10l5.5 5.5M6 10h8" /></svg></button> : null}{props.items.map((item) => <button key={item.id} className={item.active ? "is-active" : ""} type="button" onClick={() => { item.onSelect(); props.onSelect?.(); }}><i aria-hidden="true">{item.icon}</i><span>{item.label}</span>{item.trailing}</button>)}</nav>;
}
