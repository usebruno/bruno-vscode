import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { registerHandler } from '../ipc/handlers';

interface DirtyDocument {
  filePath: string;
  document: vscode.TextDocument;
  itemUid: string;
  collectionUid: string;
  itemType: 'request' | 'folder' | 'collection';
}

// Track dirty documents by their normalized file path
const dirtyDocuments = new Map<string, DirtyDocument>();

// Track registered documents (normalized file path -> TextDocument)
const registeredDocuments = new Map<string, vscode.TextDocument>();

// Track files currently being written to prevent re-entrant writes
const filesBeingWritten = new Set<string>();

// Marker used to make documents dirty (zero-width space - invisible)
const DIRTY_MARKER = '\u200B';

function normalizePath(filePath: string): string {
  // Use path.normalize and convert to lowercase on case-insensitive systems
  const normalized = path.normalize(filePath);
  // On macOS and Windows, file systems are case-insensitive by default
  if (process.platform === 'darwin' || process.platform === 'win32') {
    return normalized.toLowerCase();
  }
  return normalized;
}

export function registerDocument(document: vscode.TextDocument): void {
  const normalizedPath = normalizePath(document.uri.fsPath);
  registeredDocuments.set(normalizedPath, document);
}

export function unregisterDocument(filePath: string): void {
  const normalizedPath = normalizePath(filePath);
  registeredDocuments.delete(normalizedPath);
  dirtyDocuments.delete(normalizedPath);
}

export function getRegisteredDocument(filePath: string): vscode.TextDocument | undefined {
  return registeredDocuments.get(normalizePath(filePath));
}

export function isDocumentRegistered(filePath: string): boolean {
  return registeredDocuments.has(normalizePath(filePath));
}

async function markDocumentDirty(
  filePath: string,
  itemUid: string,
  collectionUid: string,
  itemType: 'request' | 'folder' | 'collection'
): Promise<void> {
  const normalizedPath = normalizePath(filePath);

  console.log('[DirtyStateManager] markDocumentDirty called:', {
    filePath,
    normalizedPath,
    itemType,
    registeredPaths: Array.from(registeredDocuments.keys())
  });

  // If already dirty, just update the metadata
  if (dirtyDocuments.has(normalizedPath)) {
    const existing = dirtyDocuments.get(normalizedPath)!;
    existing.itemUid = itemUid;
    existing.collectionUid = collectionUid;
    existing.itemType = itemType;
    console.log('[DirtyStateManager] Document already dirty, updated metadata');
    return;
  }

  let document = registeredDocuments.get(normalizedPath);

  if (!document) {
    console.log('[DirtyStateManager] Document not in registered list, opening...');
    try {
      const uri = vscode.Uri.file(filePath);
      document = await vscode.workspace.openTextDocument(uri);
      registeredDocuments.set(normalizedPath, document);
    } catch (error) {
      console.warn('[DirtyStateManager] Could not open document:', filePath, error);
      return;
    }
  }

  // Track this dirty document
  dirtyDocuments.set(normalizedPath, {
    filePath: normalizedPath,
    document,
    itemUid,
    collectionUid,
    itemType
  });

  // Make a minimal edit to mark the document dirty in VS Code
  // We append a zero-width space at the end of the document
  const edit = new vscode.WorkspaceEdit();
  const lastLine = document.lineAt(document.lineCount - 1);

  // Only add marker if not already present
  if (!document.getText().endsWith(DIRTY_MARKER)) {
    edit.insert(document.uri, lastLine.range.end, DIRTY_MARKER);
    const success = await vscode.workspace.applyEdit(edit);
    if (!success) {
      console.error('[DirtyStateManager] Failed to apply workspace edit for dirty marker');
    } else {
      console.log('[DirtyStateManager] Successfully marked document dirty');
    }
  } else {
    console.log('[DirtyStateManager] Document already has dirty marker');
  }
}

async function markDocumentClean(filePath: string): Promise<void> {
  const normalizedPath = normalizePath(filePath);
  const dirtyDoc = dirtyDocuments.get(normalizedPath);

  if (dirtyDoc) {
    dirtyDocuments.delete(normalizedPath);
  }

  // Don't do anything else - the writeFileViaVSCode function handles syncing
}

/**
 * Write content to a file, using VS Code's document API if the file is open in an editor.
 * This prevents conflicts between direct file writes and VS Code's document model.
 *
 * @param filePath - The path to write to
 * @param content - The content to write
 * @param options - Optional encoding options
 * @returns Promise that resolves when write is complete
 */
