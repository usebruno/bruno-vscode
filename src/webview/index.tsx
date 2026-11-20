// IPC must be imported FIRST to set up window.ipcRenderer
import './utils/ipc';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './pages/index';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

const rootElement = document.getElementById('root');

if (rootElement) {
  try {
    const root = ReactDOM.createRoot(rootElement);

    root.render(
      <React.StrictMode>
        <DndProvider backend={HTML5Backend}>
          <App />
        </DndProvider>
      </React.StrictMode>
    );
  } catch (error) {
    console.error('[Bruno] Error rendering:', error);
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'padding: 20px; color: red;';
    errorDiv.textContent = `React Error: ${error}`;
    rootElement.textContent = '';
    rootElement.appendChild(errorDiv);
  }
} else {
  console.error('[Bruno] Root element not found!');
}
