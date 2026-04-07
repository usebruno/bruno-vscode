import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class WebviewHelper {
  private static findChunkFiles(extensionUri: vscode.Uri): { jsChunk: string | null; cssChunk: string | null } {
    const jsDir = path.join(extensionUri.fsPath, 'dist', 'webview', 'static', 'js');
    const cssDir = path.join(extensionUri.fsPath, 'dist', 'webview', 'static', 'css');

    let jsChunk: string | null = null;
    let cssChunk: string | null = null;

    if (fs.existsSync(jsDir)) {
      const jsFiles = fs.readdirSync(jsDir);
      for (const file of jsFiles) {
        if (file.endsWith('.js') && !file.startsWith('lib-') && file !== 'index.js') {
          jsChunk = file;
          break;
        }
      }
    }

    if (fs.existsSync(cssDir)) {
      const cssFiles = fs.readdirSync(cssDir);
      for (const file of cssFiles) {
        if (file.endsWith('.css') && file !== 'index.css') {
          cssChunk = file;
          break;
        }
      }
    }

    return { jsChunk, cssChunk };
  }

  static getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const { jsChunk, cssChunk } = this.findChunkFiles(extensionUri);

    const libReactUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'static', 'js', 'lib-react.js')
    );
    const libAxiosUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'static', 'js', 'lib-axios.js')
    );
    const vendorChunkUri = jsChunk ? webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'static', 'js', jsChunk)
    ) : null;
    const indexUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'static', 'js', 'index.js')
    );

    const vendorChunkCssUri = cssChunk ? webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'static', 'css', cssChunk)
    ) : null;
    const indexCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'static', 'css', 'index.css')
    );

    const cssLinks = [
      vendorChunkCssUri ? `<link href="${vendorChunkCssUri}" rel="stylesheet">` : '',
      `<link href="${indexCssUri}" rel="stylesheet">`
    ].filter(Boolean).join('\n  ');

    const scriptTags = [
      `<script defer src="${libReactUri}"></script>`,
      `<script defer src="${libAxiosUri}"></script>`,
      vendorChunkUri ? `<script defer src="${vendorChunkUri}"></script>` : '',
      `<script defer src="${indexUri}"></script>`
    ].filter(Boolean).join('\n  ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline' 'unsafe-eval'; img-src ${webview.cspSource} https: data: blob:; font-src ${webview.cspSource} https: data:; connect-src ${webview.cspSource} https: wss: ws:; worker-src ${webview.cspSource} blob:;">
  ${cssLinks}
  <title>Bruno</title>
  <style>
    html, body, #root {
      height: 100%;
      width: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
    body {
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
    }
  </style>
  <script>
    window.onerror = function(msg, url, line, col, error) {
      console.error('[Bruno] Global error:', msg, url, line, col, error);
      var root = document.getElementById('root');
      if (root) {
        var errorDiv = document.createElement('div');
        errorDiv.style.cssText = 'padding: 20px; color: red;';
        errorDiv.textContent = 'Error: ' + msg + ' | URL: ' + url + ' | Line: ' + line;
        root.textContent = '';
        root.appendChild(errorDiv);
      }
      return false;
    };
    window.onunhandledrejection = function(event) {
      console.error('[Bruno] Unhandled promise rejection:', event.reason);
    };
  </script>
  ${scriptTags}
</head>
<body>
  <div id="root">
    <div style="padding: 20px; color: #888;">Loading Bruno UI...</div>
  </div>
  <script>
    setTimeout(function() {
      var root = document.getElementById('root');
      if (root && root.innerHTML.indexOf('Loading Bruno UI') !== -1) {
        console.error('[Bruno] React did not render after 5s timeout');
      }
    }, 5000);
  </script>
</body>
</html>`;
  }

  static getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
    return {
      enableScripts: true,
      localResourceRoots: [extensionUri]
    };
  }
}
