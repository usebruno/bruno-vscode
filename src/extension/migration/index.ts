/**
 * Migration orchestrator for Bruno VS Code Extension
 *
 * Handles migration from the old bruno-vscode extension to the new extension format.
 * This includes:
 * - External collections → Default workspace collections
 * - Global environments → Default workspace environments (YAML files)
 * - Active environment UID → Preserved in workspace state
 */

import * as vscode from 'vscode';
import { migrateExternalCollections } from './external-collections';
import { migrateGlobalEnvironments } from './global-environments';

const MIGRATION_KEY = 'bruno-migration-v2-complete';

export function isMigrationComplete(context: vscode.ExtensionContext): boolean {
  return context.globalState.get<boolean>(MIGRATION_KEY, false);
}

async function markMigrationComplete(context: vscode.ExtensionContext): Promise<void> {
  await context.globalState.update(MIGRATION_KEY, true);
}

function hasOldExtensionData(context: vscode.ExtensionContext): boolean {
  const externalCollections = context.globalState.get<unknown[]>('bruno-external-collections', []);

  const globalEnvironments = context.globalState.get<unknown[]>('environments', []);

  const hasData = (externalCollections && externalCollections.length > 0) ||
                  (globalEnvironments && globalEnvironments.length > 0);

  return hasData;
}

/**
 * Run migration if needed
 *
 * This should be called during extension activation, before initializing workspaces.
 * Migration will only run once - subsequent calls will be no-ops.
 *
 * @param context VS Code extension context
 * @param defaultWorkspacePath Path to the default workspace directory
 * @returns true if migration was performed, false if skipped
 */
export async function runMigrationIfNeeded(
  context: vscode.ExtensionContext,
  defaultWorkspacePath: string
): Promise<boolean> {
  if (isMigrationComplete(context)) {
    return false;
  }

  if (!hasOldExtensionData(context)) {
    await markMigrationComplete(context);
    return false;
  }

  try {
    let collectionsCount = 0;
    let environmentsCount = 0;

    try {
      collectionsCount = await migrateExternalCollections(context, defaultWorkspacePath);
    } catch (error) {
      console.error('[Migration] Error migrating collections:', error);
      // Continue with other migrations even if this fails
    }

    try {
      environmentsCount = await migrateGlobalEnvironments(context, defaultWorkspacePath);
    } catch (error) {
      console.error('[Migration] Error migrating environments:', error);
      // Continue even if this fails
    }

    // Mark migration as complete
    await markMigrationComplete(context);

    if (collectionsCount > 0 || environmentsCount > 0) {
      const message = `Bruno: Migrated ${collectionsCount} collection(s) and ${environmentsCount} environment(s) from the old extension.`;
      vscode.window.showInformationMessage(message);
    }

    return true;

  } catch (error) {
    console.error('[Migration] Migration failed with error:', error);

    // Still mark as complete to avoid repeated failures
    await markMigrationComplete(context);

    vscode.window.showWarningMessage(
      'Bruno: Migration from old extension encountered some errors. Some data may not have been migrated.'
    );

    return false;
  }
}

/**
 * Reset migration status (for debugging/testing)
 * This should NOT be called in production
 */
export async function resetMigrationStatus(context: vscode.ExtensionContext): Promise<void> {
  await context.globalState.update(MIGRATION_KEY, undefined);
}
