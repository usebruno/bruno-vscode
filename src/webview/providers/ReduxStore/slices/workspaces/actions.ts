import React from 'react';
import path from 'path';
import {
  createWorkspace,
  removeWorkspace,
  setActiveWorkspace,
  updateWorkspace,
  addCollectionToWorkspace,
  removeCollectionFromWorkspace,
  updateWorkspaceLoadingState
} from '../workspaces';
import { createCollection, openCollection, openMultipleCollections } from '../collections/actions';
import { removeCollection } from '../collections';
import { updateGlobalEnvironments } from '../global-environments';
import { normalizePath } from 'utils/common/path';
import toast from 'react-hot-toast';

const { ipcRenderer } = window;

const transformCollection = async (collection: any, type: any) => {
  switch (type) {
    case 'bruno': {
      const { processBrunoCollection } = await import('utils/importers/bruno-collection');
      return processBrunoCollection(collection);
    }
    case 'postman': {
      const { postmanToBruno } = await import('utils/importers/postman-collection');
      return postmanToBruno(collection);
    }
    case 'insomnia': {
      const { convertInsomniaToBruno } = await import('utils/importers/insomnia-collection');
      return convertInsomniaToBruno(collection);
    }
    case 'openapi': {
      const { convertOpenapiToBruno } = await import('utils/importers/openapi-collection');
      return convertOpenapiToBruno(collection);
    }
    case 'opencollection': {
      const { processOpenCollection } = await import('utils/importers/opencollection');
      return processOpenCollection(collection);
    }
    case 'wsdl': {
      const converters: any = await import('@usebruno/converters');
      return converters.wsdlToBruno(collection);
    }
    default:
      throw new Error(`Unsupported collection type: ${type}`);
  }
};

export const createWorkspaceAction = (workspaceName: any, workspaceFolderName: any, workspaceLocation: any) => {
  return async (dispatch: any) => {
    try {
      const result: any = await ipcRenderer.invoke('renderer:create-workspace',
        workspaceName,
        workspaceFolderName,
        workspaceLocation);

      const { workspaceConfig, workspaceUid, workspacePath } = result;

      dispatch(createWorkspace({
        uid: workspaceUid,
        name: workspaceName,
        pathname: workspacePath,
        ...workspaceConfig
      }));

      await dispatch(switchWorkspace(workspaceUid));

      return result;
    } catch (error) {
      throw error;
    }
  };
};

export const openWorkspace = () => {
  return async (dispatch: any) => {
    try {
      const workspacePath = await ipcRenderer.invoke('renderer:browse-directory');
      if (workspacePath) {
        const result: any = await ipcRenderer.invoke('renderer:open-workspace', workspacePath);
        const { workspaceConfig, workspaceUid } = result;

        dispatch(createWorkspace({
          uid: workspaceUid,
          pathname: workspacePath,
          ...workspaceConfig
        }));

        await dispatch(switchWorkspace(workspaceUid));

        return result;
      }
    } catch (error) {
      throw error;
    }
  };
};

export const openWorkspaceDialog = () => {
  return async (dispatch: any) => {
    try {
      const result: any = await ipcRenderer.invoke('renderer:open-workspace-dialog');
      if (result) {
        const { workspaceConfig, workspaceUid } = result;

        dispatch(createWorkspace({
          uid: workspaceUid,
          pathname: result.workspacePath,
          ...workspaceConfig
        }));

        await dispatch(switchWorkspace(workspaceUid));

        return result;
      }
    } catch (error) {
      throw error;
    }
  };
};

export const removeCollectionFromWorkspaceAction = (workspaceUid: any, collectionPath: any, options: any = {}) => {
  return async (dispatch: any, getState: any) => {
    try {
      const { deleteFiles = false } = options;
      const workspacesState = getState().workspaces;
      const collectionsState = getState().collections;
      const workspace = workspacesState.workspaces.find((w: any) => w.uid === workspaceUid);

      if (!workspace) {
        throw new Error('Workspace not found');
      }

      const normalizedCollectionPath = normalizePath(collectionPath);

      const collection = collectionsState.collections.find(
        (c: any) => normalizePath(c.pathname) === normalizedCollectionPath
      );

      await ipcRenderer.invoke('renderer:remove-collection-from-workspace',
        workspaceUid,
        workspace.pathname,
        collectionPath,
        { deleteFiles });

      if (collection) {
        const workspaceCollection = workspace.collections?.find(
          (wc: any) => normalizePath(wc.path) === normalizedCollectionPath
        );

        if (workspaceCollection) {
          dispatch(removeCollection({ collectionUid: collection.uid }));
        }
      }

      dispatch(removeCollectionFromWorkspace({
        workspaceUid,
        collectionLocation: collectionPath
      }));

      return true;
    } catch (error) {
      throw error;
    }
  };
};

