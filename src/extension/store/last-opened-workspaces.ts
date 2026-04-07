import * as vscode from 'vscode';

let extensionContext: vscode.ExtensionContext | null = null;

export function setExtensionContext(context: vscode.ExtensionContext): void {
  extensionContext = context;
}

class LastOpenedWorkspaces {
  private getFromStorage<T>(key: string, defaultValue: T): T {
    if (!extensionContext) {
      return defaultValue;
    }
    return extensionContext.globalState.get<T>(key, defaultValue);
  }

  private setInStorage<T>(key: string, value: T): void {
    if (!extensionContext) {
      console.error('Extension context not set');
      return;
    }
    extensionContext.globalState.update(key, value);
  }

  getAll(): string[] {
    return this.getFromStorage<string[]>('workspaces.lastOpenedWorkspaces', []);
  }

  add(workspacePath: string): string[] {
    const workspaces = this.getAll();

    if (workspaces.includes(workspacePath)) {
      return workspaces;
    }

    workspaces.unshift(workspacePath);
    this.setInStorage('workspaces.lastOpenedWorkspaces', workspaces);
    return workspaces;
  }

  remove(workspacePath: string): string[] {
    const workspaces = this.getAll();
    const filteredWorkspaces = workspaces.filter((w) => w !== workspacePath);
    this.setInStorage('workspaces.lastOpenedWorkspaces', filteredWorkspaces);
    return filteredWorkspaces;
  }
}

export default LastOpenedWorkspaces;
export { LastOpenedWorkspaces };
