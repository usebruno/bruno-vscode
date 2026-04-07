import * as Yup from 'yup';
import * as vscode from 'vscode';
import { get, merge } from 'lodash';

/**
 * The preferences are stored in VS Code's globalState.
 * This replaces electron-store for VS Code extension.
 */

interface ProxyAuth {
  username: string;
  password: string;
  disabled?: boolean;
}

interface ProxyConfig {
  protocol: 'http' | 'https' | 'socks4' | 'socks5';
  hostname: string;
  port: number | null;
  auth: ProxyAuth;
  bypassProxy: string;
}

interface Proxy {
  disabled?: boolean;
  inherit: boolean;
  config: ProxyConfig;
}

interface Preferences {
  request: {
    sslVerification: boolean;
    customCaCertificate: {
      enabled: boolean;
      filePath: string | null;
    };
    keepDefaultCaCertificates: {
      enabled: boolean;
    };
    storeCookies: boolean;
    sendCookies: boolean;
    timeout: number;
    oauth2: {
      useSystemBrowser: boolean;
    };
  };
  font: {
    codeFont: string;
    codeFontSize: number;
  };
  proxy: Proxy;
  layout: {
    responsePaneOrientation: 'horizontal' | 'vertical';
  };
  beta: Record<string, boolean>;
  onboarding: {
    hasLaunchedBefore: boolean;
  };
  general: {
    defaultCollectionLocation: string;
  };
  autoSave: {
    enabled: boolean;
    interval: number;
  };
  _migrations?: Record<string, boolean>;
}

const defaultPreferences: Preferences = {
  request: {
    sslVerification: true,
    customCaCertificate: {
      enabled: false,
      filePath: null
    },
    keepDefaultCaCertificates: {
      enabled: true
    },
    storeCookies: true,
    sendCookies: true,
    timeout: 0,
    oauth2: {
      useSystemBrowser: true // Default to true for VS Code (no embedded window)
    }
  },
  font: {
    codeFont: 'default',
    codeFontSize: 13
  },
  proxy: {
    inherit: true,
    config: {
      protocol: 'http',
      hostname: '',
      port: null,
      auth: {
        username: '',
        password: ''
      },
      bypassProxy: ''
    }
  },
  layout: {
    responsePaneOrientation: 'horizontal'
  },
  beta: {},
  onboarding: {
    hasLaunchedBefore: false
  },
  general: {
    defaultCollectionLocation: ''
  },
  autoSave: {
    enabled: false,
    interval: 1000
  }
};

const preferencesSchema = Yup.object().shape({
  request: Yup.object().shape({
    sslVerification: Yup.boolean(),
    customCaCertificate: Yup.object({
      enabled: Yup.boolean(),
      filePath: Yup.string().nullable()
    }),
    keepDefaultCaCertificates: Yup.object({
      enabled: Yup.boolean()
    }),
    storeCookies: Yup.boolean(),
    sendCookies: Yup.boolean(),
    timeout: Yup.number(),
    oauth2: Yup.object({
      useSystemBrowser: Yup.boolean()
    })
  }),
  font: Yup.object().shape({
    codeFont: Yup.string().nullable(),
    codeFontSize: Yup.number().min(1).max(32).nullable()
  }),
  proxy: Yup.object({
    disabled: Yup.boolean().optional(),
    inherit: Yup.boolean().required(),
    config: Yup.object({
      protocol: Yup.string().oneOf(['http', 'https', 'socks4', 'socks5']),
      hostname: Yup.string().max(1024),
      port: Yup.number().min(1).max(65535).nullable(),
      auth: Yup.object({
        disabled: Yup.boolean().optional(),
        username: Yup.string().max(1024),
        password: Yup.string().max(1024)
      }).optional(),
      bypassProxy: Yup.string().optional().max(1024)
    }).required()
  }),
  layout: Yup.object({
    responsePaneOrientation: Yup.string().oneOf(['horizontal', 'vertical'])
  }),
  beta: Yup.object({}),
  onboarding: Yup.object({
    hasLaunchedBefore: Yup.boolean()
  }),
  general: Yup.object({
    defaultCollectionLocation: Yup.string().max(1024).nullable()
  }),
  autoSave: Yup.object({
    enabled: Yup.boolean(),
    interval: Yup.number().min(100)
  })
});

