import '../utils/ipc';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import SimpleApp from './SimpleApp';
import ThemeProvider from '../providers/Theme';

const rootElement = document.getElementById('root');

if (rootElement) {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <ThemeProvider>
          <SimpleApp />
        </ThemeProvider>        
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      </React.StrictMode>
    );
  } catch (error) {
    console.error('[Bruno Simple] Error rendering:', error);
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'padding: 20px; color: red;';
    errorDiv.textContent = `React Error: ${error}`;
    rootElement.textContent = '';
    rootElement.appendChild(errorDiv);
  }
} else {
  console.error('[Bruno Simple] Root element not found!');
}