const loadWorkspaceCollectionsForSwitch = async (dispatch: any, workspace: any) => {
  const openCollectionsFunction = (collectionPaths: any, workspaceId: any) => {
    return dispatch(openMultipleCollections(collectionPaths, { workspaceId }));
  };

  try {
    await dispatch(loadWorkspaceCollections(workspace.uid));
    const updatedWorkspace = await dispatch((_: any, getState: any) => getState().workspaces.workspaces.find((w: any) => w.uid === workspace.uid));

    if (updatedWorkspace?.collections?.length > 0) {
      const alreadyOpenCollections = await dispatch((_: any, getState: any) =>
        getState().collections.collections.map((c: any) => normalizePath(c.pathname))
      );

      const collectionPaths = updatedWorkspace.collections
        .map((wc: any) => wc.path)
        .filter((p: any) => p && !alreadyOpenCollections.includes(normalizePath(p)));

      const uniqueCollectionPaths = [...new Map(
        collectionPaths.map((p: any) => [normalizePath(p), p])
      ).values()];

      if (uniqueCollectionPaths.length > 0) {
        await openCollectionsFunction(uniqueCollectionPaths, updatedWorkspace.pathname);
      }
    }

  } catch (error) {
    console.error('Failed to load workspace collections:', error);
  }
};

export const switchWorkspace = (workspaceUid: any) => {
  return async (dispatch: any, getState: any) => {
    dispatch(setActiveWorkspace(workspaceUid));

    const workspace = getState().workspaces.workspaces.find((w: any) => w.uid === workspaceUid);

    if (!workspace) {
      return;
    }

    try {
      const { ipcRenderer } = window;

      const result = await ipcRenderer.invoke('renderer:get-global-environments',
        {
          workspaceUid,
          workspacePath: workspace.pathname
        }) as { globalEnvironments?: unknown[]; activeGlobalEnvironmentUid?: string | null } | null;

      const globalEnvironments = result?.globalEnvironments || [];
      const activeGlobalEnvironmentUid = result?.activeGlobalEnvironmentUid || null;

      dispatch(updateGlobalEnvironments({ globalEnvironments, activeGlobalEnvironmentUid }));
    } catch (error) {
      dispatch(updateGlobalEnvironments({ globalEnvironments: [], activeGlobalEnvironmentUid: null }));
    }

    await loadWorkspaceCollectionsForSwitch(dispatch, workspace);
  };
};

export const loadWorkspaceCollections = (workspaceUid: any, force = false) => {
  return async (dispatch: any, getState: any) => {
    try {
      const workspace = getState().workspaces.workspaces.find((w: any) => w.uid === workspaceUid);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      const hasProcessedCollections = workspace.collections
        && workspace.collections.length > 0
        && workspace.collections.some((c: any) => c.path && path.isAbsolute(c.path));

      if (!force && hasProcessedCollections) {
        return workspace.collections;
      }

      dispatch(updateWorkspaceLoadingState({ workspaceUid, loadingState: 'loading' }));

      let collections = [];

      if (!workspace.pathname) {
        collections = [];
      } else {
        const rawCollections = await ipcRenderer.invoke('renderer:load-workspace-collections', workspace.pathname) as unknown[] | null;

        collections = (rawCollections || []).map((collection: any) => {
          return {
            ...collection
          };
        });
      }

      dispatch(updateWorkspace({
        uid: workspaceUid,
        collections
      }));

      dispatch(updateWorkspaceLoadingState({ workspaceUid, loadingState: 'loaded' }));

      return collections;
    } catch (error) {
      dispatch(updateWorkspaceLoadingState({ workspaceUid, loadingState: 'error' }));
      throw error;
    }
  };
};

