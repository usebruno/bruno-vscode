export interface RequestPreferences {
  sslVerification: boolean;
  customCaCertificate: {
    enabled: boolean;
    filePath: string | null;
  };
  /** @deprecated Use customCaCertificate instead */
  caCert?: {
    enabled: boolean;
    filePath: string | null;
  };
  keepDefaultCaCertificates: {
    enabled: boolean;
  };
  timeout: number;
  storeCookies?: boolean;
  sendCookies?: boolean;
  oauth2: {
    useSystemBrowser: boolean;
  };
}

export interface FontPreferences {
  codeFont: string;
}

export interface GeneralPreferences {
  defaultCollectionLocation: string;
}

export interface AutoSavePreferences {
  enabled: boolean;
  interval: number;
}

export interface BetaPreferences {
  [featureName: string]: boolean;
}

export interface ProxyAuthConfig {
  disabled?: boolean;
  username?: string;
  password?: string;
}

export interface ProxyConfig {
  protocol?: 'http' | 'https' | 'socks4' | 'socks5';
  hostname?: string;
  port?: number;
  auth?: ProxyAuthConfig;
  bypassProxy?: string;
}

export interface ProxyPreferences {
  disabled?: boolean;
  inherit?: boolean;
  config?: ProxyConfig;
}

export interface LayoutPreferences {
  responsePaneOrientation?: 'horizontal' | 'vertical';
  [key: string]: unknown;
}

export interface Preferences {
  request: RequestPreferences;
  font: FontPreferences;
  general: GeneralPreferences;
  autoSave: AutoSavePreferences;
  beta?: BetaPreferences;
  proxy?: ProxyPreferences;
  layout?: LayoutPreferences;
}

export interface SystemProxyEnvVariables {
  http_proxy?: string;
  https_proxy?: string;
  no_proxy?: string;
}

export interface AppState {
  isDragging: boolean;
  idbConnectionReady: boolean;
  leftSidebarWidth: number;
  leftMenuBarOpen: boolean;
  preferences: Preferences;
  cookies: CookieData[];
  runtimeVariables: Record<string, unknown>;
  storedTheme: 'light' | 'dark' | 'system';
  screenWidth: number | null;
  showHomePage: boolean;
  defaultWorkspace: string | null;
  maxSettingsSidebarWidth: number;
  currentSettingsWidth: number;
  systemProxyEnvVariables?: SystemProxyEnvVariables;
}

export interface CookieData {
  domain: string;
  cookies: Cookie[];
}

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: string | number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}
