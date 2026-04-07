import React from 'react';
/**
 *  Copyright (c) 2017, Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file at https://github.com/graphql/codemirror-graphql/tree/v0.8.3
 */

import { interpolate, mockDataFunctions } from '@usebruno/common';
import { getVariableScope, isVariableSecret, getAllVariables } from 'utils/collections';
import { updateVariableInScope } from 'providers/ReduxStore/slices/collections/actions';
import store from 'providers/ReduxStore';
import { defineCodeMirrorBrunoVariablesMode } from 'utils/common/codemirror';
import { MaskedEditor } from 'utils/common/masked-editor';
import { setupAutoComplete } from 'utils/codemirror/autocomplete';
import { variableNameRegex } from 'utils/common/regex';

// Extended element interface for CodeMirror wrapper elements
interface ExtendedElement extends Element {
  _cmEditor?: unknown;
  _maskedEditor?: MaskedEditor;
  _autoCompleteCleanup?: () => void;
  currentStyle?: CSSStyleDeclaration;
}

interface ExtendedHTMLDivElement extends HTMLDivElement {
  _cmEditor?: unknown;
  _maskedEditor?: MaskedEditor;
  _autoCompleteCleanup?: () => void;
  currentStyle?: CSSStyleDeclaration;
}

let CodeMirror: any;
const SERVER_RENDERED = typeof window === 'undefined' || (global as Record<string, any>)['PREVENT_CODEMIRROR_RENDER'] === true;
const { get } = require('lodash');

const COPY_ICON_SVG_TEXT = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
`;

const CHECKMARK_ICON_SVG_TEXT = `
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="20,6 9,17 4,12"></polyline>
</svg>
`;

const COPY_SUCCESS_COLOR = '#22c55e';

export const COPY_SUCCESS_TIMEOUT = 1000;

const EDITOR_MIN_HEIGHT = 1.75;
const EDITOR_MAX_HEIGHT = 11.125;

/**
 * Calculate editor height based on content, clamped between min and max
 * @param {number} contentHeight - The actual content height from CodeMirror
 * @returns {number} The clamped height value
 */
const calculateEditorHeight = (contentHeight: any) => {
  const contentHeightRem = contentHeight / 16;
  return Math.min(Math.max(contentHeightRem, EDITOR_MIN_HEIGHT), EDITOR_MAX_HEIGHT);
};

const EYE_ICON_SVG = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
`;

const EYE_OFF_ICON_SVG = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
  </svg>
