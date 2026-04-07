import { configureStore } from '@reduxjs/toolkit';
import tasksMiddleware from './middlewares/tasks/middleware';
import debugMiddleware from './middlewares/debug/middleware';
import appReducer from './slices/app';
import collectionsReducer from './slices/collections';
import tabsReducer from './slices/tabs';
import notificationsReducer from './slices/notifications';
import globalEnvironmentsReducer from './slices/global-environments';
import logsReducer from './slices/logs';
import workspacesReducer from './slices/workspaces';
import { draftDetectMiddleware } from './middlewares/draft/middleware';
import { autosaveMiddleware } from './middlewares/autosave/middleware';
import { vscodeDirtyStateMiddleware } from './middlewares/vscode-dirty-state/middleware';

export interface RootState {
  app: ReturnType<typeof appReducer>;
  collections: ReturnType<typeof collectionsReducer>;
  tabs: ReturnType<typeof tabsReducer>;
  notifications: ReturnType<typeof notificationsReducer>;
  globalEnvironments: ReturnType<typeof globalEnvironmentsReducer>;
  logs: ReturnType<typeof logsReducer>;
  workspaces: ReturnType<typeof workspacesReducer>;
}

const isDevEnv = (): boolean => {
  // @ts-expect-error - import.meta is available in Vite environment
  return import.meta.env.MODE === 'development';
};

let middleware = [tasksMiddleware.middleware, draftDetectMiddleware, autosaveMiddleware, vscodeDirtyStateMiddleware];
if (isDevEnv()) {
  middleware = [...middleware, debugMiddleware.middleware];
}

export const store = configureStore({
  reducer: {
    app: appReducer,
    collections: collectionsReducer,
    tabs: tabsReducer,
    notifications: notificationsReducer,
    globalEnvironments: globalEnvironmentsReducer,
    logs: logsReducer,
    workspaces: workspacesReducer
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    // on large/complex state objects (responses, etc.)
    serializableCheck: false,
    immutableCheck: false
  }).concat(middleware)
});

export type AppDispatch = typeof store.dispatch;

export default store;
