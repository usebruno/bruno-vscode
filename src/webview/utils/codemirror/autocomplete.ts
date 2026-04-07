import React from 'react';
import { mockDataFunctions } from '@usebruno/common';

const CodeMirror = require('codemirror');

interface AllVariables {
  process?: {
    env?: Record<string, string>;
  };
  [key: string]: unknown;
}

interface AutoCompleteOptions {
  showHintsFor?: string[];
  showHintsOnClick?: boolean;
  getAllVariables?: () => AllVariables;
  getAnywordAutocompleteHints?: () => string[];
}

// Static API hints - Bruno JavaScript API (subgrouped by category)
const STATIC_API_HINTS = {
  req: [
    'req',
    'req.url',
    'req.method',
    'req.headers',
    'req.body',
    'req.timeout',
    'req.getUrl()',
    'req.setUrl(url)',
    'req.getMethod()',
    'req.getAuthMode()',
    'req.setMethod(method)',
    'req.getHeader(name)',
    'req.getHeaders()',
    'req.setHeader(name, value)',
    'req.setHeaders(data)',
    'req.getBody()',
    'req.setBody(data)',
    'req.setMaxRedirects(maxRedirects)',
    'req.getTimeout()',
    'req.setTimeout(timeout)',
    'req.getExecutionMode()',
    'req.getName()',
    'req.getTags()',
    'req.disableParsingResponseJson()',
    'req.onFail(function(err) {})'
  ],
  res: [
    'res',
    'res.status',
    'res.statusText',
    'res.headers',
    'res.body',
    'res.responseTime',
    'res.url',
    'res.getStatus()',
    'res.getStatusText()',
    'res.getHeader(name)',
    'res.getHeaders()',
    'res.getBody()',
    'res.setBody(data)',
    'res.getResponseTime()',
    'res.getSize()',
    'res.getSize().header',
    'res.getSize().body',
    'res.getSize().total',
    'res.getUrl()'
  ],
  bru: [
    'bru',
    'bru.cwd()',
    'bru.getEnvName()',
    'bru.getProcessEnv(key)',
    'bru.hasEnvVar(key)',
    'bru.getEnvVar(key)',
    'bru.getFolderVar(key)',
    'bru.getCollectionVar(key)',
    'bru.setEnvVar(key, value)',
    'bru.setEnvVar(key, value, options)',
    'bru.deleteEnvVar(key)',
    'bru.hasVar(key)',
    'bru.getVar(key)',
    'bru.setVar(key,value)',
    'bru.deleteVar(key)',
    'bru.deleteAllVars()',
    'bru.setNextRequest(requestName)',
    'bru.getRequestVar(key)',
    'bru.runRequest(requestPathName)',
    'bru.getAssertionResults()',
    'bru.getTestResults()',
    'bru.sleep(ms)',
    'bru.getCollectionName()',
    'bru.getGlobalEnvVar(key)',
    'bru.setGlobalEnvVar(key, value)',
    'bru.runner',
    'bru.runner.setNextRequest(requestName)',
    'bru.runner.skipRequest()',
    'bru.runner.stopExecution()',
    'bru.interpolate(str)',
    'bru.cookies',
    'bru.cookies.jar()',
    'bru.cookies.jar().getCookie(url, name, callback)',
    'bru.cookies.jar().getCookies(url, callback)',
    'bru.cookies.jar().setCookie(url, name, value, callback)',
    'bru.cookies.jar().setCookie(url, cookieObject, callback)',
    'bru.cookies.jar().setCookies(url, cookiesArray, callback)',
    'bru.cookies.jar().clear(callback)',
    'bru.cookies.jar().deleteCookies(url, callback)',
    'bru.cookies.jar().deleteCookie(url, name, callback)',
    'bru.utils',
    'bru.utils.minifyJson(json)',
    'bru.utils.minifyXml(xml)'
  ]
};

// Mock data functions - prefixed with $
const MOCK_DATA_HINTS = Object.keys(mockDataFunctions).map((key) => `$${key}`);

