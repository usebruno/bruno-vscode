
import * as vscode from 'vscode';
import { registerHandler, registerEventListener, emit, sendToWebview } from './handlers';
import { getPreferences, savePreferences, preferencesUtil } from '../store/preferences';
import { globalEnvironmentsStore } from '../store/global-environments';

const registerPreferencesIpc = (): void => {
  registerHandler('renderer:ready', async () => {
    const preferences = getPreferences();
    sendToWebview('main:load-preferences', preferences);

    const systemProxyVars = preferencesUtil.getSystemProxyEnvVariables();
    const { http_proxy, https_proxy, no_proxy } = systemProxyVars || {};
    sendToWebview('main:load-system-proxy-env', { http_proxy, https_proxy, no_proxy });

    try {
      const globalEnvironments = globalEnvironmentsStore.getGlobalEnvironments();
      let activeGlobalEnvironmentUid = globalEnvironmentsStore.getActiveGlobalEnvironmentUid();

      const activeEnvExists = globalEnvironments?.find(
        (env: { uid?: string }) => env?.uid === activeGlobalEnvironmentUid
      );
      activeGlobalEnvironmentUid = activeEnvExists ? activeGlobalEnvironmentUid : null;

      sendToWebview('main:load-global-environments', {
        globalEnvironments,
        activeGlobalEnvironmentUid
      });
    } catch (error) {
      console.error('Error occurred while fetching global environments!');
      console.error(error);
    }

    emit('main:renderer-ready');

    return { success: true };
  });

  registerEventListener('main:open-preferences', () => {
    sendToWebview('main:open-preferences', {});
  });

  registerHandler('renderer:save-preferences', async (args) => {
    const [preferences] = args as [unknown];
    try {
      await savePreferences(preferences as Record<string, unknown>);
      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  // Note: VS Code manages its own theme, so we just acknowledge the change
  registerEventListener('renderer:theme-change', (theme: unknown) => {
    // In VS Code, theme changes are managed by VS Code itself
    // We can optionally store the preference for the webview
  });
};

export default registerPreferencesIpc;
