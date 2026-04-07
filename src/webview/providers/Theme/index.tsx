import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ThemeProvider as SCThemeProvider } from 'styled-components';
import { createVSCodeTheme } from 'themes/vscode';

type DisplayedTheme = 'light' | 'dark';

type VSCodeTheme = ReturnType<typeof createVSCodeTheme>;

interface ThemeContextValue {
  theme: VSCodeTheme;
  displayedTheme: DisplayedTheme;
  /** @deprecated Use displayedTheme instead */
  storedTheme: DisplayedTheme;
}

// Theme context with the VS Code theme
export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
}

/**
 * Detect if VS Code is in light or dark mode
 * Uses VS Code's body class
 */
const detectVSCodeTheme = (): DisplayedTheme => {
  if (document.body.classList.contains('vscode-light')) {
    return 'light';
  }
  if (document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast')) {
    return 'dark';
  }

  return 'dark';
};

/**
 * Theme Provider for Bruno VS Code Extension
 *
 * Generates a theme based on VS Code's actual CSS variables.
 * The theme automatically updates in realtime when VS Code theme changes.
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  // Detect VS Code's current theme mode (light/dark)
  const [displayedTheme, setDisplayedTheme] = useState<DisplayedTheme>(detectVSCodeTheme);

  // Theme state - regenerated when VS Code theme changes
  const [theme, setTheme] = useState<VSCodeTheme>(() => createVSCodeTheme(detectVSCodeTheme()));

  // Regenerate theme by reading fresh CSS variables
  const regenerateTheme = useCallback(() => {
    const mode = detectVSCodeTheme();
    setDisplayedTheme(mode);
    // Small delay to ensure CSS variables are updated
    setTimeout(() => {
      setTheme(createVSCodeTheme(mode));
    }, 50);
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(displayedTheme);

    const bodyObserver = new MutationObserver(() => {
      regenerateTheme();
    });

    bodyObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    // Also watch for style changes on documentElement (CSS variables)
    const styleObserver = new MutationObserver(() => {
      regenerateTheme();
    });

    styleObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style']
    });

    return () => {
      bodyObserver.disconnect();
      styleObserver.disconnect();
    };
  }, [displayedTheme, regenerateTheme]);

  const value: ThemeContextValue = {
    theme,
    displayedTheme,
    storedTheme: displayedTheme // Backward compatibility alias
  };

  return (
    <ThemeContext.Provider value={value}>
      {/* @ts-expect-error - VSCode theme has some structural differences from DefaultTheme */}
      <SCThemeProvider theme={theme}>
        {children}
      </SCThemeProvider>
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
};

export default ThemeProvider;
