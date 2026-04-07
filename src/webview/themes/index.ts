/**
 * Bruno VS Code Extension Theme
 *
 * Single theme with light/dark mode support.
 * Uses actual color values that work with polished.
 */

import vscode, { createVSCodeTheme } from './vscode';

export { createVSCodeTheme };

// Export the default (dark mode) theme for backward compatibility
const themes = {
  vscode
};

export default themes;