export const removeWorkspaceAction = (workspaceUid: any) => {
  return (dispatch: any) => {
    dispatch(removeWorkspace(workspaceUid));
  };
};

export const loadLastOpenedWorkspaces = () => {
  return async (dispatch: any, getState: any) => {
    try {
      const workspaces = await ipcRenderer.invoke('renderer:get-last-opened-workspaces') as any[] | null;
      const currentWorkspaces = getState().workspaces.workspaces;
      const validWorkspaceUids = new Set((workspaces || []).map((w: any) => w.uid));

      for (const currentWorkspace of currentWorkspaces) {
        if (currentWorkspace?.type !== 'default' && !validWorkspaceUids.has(currentWorkspace?.uid)) {
          dispatch(removeWorkspace(currentWorkspace.uid));
        }
      }

      for (const workspace of (workspaces || [])) {
        const existingWorkspace = currentWorkspaces.find((w: any) => w.uid === workspace.uid);

        if (!existingWorkspace) {
          dispatch(createWorkspace(workspace));

          if (workspace.pathname) {
            try {
              await ipcRenderer.invoke('renderer:start-workspace-watcher', workspace.pathname);
            } catch (error) {
            }
          }
        }
      }

      return workspaces;
    } catch (error) {
      throw error;
    }
  };
};

export const workspaceOpenedEvent = (workspacePath: any, workspaceUid: any, workspaceConfig: any) => {
  return async (dispatch: any, getState: any) => {
    dispatch(createWorkspace({
      uid: workspaceUid,
      pathname: workspacePath,
      ...workspaceConfig
    }));

    // Note: Collections are loaded separately from lastOpenedCollections store,
    // not from workspace.yml anymore. Skip loadWorkspaceCollections.

    // If this is the default workspace or no workspace is active yet, switch to it
    const state = getState();
    const activeWorkspaceUid = state.workspaces.activeWorkspaceUid;

    if (!activeWorkspaceUid || workspaceConfig?.type === 'default') {
      // Just set active workspace, don't call full switchWorkspace which would try to load collections
      dispatch(setActiveWorkspace(workspaceUid));
    }
  };
};

export const workspaceConfigUpdatedEvent = (workspacePath: any, workspaceUid: any, workspaceConfig: any = {}) => {
  return async (dispatch: any, getState: any) => {
    if (!workspaceConfig) {
      return;
    }

    const { collections, ...configWithoutCollections } = workspaceConfig;

    dispatch(updateWorkspace({
      uid: workspaceUid,
      ...configWithoutCollections
    }));

    const activeWorkspaceUid = getState().workspaces.activeWorkspaceUid;
    if (activeWorkspaceUid === workspaceUid) {
      try {
        await dispatch(loadWorkspaceCollections(workspaceUid, true));

        const workspace = getState().workspaces.workspaces.find((w: any) => w.uid === workspaceUid);
        const openCollections = getState().collections.collections.map((c: any) => normalizePath(c.pathname));

        if (workspace?.collections?.length > 0) {
          const newCollectionPaths = workspace.collections
            .map((workspaceCollection: any) => workspaceCollection.path)
            .filter((collectionPath: any) => collectionPath && !openCollections.includes(normalizePath(collectionPath)));

          // Deduplicate paths to prevent "collection already opened" toast
          const uniqueNewCollectionPaths = [...new Map(
            newCollectionPaths.map((p: any) => [normalizePath(p), p])
          ).values()];

          if (uniqueNewCollectionPaths.length > 0) {
            try {
              await dispatch(openMultipleCollections(uniqueNewCollectionPaths, { workspaceId: workspace.pathname }));
            } catch (error) {
            }
          }
        }
      } catch (error) {
      }
    }
  };
};

export const saveWorkspaceDocs = (workspaceUid: any, docs: any) => {
  return async (dispatch: any, getState: any) => {
    try {
      const workspace = getState().workspaces.workspaces.find((w: any) => w.uid === workspaceUid);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      if (!workspace.pathname) {
        throw new Error('Workspace path not found');
      }

      await ipcRenderer.invoke('renderer:save-workspace-docs', workspace.pathname, docs || '');

      dispatch(updateWorkspace({
        uid: workspaceUid,
        docs: docs
      }));

      return docs;
    } catch (error) {
      throw error;
    }
  };
};

