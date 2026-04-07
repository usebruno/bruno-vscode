/**
 * Key mappings for Bruno VS Code extension
 * Only essential shortcuts are kept to avoid conflicts with VS Code's native shortcuts
 */
const KeyMapping = {
  save: { mac: 'command+s', windows: 'ctrl+s', name: 'Save' },
  sendRequest: { mac: 'command+enter', windows: 'ctrl+enter', name: 'Send Request' },
  globalSearch: { mac: 'command+p', windows: 'ctrl+p', name: 'Global Search' }
};

/**
 * Retrieves the key bindings for a specific operating system.
 *
 * @param {string} os - The operating system (e.g., 'mac', 'windows').
 * @returns {Object} An object containing the key bindings for the specified OS.
 */
export const getKeyBindingsForOS = (os: 'mac' | 'windows') => {
  const keyBindings: Record<string, { keys: string; name: string }> = {};
  for (const [action, { name, ...keys }] of Object.entries(KeyMapping)) {
    if (keys[os]) {
      keyBindings[action] = {
        keys: keys[os],
        name
      };
    }
  }
  return keyBindings;
};

/**
 * Retrieves the key bindings for a specific action across all operating systems.
 *
 * @param {string} action - The action for which to retrieve key bindings.
 * @returns {Object|null} An object containing the key bindings for macOS, Windows, or null if the action is not found.
 */
export const getKeyBindingsForActionAllOS = (action: keyof typeof KeyMapping) => {
  const actionBindings = KeyMapping[action];

  if (!actionBindings) {
    console.warn(`Action "${action}" not found in KeyMapping.`);
    return null;
  }

  return [actionBindings.mac, actionBindings.windows];
};
