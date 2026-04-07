import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import filter from 'lodash/filter';
import brunoClipboard from 'utils/bruno-clipboard';

interface RequestPreferences {
  sslVerification: boolean;
  customCaCertificate: {
    enabled: boolean;
    filePath: string | null;
  };
  keepDefaultCaCertificates: {
    enabled: boolean;
  };
  timeout: number;
  oauth2: {
    useSystemBrowser: boolean;
  };
}

interface FontPreferences {
  codeFont: string;
}

interface GeneralPreferences {
  defaultCollectionLocation: string;
}

interface AutoSavePreferences {
  enabled: boolean;
  interval: number;
}

interface BetaPreferences {
  [featureName: string]: boolean;
}

interface ProxyAuthConfig {
  disabled?: boolean;
  username?: string;
  password?: string;
}

interface ProxyConfig {
  protocol?: 'http' | 'https' | 'socks4' | 'socks5';
  hostname?: string;
  port?: number;
  auth?: ProxyAuthConfig;
  bypassProxy?: string;
}

interface ProxyPreferences {
  disabled?: boolean;
  inherit?: boolean;
  config?: ProxyConfig;
}

interface LayoutPreferences {
  responsePaneOrientation?: 'horizontal' | 'vertical';
  [key: string]: unknown;
}

interface Preferences {
  request: RequestPreferences;
  font: FontPreferences;
  general: GeneralPreferences;
  autoSave: AutoSavePreferences;
  beta?: BetaPreferences;
  proxy?: ProxyPreferences;
  layout?: LayoutPreferences;
}

interface GenerateCodeSettings {
  mainLanguage: string;
  library: string;
  shouldInterpolate: boolean;
}

interface Cookie {
  domain: string;
  path: string;
  key: string;
  value: string;
  [key: string]: unknown;
}

interface Task {
  uid: string;
  [key: string]: unknown;
}

interface ClipboardState {
  hasCopiedItems: boolean;
}

type AppPage = 'home' | 'manage-workspaces' | 'request';

interface AppState {
  idbConnectionReady: boolean;
  screenWidth: number;
  isEnvironmentSettingsModalOpen: boolean;
  isGlobalEnvironmentSettingsModalOpen: boolean;
  showPreferences: boolean;
  preferences: Preferences;
  generateCode: GenerateCodeSettings;
  cookies: Cookie[];
  taskQueue: Task[];
  systemProxyEnvVariables: Record<string, string>;
  clipboard: ClipboardState;
  leftSidebarWidth: number;
  sidebarCollapsed: boolean;
  isDragging: boolean;
  currentPage: AppPage;
}

type AppThunk = (dispatch: (action: unknown) => void, getState: () => unknown) => unknown;

const initialState: AppState = {
  idbConnectionReady: false,
  screenWidth: 500,
  isEnvironmentSettingsModalOpen: false,
  isGlobalEnvironmentSettingsModalOpen: false,
  showPreferences: false,
  preferences: {
    request: {
      sslVerification: true,
      customCaCertificate: {
        enabled: false,
        filePath: null
      },
      keepDefaultCaCertificates: {
        enabled: true
      },
      timeout: 0,
      oauth2: {
        useSystemBrowser: false
      }
    },
    font: {
      codeFont: 'default'
    },
    general: {
      defaultCollectionLocation: ''
    },
    autoSave: {
      enabled: false,
      interval: 1000
    }
  },
  generateCode: {
    mainLanguage: 'Shell',
    library: 'curl',
    shouldInterpolate: true
  },
  cookies: [],
  taskQueue: [],
  systemProxyEnvVariables: {},
  clipboard: {
    hasCopiedItems: false
  },
  leftSidebarWidth: 270,
  sidebarCollapsed: false,
  isDragging: false,
  currentPage: 'home' as AppPage
};

