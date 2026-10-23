import { Frame, Page, Locator, FrameLocator } from '@playwright/test';

/**
 * Centralised Playwright locators for the e2e suite.
 *
 * Bruno's UI runs inside VS Code webview iframes, so the factory takes a `Frame`
 * (or `Page`). It also accepts a `Locator` so callers can scope lookups to a row,
 * or a `FrameLocator` such as `activeEditor(page)` for the pane currently shown.
 */
export type FrameLike = Frame | Page | Locator | FrameLocator;

export const buildCommonLocators = (frame: FrameLike) => ({
  saveButton: () => frame.getByRole('button', { name: 'Save' }),
  sidebar: {
    collectionName: (name: string) => frame.getByTestId(`sidebar-collection-row-${name}`),
    collectionById: (name: string) =>
      frame
        .locator(`#collection-${name.replace(/\s+/g, '-').toLowerCase()}`)
        .getByTestId(`sidebar-collection-row-${name}`),
    collectionItem: (name: string) => frame.getByTestId(`sidebar-collection-item-row-${name}`),
    folder: (name: string) => frame.getByTestId(`sidebar-collection-item-row-${name}`),
    folderChevron: (name: string) => frame.getByTestId(`folder-chevron-${name}`),
    addMenu: () => frame.getByTestId('collections-header-add-menu'),
    addMenuCreate: () => frame.getByTestId('collections-header-add-menu-create'),
    openCollectionButton: () => frame.getByTestId('collections-header-add-menu-open'),
    addMenuImport: () => frame.getByTestId('collections-header-add-menu-import'),
    actionsMenu: (collectionName: string) => frame.getByTestId(`collection-actions-${collectionName}`),
    actionMenuButton: (collectionName: string, id: string) => frame.getByTestId(`collection-actions-${collectionName}-${id}`),
    runCollectionButton: (collectionName: string) => frame.getByTestId(`collection-actions-${collectionName}-run`),
    actionsItem: (collectionName: string, id: string) => frame.getByTestId(`collection-actions-${collectionName}-${id}`),
    itemMenu: (name: string) => frame.getByTestId(`collection-item-menu-${name}`),
    itemMenuAction: (name: string, id: string) => frame.getByTestId(`collection-item-menu-${name}-${id}`)
  },
  importCollection: {
    container: () => frame.getByTestId('import-collection-container'),
    fileInput: () => frame.getByTestId('import-file-input'),
    search: () => frame.getByTestId('import-search'),
    selectAll: () => frame.getByTestId('import-select-all'),
    selectedCount: () => frame.getByTestId('import-selected-count'),
    rows: () => frame.getByTestId(/^import-collection-row-/),
    row: (name: string) => frame.getByTestId(`import-collection-row-${name}`),
    rowCheckbox: (name: string) => frame.getByTestId(`import-collection-checkbox-${name}`),
    location: () => frame.getByTestId('import-collection-location'),
    browse: () => frame.getByTestId('import-browse-button'),
    submit: () => frame.getByTestId('import-submit'),
    progressSummary: () => frame.getByTestId('import-progress-summary'),
    close: () => frame.getByTestId('import-close')
  },
  cloneCollection: {
    container: () => frame.locator('.clone-container'),
    nameInput: () => frame.locator('#name'),
    locationInput: () => frame.locator('#location'),
    browseButton: () => frame.locator('.browse-btn'),
    submit: () => frame.locator('button[type="submit"]').filter({ hasText: 'Clone Collection' })
  },
  collectionSettings: {
    container: () => frame.getByTestId('collection-settings'),
    // Overview → Requests line, e.g. "2 requests in collection".
    requestsInfo: () => frame.getByTestId('collection-requests-count'),
    requestsNotLoaded: () => frame.getByTestId('collection-requests-not-loaded'),
    saveButton: (tab: string) => frame.getByTestId(`collection-settings-${tab}-save`)
  },
  environments: {
    // Environment picker in the collection toolbar.
    selectorTrigger: () => frame.getByTestId('environment-selector-trigger'),
    // Names shown on the trigger; absent while nothing is selected.
    activeName: () => frame.getByTestId('active-collection-environment'),
    activeGlobalName: () => frame.getByTestId('active-global-environment'),
    inactiveLabel: () => frame.getByTestId('no-active-environment'),
    dropdownItem: (name: string) => frame.getByTestId(`environment-dropdown-item-${name}`),
    noEnvironmentOption: () => frame.getByTestId('environment-list-no-environment'),
    emptyState: () => frame.getByTestId('environment-list-empty-state'),
    configureButton: () => frame.getByTestId('environment-configure-button'),
    settingsList: () => frame.getByTestId('environments-list'),
    settingsItem: (name: string) => frame.getByTestId(`environment-item-${name}`),
    activeCheckmark: (name: string) => frame.getByTestId(`environment-item-${name}`).getByTestId('environment-active-checkmark'),
    scopeTab: (scope: 'collection' | 'global') => frame.getByTestId(`env-tab-${scope}`),
    createEnvironment: () => frame.getByTestId('create-global-environment'),
    nameInput: () => frame.getByTestId('create-global-environment-name'),
    confirmCreate: () => frame.getByTestId('modal-confirm-button'),
    newVarNameInput: () => frame.getByTestId('env-var-name-new'),
    varValueEditor: (name: string) => frame.getByTestId(`env-var-row-${name}`).locator('.CodeMirror'),
    varSecretCheckbox: (name: string) => frame.getByTestId(`env-var-secret-${name}`),
    save: () => frame.getByTestId('save-env')
  },
  dotEnv: {
    section: () => frame.getByTestId('dotenv-files-section'),
    createFile: () => frame.getByTestId('create-dotenv-file'),
    file: (filename: string) => frame.getByTestId(`dotenv-file-${filename}`),
    varRow: (name: string) => frame.getByTestId(`dotenv-var-row-${name}`),
    varNameInputs: () => frame.locator('[data-testid^="dotenv-var-row-"] input[type="text"]'),
    viewTable: () => frame.getByTestId('dotenv-view-table'),
    viewRaw: () => frame.getByTestId('dotenv-view-raw'),
    rawEditor: () => frame.getByTestId('dotenv-raw-editor').locator('.CodeMirror'),
    save: () => frame.getByTestId('save-dotenv'),
    saveRaw: () => frame.getByTestId('save-dotenv-raw'),
    deleteFile: () => frame.getByTestId('delete-dotenv-file')
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
        .getByTestId('column-value-0')
        .locator('.CodeMirror-line')
        .first()
  },
  // The "+" transient-request menu on a collection row.
  newRequestMenu: {
    addButton: (collectionName: string) => frame.getByTestId(`collection-new-request-${collectionName}`),
    // Menu option by request type: http | graphql | grpc | ws.
    option: (collectionName: string, type: string) => frame.getByTestId(`collection-new-request-${collectionName}-new-${type}`)
  },
  // VS Code workbench UI (not a webview) — pass the page to the factory.
  workbench: {
    sidebarTitle: () => frame.locator('.part.sidebar .composite.title h2'),
    editorTab: (title: string) => frame.locator('.tabs-container .tab').filter({ hasText: title }),
    editorTabClose: (title: string) =>
      frame.locator('.tabs-container .tab').filter({ hasText: title }).locator('.tab-actions .action-label'),
    quickInputBox: () => frame.locator('.quick-input-widget .quick-input-box input'),
    notificationToasts: () => frame.locator('.notifications-toasts .notification-toast'),
    getNotificationToastByText: (text: string) =>
      frame.locator('.notifications-toasts .notification-toast').filter({ hasText: text })
  },
  // New Request panel form.
  newRequest: {
    container: () => frame.getByTestId('new-request-container'),
    typeOption: (type: string) => frame.locator('.request-type-option').filter({ hasText: type }),
    methodSelector: () => frame.locator('.method-selector-container .method-selector'),
    methodOption: (method: string) => frame.getByTestId(`new-request-method-${method.toLowerCase()}`),
    nameInput: () => frame.locator('#requestName'),
    urlEditor: () => frame.locator('.url-input-container .CodeMirror'),
    submit: () => frame.locator('button[type="submit"]').filter({ hasText: 'Create Request' })
  },
  // Request-editor tabs (Params / Body / Headers / Auth / Vars …).
  tabs: {
    // Request-pane tab; the response pane reuses keys like `headers`.
    byKey: (key: string) => {
      return frame
        .getByTestId(`request-pane-tabs-${key}`)
        .or(frame.getByTestId(`grpc-request-tab-${key}`))
        .or(frame.getByTestId(`ws-request-tab-${key}`));
    },
    byText: (text: string) => frame.locator('div[role="tab"]').filter({ hasText: text }),
    more: () => frame.locator('.more-tabs')
  },
  // Key/value EditableTable (headers, params, vars). Cell lookups take the row index
  // and are meant to be scoped to a table, e.g. buildCommonLocators(table).editableTable.
  editableTable: {
    rows: (tableId: string) => frame.getByTestId(tableId).locator('tbody tr'),
    columnNameEditor: (rowIndex: number) => frame.getByTestId(`column-name-${rowIndex}`).locator('.CodeMirror'),
    columnNameInput: (rowIndex: number) => frame.getByTestId(`column-name-${rowIndex}`).locator('input'),
    columnValueEditor: (rowIndex: number) => frame.getByTestId(`column-value-${rowIndex}`).locator('.CodeMirror'),
    columnCheckbox: (rowIndex: number) => frame.getByTestId(`column-checkbox-${rowIndex}`)
  },
  varsTable: {
    rows: (scope: 'request' | 'collection' | 'folder', kind: 'req' | 'res' = 'req') =>
      frame.getByTestId(`${scope}-vars-${kind}`).locator('tbody tr')
  },
  auth: {
    modeSelector: () => frame.locator('.auth-mode-selector'),
    inheritedMode: () => frame.locator('.inherit-mode-text'),
    bearerTokenEditor: (level: 'collection' | 'request') => frame.getByTestId(`${level}-auth-bearer-token`).locator('.CodeMirror'),
    basicUsernameEditor: (level: 'collection' | 'request') => frame.getByTestId(`${level}-auth-basic-username`).locator('.CodeMirror'),
    basicPasswordEditor: (level: 'collection' | 'request') => frame.getByTestId(`${level}-auth-basic-password`).locator('.CodeMirror'),
    awsAccessKeyIdEditor: () => frame.getByTestId('auth-awsv4-access-key-id').locator('.CodeMirror'),
    awsSecretAccessKeyEditor: () => frame.getByTestId('auth-awsv4-secret-access-key').locator('.CodeMirror'),
    awsServiceEditor: () => frame.getByTestId('auth-awsv4-service').locator('.CodeMirror'),
    awsRegionEditor: () => frame.getByTestId('auth-awsv4-region').locator('.CodeMirror')
  },
  paneTabs: {
    collectionSettingsTab: (key: string) => frame.getByTestId('collection-settings').locator(`[role="tab"].${key}`),
    folderSettingsTab: (key: string) => frame.getByTestId('folder-settings').locator(`[role="tab"].${key}`)
  },
  timeline: {
    lastItem: () => frame.getByTestId('timeline-entry').first(),
    itemHeader: (item: Locator) => item.getByTestId('timeline-item-header'),
    requestPanel: (item: Locator) => item.getByTestId('timeline-panel-request'),
    networkTab: (item: Locator) => item.getByRole('button', { name: 'Network', exact: true }),
    networkPanel: (item: Locator) => item.getByTestId('timeline-panel-network')
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
    credentialsPlacementSelector: () => frame.getByTestId('oauth2-client-credentials-placement-selector'),
    field: (key: string) => frame.getByTestId(`oauth2-field-${key}`),
    getTokenBtn: () => frame.getByTestId('oauth2-get-token-btn'),
    tokenTitle: () => frame.getByTestId('oauth2-token-title')
  },
  graphql: {
    queryEditor: () => frame.locator('.graphiql-container .CodeMirror'),
    variablesEditor: () => frame.locator('.CodeMirror-wrap').first()
  },
  grpc: {
    queryUrlContainer: () => frame.getByTestId('grpc-query-url-container'),
    protoDropdownIcon: () => frame.getByTestId('grpc-proto-file-dropdown-icon'),
    browseButton: () => frame.locator('.browse-button').filter({ hasText: 'Browse' }),
    modeToggleLabel: () => frame.getByTestId('grpc-mode-toggle').locator('label[for="toggle-switch"]'),
    methodDropdownTrigger: () => frame.getByTestId('grpc-method-dropdown-trigger'),
    methodsList: () => frame.getByTestId('grpc-methods-list'),
    methodsSearchInput: () => frame.getByTestId('grpc-methods-search-input'),
    methodItems: () => frame.getByTestId(/^grpc-method-item-/),
    methodItem: (methodName: string) => frame.getByTestId(`grpc-method-item-${methodName}`),
    methodsEmptyState: () => frame.getByTestId('grpc-methods-empty-state'),
    selectedMethodName: () => frame.getByTestId('selected-grpc-method-name'),
    messageEditor: () => frame.getByTestId('grpc-messages-container').locator('.CodeMirror-wrap').first(),
    messages: () => frame.getByTestId('grpc-messages-container').locator('.message-container'),
    addMessageButton: () => frame.getByTestId('grpc-add-message-button'),
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
    inputContainers: () => frame.getByTestId(/^prompt-variable-input-container-/),
    continueButton: () => frame.locator('.submit').filter({ hasText: 'Continue' })
  },
  response: {
    statusCode: () => frame.getByTestId('response-status-code'),
    previewContainer: () => frame.getByTestId('response-preview-container'),
    loadingOverlay: () => frame.getByTestId('response-loading-overlay'),
    body: () => frame.getByTestId('response-status-code').locator('..'),
    error: () => frame.getByTestId('response-error')
  },
  clientCerts: {
    emptyMessage: () => frame.getByText('No client certificates added'),
    row: (index: number) => frame.getByTestId(`client-cert-row-${index}`),
    domainInput: () => frame.getByTestId('client-cert-domain'),
    pfxRadio: () => frame.getByTestId('client-cert-type-pfx'),
    filePicker: (field: string) => frame.getByTestId(`client-cert-file-${field}`),
    pickedFile: (field: string) => frame.getByTestId(`client-cert-file-name-${field}`),
    passphraseEditor: () => frame.getByTestId('client-cert-passphrase').locator('.CodeMirror'),
    addButton: () => frame.getByTestId('add-client-cert'),
    saveButton: () => frame.getByTestId('collection-settings-client-certs-save')
  },
  modal: {
    confirm: () => frame.getByTestId('modal-confirm-button'),
    cancel: () => frame.getByTestId('modal-cancel-button')
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
  },
  runner: {
    runCollectionButton: () => frame.getByRole('button', { name: 'Run Collection' }),
    runAgainButton: () => frame.getByRole('button', { name: 'Run Again' }),
    delayInput: () => frame.getByRole('spinbutton'),
    filterByTagsRadio: () => frame.getByLabel('Filter requests with tags'),
    // Both fields share data-testid="tag-input". Scope each one to its label so the id resolves to one element.
    includeTagInput: () =>
      frame.getByText('Included tags:', { exact: true }).locator('..').getByTestId('tag-input'),
    excludeTagInput: () =>
      frame.getByText('Excluded tags:', { exact: true }).locator('..').getByTestId('tag-input'),
    // Request Settings has a single tag field, so the id is unique there.
    requestTagInput: () => frame.getByTestId('tag-input'),
    // CodeMirror's hint list has no role or test id.
    tagSuggestionList: () => frame.locator('.CodeMirror-hints'),
    tagChipButton: (tag: string) => frame.getByRole('button', { name: tag }),
    savedToastText: () => frame.getByText('Request saved successfully'),
    requestCountText: () => frame.getByText(/requests in this collection/),
    // Result block has no test id; the name and status sit together in this display.
    resultDisplay: (name: string) => frame.locator('.item-path').filter({ hasText: name }),
    filterButton: (label: 'All' | 'Passed' | 'Failed' | 'Skipped') =>
      frame.getByRole('button', { name: label })
  }
});