export const createCollectionInWorkspace = (collectionName: any, collectionFolderName: any, collectionLocation: any, workspaceUid: any) => {
  return async (dispatch: any, getState: any) => {
    const currentWorkspace = getState().workspaces.workspaces.find((w: any) => w.uid === workspaceUid);
    if (!currentWorkspace) {
      throw new Error('Workspace not found');
    }

    const projectCollectionLocation = `${currentWorkspace.pathname}/collections`;

    return await dispatch(createCollection(collectionName, collectionFolderName, projectCollectionLocation, {
      workspaceId: currentWorkspace.pathname
    }));
  };
};

export const openCollectionInWorkspace = () => {
  return (dispatch: any) => dispatch(openCollection());
};

const handleWorkspaceAction = async (action: any, workspaceUid: any, ...args: any[]) => {
  try {
    await action(workspaceUid, ...args);
    return true;
  } catch (error) {
    const actionName = action.name.replace('renderer:', '').replace('-', ' ');
    toast.error(error.message || `Failed to ${actionName} workspace`);
    throw error;
  }
};

export const renameWorkspaceAction = (workspaceUid: any, newName: any) => {
  return async (dispatch: any, getState: any) => {
    try {
      const { workspaces } = getState().workspaces;
      const workspace = workspaces.find((w: any) => w.uid === workspaceUid);

      if (!workspace) {
        throw new Error('Workspace not found');
      }

      await handleWorkspaceAction((...args: any[]) => ipcRenderer.invoke('renderer:rename-workspace', ...args),
        workspace.pathname,
        newName);

      dispatch(updateWorkspace({
        uid: workspaceUid,
        name: newName
      }));
    } catch (error) {
      throw error;
    }
  };
};

export const closeWorkspaceAction = (workspaceUid: any) => {
  return async (dispatch: any, getState: any) => {
    try {
      const { workspaces } = getState().workspaces;
      const workspace = workspaces.find((w: any) => w.uid === workspaceUid);

      if (!workspace) {
        throw new Error('Workspace not found');
      }

      await ipcRenderer.invoke('renderer:close-workspace', workspace.pathname);
      dispatch(removeWorkspace(workspaceUid));
    } catch (error) {
      toast.error(error.message || 'Failed to close workspace');
      throw error;
    }
  };
};

export const importCollectionInWorkspace = (collection: any, workspaceUid: any, collectionLocation: any, type: any) => {
  return async (dispatch: any, getState: any) => {
    const currentWorkspace = getState().workspaces.workspaces.find((w: any) => w.uid === workspaceUid);

    if (!currentWorkspace) {
      throw new Error('Workspace not found');
    }

    const location = collectionLocation || path.join(currentWorkspace.pathname, 'collections');
    const transformedCollection = await transformCollection(collection, type);
    const collectionPath = await ipcRenderer.invoke('renderer:import-collection', transformedCollection, location);

    const workspaceCollection = {
      name: transformedCollection.name,
      path: collectionPath
    };

    await ipcRenderer.invoke('renderer:add-collection-to-workspace', currentWorkspace.pathname, workspaceCollection);

    return collectionPath;
  };
};

export const loadWorkspaceEnvironments = (workspaceUid: any) => {
  return async (dispatch: any, getState: any) => {
    try {
      const workspace = getState().workspaces.workspaces.find((w: any) => w.uid === workspaceUid);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      const environments = await ipcRenderer.invoke('renderer:load-workspace-environments', workspace.pathname);

      dispatch(updateWorkspace({
        uid: workspaceUid,
        environments: environments
      }));

      return environments;
    } catch (error) {
      throw error;
    }
  };
};

export const createWorkspaceEnvironment = (workspaceUid: any, environmentName: any) => {
  return async (dispatch: any, getState: any) => {
    try {
      const workspace = getState().workspaces.workspaces.find((w: any) => w.uid === workspaceUid);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      const environment = await ipcRenderer.invoke('renderer:create-workspace-environment', workspace.pathname, environmentName);

      await dispatch(loadWorkspaceEnvironments(workspaceUid));

      return environment;
    } catch (error) {
      throw error;
    }
  };
};

