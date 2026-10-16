export type NotificationPreferences = {
  newMail: boolean;
  confirmations: boolean;
  position: "bottom-right" | "bottom-center" | "top-right";
  duration: 3000 | 6000 | 10000 | 0;
};

export const notificationKey = "emc2.notifications.v1";
export const notificationDefaults: NotificationPreferences = {
  newMail: true, confirmations: true, position: "bottom-right", duration: 6000,
};

export function readNotifications(): NotificationPreferences {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(notificationKey) || "null");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return { ...notificationDefaults };
    const value = stored as Record<string, unknown>;
    return {
      newMail: typeof value.newMail === "boolean" ? value.newMail : notificationDefaults.newMail,
      confirmations: typeof value.confirmations === "boolean" ? value.confirmations : notificationDefaults.confirmations,
      position: value.position === "bottom-center" || value.position === "top-right" ? value.position : "bottom-right",
      duration: value.duration === 3000 || value.duration === 10000 || value.duration === 0 ? value.duration : 6000,
    };
  } catch { return { ...notificationDefaults }; }
}

export function saveNotifications(value: NotificationPreferences): boolean {
  try { localStorage.setItem(notificationKey, JSON.stringify(value)); return true; }
  catch { return false; }
}
