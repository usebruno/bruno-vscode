import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { generateUidBasedOnHash } from '../utils/common';
import { getCollectionFormat } from '../utils/filesystem';

interface BrunoConfig {
  name: string;
  version?: string;
  type?: string;
  ignore?: string[];
}

interface TreeItemData {
  uid: string;
  name: string;
  type: 'collection' | 'folder' | 'http-request' | 'graphql-request' | 'grpc-request' | 'ws-request';
  path: string;
  collectionPath: string;
  method?: string;
  children?: TreeItemData[];
}

export class BrunoTreeItem extends vscode.TreeItem {
  constructor(
    public readonly data: TreeItemData,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(data.name, collapsibleState);

    this.tooltip = data.path;
    this.contextValue = data.type;

    if (data.type === 'collection') {
      this.iconPath = new vscode.ThemeIcon('folder-library');
    } else if (data.type === 'folder') {
      this.iconPath = new vscode.ThemeIcon('folder');
    } else {
      this.iconPath = this.getRequestIcon(data.type, data.method);
      this.description = data.method?.toUpperCase() || '';
    }

    if (data.type !== 'collection' && data.type !== 'folder') {
      this.command = {
        command: 'bruno.openRequestFromTree',
        title: 'Open Request',
        arguments: [data.path]
      };
    }

    this.resourceUri = vscode.Uri.file(data.path);
  }

  private getRequestIcon(type: string, method?: string): vscode.ThemeIcon {
    const methodColors: Record<string, string> = {
      'get': 'charts.green',
      'post': 'charts.yellow',
      'put': 'charts.blue',
      'patch': 'charts.orange',
      'delete': 'charts.red',
      'head': 'charts.purple',
      'options': 'charts.purple'
    };

    if (type === 'graphql-request') {
      return new vscode.ThemeIcon('symbol-interface', new vscode.ThemeColor('charts.purple'));
    } else if (type === 'grpc-request') {
      return new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor('charts.blue'));
    } else if (type === 'ws-request') {
      return new vscode.ThemeIcon('plug', new vscode.ThemeColor('charts.green'));
    }

    const color = methodColors[method?.toLowerCase() || 'get'] || 'charts.green';
    return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(color));
  }
}

