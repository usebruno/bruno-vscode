
import { registerHandler, broadcastToAllWebviews } from './handlers';
import { globalEnvironmentsStore } from '../store/global-environments';
import { generateUniqueName, sanitizeName } from '../utils/filesystem';

interface EnvironmentVariable {
  uid?: string;
  name: string;
  value: string;
  secret?: boolean;
  enabled?: boolean;
}

interface Environment {
  uid: string;
  name: string;
  variables: EnvironmentVariable[];
}

interface CreateEnvironmentParams {
  uid: string;
  name: string;
  variables: EnvironmentVariable[];
  workspaceUid?: string;
  workspacePath?: string;
}

interface SaveEnvironmentParams {
  environmentUid: string;
  variables: EnvironmentVariable[];
  workspaceUid?: string;
  workspacePath?: string;
}

interface RenameEnvironmentParams {
  environmentUid: string;
  name: string;
  workspaceUid?: string;
  workspacePath?: string;
}

interface DeleteEnvironmentParams {
  environmentUid: string;
  workspaceUid?: string;
  workspacePath?: string;
}

interface SelectEnvironmentParams {
  environmentUid: string | null;
  workspaceUid?: string;
  workspacePath?: string;
}

interface GetEnvironmentsParams {
  workspaceUid?: string;
  workspacePath?: string;
}

interface WorkspaceEnvironmentsManager {
  getGlobalEnvironmentsByPath(workspacePath: string): Promise<{ globalEnvironments: Environment[]; activeGlobalEnvironmentUid: string | null }>;
  addGlobalEnvironmentByPath(workspacePath: string, env: { uid: string; name: string; variables: EnvironmentVariable[] }): Promise<{ name: string }>;
  saveGlobalEnvironmentByPath(workspacePath: string, params: { environmentUid: string; variables: EnvironmentVariable[] }): Promise<void>;
  renameGlobalEnvironmentByPath(workspacePath: string, params: { environmentUid: string; name: string }): Promise<void>;
  deleteGlobalEnvironmentByPath(workspacePath: string, params: { environmentUid: string }): Promise<void>;
  selectGlobalEnvironmentByPath(workspacePath: string, params: { environmentUid: string | null }): Promise<void>;
}

