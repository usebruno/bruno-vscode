/**
 * View System Types for Bruno VS Code Extension
 *
 * This replaces the tab-based system with a simpler view-based system
 * where VS Code handles tabs natively via custom editors.
 */

// Note: Collection/Item/Folder types are defined inline in various components
// We use a loose type here and will strengthen typing incrementally
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Collection = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Item = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Folder = any;

/**
 * All supported view types in the extension
 */
export type ViewType =
  | 'request'              // HTTP, GraphQL, gRPC, WebSocket requests
  | 'collection-settings'  // Collection configuration
  | 'folder-settings'      // Folder configuration
  | 'collection-runner'    // Runner results view
  | 'global-environments'  // Global environment variables
  | 'environment-settings' // Collection environment settings
  | 'variables'            // Collection variables editor
  | 'collection-overview'  // Collection overview
  | 'create-collection'    // Create new collection
  | 'new-request'          // Create new request
  | 'export-collection'
  | 'clone-collection'     // Clone collection
  | 'import-collection'    // Import collection
  | 'empty';               // No content (blank state)

/**
 * Data passed from extension to webview to identify what view to render
 */
export interface ViewData {
  viewType: ViewType;
  collectionUid?: string;
  itemUid?: string;
  folderUid?: string;
  collectionPath?: string;
}

/**
 * Props passed to view components
 */
export interface ViewProps {
  collection?: Collection | null;
  item?: Item | null;
  folder?: Folder | null;
}

/**
 * Configuration for each view type
 */
export interface ViewConfig {
  viewType: ViewType;
  requiresCollection: boolean;
  requiresItem?: boolean;
  requiresFolder?: boolean;
}

/**
 * View registry mapping view types to their configuration
 */
export const VIEW_CONFIGS: Record<ViewType, ViewConfig> = {
  'request': {
    viewType: 'request',
    requiresCollection: true,
    requiresItem: true,
  },
  'collection-settings': {
    viewType: 'collection-settings',
    requiresCollection: true,
  },
  'folder-settings': {
    viewType: 'folder-settings',
    requiresCollection: true,
    requiresFolder: true,
  },
  'collection-runner': {
    viewType: 'collection-runner',
    requiresCollection: true,
  },
  'global-environments': {
    viewType: 'global-environments',
    requiresCollection: false,
  },
  'environment-settings': {
    viewType: 'environment-settings',
    requiresCollection: true,
  },
  'variables': {
    viewType: 'variables',
    requiresCollection: true,
  },
  'collection-overview': {
    viewType: 'collection-overview',
    requiresCollection: true,
  },
  'create-collection': {
    viewType: 'create-collection',
    requiresCollection: false,
  },
  'new-request': {
    viewType: 'new-request',
    requiresCollection: true,
  },
  'export-collection': {
    viewType: 'export-collection',
    requiresCollection: true,
  },
  'clone-collection': {
    viewType: 'clone-collection',
    requiresCollection: true,
  },
  'import-collection': {
    viewType: 'import-collection',
    requiresCollection: false,
  },
  'empty': {
    viewType: 'empty',
    requiresCollection: false,
  },
};

export function viewRequiresCollection(viewType: ViewType): boolean {
  return VIEW_CONFIGS[viewType]?.requiresCollection ?? false;
}

export function viewRequiresItem(viewType: ViewType): boolean {
  return VIEW_CONFIGS[viewType]?.requiresItem ?? false;
}

export function viewRequiresFolder(viewType: ViewType): boolean {
  return VIEW_CONFIGS[viewType]?.requiresFolder ?? false;
}