`;

const getScopeLabel = (scopeType: string) => {
  const labels: Record<string, string> = {
    'global': 'Global',
    'environment': 'Environment',
    'collection': 'Collection',
    'folder': 'Folder',
    'request': 'Request',
    'runtime': 'Runtime',
    'process.env': 'Process Env',
    'dynamic': 'Dynamic',
    'oauth2': 'OAuth2',
    'path': 'Path Param',
    'undefined': 'Undefined'
  };
  return labels[scopeType] || scopeType;
};

const getMaskedDisplay = (value: any) => {
  const contentLength = (value || '').length;
  return contentLength > 0 ? '*'.repeat(contentLength) : '';
};

const updateValueDisplay = (valueDisplay: any, value: any, isSecret: any, isMasked: any, isRevealed: any) => {
  if ((isSecret || isMasked) && !isRevealed) {
    valueDisplay.textContent = getMaskedDisplay(value);
  } else {
    valueDisplay.textContent = value || '';
  }
};

const containsSecretVariableReferences = (rawValue: any, collection: any, item: any) => {
  if (!rawValue || typeof rawValue !== 'string') {
    return false;
  }

  // Match all variable references like {{varName}}
  const variableReferencePattern = /\{\{([^}]+)\}\}/g;
  const matches = rawValue.matchAll(variableReferencePattern);

  for (const match of matches) {
    const referencedVarName = match[1].trim();

    const referencedScopeInfo = getVariableScope(referencedVarName, collection, item);

    if (referencedScopeInfo && isVariableSecret(referencedScopeInfo)) {
      return true;
    }
  }

  return false;
};

const getCopyButton = (variableValue: string, onCopyCallback?: () => void) => {
  const copyButton = document.createElement('button');

  copyButton.className = 'copy-button';
  copyButton.innerHTML = COPY_ICON_SVG_TEXT;
  copyButton.type = 'button';

  let isCopied = false;

  copyButton.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();

    if (isCopied) {
      return;
    }

    navigator.clipboard
      .writeText(variableValue)
      .then(() => {
        isCopied = true;
        copyButton.innerHTML = CHECKMARK_ICON_SVG_TEXT;
        copyButton.style.color = COPY_SUCCESS_COLOR;
        copyButton.style.cursor = 'default';
        copyButton.classList.add('copy-success');

        setTimeout(() => {
          isCopied = false;
          copyButton.innerHTML = COPY_ICON_SVG_TEXT;
          copyButton.style.color = '#989898';
          copyButton.style.cursor = 'pointer';
          copyButton.classList.remove('copy-success');
        }, COPY_SUCCESS_TIMEOUT);

        // Call callback if provided
        if (onCopyCallback) {
          onCopyCallback();
        }
      })
      .catch((err) => {
        console.error('Failed to copy to clipboard:', err.message);
      });
  });

  return copyButton;
};

export const renderVarInfo = (token: any, options: any) => {
  const { variableName, variableValue } = extractVariableInfo(token.string, options.variables);

  // Don't show popover if we can't extract a variable name or if it's empty/whitespace
  if (!variableName || !variableName.trim()) {
    return;
  }

  const collection = options.collection;
  const item = options.item;

  // Check if this is a path parameter (token starts with /:)
  const isPathParam = token.string && token.string.startsWith('/:');

  let scopeInfo: any;
  if (isPathParam) {
    // Path parameter - show value from pathParams
    scopeInfo = {
      type: 'path',
      value: variableValue || '',
      data: { item, variable: { name: variableName, value: variableValue || '' } }
    };
  } else if (variableName.startsWith('$oauth2.')) {
    // OAuth2 token variable - look up in variables object
    const oauth2Value = get(options.variables, variableName);
    scopeInfo = {
      type: 'oauth2',
      value: oauth2Value !== undefined ? oauth2Value : '',
      data: null,
      isValidOAuth2Variable: oauth2Value !== undefined
    };
  } else if (variableName.startsWith('$')) {
    const fakerKeyword = variableName.substring(1); // Remove the $ prefix
    const fakerFunction = (mockDataFunctions as unknown as Record<string, unknown>)[fakerKeyword];
    scopeInfo = {
      type: 'dynamic',
      value: '',
      data: null,
      isValidFakerVariable: !!fakerFunction
    };
  } else if (variableName.startsWith('process.env.')) {
    scopeInfo = {
      type: 'process.env',
      value: variableValue || '',
      data: null
    };
  } else {
    scopeInfo = getVariableScope(variableName, collection, item);

    // If variable doesn't exist in any scope, determine scope based on context
    if (!scopeInfo) {
      if (item) {
        const isFolder = item.type === 'folder';

        if (isFolder) {
          // We're in folder settings - create as folder variable
          scopeInfo = {
            type: 'folder',
            value: '', // Empty value for new variable
            data: { folder: item, variable: null } // variable is null since it doesn't exist yet
          };
        } else {
          // We're in a request - create as request variable
          scopeInfo = {
            type: 'request',
            value: '', // Empty value for new variable
            data: { item, variable: null } // variable is null since it doesn't exist yet
          };
        }
      } else if (collection) {
        // No item context but we have collection - create as collection variable
        scopeInfo = {
          type: 'collection',
          value: '',
          data: { collection, variable: null }
        };
      } else {
        // No context at all, show as undefined
        scopeInfo = {
          type: 'undefined',
          value: '',
          data: null
        };
      }
    }
  }

  // Check if variable is read-only (process.env, runtime, dynamic/faker, oauth2, path, and undefined variables cannot be edited)
  const isReadOnly = scopeInfo.type === 'process.env' || scopeInfo.type === 'runtime' || scopeInfo.type === 'dynamic' || scopeInfo.type === 'oauth2' || scopeInfo.type === 'path' || scopeInfo.type === 'undefined';

  const rawValue = scopeInfo.value || '';

  const isSecret = scopeInfo.type !== 'undefined' ? isVariableSecret(scopeInfo) : false;
  const hasSecretReferences = containsSecretVariableReferences(rawValue, collection, item);
  const shouldMaskValue = isSecret || hasSecretReferences;

  const isMasked = options.variables?.maskedEnvVariables?.includes(variableName);

  const into = document.createElement('div');
  into.className = 'bruno-var-info-container';

  // Header: Variable name + Scope badge
  const header = document.createElement('div');
  header.className = 'var-info-header';

  const varName = document.createElement('span');
  varName.className = 'var-name';
  varName.textContent = variableName;

  const scopeBadge = document.createElement('span');
  scopeBadge.className = 'var-scope-badge';

  const scopeLabel = scopeInfo ? getScopeLabel(scopeInfo.type) : 'Unknown';
  const isNewVariable = scopeInfo && scopeInfo.data && scopeInfo.data.variable === null;
  scopeBadge.textContent = isNewVariable ? `${scopeLabel}` : scopeLabel;

  header.appendChild(varName);
  header.appendChild(scopeBadge);
  into.appendChild(header);

  const isValidVariableName = scopeInfo.type === 'process.env' || scopeInfo.type === 'dynamic' || scopeInfo.type === 'oauth2' || variableNameRegex.test(variableName);

  if (!isValidVariableName) {
    const warningNote = document.createElement('div');
    warningNote.className = 'var-warning-note';
    warningNote.textContent = 'Invalid variable name! Variables must only contain alpha-numeric characters, "-", "_", "."';
    into.appendChild(warningNote);

    // Don't show value or any other content for invalid variable names
    return into;
  }

  if (scopeInfo.type === 'dynamic' && !scopeInfo.isValidFakerVariable) {
    const warningNote = document.createElement('div');
    warningNote.className = 'var-warning-note';
    warningNote.textContent = `Unknown dynamic variable "${variableName}". Check the variable name.`;
    into.appendChild(warningNote);
    return into;
  }

  // For valid dynamic variables, just show the read-only note (no value display since it's generated at runtime)
  if (scopeInfo.type === 'dynamic' && scopeInfo.isValidFakerVariable) {
    const readOnlyNote = document.createElement('div');
    readOnlyNote.className = 'var-readonly-note';
    readOnlyNote.textContent = 'Generates random value on each request';
    into.appendChild(readOnlyNote);
    return into;
  }

  if (scopeInfo.type === 'oauth2' && !scopeInfo.isValidOAuth2Variable) {
    const warningNote = document.createElement('div');
    warningNote.className = 'var-warning-note';
    warningNote.textContent = `OAuth2 token not found. Make sure you have fetched the token with the correct Token ID.`;
    into.appendChild(warningNote);
    return into;
  }

  const valueContainer = document.createElement('div') as ExtendedHTMLDivElement;
  valueContainer.className = 'var-value-container';

  if (!isReadOnly && scopeInfo) {
    let isRevealed = false;

    const valueDisplay = document.createElement('div');
    valueDisplay.className = 'var-value-editable-display';
    // Mask the displayed value if it contains secrets or references to secrets
    updateValueDisplay(valueDisplay, variableValue, shouldMaskValue, isMasked, false);

    const editorContainer = document.createElement('div');
    editorContainer.className = 'var-value-editor';
    editorContainer.style.display = 'none'; // Hidden initially

    // Detect current theme from DOM
    const isDarkTheme = document.documentElement.classList.contains('dark');
    const cmTheme = isDarkTheme ? 'monokai' : 'default';

    const allVariables = collection ? getAllVariables(collection, item) : {};

    const cmEditor = CodeMirror(editorContainer, {
      value: typeof rawValue === 'string' ? rawValue : String(rawValue), // Use raw value (e.g., {{echo-host}} not resolved value) (ensure it's always a string for CodeMirror) #usebruno/bruno/#6265
      mode: 'brunovariables',
      theme: cmTheme,
      lineWrapping: true,
      lineNumbers: false,
      brunoVarInfo: false, // Disable tooltips within the editor to prevent recursion
      scrollbarStyle: null,
      viewportMargin: Infinity
    });

    defineCodeMirrorBrunoVariablesMode(allVariables, 'text/plain', false, true);
    cmEditor.setOption('mode', 'brunovariables');

    const getAllVariablesHandler = () => allVariables;
    const autoCompleteOptions = {
      getAllVariables: getAllVariablesHandler,
      showHintsFor: ['variables']
    };
    const autoCompleteCleanup = setupAutoComplete(cmEditor, autoCompleteOptions);

    let maskedEditor: any = null;

    if (shouldMaskValue || isMasked) {
      maskedEditor = new MaskedEditor(cmEditor);
      maskedEditor.enable();
    }

    let originalValue = rawValue;
    let isEditing = false;

    cmEditor.setOption('extraKeys', {
      'Enter': (cm: any) => {
        // Enter: save and blur
        cm.getInputField().blur();
      },
      'Shift-Enter': (cm: any) => {
        // Shift+Enter: insert new line
        cm.replaceSelection('\n', 'end');
      }
    });

    // Dynamically adjust editor height as content changes
    cmEditor.on('change', () => {
      if (isEditing) {
        requestAnimationFrame(() => {
          cmEditor.refresh();
          const sizer = cmEditor.getWrapperElement().querySelector('.CodeMirror-sizer');
          const contentHeight = sizer ? sizer.clientHeight : cmEditor.getScrollInfo().height;
          const newHeight = calculateEditorHeight(contentHeight);
          editorContainer.style.height = `${newHeight}rem`;
        });
      }
    });

    // Icons container (top-right)
    const iconsContainer = document.createElement('div');
    iconsContainer.className = 'var-icons';

    // Eye toggle button (show if the displayed value is masked)
    if (shouldMaskValue || isMasked) {
      const toggleButton = document.createElement('button');
      toggleButton.className = 'secret-toggle-button';
      toggleButton.innerHTML = EYE_ICON_SVG;
      toggleButton.type = 'button';

      toggleButton.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        isRevealed = !isRevealed;

        toggleButton.innerHTML = isRevealed ? EYE_OFF_ICON_SVG : EYE_ICON_SVG;

        updateValueDisplay(valueDisplay, variableValue, shouldMaskValue, isMasked, isRevealed);

        if (maskedEditor) {
          isRevealed ? maskedEditor.disable() : maskedEditor.enable();
        }

        if (isEditing) {
          setTimeout(() => {
            cmEditor.focus();
          }, 0);
        }
      });

      iconsContainer.appendChild(toggleButton);
    }

    // Copy button (copy actual value, not masked)
    const copyButton = getCopyButton(variableValue || '', () => {
      if (isEditing) {
        setTimeout(() => {
          cmEditor.focus();
        }, 0);
      }
    });
    iconsContainer.appendChild(copyButton);

    valueContainer.appendChild(valueDisplay);
    valueContainer.appendChild(editorContainer);
    valueContainer.appendChild(iconsContainer);

    // Click on display to enter edit mode
    valueDisplay.addEventListener('click', () => {
      if (isEditing) return;

      isEditing = true;
      valueDisplay.style.display = 'none';
      editorContainer.style.display = 'block';

      // Focus the editor and ensure proper sizing
      setTimeout(() => {
        cmEditor.refresh();
        cmEditor.focus();

        const lineCount = cmEditor.lineCount();
        const lastLine = cmEditor.getLine(lineCount - 1);
        cmEditor.setCursor(lineCount - 1, lastLine ? lastLine.length : 0);

        // Adjust height based on content
        const contentHeight = cmEditor.getScrollInfo().height;
        editorContainer.style.height = `${calculateEditorHeight(contentHeight)}rem`;
      }, 0);
    });

    cmEditor.on('blur', () => {
      const newValue = cmEditor.getValue();

      // Switch back to display mode
      editorContainer.style.display = 'none';
      editorContainer.style.height = `${EDITOR_MIN_HEIGHT}rem`; // Reset to minimum height
      valueDisplay.style.display = 'block';
      isEditing = false;

      if (newValue !== originalValue) {
        const dispatch = store.dispatch;
        dispatch(updateVariableInScope(variableName, newValue, scopeInfo, collection.uid))
          .then(() => {
            originalValue = newValue;
            // Re-interpolate the new value to show the resolved value in display
            const interpolatedValue = interpolate(newValue, allVariables);
            const newHasSecretRefs = containsSecretVariableReferences(newValue, collection, item);
            const newShouldMask = isSecret || newHasSecretRefs;
            updateValueDisplay(valueDisplay, interpolatedValue, newShouldMask, isMasked, isRevealed);
          })
          .catch((err: any) => {
            console.error('Failed to update variable:', err);
            cmEditor.setValue(originalValue);
            updateValueDisplay(valueDisplay, variableValue, shouldMaskValue, isMasked, isRevealed);
          });
      }
    });

    valueContainer._cmEditor = cmEditor;
    valueContainer._maskedEditor = maskedEditor;
    valueContainer._autoCompleteCleanup = autoCompleteCleanup;
  } else {
    // Read-only display (for runtime, process.env, undefined variables)
    let isRevealed = false;

    const valueDisplay = document.createElement('div');
    valueDisplay.className = 'var-value-display';
    // For read-only variables, still check if they reference secrets
    updateValueDisplay(valueDisplay, variableValue, shouldMaskValue, isMasked, false);

    const iconsContainer = document.createElement('div');
    iconsContainer.className = 'var-icons';

    // Eye toggle button (for read-only variables that reference secrets or are masked)
    if (shouldMaskValue || isMasked) {
      const toggleButton = document.createElement('button');
      toggleButton.className = 'secret-toggle-button';
      toggleButton.innerHTML = EYE_ICON_SVG;
      toggleButton.type = 'button';

      toggleButton.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        isRevealed = !isRevealed;

        toggleButton.innerHTML = isRevealed ? EYE_OFF_ICON_SVG : EYE_ICON_SVG;
        updateValueDisplay(valueDisplay, variableValue, shouldMaskValue, isMasked, isRevealed);
      });

      iconsContainer.appendChild(toggleButton);
    }

    // Copy button (always copy actual value, not masked)
    const copyButton = getCopyButton(variableValue || '');
    iconsContainer.appendChild(copyButton);

    valueContainer.appendChild(valueDisplay);
    valueContainer.appendChild(iconsContainer);

    if (scopeInfo.type === 'process.env') {
      const readOnlyNote = document.createElement('div');
      readOnlyNote.className = 'var-readonly-note';
      readOnlyNote.textContent = 'read-only';
      into.appendChild(readOnlyNote);
    } else if (scopeInfo.type === 'runtime') {
      const readOnlyNote = document.createElement('div');
      readOnlyNote.className = 'var-readonly-note';
      readOnlyNote.textContent = 'Set by scripts (read-only)';
      into.appendChild(readOnlyNote);
    } else if (scopeInfo.type === 'oauth2') {
      const readOnlyNote = document.createElement('div');
      readOnlyNote.className = 'var-readonly-note';
      readOnlyNote.textContent = 'read-only';
      into.appendChild(readOnlyNote);
    } else if (scopeInfo.type === 'path') {
      const readOnlyNote = document.createElement('div');
      readOnlyNote.className = 'var-readonly-note';
      readOnlyNote.textContent = 'Edit in Params tab';
      into.appendChild(readOnlyNote);
    } else if (scopeInfo.type === 'undefined') {
      const readOnlyNote = document.createElement('div');
      readOnlyNote.className = 'var-readonly-note';
      readOnlyNote.textContent = 'No active environment';
      into.appendChild(readOnlyNote);
    }
  }

  into.appendChild(valueContainer);

  return into;
};

if (!SERVER_RENDERED) {
  CodeMirror = require('codemirror');

  // Global state to track active popup
  let activePopup: any = null;

  CodeMirror.defineOption('brunoVarInfo', false, function (cm: any, options: any, old: any) {
    if (old && old !== CodeMirror.Init) {
      const oldOnMouseOver = cm.state.brunoVarInfo.onMouseOver;
      CodeMirror.off(cm.getWrapperElement(), 'mouseover', oldOnMouseOver);
      clearTimeout(cm.state.brunoVarInfo.hoverTimeout);
      delete cm.state.brunoVarInfo;
    }

    if (options) {
      const state = (cm.state.brunoVarInfo = createState(options));
      state.onMouseOver = onMouseOver.bind(null, cm);
      CodeMirror.on(cm.getWrapperElement(), 'mouseover', state.onMouseOver);
    }
  });

  function createState(options: unknown): { options: unknown; onMouseOver?: (e: MouseEvent) => void } {
    return {
      options: options instanceof Function ? { render: options } : options === true ? {} : options
    };
  }

  function getHoverTime(cm: any) {
    const options = cm.state.brunoVarInfo.options;
    return (options && options.hoverTime) || 50;
  }

  function onMouseOver(cm: any, e: any) {
    const state = cm.state.brunoVarInfo;
    const target = e.target || e.srcElement;

    if (target.nodeName !== 'SPAN' || state.hoverTimeout !== undefined) {
      return;
    }
    if (!target.classList.contains('cm-variable-valid') && !target.classList.contains('cm-variable-invalid')) {
      return;
    }

    const box = target.getBoundingClientRect();

    const onMouseMove = function () {
      clearTimeout(state.hoverTimeout);
      state.hoverTimeout = setTimeout(onHover, hoverTime);
    };

    const onMouseOut = function () {
      CodeMirror.off(document, 'mousemove', onMouseMove);
      CodeMirror.off(cm.getWrapperElement(), 'mouseout', onMouseOut);
      clearTimeout(state.hoverTimeout);
      state.hoverTimeout = undefined;
    };

    const onHover = function () {
      CodeMirror.off(document, 'mousemove', onMouseMove);
      CodeMirror.off(cm.getWrapperElement(), 'mouseout', onMouseOut);
      state.hoverTimeout = undefined;
      onMouseHover(cm, box);
    };

    const hoverTime = getHoverTime(cm);
    state.hoverTimeout = setTimeout(onHover, hoverTime);

    CodeMirror.on(document, 'mousemove', onMouseMove);
    CodeMirror.on(cm.getWrapperElement(), 'mouseout', onMouseOut);
  }

  function onMouseHover(cm: any, box: any) {
    const pos = cm.coordsChar({
      left: (box.left + box.right) / 2,
      top: (box.top + box.bottom) / 2
    });

    const state = cm.state.brunoVarInfo;
    const options = state.options;
    let token = cm.getTokenAt(pos, true);

    if (token) {
      const line = cm.getLine(pos.line);

      // Check if this is a path parameter (/:paramName)
      let start = token.start;
      let end = token.end;

      // Look for /: prefix before the token
      if (start > 0 && line.substring(start - 2, start) === '/:') {
        // This is a path parameter - expand to include /:
        start = start - 2;
        // Find the end of the param name
        while (end < line.length) {
          const ch = line[end];
          if (ch === '/' || ch === '?' || ch === '&' || ch === '=' || ch === ' ') {
            break;
          }
          end++;
        }
        const pathParamString = line.substring(start, end);
        token = {
          ...token,
          string: pathParamString,
          start: start,
          end: end
        };
      } else {
        // Handle {{variable}} format
        while (start > 0 && !line.substring(start - 2, start).includes('{{')) {
          if (line.substring(start - 2, start) === '}}') {
            break;
          }
          start--;
        }
        if (line.substring(start - 2, start) === '{{') {
          start = start - 2;
        }

        while (end < line.length && !line.substring(end, end + 2).includes('}}')) {
          if (line.substring(end, end + 2) === '{{') {
            break;
          }
          end++;
        }
        if (line.substring(end, end + 2) === '}}') {
          end = end + 2;
        }

        const fullVariableString = line.substring(start, end);

        // Only use the expanded string if it looks like a complete variable
        if (fullVariableString.startsWith('{{') && fullVariableString.endsWith('}}')) {
          token = {
            ...token,
            string: fullVariableString,
            start: start,
            end: end
          };
        }
      }

      const brunoVarInfo = renderVarInfo(token, options);
      if (brunoVarInfo) {
        showPopup(cm, box, brunoVarInfo);
      }
    }
  }

  function showPopup(cm: any, box: any, brunoVarInfo: any) {
    // If there's already an active popup, remove it first
    if (activePopup && activePopup.parentNode) {
      activePopup.parentNode.removeChild(activePopup);
      activePopup = null;
    }

    const popup = document.createElement('div');
    popup.className = 'CodeMirror-brunoVarInfo';
    popup.appendChild(brunoVarInfo);
    document.body.appendChild(popup);

    // Track this popup as the active one
    activePopup = popup;

    const popupBox = popup.getBoundingClientRect();
    const popupStyle = (popup as ExtendedHTMLDivElement).currentStyle || window.getComputedStyle(popup);
    const popupWidth
      = popupBox.right - popupBox.left + parseFloat(popupStyle.marginLeft) + parseFloat(popupStyle.marginRight);
    const popupHeight
      = popupBox.bottom - popupBox.top + parseFloat(popupStyle.marginTop) + parseFloat(popupStyle.marginBottom);

    const GAP_REM = 0.5;
    const EDGE_MARGIN_REM = 0.9375;

    // Position below the trigger by default with gap
    let topPos = box.bottom + (GAP_REM * 16);

    if (popupHeight > window.innerHeight - box.bottom - (EDGE_MARGIN_REM * 16) && box.top > window.innerHeight - box.bottom) {
      topPos = box.top - popupHeight - (GAP_REM * 16);
    }

    if (topPos < 0) {
      topPos = box.bottom + (GAP_REM * 16);
    }

    // Horizontal positioning - align to left of trigger
    let leftPos = box.left;

    if (leftPos + popupWidth > window.innerWidth - (EDGE_MARGIN_REM * 16)) {
      leftPos = window.innerWidth - popupWidth - (EDGE_MARGIN_REM * 16);
    }

    if (leftPos < 0) {
      leftPos = 0;
    }

    popup.style.opacity = '1';
    popup.style.top = `${topPos / 16}rem`;
    popup.style.left = `${leftPos / 16}rem`;

    let popupTimeout: any;

    const onMouseOverPopup = function () {
      clearTimeout(popupTimeout);
    };

    const onMouseOut = function () {
      clearTimeout(popupTimeout);
      popupTimeout = setTimeout(hidePopup, 500);
    };

    const hidePopup = function () {
      CodeMirror.off(popup, 'mouseover', onMouseOverPopup);
      CodeMirror.off(popup, 'mouseout', onMouseOut);
      CodeMirror.off(cm.getWrapperElement(), 'mouseout', onMouseOut);
      CodeMirror.off(cm, 'change', onEditorChange);

      const valueContainer = popup.querySelector('.var-value-container') as ExtendedElement | null;
      if (valueContainer) {
        if (valueContainer._autoCompleteCleanup) {
          valueContainer._autoCompleteCleanup();
          valueContainer._autoCompleteCleanup = undefined;
        }

        if (valueContainer._maskedEditor) {
          valueContainer._maskedEditor.destroy();
          valueContainer._maskedEditor = undefined;
        }

        if (valueContainer._cmEditor) {
          (valueContainer._cmEditor as { getWrapperElement: () => HTMLElement }).getWrapperElement().remove();
          valueContainer._cmEditor = undefined;
        }
      }

      if (activePopup === popup) {
        activePopup = null;
      }

      if (popup.style.opacity) {
        popup.style.opacity = '0';
        setTimeout(function () {
          if (popup.parentNode) {
            popup.parentNode.removeChild(popup);
          }
        }, 600);
      } else if (popup.parentNode) {
        popup.parentNode.removeChild(popup);
      }
    };

    // Hide popup when user types in the main editor
    const onEditorChange = function () {
      hidePopup();
    };

    CodeMirror.on(popup, 'mouseover', onMouseOverPopup);
    CodeMirror.on(popup, 'mouseout', onMouseOut);
    CodeMirror.on(cm.getWrapperElement(), 'mouseout', onMouseOut);
    CodeMirror.on(cm, 'change', onEditorChange);
  }
}

export const extractVariableInfo = (str: any, variables: any) => {
  let variableName;
  let variableValue;

  if (!str || !str.length || typeof str !== 'string') {
    return { variableName, variableValue };
  }

  // Regex to match double brace variable syntax: {{variableName}}
  const DOUBLE_BRACE_PATTERN = /\{\{([^}]+)\}\}/;

  if (DOUBLE_BRACE_PATTERN.test(str)) {
    variableName = str.replace('{{', '').replace('}}', '').trim();
    // Don't return empty variable names
    if (!variableName) {
      return { variableName: undefined, variableValue: undefined };
    }
    variableValue = interpolate(get(variables, variableName), variables);
  } else if (str.startsWith('/:')) {
    variableName = str.replace('/:', '').trim();
    // Don't return empty variable names
    if (!variableName) {
      return { variableName: undefined, variableValue: undefined };
    }
    variableValue = variables?.pathParams?.[variableName];
  } else if (str.startsWith('{{') && str.endsWith('}}')) {
    // These don't match the pattern but look like variables
    return { variableName: undefined, variableValue: undefined };
  } else {
    // direct variable reference (e.g., for numeric values in JSON mode or plain variable names)
    variableName = str;
    variableValue = interpolate(get(variables, variableName), variables);
  }

  return { variableName, variableValue };
};
