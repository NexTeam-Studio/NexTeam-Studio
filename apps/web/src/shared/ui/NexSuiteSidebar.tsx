import React from "react";
import "./nexSuiteSidebar.css";

export type NexSuiteSidebarItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
  onSelect: () => void;
};

/**
 * Global Sidebar Layout Part. Its visual structure and responsive drawer
 * behavior are duplicated from the current NexCommand sidebar. A consumer
 * supplies its own feature navigation and actions.
 */
export function NexSuiteSidebar(props: { items: NexSuiteSidebarItem[]; open?: boolean; id?: string; onSelect?: () => void }): React.ReactElement {
  return <nav className={`nexsuite-sidebar ${props.open ? "nexsuite-sidebar--open" : ""}`} id={props.id} aria-label="Workspace navigation">{props.items.map((item) => <button key={item.id} className={item.active ? "is-active" : ""} type="button" onClick={() => { item.onSelect(); props.onSelect?.(); }}><i aria-hidden="true">{item.icon}</i><span>{item.label}</span></button>)}</nav>;
}
