import { Frame, Page, Locator } from '@playwright/test';

/**
 * Centralised Playwright locators for the e2e suite.
 *
 * Bruno's UI runs inside VS Code webview iframes, so the factory takes a `Frame`
 * (or `Page`). It also accepts a `Locator` so callers can scope lookups to a row.
 */
export type FrameLike = Frame | Page | Locator;

export const buildCommonLocators = (frame: FrameLike) => ({
  sidebar: {
    collectionName: (name: string) =>
      frame.getByTestId('sidebar-collection-row').filter({ hasText: name }),
    collectionItem: (name: string) =>
      frame.getByTestId('sidebar-collection-item-row').filter({ hasText: name })
  },
  collectionSettings: {
    container: () => frame.getByTestId('collection-settings'),
    // Overview → Requests line, e.g. "2 requests in collection".
    requestsInfo: () => frame.getByTestId('collection-requests-count'),
    requestsNotLoaded: () => frame.getByTestId('collection-requests-not-loaded')
  },
  requestUrl: {
    editor: () => frame.locator('#request-url'),
    highlightedToken: (name: string) =>
      frame
        .locator('#request-url .CodeMirror span.cm-variable-valid, #request-url .CodeMirror span.cm-variable-invalid')
        .filter({ hasText: name })
        .first()
  },
  // Var-info hover popover shown over a highlighted token.
  varPopover: {
    // A dismissed popover lingers for its fade, so a re-hover can briefly leave two.
    all: () => frame.locator('.CodeMirror-brunoVarInfo'),
    container: () => frame.locator('.CodeMirror-brunoVarInfo').last(),
    editableDisplay: () => frame.locator('.CodeMirror-brunoVarInfo').last().locator('.var-value-editable-display'),
    editor: () => frame.locator('.CodeMirror-brunoVarInfo .var-value-editor .CodeMirror'),
    editorFocused: () => frame.locator('.CodeMirror-brunoVarInfo .var-value-editor .CodeMirror-focused'),
    editorLine: () => frame.locator('.CodeMirror-brunoVarInfo .var-value-editor .CodeMirror-line').first()
  },
  paramsTable: {
    // Value cell of the path-params table.
    pathValueCell: () =>
      frame
        .getByTestId('path-params-table')
        .getByTestId('column-value')
        .locator('.CodeMirror-line')
        .first()
  },
  // The "+" transient-request menu on a collection row.
  newRequestMenu: {
    addButton: (collectionName: string) =>
      frame
        .getByTestId('sidebar-collection-row')
        .filter({ hasText: collectionName })
        .getByTestId('collection-new-request'),
    // Menu option by request type: http | graphql | grpc | ws.
    option: (type: string) => frame.getByTestId(`collection-new-request-new-${type}`)
  },
  // VS Code editor tab (workbench, not a webview) — pass the page to the factory.
  workbench: {
    editorTab: (title: string) => frame.locator('.tabs-container .tab').filter({ hasText: title }),
    editorTabClose: (title: string) =>
      frame.locator('.tabs-container .tab').filter({ hasText: title }).locator('.action-label.codicon-close')
  },
  // New Request panel form.
  newRequest: {
    typeOption: (type: string) => frame.locator('.request-type-option').filter({ hasText: type }),
    methodSelector: () => frame.locator('.method-selector-container .method-selector'),
    methodOption: (method: string) => frame.getByTestId(`new-request-method-${method.toLowerCase()}`),
    nameInput: () => frame.locator('#requestName'),
    urlEditor: () => frame.locator('.url-input-container .CodeMirror'),
    submit: () => frame.locator('button[type="submit"]').filter({ hasText: 'Create Request' })
  },
  // Request-editor tabs (Params / Body / Headers / Auth / Vars …).
  tabs: {
    byKey: (key: string) => frame.locator(`div[role="tab"].${key}`),
    byText: (text: string) => frame.locator('div[role="tab"]').filter({ hasText: text }),
    more: () => frame.locator('.more-tabs')
  },
  // Key/value EditableTable (headers, params, vars). Cell lookups are meant to be
  // scoped to a row, i.e. buildCommonLocators(row).editableTable.columnValueEditor().
  editableTable: {
    rows: () => frame.getByTestId('editable-table').locator('tbody tr'),
    firstTableRows: () => frame.getByTestId('editable-table').first().locator('tbody tr'),
    columnNameEditor: () => frame.getByTestId('column-name').locator('.CodeMirror'),
    columnNameInput: () => frame.getByTestId('column-name').locator('input'),
    columnValueEditor: () => frame.getByTestId('column-value').locator('.CodeMirror'),
    columnCheckbox: () => frame.getByTestId('column-checkbox')
  },
  auth: {
    modeSelector: () => frame.locator('.auth-mode-selector'),
    bearerTokenEditor: () => frame.locator('.single-line-editor-wrapper .CodeMirror').first()
  },
  body: {
    modeSelector: () => frame.locator('.body-mode-selector'),
    modeOption: (name: string) => frame.getByText(name, { exact: true }),
    editor: () => frame.locator('.CodeMirror-wrap')
  },
  // Body-mode dropdown addressed by test id, plus the File / Binary row controls.
  requestBody: {
    modeSelector: () => frame.getByTestId('body-mode'),
    modeOption: (mode: string) => frame.getByTestId(`body-mode-${mode}`),
    addFile: () => frame.getByTestId('body-file-add'),
    selectFile: () => frame.getByTestId('file-picker-button').first(),
    selectedFileName: () => frame.getByTestId('file-picker-file-name').first()
  },
  oauth2: {
    authModeSelector: () => frame.getByTestId('oauth2-auth-mode-selector'),
    grantTypeSelector: () => frame.getByTestId('oauth2-grant-type-selector'),
    credentialsPlacementSelector: () => frame.getByTestId('oauth2-credentials-placement-selector'),
    field: (key: string) => frame.getByTestId(`oauth2-field-${key}`),
    getTokenBtn: () => frame.getByTestId('oauth2-get-token-btn'),
    tokenTitle: () => frame.getByTestId('oauth2-token-title')
  },
  graphql: {
    queryEditor: () => frame.locator('.graphiql-container .CodeMirror'),
    variablesEditor: () => frame.locator('.CodeMirror-wrap').first()
  },
  grpc: {
    protoDropdownIcon: () => frame.getByTestId('grpc-proto-file-dropdown-icon'),
    browseButton: () => frame.locator('.browse-button').filter({ hasText: 'Browse' }),
    modeToggleLabel: () => frame.getByTestId('grpc-mode-toggle').locator('label[for="toggle-switch"]'),
    methodDropdownTrigger: () => frame.getByTestId('grpc-method-dropdown-trigger'),
    methodItem: (text: string) => frame.getByTestId('grpc-method-item').filter({ hasText: text }),
    selectedMethodName: () => frame.getByTestId('selected-grpc-method-name'),
    messageEditor: () => frame.getByTestId('grpc-messages-container').locator('.CodeMirror-wrap').first(),
    sendRequestButton: () => frame.getByTestId('grpc-send-request-button'),
    responseStatusCode: () => frame.getByTestId('grpc-response-status-code'),
    responseContent: () => frame.getByTestId('grpc-response-content'),
    errorMessage: () => frame.getByTestId('grpc-response-content').locator('.error-message')
  },
  // Modal that asks the user for {{?prompt}} values before a request is sent.
  promptVariables: {
    modal: () => frame.getByTestId('prompt-variables-modal-content'),
    input: (index: number) => frame.getByTestId(`prompt-variable-input-${index}`),
    // One container per unique prompt — used to assert how many prompts were asked.
    inputContainers: () => frame.getByTestId('prompt-variable-input-container'),
    continueButton: () => frame.locator('.submit').filter({ hasText: 'Continue' })
  },
  response: {
    statusCode: () => frame.getByTestId('response-status-code'),
    previewContainer: () => frame.getByTestId('response-preview-container'),
    error: () => frame.getByTestId('response-error')
  },
  clientCerts: {
    emptyMessage: () => frame.getByText('No client certificates added'),
    rows: () => frame.getByTestId('client-cert-row'),
    domainInput: () => frame.getByTestId('client-cert-domain'),
    pfxRadio: () => frame.getByTestId('client-cert-type-pfx'),
    filePicker: (field: string) => frame.getByTestId(`client-cert-file-${field}`),
    pickedFile: (field: string) => frame.getByTestId(`client-cert-file-name-${field}`),
    passphraseEditor: () => frame.getByTestId('client-cert-passphrase').locator('.CodeMirror'),
    addButton: () => frame.getByTestId('add-client-cert'),
    saveButton: () => frame.getByTestId('save-client-certs')
  },
  // A dropdown menu item, by its visible text.
  dropdownItem: (text: string) => frame.locator('.dropdown-item').filter({ hasText: text }),
  // Send/run control shared by HTTP, GraphQL, WS and gRPC editors.
  sendRequest: () => frame.locator('#send-request'),
  ws: {
    // "Connect" control in the URL bar (present only while disconnected).
    connectButton: () => frame.getByTestId('ws-connect-button'),
    // Strip shown once the socket is connected.
    connectionStatusStrip: () => frame.locator('.connection-status-strip'),
    // Text of an incoming message in the WS response pane.
    incomingMessage: () => frame.locator('.ws-message.ws-incoming .message-content'),
    errorMessage: () => frame.locator('.ws-message.ws-error .message-content')
  }
});
