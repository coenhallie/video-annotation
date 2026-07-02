import { ref } from 'vue';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number;
}

const notifications = ref<Notification[]>([]);

export function useNotifications() {
  const addNotification = (notification: {
    type: Notification['type'];
    title: string;
    message?: string | undefined;
    duration?: number | undefined;
  }) => {
    const id = Date.now().toString();
    const newNotification: Notification = {
      id,
      type: notification.type,
      title: notification.title,
      duration: notification.duration ?? 3000, // Default 3 seconds if not specified
      ...(notification.message !== undefined && { message: notification.message }),
    };

    notifications.value.push(newNotification);

    // Auto remove after duration
    if (newNotification.duration && newNotification.duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, newNotification.duration);
    }

    return id;
  };

  const removeNotification = (id: string) => {
    const index = notifications.value.findIndex((n) => n.id === id);
    if (index > -1) {
      notifications.value.splice(index, 1);
    }
  };

  const clearAll = () => {
    notifications.value = [];
  };

  // Convenience methods
  const success = (title: string, message?: string, duration?: number) => {
    return addNotification({ type: 'success', title, message, duration });
  };

  const error = (title: string, message?: string, duration?: number) => {
    return addNotification({ type: 'error', title, message, duration });
  };

  const info = (title: string, message?: string, duration?: number) => {
    return addNotification({ type: 'info', title, message, duration });
  };

  const warning = (title: string, message?: string, duration?: number) => {
    return addNotification({ type: 'warning', title, message, duration });
  };

  return {
    notifications,
    addNotification,
    removeNotification,
    clearAll,
    success,
    error,
    info,
    warning,
  };
}