export async function writeFileViaVSCode(
  filePath: string,
  content: string,
  _options?: { encoding?: BufferEncoding }
): Promise<void> {
  const normalizedPath = normalizePath(filePath);

  // Prevent re-entrant writes
  if (filesBeingWritten.has(normalizedPath)) {
    console.warn('[DirtyStateManager] Skipping re-entrant write for:', filePath);
    return;
  }

  filesBeingWritten.add(normalizedPath);

  try {
    const document = registeredDocuments.get(normalizedPath);

    if (document) {
      // Document is open in VS Code - update via workspace edit
      const currentContent = document.getText();

      // Remove any dirty markers from the new content (shouldn't have any, but just in case)
      const cleanContent = content.replace(new RegExp(DIRTY_MARKER, 'g'), '');

      // Only update if content is different (ignoring dirty markers)
      const currentClean = currentContent.replace(new RegExp(DIRTY_MARKER, 'g'), '');

      if (currentClean !== cleanContent) {
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(currentContent.length)
        );
        edit.replace(document.uri, fullRange, cleanContent);

        const success = await vscode.workspace.applyEdit(edit);
        if (!success) {
          throw new Error('Failed to apply workspace edit');
        }
      }

      const saved = await document.save();
      if (!saved) {
        // If save failed, try direct write as fallback
        console.warn('[DirtyStateManager] VS Code save failed, falling back to direct write');
        await writeFileDirect(filePath, cleanContent);
      }
    } else {
      // Document is not open - write directly to disk
      await writeFileDirect(filePath, content);
    }
  } finally {
    filesBeingWritten.delete(normalizedPath);
  }
}

/**
 * Direct file write (fallback when document is not open)
 */
async function writeFileDirect(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  await fs.promises.writeFile(filePath, content, 'utf8');
}

/**
 * Sync a document's content with what's on disk.
 * Used after external writes to update VS Code's document model.
 */
export async function syncDocumentWithDisk(filePath: string): Promise<void> {
  const normalizedPath = normalizePath(filePath);
  const document = registeredDocuments.get(normalizedPath);

  if (!document) return;

  try {
    if (!fs.existsSync(filePath)) return;

    const diskContent = fs.readFileSync(filePath, 'utf8');
    const currentContent = document.getText();

    // Remove dirty markers for comparison
    const currentClean = currentContent.replace(new RegExp(DIRTY_MARKER, 'g'), '');

    if (currentClean !== diskContent) {
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(currentContent.length)
      );
      edit.replace(document.uri, fullRange, diskContent);
      await vscode.workspace.applyEdit(edit);
    }

    // Clear dirty state by reverting
    // Only do this if the document is not in our dirty list
    if (!dirtyDocuments.has(normalizedPath)) {
      await vscode.commands.executeCommand('workbench.action.files.revert');
    }
  } catch (error) {
    console.warn('[DirtyStateManager] Could not sync document with disk:', error);
  }
}

/**
 * Get dirty state for a document
 */
export function isDirty(filePath: string): boolean {
  return dirtyDocuments.has(normalizePath(filePath));
}

/**
 * Get dirty document info
 */
export function getDirtyDocument(filePath: string): DirtyDocument | undefined {
  return dirtyDocuments.get(normalizePath(filePath));
}

export function getAllDirtyDocuments(): DirtyDocument[] {
  return Array.from(dirtyDocuments.values());
}

export function triggerSave(_filePath: string): boolean {
  // which dispatches the appropriate save action via IPC.
  return false;
}

export function registerDirtyStateHandlers(): void {
  // Handler for webview notifying about dirty state changes
  registerHandler('renderer:set-dirty-state', async (args: unknown[]) => {
    const [payload] = args as [{
      filePath: string;
      itemUid: string;
      collectionUid: string;
      itemType: 'request' | 'folder' | 'collection';
      isDirty: boolean;
    }];

    if (!payload) {
      console.error('[DirtyStateManager] No payload received!');
      return { success: false, error: 'No payload' };
    }

    if (payload.isDirty) {
      await markDocumentDirty(
        payload.filePath,
        payload.itemUid,
        payload.collectionUid,
        payload.itemType
      );
    } else {
      await markDocumentClean(payload.filePath);
    }

    return { success: true };
  });

  // Handler for webview querying dirty state
  registerHandler('renderer:get-dirty-state', async (args: unknown[]) => {
    const [filePath] = args as [string];
    return { isDirty: isDirty(filePath) };
  });

  // Handler for VS Code-aware file writes
  registerHandler('renderer:write-file-vscode', async (args: unknown[]) => {
    const [filePath, content] = args as [string, string];

    try {
      await writeFileViaVSCode(filePath, content);
      return { success: true };
    } catch (error) {
      console.error('[DirtyStateManager] Error writing file:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Handler to sync document with disk after external write
  registerHandler('renderer:sync-document', async (args: unknown[]) => {
    const [filePath] = args as [string];

    try {
      await syncDocumentWithDisk(filePath);
      return { success: true };
    } catch (error) {
      console.error('[DirtyStateManager] Error syncing document:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
}

/**
 * Register VS Code save event handler
 *
 * This handler tracks document changes to keep our registered document references
 * up to date. We no longer interfere with VS Code's native save - instead, Bruno's
 * saves go through writeFileViaVSCode which properly updates the TextDocument.
 */
export function registerSaveHandler(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const filePath = event.document.uri.fsPath;

      // Only handle .bru and .yml files
      if (!filePath.endsWith('.bru') && !filePath.endsWith('.yml')) {
        return;
      }

      // Update our registered document reference
      const normalizedPath = normalizePath(filePath);
      if (registeredDocuments.has(normalizedPath)) {
        registeredDocuments.set(normalizedPath, event.document);
      }
    })
  );
}