export const deleteWorkspaceEnvironment = (workspaceUid: any, environmentUid: any) => {
  return async (dispatch: any, getState: any) => {
    try {
      const workspace = getState().workspaces.workspaces.find((w: any) => w.uid === workspaceUid);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      await ipcRenderer.invoke('renderer:delete-workspace-environment', workspace.pathname, environmentUid);

      await dispatch(loadWorkspaceEnvironments(workspaceUid));

      return true;
    } catch (error) {
      throw error;
    }
  };
};

export const selectWorkspaceEnvironment = (workspaceUid: any, environmentUid: any) => {
  return async (dispatch: any, getState: any) => {
    try {
      const workspace = getState().workspaces.workspaces.find((w: any) => w.uid === workspaceUid);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      await ipcRenderer.invoke('renderer:select-workspace-environment', workspace.pathname, environmentUid);

      dispatch(updateWorkspace({
        uid: workspaceUid,
        activeEnvironmentUid: environmentUid
      }));

      return true;
    } catch (error) {
      throw error;
    }
  };
};

export const importWorkspaceEnvironment = (workspaceUid: any, environmentData: any) => {
  return async (dispatch: any, getState: any) => {
    try {
      const workspace = getState().workspaces.workspaces.find((w: any) => w.uid === workspaceUid);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      const environment = await ipcRenderer.invoke('renderer:import-workspace-environment', workspace.pathname, environmentData);

      await dispatch(loadWorkspaceEnvironments(workspaceUid));

      return environment;
    } catch (error) {
      throw error;
    }
  };
};

export const updateWorkspaceEnvironment = (workspaceUid: any, environmentUid: any, environmentData: any) => {
  return async (dispatch: any, getState: any) => {
    try {
      const workspace = getState().workspaces.workspaces.find((w: any) => w.uid === workspaceUid);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      await ipcRenderer.invoke('renderer:update-workspace-environment', workspace.pathname, environmentUid, environmentData);

      await dispatch(loadWorkspaceEnvironments(workspaceUid));

      return true;
    } catch (error) {
      throw error;
    }
  };
};

export const renameWorkspaceEnvironment = (workspaceUid: any, environmentUid: any, newName: any) => {
  return async (dispatch: any, getState: any) => {
    try {
      const workspace = getState().workspaces.workspaces.find((w: any) => w.uid === workspaceUid);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      await ipcRenderer.invoke('renderer:rename-workspace-environment', workspace.pathname, environmentUid, newName);

      await dispatch(loadWorkspaceEnvironments(workspaceUid));

      return true;
    } catch (error) {
      throw error;
    }
  };
};

export const copyWorkspaceEnvironment = (workspaceUid: any, environmentUid: any, newName: any) => {
  return async (dispatch: any, getState: any) => {
    try {
      const workspace = getState().workspaces.workspaces.find((w: any) => w.uid === workspaceUid);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      const newEnvironment = await ipcRenderer.invoke('renderer:copy-workspace-environment', workspace.pathname, environmentUid, newName);

      await dispatch(loadWorkspaceEnvironments(workspaceUid));

      return newEnvironment;
    } catch (error) {
      throw error;
    }
  };
};

export const exportWorkspaceAction = (workspaceUid: any) => {
  return async (dispatch: any, getState: any) => {
    try {
      const { workspaces } = getState().workspaces;
      const workspace = workspaces.find((w: any) => w.uid === workspaceUid);

      if (!workspace) {
        throw new Error('Workspace not found');
      }

      if (!workspace.pathname) {
        throw new Error('Workspace path not found');
      }

      const result: any = await ipcRenderer.invoke('renderer:export-workspace', workspace.pathname, workspace.name);

      if (result.canceled) {
        return { canceled: true };
      }

      return result;
    } catch (error) {
      throw error;
    }
  };
};

export const importWorkspaceAction = (zipFilePath: any, extractLocation: any) => {
  return async (dispatch: any) => {
    try {
      const result: any = await ipcRenderer.invoke('renderer:import-workspace', zipFilePath, extractLocation);

      if (result.success) {
        dispatch(createWorkspace({
          uid: result.workspaceUid,
          pathname: result.workspacePath,
          ...result.workspaceConfig
        }));

        await dispatch(switchWorkspace(result.workspaceUid));
      }

      return result;
    } catch (error) {
      throw error;
    }
  };
};