// VS Code extension context - must be set during activation
let extensionContext: vscode.ExtensionContext | null = null;

export function setExtensionContext(context: vscode.ExtensionContext): void {
  extensionContext = context;
}

class PreferencesStore {
  getPreferences(): Preferences {
    if (!extensionContext) {
      console.warn('Extension context not set, using default preferences');
      return { ...defaultPreferences };
    }

    let preferences = extensionContext.globalState.get<Partial<Preferences>>('preferences', {});

    // Migrate font size from 14px to 13px for existing users
    const fontSizeMigrated = get(preferences, '_migrations.codeFontSize14to13', false);
    if (!fontSizeMigrated) {
      const codeFont = get(preferences, 'font.codeFont', 'default');
      const codeFontSize = get(preferences, 'font.codeFontSize');

      if (codeFont === 'default' && codeFontSize === 14) {
        if (!preferences.font) preferences.font = { codeFont: 'default', codeFontSize: 13 };
        preferences.font.codeFontSize = 13;
        if (!preferences._migrations) preferences._migrations = {};
        preferences._migrations.codeFontSize14to13 = true;
        extensionContext.globalState.update('preferences', preferences);
      }
    }

    return merge({}, defaultPreferences, preferences);
  }

  savePreferences(newPreferences: Preferences): void {
    if (!extensionContext) {
      console.error('Extension context not set, cannot save preferences');
      return;
    }
    extensionContext.globalState.update('preferences', newPreferences);
  }
}

const preferencesStore = new PreferencesStore();

export const getPreferences = (): Preferences => {
  return preferencesStore.getPreferences();
};

export const savePreferences = async (newPreferences: Partial<Preferences> | Record<string, unknown>): Promise<void> => {
  try {
    const validatedPreferences = await preferencesSchema.validate(newPreferences, { abortEarly: true });
    preferencesStore.savePreferences(validatedPreferences as Preferences);
  } catch (error) {
    throw error;
  }
};

export const preferencesUtil = {
  shouldVerifyTls: (): boolean => {
    return get(getPreferences(), 'request.sslVerification', true);
  },
  shouldUseCustomCaCertificate: (): boolean => {
    return get(getPreferences(), 'request.customCaCertificate.enabled', false);
  },
  shouldKeepDefaultCaCertificates: (): boolean => {
    return get(getPreferences(), 'request.keepDefaultCaCertificates.enabled', true);
  },
  getCustomCaCertificateFilePath: (): string | null => {
    return get(getPreferences(), 'request.customCaCertificate.filePath', null);
  },
  getRequestTimeout: (): number => {
    return get(getPreferences(), 'request.timeout', 0);
  },
  getGlobalProxyConfig: (): Proxy => {
    return get(getPreferences(), 'proxy', defaultPreferences.proxy);
  },
  shouldStoreCookies: (): boolean => {
    return get(getPreferences(), 'request.storeCookies', true);
  },
  shouldSendCookies: (): boolean => {
    return get(getPreferences(), 'request.sendCookies', true);
  },
  shouldUseSystemBrowser: (): boolean => {
    // Always true in VS Code (no embedded browser window)
    return true;
  },
  getResponsePaneOrientation: (): 'horizontal' | 'vertical' => {
    return get(getPreferences(), 'layout.responsePaneOrientation', 'horizontal');
  },
  getSystemProxyEnvVariables: (): { http_proxy?: string; https_proxy?: string; no_proxy?: string } => {
    const { http_proxy, HTTP_PROXY, https_proxy, HTTPS_PROXY, no_proxy, NO_PROXY } = process.env;
    return {
      http_proxy: http_proxy || HTTP_PROXY,
      https_proxy: https_proxy || HTTPS_PROXY,
      no_proxy: no_proxy || NO_PROXY
    };
  },
  isBetaFeatureEnabled: (featureName: string): boolean => {
    return get(getPreferences(), `beta.${featureName}`, false);
  },
  hasLaunchedBefore: (): boolean => {
    return get(getPreferences(), 'onboarding.hasLaunchedBefore', false);
  },
  markAsLaunched: async (): Promise<void> => {
    const preferences = getPreferences();
    preferences.onboarding.hasLaunchedBefore = true;
    try {
      await savePreferences(preferences);
    } catch (err) {
      console.error('Failed to save preferences in markAsLaunched:', err);
    }
  }
};