const registerGlobalEnvironmentsIpc = (workspaceEnvironmentsManager?: WorkspaceEnvironmentsManager): void => {
  // Helper: broadcast current global environments state to all webviews
  const broadcastGlobalEnvironments = async (workspacePath?: string) => {
    const globalEnvironments = workspacePath && workspaceEnvironmentsManager
      ? (await workspaceEnvironmentsManager.getGlobalEnvironmentsByPath(workspacePath)).globalEnvironments
      : globalEnvironmentsStore.getGlobalEnvironments();
    const activeGlobalEnvironmentUid = workspacePath && workspaceEnvironmentsManager
      ? (await workspaceEnvironmentsManager.getGlobalEnvironmentsByPath(workspacePath)).activeGlobalEnvironmentUid
      : globalEnvironmentsStore.getActiveGlobalEnvironmentUid();

    broadcastToAllWebviews('main:load-global-environments', {
      globalEnvironments,
      activeGlobalEnvironmentUid
    });
  };

  registerHandler('renderer:create-global-environment', async (args) => {
    const [params] = args as [CreateEnvironmentParams];
    const { uid, name, variables, workspacePath } = params;

    try {
      // If workspace path provided, use workspace environments manager
      if (workspacePath && workspaceEnvironmentsManager) {
        const { globalEnvironments } = await workspaceEnvironmentsManager.getGlobalEnvironmentsByPath(workspacePath);
        const existingNames = globalEnvironments?.map((env) => env.name) || [];

        const sanitizedName = sanitizeName(name);
        const uniqueName = generateUniqueName(sanitizedName, (n) => existingNames.includes(n));

        const result = await workspaceEnvironmentsManager.addGlobalEnvironmentByPath(workspacePath, {
          uid,
          name: uniqueName,
          variables
        });
        await broadcastGlobalEnvironments(workspacePath);
        return result;
      }

      const existingGlobalEnvironments = globalEnvironmentsStore.getGlobalEnvironments();
      const existingNames = existingGlobalEnvironments?.map((env: Environment) => env.name) || [];

      const sanitizedName = sanitizeName(name);
      const uniqueName = generateUniqueName(sanitizedName, (n) => existingNames.includes(n));

      globalEnvironmentsStore.addGlobalEnvironment({ uid, name: uniqueName, variables });
      await broadcastGlobalEnvironments();

      return { name: uniqueName };
    } catch (error) {
      console.error('Error in renderer:create-global-environment:', error);
      throw error;
    }
  });

  registerHandler('renderer:save-global-environment', async (args) => {
    const [params] = args as [SaveEnvironmentParams];
    const { environmentUid, variables, workspacePath } = params;

    try {
      if (workspacePath && workspaceEnvironmentsManager) {
        await workspaceEnvironmentsManager.saveGlobalEnvironmentByPath(workspacePath, {
          environmentUid,
          variables
        });
        await broadcastGlobalEnvironments(workspacePath);
        return { success: true };
      }

      globalEnvironmentsStore.saveGlobalEnvironment({ environmentUid, variables });
      await broadcastGlobalEnvironments();
      return { success: true };
    } catch (error) {
      console.error('Error in renderer:save-global-environment:', error);
      throw error;
    }
  });

  registerHandler('renderer:rename-global-environment', async (args) => {
    const [params] = args as [RenameEnvironmentParams];
    const { environmentUid, name, workspacePath } = params;

    try {
      if (workspacePath && workspaceEnvironmentsManager) {
        await workspaceEnvironmentsManager.renameGlobalEnvironmentByPath(workspacePath, {
          environmentUid,
          name
        });
        await broadcastGlobalEnvironments(workspacePath);
        return { success: true };
      }

      globalEnvironmentsStore.renameGlobalEnvironment({ environmentUid, name });
      await broadcastGlobalEnvironments();
      return { success: true };
    } catch (error) {
      console.error('Error in renderer:rename-global-environment:', error);
      throw error;
    }
  });

  registerHandler('renderer:delete-global-environment', async (args) => {
    const [params] = args as [DeleteEnvironmentParams];
    const { environmentUid, workspacePath } = params;

    try {
      if (workspacePath && workspaceEnvironmentsManager) {
        await workspaceEnvironmentsManager.deleteGlobalEnvironmentByPath(workspacePath, {
          environmentUid
        });
        await broadcastGlobalEnvironments(workspacePath);
        return { success: true };
      }

      globalEnvironmentsStore.deleteGlobalEnvironment({ environmentUid });
      await broadcastGlobalEnvironments();
      return { success: true };
    } catch (error) {
      console.error('Error in renderer:delete-global-environment:', error);
      throw error;
    }
  });

  registerHandler('renderer:select-global-environment', async (args) => {
    const [params] = args as [SelectEnvironmentParams];
    const { environmentUid, workspacePath } = params;

    try {
      if (workspacePath && workspaceEnvironmentsManager) {
        await workspaceEnvironmentsManager.selectGlobalEnvironmentByPath(workspacePath, {
          environmentUid
        });
      } else {
        globalEnvironmentsStore.selectGlobalEnvironment({ environmentUid });
      }

      // Broadcast global env change to all tabs
      await broadcastGlobalEnvironments(workspacePath);

      return { success: true };
    } catch (error) {
      console.error('Error in renderer:select-global-environment:', error);
      throw error;
    }
  });

  registerHandler('renderer:get-global-environments', async (args) => {
    const [params] = args as [GetEnvironmentsParams];
    const { workspacePath } = params;

    try {
      if (workspacePath && workspaceEnvironmentsManager) {
        return await workspaceEnvironmentsManager.getGlobalEnvironmentsByPath(workspacePath);
      }

      return {
        globalEnvironments: globalEnvironmentsStore.getGlobalEnvironments() || [],
        activeGlobalEnvironmentUid: globalEnvironmentsStore.getActiveGlobalEnvironmentUid()
      };
    } catch (error) {
      console.error('Error in renderer:get-global-environments:', error);
      throw error;
    }
  });
};

export default registerGlobalEnvironmentsIpc;
