import { useEffect, useState } from "react";
import type {
  NexOpsNotificationEntry,
  NexOpsNotificationsResponse,
  WorkspaceTarget
} from "../contracts/workspaceContracts";

export function useNexOpsNotifications(options: {
  tenantId: string;
  onOpenTarget: (target: WorkspaceTarget) => void;
}) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NexOpsNotificationEntry[]>([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [notificationStatus, setNotificationStatus] = useState("");

  async function loadNotifications(): Promise<void> {
    try {
      const body = await fetch(`/api/crm/notifications?tenantId=${encodeURIComponent(options.tenantId)}`)
        .then((response) => response.json() as Promise<NexOpsNotificationsResponse>);
      if (!body.ok) {
        setNotifications([]);
        setNotificationUnreadCount(0);
        setNotificationStatus(body.error ?? "Notifications are unavailable right now.");
        return;
      }
      setNotifications(body.notifications ?? []);
      setNotificationUnreadCount(body.unreadCount ?? 0);
      setNotificationStatus("");
    } catch {
      setNotifications([]);
      setNotificationUnreadCount(0);
      setNotificationStatus("Notifications API unreachable.");
    }
  }

  async function openNotification(entry: NexOpsNotificationEntry): Promise<void> {
    try {
      if (entry.unread) {
        await fetch("/api/crm/notifications/read", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tenantId: options.tenantId, notificationId: entry.id })
        });
      }
    } finally {
      options.onOpenTarget({ module: entry.target.module, objectId: entry.target.objectId });
      void loadNotifications();
    }
  }

  async function markAllNotificationsRead(): Promise<void> {
    await fetch("/api/crm/notifications/read-all", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: options.tenantId })
    });
    void loadNotifications();
  }

  useEffect(() => {
    void loadNotifications();
    const onCrmMutation = () => void loadNotifications();
    window.addEventListener("nexops:crm-mutated", onCrmMutation);
    return () => window.removeEventListener("nexops:crm-mutated", onCrmMutation);
  }, [options.tenantId]);

  return {
    notificationsOpen,
    notifications,
    notificationUnreadCount,
    notificationStatus,
    setNotificationsOpen,
    openNotification,
    markAllNotificationsRead
  };
}
