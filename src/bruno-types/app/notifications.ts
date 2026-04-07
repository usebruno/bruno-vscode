import type { UID } from '../common';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  uid: UID;
  type: NotificationType;
  message: string;
  description?: string;
  timestamp: number;
  read?: boolean;
  action?: NotificationAction;
}

export interface NotificationAction {
  label: string;
  handler: string;
  data?: unknown;
}

export interface NotificationsState {
  notifications: Notification[];
}
