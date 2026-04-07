import toast from 'react-hot-toast';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { getAppInstallDate } from 'utils/common/platform';
import semver from 'semver';
import type { AppDispatch } from '../index';

interface Notification {
  id: string;
  date: string;
  title?: string;
  message?: string;
  minVersion?: string;
  maxVersion?: string;
  read?: boolean;
}

interface NotificationsState {
  loading: boolean;
  notifications: Notification[];
  readNotificationIds: string[];
}

const getReadNotificationIds = (): string[] => {
  try {
    const readNotificationIdsString = window.localStorage.getItem('bruno.notifications.read');
    const readNotificationIds = readNotificationIdsString ? JSON.parse(readNotificationIdsString) : [];
    return readNotificationIds;
  } catch (err) {
    toast.error('An error occurred while fetching read notifications');
    return [];
  }
};

const setReadNotificationsIds = (val: string[]): void => {
  try {
    window.localStorage.setItem('bruno.notifications.read', JSON.stringify(val));
  } catch (err) {
    toast.error('An error occurred while setting read notifications');
  }
};

const initialState: NotificationsState = {
  loading: false,
  notifications: [],
  readNotificationIds: getReadNotificationIds() || []
};

export const filterNotificationsByVersion = (notifications: Notification[] | null, currentVersion: string | null): Notification[] => {
  try {
    if (!notifications) return [];

    if (!currentVersion) return notifications;

    return notifications.filter((notification) => {
      const { minVersion, maxVersion } = notification;
      if (!minVersion && !maxVersion) return true;
      if (!minVersion) return semver.lte(currentVersion, maxVersion!);
      if (!maxVersion) return semver.gte(currentVersion, minVersion);

      return semver.gte(currentVersion, minVersion) && semver.lte(currentVersion, maxVersion);
    });
  } catch (error) {
    console.error(error);
    return [];
  }
};

export const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    setFetchingStatus: (state, action: PayloadAction<{ fetching: boolean }>) => {
      state.loading = action.payload.fetching;
    },
    setNotifications: (state, action: PayloadAction<{ notifications: Notification[] }>) => {
      let notifications = action.payload.notifications || [];
      const readNotificationIds = state.readNotificationIds;

      // Ignore notifications sent before the app was installed
      const appInstalledOnDate = getAppInstallDate();
      notifications = notifications.filter((notification) => {
        const notificationDate = new Date(notification.date);
        const appInstalledOn = new Date(appInstalledOnDate);

        notificationDate.setHours(0, 0, 0, 0);
        appInstalledOn.setHours(0, 0, 0, 0);

        return notificationDate >= appInstalledOn;
      });

      state.notifications = notifications.map((notification) => {
        return {
          ...notification,
          read: readNotificationIds.includes(notification.id)
        };
      });
    },
    markNotificationAsRead: (state, action: PayloadAction<{ notificationId: string }>) => {
      const { notificationId } = action.payload;

      if (state.readNotificationIds.includes(notificationId)) return;

      const notification = state.notifications.find(
        (notification) => notification.id === notificationId
      );
      if (!notification) return;

      state.readNotificationIds.push(notificationId);
      setReadNotificationsIds(state.readNotificationIds);
      notification.read = true;
    },
    markAllNotificationsAsRead: (state) => {
      const readNotificationIds = state.notifications.map((notification) => notification.id);
      state.readNotificationIds = readNotificationIds;
      setReadNotificationsIds(readNotificationIds);

      state.notifications.forEach((notification) => {
        notification.read = true;
      });
    }
  }
});

export const { setNotifications, setFetchingStatus, markNotificationAsRead, markAllNotificationsAsRead }
  = notificationSlice.actions;

export const fetchNotifications = ({ currentVersion }: { currentVersion: string | null }) => (dispatch: AppDispatch): Promise<Notification[]> => {
  return new Promise((resolve) => {
    const { ipcRenderer } = window as Window & { ipcRenderer?: { invoke: (channel: string) => Promise<Notification[]> } };
    dispatch(setFetchingStatus({ fetching: true }));

    if (!ipcRenderer) {
      dispatch(setFetchingStatus({ fetching: false }));
      resolve([]);
      return;
    }

    ipcRenderer
      .invoke('renderer:fetch-notifications')
      .then((notifications: Notification[] | null) => {
        const filteredNotifications = filterNotificationsByVersion(notifications, currentVersion);
        dispatch(setNotifications({ notifications: filteredNotifications }));
        dispatch(setFetchingStatus({ fetching: false }));
        resolve(filteredNotifications);
      })
      .catch((err) => {
        dispatch(setFetchingStatus({ fetching: false }));
        console.error(err);
        resolve([]);
      });
  });
};

export default notificationSlice.reducer;
