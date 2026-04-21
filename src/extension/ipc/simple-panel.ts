import fs from 'fs';
import path from 'path';
import { registerHandler } from './handlers';
import { getPreferences } from '../store/preferences';
import { defaultWorkspaceManager } from '../store/default-workspace';
import LastOpenedWorkspaces from '../store/last-opened-workspaces';
import { readWorkspaceConfig } from '../utils/workspace-config';
import { getWorkspaceUid } from '../utils/workspace-config';
import { posixifyPath } from '../utils/filesystem';

const DEFAULT_WORKSPACE_NAME = 'My Workspace';

interface WorkspaceSummary {
  uid: string;
  name: string;
  pathname: string;
  type?: string;
}

const registerSimplePanelIpc = (): void => {
  const lastOpenedWorkspaces = new LastOpenedWorkspaces();

  registerHandler('renderer:simple-panel-bootstrap', async () => {
    const preferences = getPreferences();
    const workspaces: WorkspaceSummary[] = [];

    const defaultPath = defaultWorkspaceManager.getDefaultWorkspacePath();
    let defaultUid: string | null = null;

    if (defaultPath && defaultWorkspaceManager.isValidDefaultWorkspace(defaultPath)) {
      try {
        const config = readWorkspaceConfig(defaultPath);
        defaultUid = defaultWorkspaceManager.getDefaultWorkspaceUid();
        workspaces.push({
          uid: defaultUid,
          name: config.info?.name || config.name || DEFAULT_WORKSPACE_NAME,
          pathname: posixifyPath(defaultPath),
          type: 'default'
        });
      } catch (error) {
        console.warn('[SimplePanel] Error reading default workspace:', error);
      }
    }

    for (const workspacePath of lastOpenedWorkspaces.getAll()) {
      if (workspacePath === defaultPath) continue;
      const workspaceYmlPath = path.join(workspacePath, 'workspace.yml');
      if (!fs.existsSync(workspaceYmlPath)) continue;
      try {
        const config = readWorkspaceConfig(workspacePath);
        workspaces.push({
          uid: getWorkspaceUid(workspacePath),
          name: config.info?.name || config.name || path.basename(workspacePath),
          pathname: posixifyPath(workspacePath)
        });
      } catch (error) {
        console.warn('[SimplePanel] Error loading workspace:', workspacePath);
      }
    }

    return {
      preferences,
      workspaces,
      activeWorkspaceUid: defaultUid
    };
  });
};

export default registerSimplePanelIpc;
