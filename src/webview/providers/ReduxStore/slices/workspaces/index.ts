import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { normalizePath } from 'utils/common/path';

const DEFAULT_WORKSPACE_UID = 'default';

interface WorkspaceCollection {
  uid: string;
  path: string;
}

interface Workspace {
  uid: string;
  name: string;
  pathname?: string;
  collections: WorkspaceCollection[];
  loadingState?: string;
}

interface SliceState {
  workspaces: Workspace[];
  activeWorkspaceUid: string;
}

const initialState: SliceState = {
  workspaces: [],
  activeWorkspaceUid: DEFAULT_WORKSPACE_UID
};

export const workspacesSlice = createSlice({
  name: 'workspaces',
  initialState,
  reducers: {
    setActiveWorkspace: (state, action: PayloadAction<string>) => {
      state.activeWorkspaceUid = action.payload;
    },

    createWorkspace: (state, action: PayloadAction<any>) => {
      const workspace = action.payload;
      workspace.collections = workspace.collections || [];

      const existingWorkspace = state.workspaces.find((w) => w.uid === workspace.uid);
      if (!existingWorkspace) {
        state.workspaces.push(workspace);
      } else {
        Object.assign(existingWorkspace, workspace);
      }
    },

    removeWorkspace: (state, action: PayloadAction<string>) => {
      const workspaceUid = action.payload;
      state.workspaces = state.workspaces.filter((w) => w.uid !== workspaceUid);

      if (state.activeWorkspaceUid === workspaceUid) {
        state.activeWorkspaceUid = DEFAULT_WORKSPACE_UID;
      }
    },

    updateWorkspace: (state, action: PayloadAction<any>) => {
      const { uid, ...updates } = action.payload;
      const workspace = state.workspaces.find((w) => w.uid === uid);
      if (workspace) {
        Object.assign(workspace, updates);
      }
    },

    addCollectionToWorkspace: (state, action: PayloadAction<any>) => {
      const { workspaceUid, collection } = action.payload;
      const workspace = state.workspaces.find((w) => w.uid === workspaceUid);
      if (workspace) {
        workspace.collections = workspace.collections || [];
        const existingCollection = workspace.collections.find((c) => c.uid === collection.uid || c.path === collection.path);
        if (!existingCollection) {
          workspace.collections.push(collection);
        }
      }
    },

    removeCollectionFromWorkspace: (state, action: PayloadAction<any>) => {
      const { workspaceUid, collectionLocation } = action.payload;
      const workspace = state.workspaces.find((w) => w.uid === workspaceUid);
      if (workspace?.collections) {
        const normalizedLocation = normalizePath(collectionLocation);
        workspace.collections = workspace.collections.filter((c) => {
          const normalizedPath = normalizePath(c.path);
          return normalizedPath !== normalizedLocation;
        });
      }
    },

    updateWorkspaceLoadingState: (state, action: PayloadAction<any>) => {
      const { workspaceUid, loadingState } = action.payload;
      const workspace = state.workspaces.find((w) => w.uid === workspaceUid);
      if (workspace) {
        workspace.loadingState = loadingState;
      }
    }
  }
});

export const {
  setActiveWorkspace,
  createWorkspace,
  removeWorkspace,
  updateWorkspace,
  addCollectionToWorkspace,
  removeCollectionFromWorkspace,
  updateWorkspaceLoadingState
} = workspacesSlice.actions;

export default workspacesSlice.reducer;
