import * as vscode from 'vscode';
import logsStore, { LogEntry } from '../store/logs';

export class LogsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'bruno.logsView';
  private _view?: vscode.WebviewView;
  private _disposables: vscode.Disposable[] = [];

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtml();
    webviewView.title = 'Bruno Logs';

    webviewView.webview.onDidReceiveMessage((message) => {
      if (message.command === 'clearLogs') {
        vscode.commands.executeCommand('bruno.clearLogs');
      }
    });

    // Push initial logs once webview is ready, then listen for changes
    this._disposables.push(
      logsStore.onLogsChanged(() => this._sendLogs())
    );

    // Slight delay to ensure the webview JS is ready
    setTimeout(() => this._sendLogs(), 300);
  }

  private _sendLogs(): void {
    if (!this._view) return;
    this._view.webview.postMessage({
      command: 'updateLogs',
      logs: logsStore.getLogs()
    });
  }

  dispose(): void {
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family, monospace);
      font-size: 12px;
      background: var(--vscode-panel-background, #1e1e1e);
      color: var(--vscode-foreground, #cccccc);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    #toolbar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-bottom: 1px solid var(--vscode-panel-border, #333);
      flex-shrink: 0;
    }

    #filter-buttons {
      display: flex;
      gap: 4px;
      flex: 1;
    }

    .filter-btn {
      padding: 1px 6px;
      border-radius: 3px;
      border: 1px solid transparent;
      cursor: pointer;
      font-size: 11px;
      font-family: inherit;
      background: transparent;
      color: var(--vscode-foreground, #ccc);
      opacity: 0.5;
      transition: opacity 0.15s;
    }
    .filter-btn.active { opacity: 1; border-color: currentColor; }
    .filter-btn.log  { color: var(--vscode-foreground, #ccc); }
    .filter-btn.info { color: #3794ff; }
    .filter-btn.warn { color: #cca700; }
    .filter-btn.error { color: #f14c4c; }
    .filter-btn.debug { color: #888; }

    #clear-btn {
      padding: 1px 8px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      font-family: inherit;
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #ccc);
    }
    #clear-btn:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }

    #log-count {
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #888);
      white-space: nowrap;
    }

    #logs-container {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
      font-size: 12px;
    }

    .log-entry {
      display: flex;
      align-items: flex-start;
      padding: 2px 8px;
      border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a);
      line-height: 1.5;
      gap: 8px;
    }
    .log-entry:hover { background: var(--vscode-list-hoverBackground, #2a2a2a); }

    .log-time {
      color: var(--vscode-descriptionForeground, #666);
      white-space: nowrap;
      flex-shrink: 0;
      font-size: 11px;
      padding-top: 1px;
    }

    .log-badge {
      font-size: 10px;
      font-weight: bold;
      padding: 1px 4px;
      border-radius: 2px;
      flex-shrink: 0;
      text-transform: uppercase;
      margin-top: 2px;
    }
    .log-badge.log   { background: #333; color: #aaa; }
    .log-badge.info  { background: #1a3a5c; color: #3794ff; }
    .log-badge.warn  { background: #3d3100; color: #cca700; }
    .log-badge.error { background: #4a1010; color: #f14c4c; }
    .log-badge.debug { background: #2a2a2a; color: #888; }

    .log-message {
      flex: 1;
      white-space: pre-wrap;
      word-break: break-all;
      overflow: hidden;
    }
    .log-message.error { color: #f14c4c; }
    .log-message.warn  { color: #cca700; }
    .log-message.info  { color: #3794ff; }
    .log-message.debug { color: #888; }

    #empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--vscode-descriptionForeground, #666);
      gap: 8px;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div id="toolbar">
    <div id="filter-buttons">
      <button class="filter-btn log active"   data-level="log">Log</button>
      <button class="filter-btn info active"  data-level="info">Info</button>
      <button class="filter-btn warn active"  data-level="warn">Warn</button>
      <button class="filter-btn error active" data-level="error">Error</button>
      <button class="filter-btn debug active" data-level="debug">Debug</button>
    </div>
    <span id="log-count">0 entries</span>
    <button id="clear-btn">Clear</button>
  </div>
  <div id="logs-container">
    <div id="empty-state">No logs yet. Run a request with scripts to see console output here.</div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const logsContainer = document.getElementById('logs-container');
    const emptyState = document.getElementById('empty-state');
    const logCountEl = document.getElementById('log-count');

    const activeFilters = new Set(['log', 'info', 'warn', 'error', 'debug']);
    let allLogs = [];

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const level = btn.dataset.level;
        if (activeFilters.has(level)) {
          activeFilters.delete(level);
          btn.classList.remove('active');
        } else {
          activeFilters.add(level);
          btn.classList.add('active');
        }
        renderLogs();
      });
    });

    // Clear button
    document.getElementById('clear-btn').addEventListener('click', () => {
      vscode.postMessage({ command: 'clearLogs' });
    });

    function formatArgs(args) {
      return args.map(arg => {
        if (arg === null) return 'null';
        if (arg === undefined) return 'undefined';
        if (typeof arg === 'object') {
          try { return JSON.stringify(arg, null, 2); } catch { return String(arg); }
        }
        return String(arg);
      }).join(' ');
    }

    function formatTime(timestamp) {
      const d = new Date(timestamp);
      return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
        + '.' + String(d.getMilliseconds()).padStart(3, '0');
    }

    function renderLogs() {
      const filtered = allLogs.filter(log => activeFilters.has(log.type));
      const count = filtered.length;
      logCountEl.textContent = count === 1 ? '1 entry' : count + ' entries';

      if (count === 0) {
        logsContainer.innerHTML = '';
        logsContainer.appendChild(emptyState);
        emptyState.style.display = 'flex';
        return;
      }

      emptyState.style.display = 'none';

      // Only re-render if needed (simple full re-render for reliability)
      logsContainer.innerHTML = '';
      const fragment = document.createDocumentFragment();

      filtered.forEach(log => {
        const entry = document.createElement('div');
        entry.className = 'log-entry';

        const time = document.createElement('span');
        time.className = 'log-time';
        time.textContent = formatTime(log.timestamp);

        const badge = document.createElement('span');
        badge.className = 'log-badge ' + log.type;
        badge.textContent = log.type;

        const msg = document.createElement('span');
        msg.className = 'log-message ' + log.type;
        msg.textContent = formatArgs(log.args);

        entry.appendChild(time);
        entry.appendChild(badge);
        entry.appendChild(msg);
        fragment.appendChild(entry);
      });

      logsContainer.appendChild(fragment);

      // Auto-scroll to bottom
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    window.addEventListener('message', event => {
      const { command, logs } = event.data;
      if (command === 'updateLogs') {
        allLogs = logs || [];
        renderLogs();
      }
    });
  </script>
</body>
</html>`;
  }
}
