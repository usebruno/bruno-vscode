# Developer Guide

This repository is the Bruno VS Code extension. It connects VS Code's extension APIs to Bruno's collection and request functionality, with most of the user interface rendered in webviews.

## Architecture

The code runs in two places:

- **Extension host (Node.js):** Registers VS Code commands, views, custom editors, file watchers, persistence, and request/network services. It sends messages to webviews through the IPC layer.
- **Webviews (browser):** React applications for the main editor and sidebar. They communicate with the extension host through the shared IPC utilities; keep VS Code-only APIs in the extension host.

The main startup path is `package.json`'s `main` field (`dist/extension.js`), built from [`src/extension/extension.ts`](../src/extension/extension.ts). VS Code activates the extension when a workspace contains `bruno.json` or an OpenCollection YAML file. `activate()` initializes stores and IPC, then registers the editor, sidebar, collection tree, logs view, and commands.

The webview build has two entry points: [`src/webview/index.tsx`](../src/webview/index.tsx) for the full app and `src/webview/simple/index.tsx` for simpler panels. `index.tsx` chooses between the full app and sidebar based on the webview mode.

## Where to Look

| Area                        | Location                                             | Responsibility                                                                      |
| --------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| VS Code integration         | `src/extension/`                                     | Activation, commands, editors, views, panels, watchers, and extension-side services |
| Extension/webview messaging | `src/extension/ipc/`, `src/webview/utils/ipc`        | Message handlers and the webview transport                                          |
| Webview UI                  | `src/webview/`                                       | React pages, components, state/providers, styles, themes, and browser shims         |
| Bruno domain types          | `src/bruno-types/`                                   | Types shared across extension and webview code                                      |
| Bruno language support      | `syntaxes/`, `language-configuration.json`           | `.bru` syntax highlighting and editor behavior                                      |
| Tests                       | `src/**/*.spec.ts`, `src/**/*.test.ts`, `tests/e2e/` | Vitest unit tests and Playwright end-to-end tests                                   |

## Technologies and Builds

- TypeScript and the VS Code Extension API for the extension host.
- React for webviews, with Redux Toolkit for shared app state; Sass and Tailwind CSS are used for styling.
- esbuild bundles the extension host; Rsbuild builds the webview assets. The output is written under `dist/`.
- Bruno's shared packages provide collection, request, scripting, and conversion functionality; see `dependencies` in `package.json`.
- Vitest runs unit tests. Playwright runs end-to-end tests against a VS Code-based test setup.

## Local Development

1. Install dependencies with `npm install`.
2. Run `npm run dev` to watch/build the extension host and webview during development. Use `npm run build` for a production build.
3. To run the extension interactively, launch this folder in an Extension Development Host using your local VS Code extension-debug setup. This repository does not include a `.vscode/launch.json`.

Useful checks:

```sh
npm run typecheck
npm run lint
npm test
```

For end-to-end tests, see `playwright.config.ts` and `tests/e2e/`; `npm run test:e2e` runs them. Build, lint, and test commands are defined in `package.json`.

## Notes for Contributors

- Register user-facing commands and activation conditions in `package.json`; their implementations are generally under `src/extension/commands/`.
- Keep the extension host as the owner of filesystem and VS Code operations. Exchange data with webviews through IPC rather than importing extension APIs into React code.
- When changing IPC messages or shared data shapes, check both sender and receiver, and update shared types where appropriate.
- The extension is activated by Bruno collection manifests. For manual testing, use a workspace containing `bruno.json` or `opencollection.yaml`/`.yml`.

## Troubleshooting

If the Extension Development Host debugger stops activating the extension after a VS Code update, try launching it without the debugger. This is a VS Code issue that can affect extensions generally, not a Bruno-specific problem. From the extension's root directory, run:

```sh
code --extensionDevelopmentPath=$PWD
```