// Constants for word pattern matching
const WORD_PATTERN = /[\w.$-/]/;
const VARIABLE_PATTERN = /\{\{([\w$.-]*)$/;
const NON_CHARACTER_KEYS = /^(?!Shift|Tab|Enter|Escape|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Meta|Alt|Home|End\s)\w*/;

/**
 * Generate progressive hints for a given full hint
 * @param {string} fullHint - The complete hint string
 * @returns {string[]} Array of progressive hints
 */
const generateProgressiveHints = (fullHint: any) => {
  const parts = fullHint.split('.');
  const progressiveHints = [];

  for (let i = 1; i <= parts.length; i++) {
    progressiveHints.push(parts.slice(0, i).join('.'));
  }

  return progressiveHints;
};

/**
 * Check if a variable key should be skipped
 * @param {string} key - The variable key to check
 * @returns {boolean} True if the key should be skipped
 */
const shouldSkipVariableKey = (key: any) => {
  return key === 'pathParams' || key === 'maskedEnvVariables' || key === 'process';
};

/**
 * Transform variables object into flat hint list
 * @param {Object} allVariables - All available variables
 * @returns {string[]} Array of variable hints
 */
const transformVariablesToHints = (allVariables: AllVariables = {}) => {
  const hints: string[] = [];

  Object.keys(allVariables).forEach((key) => {
    if (!shouldSkipVariableKey(key)) {
      hints.push(key);
    }
  });

  if (allVariables.process && allVariables.process.env) {
    Object.keys(allVariables.process.env).forEach((key) => {
      hints.push(`process.env.${key}`);
    });
  }

  return hints;
};

/**
 * Add API hints to categorized hints based on showHintsFor configuration
 * @param {Set} apiHints - Set to add API hints to
 * @param {string[]} showHintsFor - Array of hint types to show
 */
const addApiHintsToSet = (apiHints: any, showHintsFor: any) => {
  const apiTypes = ['req', 'res', 'bru'] as const;

  apiTypes.forEach((apiType) => {
    if (showHintsFor.includes(apiType)) {
      STATIC_API_HINTS[apiType].forEach((hint: any) => {
        generateProgressiveHints(hint).forEach((h) => apiHints.add(h));
      });
    }
  });
};

/**
 * Add variable hints to categorized hints
 * @param {Set} variableHints - Set to add variable hints to
 * @param {Object} allVariables - All available variables
 */
const addVariableHintsToSet = (variableHints: any, allVariables: any) => {
  MOCK_DATA_HINTS.forEach((hint) => {
    generateProgressiveHints(hint).forEach((h) => variableHints.add(h));
  });

  const variableHintsList = transformVariablesToHints(allVariables);
  variableHintsList.forEach((hint: any) => {
    generateProgressiveHints(hint).forEach((h) => variableHints.add(h));
  });
};

/**
 * Add custom hints to categorized hints
 * @param {Set} anywordHints - Set to add custom hints to
 * @param {string[]} customHints - Array of custom hints
 */
const addCustomHintsToSet = (anywordHints: any, customHints: any) => {
  if (customHints && Array.isArray(customHints)) {
    customHints.forEach((hint) => {
      generateProgressiveHints(hint).forEach((h) => anywordHints.add(h));
    });
  }
};

/**
 * Build categorized hints list from all sources
 * @param {Object} allVariables - All available variables
 * @param {string[]} anywordAutocompleteHints - Custom autocomplete hints
 * @param {Object} options - Configuration options
 * @returns {Object} Categorized hints object
 */
const buildCategorizedHintsList = (allVariables: AllVariables = {}, anywordAutocompleteHints: string[] = [], options: AutoCompleteOptions = {}) => {
  const categorizedHints = {
    api: new Set(),
    variables: new Set(),
    anyword: new Set()
  };

  const showHintsFor = options.showHintsFor || [];

  addApiHintsToSet(categorizedHints.api, showHintsFor);
  addVariableHintsToSet(categorizedHints.variables, allVariables);
  addCustomHintsToSet(categorizedHints.anyword, anywordAutocompleteHints);

  return {
    api: Array.from(categorizedHints.api).sort(),
    variables: Array.from(categorizedHints.variables).sort(),
    anyword: Array.from(categorizedHints.anyword).sort()
  };
};

/**
 * Calculate replacement positions for variable context
 * @param {Object} cursor - Current cursor position
 * @param {Object} startPos - Start position of variable
 * @param {string} wordMatch - The matched word
 * @returns {Object} From and to positions for replacement
 */
const calculateVariableReplacementPositions = (cursor: any, startPos: any, wordMatch: any) => {
  let replaceFrom, replaceTo;

  if (wordMatch.endsWith('.')) {
    replaceFrom = cursor;
    replaceTo = cursor;
  } else {
    const lastDotIndex = wordMatch.lastIndexOf('.');
    if (lastDotIndex !== -1) {
      replaceFrom = { line: cursor.line, ch: startPos.ch + lastDotIndex + 1 };
      replaceTo = cursor;
    } else {
      replaceFrom = startPos;
      replaceTo = cursor;
    }
  }

  return { replaceFrom, replaceTo };
};

/**
 * Calculate replacement positions for regular word context
 * @param {Object} cursor - Current cursor position
 * @param {number} start - Start position of word
 * @param {number} end - End position of word
 * @param {string} word - The matched word
 * @returns {Object} From and to positions for replacement
 */
const calculateWordReplacementPositions = (cursor: any, start: any, end: any, word: any) => {
  let replaceFrom, replaceTo;

  if (word.endsWith('.')) {
    replaceFrom = { line: cursor.line, ch: end };
    replaceTo = cursor;
  } else {
    const lastDotIndex = word.lastIndexOf('.');
    if (lastDotIndex !== -1) {
      replaceFrom = { line: cursor.line, ch: start + lastDotIndex + 1 };
      replaceTo = { line: cursor.line, ch: end };
    } else {
      replaceFrom = { line: cursor.line, ch: start };
      replaceTo = { line: cursor.line, ch: end };
    }
  }

  return { replaceFrom, replaceTo };
};

/**
 * Determine context based on word prefix
 * @param {string} word - The word to analyze
 * @returns {string} The determined context
 */
const determineWordContext = (word: any) => {
  if (word.startsWith('req') || word.startsWith('res') || word.startsWith('bru')) {
    return 'api';
  }
  return 'anyword';
};

/**
 * Extract word from current line with boundaries
 * @param {string} currentLine - The current line content
 * @param {number} cursorPosition - Current cursor position
 * @returns {Object|null} Word information or null if no word found
 */
const extractWordFromLine = (currentLine: any, cursorPosition: any) => {
  let start = cursorPosition;
  let end = start;

  while (end < currentLine.length && WORD_PATTERN.test(currentLine.charAt(end))) {
    ++end;
  }
  while (start && WORD_PATTERN.test(currentLine.charAt(start - 1))) {
    --start;
  }

  if (start === end) {
    return null;
  }

  return {
    word: currentLine.slice(start, end),
    start,
    end
  };
};

/**
 * Get current word being typed at cursor position with context information
 * @param {Object} cm - CodeMirror instance
 * @returns {Object|null} Word information with context or null
 */
const getCurrentWordWithContext = (cm: any) => {
  const cursor = cm.getCursor();
  const currentLine = cm.getLine(cursor.line);
  const currentString = cm.getRange({ line: cursor.line, ch: 0 }, cursor);

  const variableMatch = currentString.match(VARIABLE_PATTERN);
  if (variableMatch) {
    const wordMatch = variableMatch[1];
    const startPos = { line: cursor.line, ch: currentString.lastIndexOf('{{') + 2 };
    const { replaceFrom, replaceTo } = calculateVariableReplacementPositions(cursor, startPos, wordMatch);

    return {
      word: wordMatch,
      from: replaceFrom,
      to: replaceTo,
      context: 'variables',
      requiresBraces: true
    };
  }

  const wordInfo = extractWordFromLine(currentLine, cursor.ch);
  if (!wordInfo) {
    return null;
  }

  const { word, start, end } = wordInfo;
  const { replaceFrom, replaceTo } = calculateWordReplacementPositions(cursor, start, end, word);
  const context = determineWordContext(word);

  return {
    word,
    from: replaceFrom,
    to: replaceTo,
    context,
    requiresBraces: false
  };
};

/**
 * Extract next segment suggestions from filtered hints
 * @param {string[]} filteredHints - Pre-filtered hints
 * @param {string} currentInput - Current user input
 * @returns {string[]} Array of suggestion segments
 */
const extractNextSegmentSuggestions = (filteredHints: any, currentInput: any) => {
  const suggestions = new Set();

  filteredHints.forEach((hint: any) => {
    if (!hint.toLowerCase().startsWith(currentInput.toLowerCase())) {
      return;
    }

    if (hint.toLowerCase() === currentInput.toLowerCase()) {
      suggestions.add(hint.substring(hint.lastIndexOf('.') + 1));
      return;
    }

    const inputLength = currentInput.length;

    if (currentInput.endsWith('.')) {
      const afterDot = hint.substring(inputLength);
      const nextDot = afterDot.indexOf('.');
      const segment = nextDot === -1 ? afterDot : afterDot.substring(0, nextDot);
      suggestions.add(segment);
    } else {
      const lastDotInInput = currentInput.lastIndexOf('.');
      const currentSegmentStart = lastDotInInput + 1;
      const nextDotAfterInput = hint.indexOf('.', currentSegmentStart);
      const segment = nextDotAfterInput === -1
        ? hint.substring(currentSegmentStart)
        : hint.substring(currentSegmentStart, nextDotAfterInput);
      suggestions.add(segment);
    }
  });

  return Array.from(suggestions).sort();
};

/**
 * Extract the relevant part of hints based on user input
 * @param {string[]} filteredHints - Pre-filtered hints
 * @param {string} currentInput - Current user input
 * @returns {string[]} Array of hint parts
 */
const getHintParts = (filteredHints: any, currentInput: any) => {
  if (!filteredHints || filteredHints.length === 0) {
    return [];
  }

  return extractNextSegmentSuggestions(filteredHints, currentInput);
};

/**
 * Get allowed hints based on context and configuration
 * @param {Object} categorizedHints - All categorized hints
 * @param {string} context - Current context
 * @param {string[]} showHintsFor - Allowed hint types
 * @returns {string[]} Array of allowed hints
 */
const getAllowedHintsByContext = (categorizedHints: any, context: any, showHintsFor: any) => {
  let allowedHints: any = [];

  if (context === 'variables' && showHintsFor.includes('variables')) {
    allowedHints = [...categorizedHints.variables];
  } else if (context === 'api') {
    const hasApiHints = showHintsFor.some((hint: any) => ['req', 'res', 'bru'].includes(hint));
    if (hasApiHints) {
      allowedHints = [...categorizedHints.api];
    }
  } else if (context === 'anyword') {
    allowedHints = [...categorizedHints.anyword];
  }

  return allowedHints;
};

/**
 * Filter hints based on current word and allowed hint types
 * @param {Object} categorizedHints - All categorized hints
 * @param {string} currentWord - Current word being typed
 * @param {string} context - Current context
 * @param {string[]} showHintsFor - Allowed hint types
 * @returns {string[]} Filtered hints
 */
const filterHintsByContext = (categorizedHints: any, currentWord: any, context: any, showHintsFor: string[] = []) => {
  if (!currentWord) {
    return [];
  }

  const allowedHints = getAllowedHintsByContext(categorizedHints, context, showHintsFor);

  const filtered = allowedHints.filter((hint: any) => {
    return hint.toLowerCase().startsWith(currentWord.toLowerCase());
  });

  const hintParts = getHintParts(filtered, currentWord);

  return hintParts.slice(0, 50);
};

/**
 * Create hint list for variables context
 * @param {string[]} filteredHints - Filtered hints
 * @param {Object} from - Start position
 * @param {Object} to - End position
 * @returns {Object} Hint object with list and positions
 */
const createVariableHintList = (filteredHints: any, from: any, to: any) => {
  const hintList = filteredHints.map((hint: any) => ({
    text: hint,
    displayText: hint
  }));

  return {
    list: hintList,
    from,
    to
  };
};

/**
 * Create hint list for non-variable contexts
 * @param {string[]} filteredHints - Filtered hints
 * @param {Object} from - Start position
 * @param {Object} to - End position
 * @returns {Object} Hint object with list and positions
 */
const createStandardHintList = (filteredHints: any, from: any, to: any) => {
  return {
    list: filteredHints,
    from,
    to
  };
};

/**
 * Bruno AutoComplete Helper - Main function with context awareness
 * @param {Object} cm - CodeMirror instance
 * @param {Object} allVariables - All available variables
 * @param {string[]} anywordAutocompleteHints - Custom autocomplete hints
 * @param {Object} options - Configuration options
 * @returns {Object|null} Hint object or null
 */
export const getAutoCompleteHints = (cm: any, allVariables: AllVariables = {}, anywordAutocompleteHints: string[] = [], options: AutoCompleteOptions = {}) => {
  if (!allVariables) {
    return null;
  }

  const wordInfo = getCurrentWordWithContext(cm);
  if (!wordInfo) {
    return null;
  }

  const { word, from, to, context, requiresBraces } = wordInfo;
  const showHintsFor = options.showHintsFor || [];

  if (context === 'variables' && !requiresBraces) {
    return null;
  }

  const categorizedHints = buildCategorizedHintsList(allVariables, anywordAutocompleteHints, options);
  const filteredHints = filterHintsByContext(categorizedHints, word, context, showHintsFor);

  if (filteredHints.length === 0) {
    return null;
  }

  if (context === 'variables') {
    return createVariableHintList(filteredHints, from, to);
  }

  return createStandardHintList(filteredHints, from, to);
};

/**
 * Handle click events for autocomplete
 * @param {Object} cm - CodeMirror instance
 * @param {Object} options - Configuration options
 */
const handleClickForAutocomplete = (cm: any, options: AutoCompleteOptions) => {
  const allVariables = options.getAllVariables?.() || {};
  const anywordAutocompleteHints = options.getAnywordAutocompleteHints?.() || [];
  const showHintsFor = options.showHintsFor || [];

  const categorizedHints = buildCategorizedHintsList(allVariables, anywordAutocompleteHints, options);

  // Combine all hints based on showHintsFor configuration
  let allHints: any = [];

  const hasApiHints = showHintsFor.some((hint: any) => ['req', 'res', 'bru'].includes(hint));
  if (hasApiHints) {
    allHints = [...allHints, ...categorizedHints.api];
  }

  if (showHintsFor.includes('variables')) {
    allHints = [...allHints, ...categorizedHints.variables];
  }

  allHints = [...allHints, ...categorizedHints.anyword];

  allHints = [...new Set(allHints)].sort();

  if (allHints.length === 0) {
    return;
  }

  const cursor = cm.getCursor();

  if (cursor.ch > 0) return;

  // Defer showHint to ensure editor is focused
  setTimeout(() => {
    cm.showHint({
      hint: () => ({
        list: allHints,
        from: cursor,
        to: cursor
      }),
      completeSingle: false
    });
  }, 0);
};

/**
 * Handle keyup events for autocomplete
 * @param {Object} cm - CodeMirror instance
 * @param {Event} event - The keyup event
 * @param {Object} options - Configuration options
 */
const handleKeyupForAutocomplete = (cm: any, event: any, options: AutoCompleteOptions) => {
  if (!NON_CHARACTER_KEYS.test(event?.key)) {
    return;
  }

  const allVariables = options.getAllVariables?.() || {};
  const anywordAutocompleteHints = options.getAnywordAutocompleteHints?.() || [];
  const hints = getAutoCompleteHints(cm, allVariables, anywordAutocompleteHints, options);

  if (!hints) {
    if (cm.state.completionActive) {
      cm.state.completionActive.close();
    }
    return;
  }

  cm.showHint({
    hint: () => hints,
    completeSingle: false
  });
};

/**
 * Setup Bruno AutoComplete Helper on a CodeMirror editor
 * @param {Object} editor - CodeMirror editor instance
 * @param {Object} options - Configuration options
 * @returns {Function} Cleanup function
 */
export const setupAutoComplete = (editor: any, options: AutoCompleteOptions = {}) => {
  if (!editor) {
    return;
  }

  const keyupHandler = (cm: any, event: any) => {
    handleKeyupForAutocomplete(cm, event, options);
  };

  editor.on('keyup', keyupHandler);

  const clickHandler = (cm: any) => {
    if (options.showHintsOnClick) {
      handleClickForAutocomplete(cm, options);
    }
  };

  if (options.showHintsOnClick) {
    editor.on('mousedown', clickHandler);
  }

  return () => {
    editor.off('keyup', keyupHandler);
    if (options.showHintsOnClick) {
      editor.off('mousedown', clickHandler);
    }
  };
};

if (!CodeMirror.commands.autocomplete) {
  CodeMirror.commands.autocomplete = (cm: any, hint: any, options: any) => {
    cm.showHint({ hint, ...options });
  };
}
