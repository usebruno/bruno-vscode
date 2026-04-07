/**
 *  Copyright (c) 2021 GraphQL Contributors.
 *
 *  This source code is licensed under the MIT license found in the
 *  LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import isEqual from 'lodash/isEqual';
import MD from 'markdown-it';
import { format } from 'prettier/standalone';
import * as prettierPluginGraphql from 'prettier/plugins/graphql';
import { getAllVariables } from 'utils/collections';
import { defineCodeMirrorBrunoVariablesMode } from 'utils/common/codemirror';
import toast from 'react-hot-toast';
import StyledWrapper from './StyledWrapper';
import { IconWand } from '@tabler/icons';

import onHasCompletion from './onHasCompletion';
import { setupLinkAware } from 'utils/codemirror/linkAware';
import type { Collection } from '@bruno-types';

const CodeMirror = require('codemirror');

const md = new MD();
const AUTO_COMPLETE_AFTER_KEY = /^[a-zA-Z0-9_@(]$/;

interface QueryEditorProps {
  value?: string;
  collection?: Collection;
  item?: any;
  theme?: 'dark' | 'light';
  editorTheme?: string;
  readOnly?: boolean;
  schema?: unknown;
  validationRules?: unknown[] | null;
  externalFragments?: unknown;
  onRun?: () => void;
  onSave?: () => void;
  onEdit?: (value: string) => void;
  onClickReference?: (reference: unknown) => void;
  onCopyQuery?: () => void;
  onPrettifyQuery?: () => void;
  onMergeQuery?: () => void;
  onHintInformationRender?: (element: HTMLElement) => void;
  font?: string;
  fontSize?: number;
}

interface QueryEditorState {}

export default class QueryEditor extends React.Component<QueryEditorProps, QueryEditorState> {
  _node: any;
  cachedValue: any;
  editor: any;
  ignoreChangeEvent: boolean;
  variables: Record<string, unknown>;
  constructor(props: QueryEditorProps) {
    super(props);

    // Keep a cached version of the value, this cache will be updated when the
    // editor is updated, which can later be used to protect the editor from
    // unnecessary updates during the update lifecycle.
    this.cachedValue = props.value || '';
    this.variables = {};
  }

  componentDidMount() {
    const editor = (this.editor = CodeMirror(this._node, {
      value: this.props.value || '',
      lineNumbers: true,
      tabSize: 2,
      mode: 'graphql',
      brunoVarInfo: {
        variables: getAllVariables(this.props.collection, this.props.item)
      },
      theme: this.props.theme === 'dark' ? 'monokai' : 'default',
      keyMap: 'sublime',
      autoCloseBrackets: true,
      matchBrackets: true,
      showCursorWhenSelecting: true,
      scrollbarStyle: 'overlay',
      readOnly: this.props.readOnly ? 'nocursor' : false,
      foldGutter: {
        minFoldSize: 4
      },
      lint: {
        schema: this.props.schema,
        validationRules: this.props.validationRules ?? null,
        // linting accepts string or FragmentDefinitionNode[]
        externalFragments: this.props?.externalFragments
      },
      hintOptions: {
        schema: this.props.schema,
        closeOnUnfocus: false,
        completeSingle: false,
        container: this._node,
        externalFragments: this.props?.externalFragments
      },
      info: {
        schema: this.props.schema,
        renderDescription: (text: any) => md.render(text),
        onClick: (reference: any) => this.props.onClickReference && this.props.onClickReference(reference)
      },
      jump: {
        schema: this.props.schema,
        onClick: (reference: any) => this.props.onClickReference && this.props.onClickReference(reference)
      },
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
      extraKeys: {
        'Cmd-Space': () => editor.showHint({ completeSingle: true, container: this._node }),
        'Ctrl-Space': () => editor.showHint({ completeSingle: true, container: this._node }),
        'Alt-Space': () => editor.showHint({ completeSingle: true, container: this._node }),
        'Shift-Space': () => editor.showHint({ completeSingle: true, container: this._node }),
        'Shift-Alt-Space': () => editor.showHint({ completeSingle: true, container: this._node }),
        'Cmd-Enter': () => {
          if (this.props.onRun) {
            this.props.onRun();
          }
        },
        'Ctrl-Enter': () => {
          if (this.props.onRun) {
            this.props.onRun();
          }
        },
        'Shift-Ctrl-C': () => {
          if (this.props.onCopyQuery) {
            this.props.onCopyQuery();
          }
        },
        'Shift-Ctrl-P': () => {
          if (this.props.onPrettifyQuery) {
            this.props.onPrettifyQuery();
          }
        },
        /* Shift-Ctrl-P is hard coded in Firefox for private browsing so adding an alternative to Prettify */
        'Shift-Ctrl-F': () => {
          if (this.props.onPrettifyQuery) {
            this.props.onPrettifyQuery();
          }
        },
        'Shift-Ctrl-M': () => {
          if (this.props.onMergeQuery) {
            this.props.onMergeQuery();
          }
        },
        'Cmd-S': () => {},
        'Ctrl-S': () => {},
        'Cmd-F': 'findPersistent',
        'Ctrl-F': 'findPersistent'
      }
    }));
    if (editor) {
      editor.on('change', this._onEdit);
      editor.on('keyup', this._onKeyUp);
      editor.on('hasCompletion', this._onHasCompletion);
      editor.on('beforeChange', this._onBeforeChange);
    }
    this.addOverlay();

    setupLinkAware(editor);
  }

  componentDidUpdate(prevProps: QueryEditorProps) {
    // user-input changes which could otherwise result in an infinite
    // event loop.
    this.ignoreChangeEvent = true;
    if (this.props.schema !== prevProps.schema && this.editor) {
      this.editor.options.lint.schema = this.props.schema;
      this.editor.options.hintOptions.schema = this.props.schema;
      this.editor.options.info.schema = this.props.schema;
      this.editor.options.jump.schema = this.props.schema;
      CodeMirror.signal(this.editor, 'change', this.editor);
    }
    if (this.props.value !== prevProps.value && this.props.value !== this.cachedValue && this.editor) {
      this.cachedValue = this.props.value;
      this.editor.setValue(this.props.value);
    }

    if (this.props.theme !== prevProps.theme && this.editor) {
      this.editor.setOption('theme', this.props.theme === 'dark' ? 'monokai' : 'default');
    }
    let variables = getAllVariables(this.props.collection, this.props.item);
    // Use shallow key comparison to avoid stack overflow from deep isEqual on nested objects
    const variablesChanged = !this.variables ||
      Object.keys(variables).length !== Object.keys(this.variables).length ||
      Object.keys(variables).some(key => {
        const newVal = variables[key];
        const oldVal = this.variables[key];
        if (typeof newVal !== 'object' || newVal === null) {
          return newVal !== oldVal;
        }
        return false;
      });
    if (variablesChanged) {
      this.editor.options.brunoVarInfo.variables = variables;
      this.addOverlay();
    }
    this.ignoreChangeEvent = false;
  }

  componentWillUnmount() {
    if (this.editor) {
      if (this.editor?._destroyLinkAware) {
        this.editor._destroyLinkAware();
      }
      this.editor.off('change', this._onEdit);
      this.editor.off('keyup', this._onKeyUp);
      this.editor.off('hasCompletion', this._onHasCompletion);
      this.editor = null;
    }
  }

  beautifyRequestBody = async () => {
    try {
      const prettyQuery = await format(this.props.value || '', {
        parser: 'graphql',
        plugins: [prettierPluginGraphql]
      });

      this.editor.setValue(prettyQuery);
      toast.success('Query prettified');
    } catch (e) {
      toast.error('Error occurred while prettifying GraphQL query');
    }
  };

  addOverlay = () => {
  };

  render() {
    return (
      <>
        <StyledWrapper
          className="h-full w-full  flex flex-col relative graphiql-container"
          aria-label="Query Editor"
          font={this.props.font}
          fontSize={this.props.fontSize}
          ref={(node) => {
            this._node = node;
          }}
        >
          <button
            className="btn-add-param text-link px-4 py-4 select-none absolute top-0 right-0 z-10"
            onClick={this.beautifyRequestBody}
            title="prettify"
          >
            <IconWand size={20} strokeWidth={1.5} />
          </button>
        </StyledWrapper>
      </>
    );
  }

  _onKeyUp = (_cm: any, e: any) => {
    if (e.metaKey || e.ctrlKey || e.altKey) {
      return;
    }
    if (AUTO_COMPLETE_AFTER_KEY.test(e.key) && this.editor) {
      this.editor.execCommand('autocomplete');
    }
  };

  _onEdit = () => {
    if (!this.ignoreChangeEvent && this.editor) {
      this.cachedValue = this.editor.getValue();
      if (this.props.onEdit) {
        this.props.onEdit(this.cachedValue);
      }
    }
  };

  /**
   * Render a custom UI for CodeMirror's hint which includes additional info
   * about the type and description for the selected context.
   */
  _onHasCompletion = (cm: any, data: any) => {
    onHasCompletion(cm, data, this.props.onHintInformationRender);
  };

  _onBeforeChange(_instance: any, change: any) {
    const normalizeWhitespace = (line: any) => {
      // Unicode whitespace characters that break the interface.
      const invalidCharacters = Array.from({ length: 11 }, (_, i) => {
        return String.fromCharCode(0x2000 + i);
      }).concat(['\u2028', '\u2029', '\u202f', '\u00a0']);

      const sanitizeRegex = new RegExp('[' + invalidCharacters.join('') + ']', 'g');
      return line.replace(sanitizeRegex, ' ');
    };

    // The update function is only present on non-redo, non-undo events.
    if (change.origin === 'paste') {
      const text = change.text.map(normalizeWhitespace);
      change.update(change.from, change.to, text);
    }
  }
}
