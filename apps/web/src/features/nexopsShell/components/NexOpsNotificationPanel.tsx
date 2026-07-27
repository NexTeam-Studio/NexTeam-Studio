import React from "react";
import type { NexOpsNotificationEntry } from "../NexOpsWorkspace";

interface NexOpsNotificationPanelProps {
  notificationStatus: string;
  notifications: Array<{ id: string; title: string; body: string; relativeTime: string; unread?: boolean }>;
  onMarkAllRead: () => Promise<void> | void;
  onOpenNotification: (entry: NexOpsNotificationEntry) => Promise<void> | void;
  onClose?: () => void;
}

export function NexOpsNotificationPanel(props: NexOpsNotificationPanelProps): React.ReactElement {
  const { notificationStatus, notifications, onMarkAllRead, onOpenNotification, onClose } = props;

  return (
    <section className="nexops-notification-panel" role="dialog" aria-label="Notifications">
      <div className="nexops-notification-head">
        <div>
          <p className="eyebrow">Updates</p>
          <h2>Notifications</h2>
        </div>
        <div className="nexops-inline-actions">
          <button type="button" onClick={() => void onMarkAllRead()}>Mark all read</button>
          {onClose ? <button type="button" onClick={onClose}>Close</button> : null}
        </div>
      </div>
      {notificationStatus ? <p className="nexops-module-status">{notificationStatus}</p> : null}
      <div className="nexops-notification-list">
        {notifications.map((entry) => (
          <button className={`nexops-notification-row${entry.unread ? " unread" : ""}`} key={entry.id} type="button" onClick={() => void onOpenNotification(entry)}>
            <div>
              <strong>{entry.title}</strong>
              <p>{entry.body}</p>
            </div>
            <small>{entry.relativeTime}</small>
          </button>
        ))}
        {!notifications.length && !notificationStatus ? <p className="nexops-module-status">Nothing is waiting in this notification rail right now.</p> : null}
      </div>
    </section>
  );
}

