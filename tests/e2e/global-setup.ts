/**
 * Runs once before any worker starts.
 */
import { resolveExecutable } from './utils/vscode-executable';

export default async function globalSetup(): Promise<void> {
  // Download VS Code here so parallel workers find it installed instead of each downloading it at once.
  await resolveExecutable();
}
