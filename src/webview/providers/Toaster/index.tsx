import React from 'react';
import { Toaster } from 'react-hot-toast';
import { useTheme } from 'providers/Theme';
import { isPlaywright } from 'utils/common';

export const ToastContext = React.createContext<string | null>(null);

export const ToastProvider = (props: any) => {
  const { theme, displayedTheme } = useTheme();

  const toastOptions = {
    duration: isPlaywright() ? 500 : 2000,
    style: {
      // Break long word like file-path, URL etc. to prevent overflow
      overflowWrap: 'anywhere' as const,
      borderRadius: theme.border.radius.lg,
      background: displayedTheme === 'light'
        ? theme.background.base
        : theme.background.crust,
      color: theme.text
    }
  };

  return (
    <ToastContext.Provider {...props} value="toastProvider">
      <Toaster toastOptions={toastOptions} />
      <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>{props.children}</div>
    </ToastContext.Provider>
  );
};

export default ToastProvider;
