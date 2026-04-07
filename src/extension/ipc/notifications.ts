
import { registerHandler } from './handlers';

interface Notification {
  id: string;
  title: string;
  message: string;
  type?: string;
  timestamp?: string;
}

const BRUNO_INFO_ENDPOINT = process.env.BRUNO_INFO_ENDPOINT || 'https://appinfo.usebruno.com';

const fetchNotifications = async (): Promise<Notification[]> => {
  try {
    const response = await fetch(BRUNO_INFO_ENDPOINT);
    const data = await response.json() as { notifications?: Notification[] };
    return data?.notifications || [];
  } catch (error) {
    console.error('Error while fetching notifications:', error);
    return [];
  }
};

const registerNotificationsIpc = (): void => {
  registerHandler('renderer:fetch-notifications', async () => {
    try {
      const notifications = await fetchNotifications();
      return notifications;
    } catch (error) {
      throw error;
    }
  });
};

export default registerNotificationsIpc;
export { fetchNotifications };