export const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    idbConnectionReady: (state: AppState) => {
      state.idbConnectionReady = true;
    },
    refreshScreenWidth: (state: AppState) => {
      state.screenWidth = window.innerWidth;
    },
    updatePreferences: (state: AppState, action: PayloadAction<Preferences>) => {
      state.preferences = action.payload;
    },
    updateCookies: (state: AppState, action: PayloadAction<Cookie[]>) => {
      state.cookies = action.payload;
    },
    insertTaskIntoQueue: (state: AppState, action: PayloadAction<Task>) => {
      state.taskQueue.push(action.payload);
    },
    removeTaskFromQueue: (state: AppState, action: PayloadAction<{ taskUid: string }>) => {
      state.taskQueue = filter(state.taskQueue, (task) => task.uid !== action.payload.taskUid);
    },
    removeAllTasksFromQueue: (state: AppState) => {
      state.taskQueue = [];
    },
    updateSystemProxyEnvVariables: (state: AppState, action: PayloadAction<Record<string, string>>) => {
      state.systemProxyEnvVariables = action.payload;
    },
    updateGenerateCode: (state: AppState, action: PayloadAction<Partial<GenerateCodeSettings>>) => {
      state.generateCode = {
        ...state.generateCode,
        ...action.payload
      };
    },
    setClipboard: (state: AppState, action: PayloadAction<{ hasCopiedItems: boolean }>) => {
      state.clipboard.hasCopiedItems = action.payload.hasCopiedItems;
    },
    openEnvironmentSettingsModal: (state: AppState) => {
      state.isEnvironmentSettingsModalOpen = true;
    },
    closeEnvironmentSettingsModal: (state: AppState) => {
      state.isEnvironmentSettingsModalOpen = false;
    },
    openGlobalEnvironmentSettingsModal: (state: AppState) => {
      state.isGlobalEnvironmentSettingsModalOpen = true;
    },
    closeGlobalEnvironmentSettingsModal: (state: AppState) => {
      state.isGlobalEnvironmentSettingsModalOpen = false;
    },
    showPreferences: (state: AppState, action: PayloadAction<boolean>) => {
      state.showPreferences = action.payload;
    },
    updateLeftSidebarWidth: (state: AppState, action: PayloadAction<{ leftSidebarWidth: number }>) => {
      state.leftSidebarWidth = action.payload.leftSidebarWidth;
    },
    updateIsDragging: (state: AppState, action: PayloadAction<{ isDragging: boolean }>) => {
      state.isDragging = action.payload.isDragging;
    },
    updateSidebarCollapsed: (state: AppState, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload;
    },
    updateCurrentPage: (state: AppState, action: PayloadAction<AppPage>) => {
      state.currentPage = action.payload;
    }
  }
});

export const {
  idbConnectionReady,
  refreshScreenWidth,
  updatePreferences,
  updateCookies,
  insertTaskIntoQueue,
  removeTaskFromQueue,
  removeAllTasksFromQueue,
  updateSystemProxyEnvVariables,
  updateGenerateCode,
  setClipboard,
  openEnvironmentSettingsModal,
  closeEnvironmentSettingsModal,
  openGlobalEnvironmentSettingsModal,
  closeGlobalEnvironmentSettingsModal,
  showPreferences,
  updateLeftSidebarWidth,
  updateIsDragging,
  updateSidebarCollapsed,
  updateCurrentPage
} = appSlice.actions;

export const savePreferences = (preferences: Preferences): AppThunk => (dispatch) => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;

    ipcRenderer
      .invoke('renderer:save-preferences', preferences)
      .then(() => dispatch(updatePreferences(preferences)))
      .then(resolve)
      .catch(reject);
  });
};

export const deleteCookiesForDomain = (domain: any): AppThunk => (dispatch, getState) => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;

    ipcRenderer.invoke('renderer:delete-cookies-for-domain', domain).then(resolve).catch(reject);
  });
};

export const deleteCookie = (domain: any, path: any, cookieKey: any): AppThunk => (dispatch, getState) => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;

    ipcRenderer.invoke('renderer:delete-cookie', domain, path, cookieKey).then(resolve).catch(reject);
  });
};

export const addCookie = (domain: any, cookie: any): AppThunk => (dispatch, getState) => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;

    ipcRenderer.invoke('renderer:add-cookie', domain, cookie).then(resolve).catch(reject);
  });
};

export const modifyCookie = (domain: any, oldCookie: any, cookie: any): AppThunk => (dispatch, getState) => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;

    ipcRenderer.invoke('renderer:modify-cookie', domain, oldCookie, cookie).then(resolve).catch(reject);
  });
};

export const getParsedCookie = (cookieStr: any) => () => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;
    ipcRenderer.invoke('renderer:get-parsed-cookie', cookieStr).then(resolve).catch(reject);
  });
};

export const createCookieString = (cookieObj: any) => () => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;
    ipcRenderer.invoke('renderer:create-cookie-string', cookieObj).then(resolve).catch(reject);
  });
};

export const completeQuitFlow = (): AppThunk => (dispatch, getState) => {
  const { ipcRenderer } = window;
  return ipcRenderer.invoke('main:complete-quit-flow');
};

export const copyRequest = (item: any): AppThunk => (dispatch, getState) => {
  brunoClipboard.write(item);
  dispatch(setClipboard({ hasCopiedItems: true }));
  return Promise.resolve();
};

export default appSlice.reducer;
