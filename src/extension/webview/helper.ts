import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface ExtractedAssets {
  scripts: string[];
  styles: string[];
}

export class WebviewHelper {
  private static extractAssetsFromHtml(htmlPath: string): ExtractedAssets {
    const scripts: string[] = [];
    const styles: string[] = [];

    if (!fs.existsSync(htmlPath)) {
      return { scripts, styles };
    }

    const html = fs.readFileSync(htmlPath, 'utf8');

    const scriptRe = /<script[^>]*\ssrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = scriptRe.exec(html)) !== null) {
      scripts.push(m[1]);
    }

    const linkRe = /<link[^>]*\shref=["']([^"']+\.css)["'][^>]*>/gi;
    while ((m = linkRe.exec(html)) !== null) {
      styles.push(m[1]);
    }

    return { scripts, styles };
  }

  static getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    return this.buildHtml(webview, extensionUri, 'index');
  }

  static getHtmlForSimplePanel(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    return this.buildHtml(webview, extensionUri, 'simple');
  }

  private static buildHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    entryName: 'index' | 'simple'
  ): string {
    const distRoot = path.join(extensionUri.fsPath, 'dist', 'webview');
    const htmlPath = path.join(distRoot, `${entryName}.html`);
    const { scripts, styles } = this.extractAssetsFromHtml(htmlPath);

    const toWebviewUri = (relativeAssetPath: string) => {
      const segments = relativeAssetPath.split('/').filter(Boolean);
      return webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'dist', 'webview', ...segments)
      );
    };

    const cssLinks = styles
      .map((s) => `<link href="${toWebviewUri(s)}" rel="stylesheet">`)
      .join('\n  ');

    const scriptTags = scripts
      .map((s) => `<script defer src="${toWebviewUri(s)}"></script>`)
      .join('\n  ');

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
    window.__brunoMessageBuffer = [];
    window.addEventListener('message', function(event) {
      var buf = window.__brunoMessageBuffer;
      if (buf) buf.push(event.data);
    });

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
