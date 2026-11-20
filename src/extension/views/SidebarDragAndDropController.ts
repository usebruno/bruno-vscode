import * as vscode from 'vscode';
import { isMovable, placeItem, type MovableEntity, type Placement } from '../utils/reorder';
import { dirname } from '../utils/file';
import { Entity, NativeSidebarViewProvider } from './NativeSidebarViewProvider';

/**
 * Drag and drop within the native sidebar.
 *
 * VS Code reports only the row an item is dropped on, not whether it landed
 * above or below it, so the rules are:
 * - on a collection or folder: the item moves inside it, last of its kind;
 * - a request on a request: it goes in front of that request, in its folder;
 * - a folder on a request: it goes into the request's folder, last, since
 *   folders always list before requests.
 * Finer placement is what the Move Up and Move Down commands are for.
 */
export class SidebarDragAndDropController implements vscode.TreeDragAndDropController<Entity> {
  /**
   * The tree's own mime type, by VS Code's naming convention. Items set under
   * it in handleDrag reach handleDrop as the same objects when the drop lands
   * in this tree; VS Code advertises the type but does not fill it.
   */
  private static readonly TREE_MIME = `application/vnd.code.tree.${NativeSidebarViewProvider.viewType.toLowerCase()}`;
  private readonly provider: NativeSidebarViewProvider;

  readonly dropMimeTypes = [SidebarDragAndDropController.TREE_MIME];
  /** Lets an item be dropped on the editor area or the Explorer, which read a uri-list. */
  readonly dragMimeTypes = ['text/uri-list'];

  constructor(provider: NativeSidebarViewProvider) {
    this.provider = provider;
  }

  handleDrag(sources: readonly Entity[], dataTransfer: vscode.DataTransfer): void {
    const movableItems = sources.filter(isMovable);
    if (!movableItems.length) {
      return;
    }

    dataTransfer.set(SidebarDragAndDropController.TREE_MIME, new vscode.DataTransferItem(movableItems));
    dataTransfer.set('text/uri-list', new vscode.DataTransferItem(movableItems.map((source) => source.uri.toString()).join('\r\n')));
  }

  async handleDrop(target: Entity | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    const sources = dataTransfer.get(SidebarDragAndDropController.TREE_MIME)?.value as MovableEntity[] | undefined;
    const source = sources?.[0];
    if (!source) {
      return;
    }

    // VS Code highlights the empty area as a drop target before asking the
    // extension, and the controller has no way to refuse a target up front.
    // The area belongs to no collection, so explain why nothing moved.
    if (!target) {
      vscode.window.showInformationMessage(`Drop "${source.label}" onto a collection or folder to move it there.`);
      return;
    }

    if (!target.collection.available) {
      vscode.window.showInformationMessage(`"${target.label}" cannot be read right now, so nothing can be moved into it.`);
      return;
    }

    if (source.uri.toString() === target.uri.toString()) {
      return;
    }

    const placement: Placement = target.type === 'request'
      ? { dir: dirname(target.uri), collection: target.collection, before: source.type === 'request' ? target.uri : undefined }
      : { dir: target.uri, collection: target.collection };

    try {
      await vscode.window.withProgress(
        { location: { viewId: NativeSidebarViewProvider.viewType } },
        () => placeItem(this.provider, source, placement)
      );
    } catch (err) {
      // Errors thrown from handleDrop only reach the log, so tell the user here.
      vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }
}