export class WorkspaceCollectionsProvider implements vscode.TreeDataProvider<BrunoTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<BrunoTreeItem | undefined | null | void> = new vscode.EventEmitter<BrunoTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<BrunoTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private collections: TreeItemData[] = [];
  private fileWatchers: vscode.FileSystemWatcher[] = [];

  constructor() {
    this.scanWorkspace();

    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.refresh();
    });
  }

  refresh(): void {
    this.scanWorkspace();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: BrunoTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: BrunoTreeItem): Promise<BrunoTreeItem[]> {
    if (!element) {
      return this.collections.map(collection => new BrunoTreeItem(
        collection,
        vscode.TreeItemCollapsibleState.Collapsed
      ));
    }

    if (element.data.children && element.data.children.length > 0) {
      return element.data.children.map(child => new BrunoTreeItem(
        child,
        child.type === 'folder' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
      ));
    }

    if (element.data.type === 'folder' || element.data.type === 'collection') {
      const children = await this.scanDirectory(element.data.path, element.data.collectionPath);
      element.data.children = children;
      return children.map(child => new BrunoTreeItem(
        child,
        child.type === 'folder' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
      ));
    }

    return [];
  }

  private scanWorkspace(): void {
    this.collections = [];
    this.disposeWatchers();

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    for (const folder of workspaceFolders) {
      this.scanForCollections(folder.uri.fsPath, 0);
    }

    this.setupWatchers();
  }

  private scanForCollections(dirPath: string, depth: number): void {
    if (depth > 5) return;

    try {
      const brunoJsonPath = path.join(dirPath, 'bruno.json');
      const ocYmlPath = path.join(dirPath, 'opencollection.yml');

      if (fs.existsSync(brunoJsonPath)) {
        try {
          const configContent = fs.readFileSync(brunoJsonPath, 'utf8');
          const config: BrunoConfig = JSON.parse(configContent);

          this.collections.push({
            uid: generateUidBasedOnHash(dirPath),
            name: config.name || path.basename(dirPath),
            type: 'collection',
            path: dirPath,
            collectionPath: dirPath
          });

          return;
        } catch {
        }
      } else if (fs.existsSync(ocYmlPath)) {
        // OpenCollection YML format
        this.collections.push({
          uid: generateUidBasedOnHash(dirPath),
          name: path.basename(dirPath),
          type: 'collection',
          path: dirPath,
          collectionPath: dirPath
        });

        return;
      }

      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          this.scanForCollections(path.join(dirPath, entry.name), depth + 1);
        }
      }
    } catch {
    }
  }

  private async scanDirectory(dirPath: string, collectionPath: string): Promise<TreeItemData[]> {
    const items: TreeItemData[] = [];

    let format: 'bru' | 'yml' = 'bru';
    try {
      format = getCollectionFormat(collectionPath);
    } catch {
      // Default to bru
    }
    const requestExt = format === 'yml' ? '.yml' : '.bru';
    const skipFiles = format === 'yml'
      ? ['folder.yml', 'opencollection.yml']
      : ['folder.bru', 'collection.bru'];

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      const sortedEntries = entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      for (const entry of sortedEntries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }

        if (entry.isDirectory()) {
          if (entry.name === 'environments') continue;

          items.push({
            uid: generateUidBasedOnHash(fullPath),
            name: entry.name,
            type: 'folder',
            path: fullPath,
            collectionPath
          });
        } else if (entry.name.endsWith(requestExt)) {
          if (skipFiles.includes(entry.name)) {
            continue;
          }

          if (format === 'yml') {
            // For YML format, use a simple YAML-based approach
            const ymlData = this.parseYmlFile(fullPath);
            if (ymlData) {
              items.push({
                uid: generateUidBasedOnHash(fullPath),
                name: ymlData.name || entry.name.replace('.yml', ''),
                type: ymlData.type as TreeItemData['type'],
                path: fullPath,
                collectionPath,
                method: ymlData.method
              });
            }
          } else {
            const bruData = this.parseBruFile(fullPath);
            if (bruData) {
              items.push({
                uid: generateUidBasedOnHash(fullPath),
                name: bruData.name || entry.name.replace('.bru', ''),
                type: bruData.type as TreeItemData['type'],
                path: fullPath,
                collectionPath,
                method: bruData.method
              });
            }
          }
        }
      }
    } catch {
    }

    return items;
  }

  private parseBruFile(filePath: string): { name: string; type: string; method?: string } | null {
    try {
      const content = fs.readFileSync(filePath, 'utf8');

      let name = path.basename(filePath, '.bru');
      const metaMatch = content.match(/meta\s*\{([^}]*)\}/s);
      if (metaMatch) {
        const nameMatch = metaMatch[1].match(/name\s*:\s*([^\n,}]+)/);
        if (nameMatch) {
          name = nameMatch[1].trim();
          if ((name.startsWith('"') && name.endsWith('"')) || (name.startsWith("'") && name.endsWith("'"))) {
            name = name.slice(1, -1);
          }
        }
      }

      let type = 'http-request';
      let method = 'get';

      if (metaMatch) {
        const typeMatch = metaMatch[1].match(/type\s*:\s*(\w+)/);
        if (typeMatch) {
          const metaType = typeMatch[1].toLowerCase();
          if (metaType === 'graphql') {
            type = 'graphql-request';
          } else if (metaType === 'grpc') {
            type = 'grpc-request';
          } else if (metaType === 'ws') {
            type = 'ws-request';
          }
        }
      }

      const methodMatch = content.match(/^(get|post|put|patch|delete|head|options|connect|trace)\s*\{/m);
      if (methodMatch) {
        method = methodMatch[1].toLowerCase();
      }

      return { name, type, method };
    } catch {
      return null;
    }
  }

  private parseYmlFile(filePath: string): { name: string; type: string; method?: string } | null {
    try {
      const content = fs.readFileSync(filePath, 'utf8');

      let name = path.basename(filePath, '.yml');
      let type = 'http-request';
      let method = 'get';

      // Simple YAML parsing for name and type
      const nameMatch = content.match(/^\s*name\s*:\s*['"]?(.+?)['"]?\s*$/m);
      if (nameMatch) {
        name = nameMatch[1].trim();
      }

      if (content.match(/^\s*graphql\s*:/m)) {
        type = 'graphql-request';
        method = 'post';
      } else if (content.match(/^\s*grpc\s*:/m)) {
        type = 'grpc-request';
      } else if (content.match(/^\s*websocket\s*:/m)) {
        type = 'ws-request';
      } else {
        // HTTP request - find method
        const httpMatch = content.match(/^\s*http\s*:[\s\S]*?method\s*:\s*['"]?(\w+)['"]?/m);
        if (httpMatch) {
          method = httpMatch[1].toLowerCase();
        }
      }

      return { name, type, method };
    } catch {
      return null;
    }
  }

  private setupWatchers(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    for (const folder of workspaceFolders) {
      const configWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, '**/bruno.json')
      );
      configWatcher.onDidCreate(() => this.refresh());
      configWatcher.onDidDelete(() => this.refresh());
      configWatcher.onDidChange(() => this.refresh());
      this.fileWatchers.push(configWatcher);

      // Also watch for opencollection.yml
      const ocYmlWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, '**/opencollection.yml')
      );
      ocYmlWatcher.onDidCreate(() => this.refresh());
      ocYmlWatcher.onDidDelete(() => this.refresh());
      ocYmlWatcher.onDidChange(() => this.refresh());
      this.fileWatchers.push(ocYmlWatcher);

      const bruWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, '**/*.bru')
      );
      bruWatcher.onDidCreate(() => this._onDidChangeTreeData.fire());
      bruWatcher.onDidDelete(() => this._onDidChangeTreeData.fire());
      bruWatcher.onDidChange(() => this._onDidChangeTreeData.fire());
      this.fileWatchers.push(bruWatcher);

      // Also watch for .yml files (for opencollection format)
      const ymlWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, '**/*.yml')
      );
      ymlWatcher.onDidCreate(() => this._onDidChangeTreeData.fire());
      ymlWatcher.onDidDelete(() => this._onDidChangeTreeData.fire());
      ymlWatcher.onDidChange(() => this._onDidChangeTreeData.fire());
      this.fileWatchers.push(ymlWatcher);
    }
  }

  private disposeWatchers(): void {
    for (const watcher of this.fileWatchers) {
      watcher.dispose();
    }
    this.fileWatchers = [];
  }

  dispose(): void {
    this.disposeWatchers();
    this._onDidChangeTreeData.dispose();
  }
}
