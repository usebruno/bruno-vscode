import React, { Component } from 'react';
import isEqual from 'lodash/isEqual';
import { getAllVariables } from 'utils/collections';
import { defineCodeMirrorBrunoVariablesMode } from 'utils/common/codemirror';
import { setupAutoComplete } from 'utils/codemirror/autocomplete';
import { MaskedEditor } from 'utils/common/masked-editor';
import StyledWrapper from './StyledWrapper';
import { setupLinkAware } from 'utils/codemirror/linkAware';
import { IconEye, IconEyeOff } from '@tabler/icons';
import type { Collection, Item } from '@bruno-types/collection';

const CodeMirror = require('codemirror');

interface MultiLineEditorProps {
  value?: string;
  collection?: any;
  item?: Item;
  theme?: 'dark' | 'light';
  placeholder?: string;
  readOnly?: boolean;
  isSecret?: boolean;
  enableBrunoVarInfo?: boolean;
  onRun?: () => void;
  onSave?: () => void;
  onChange?: (value: string) => void;
  autocomplete?: string[];
  className?: string;
  allowNewlines?: boolean;
}

interface MultiLineEditorState {
  maskInput: boolean;
}

class MultiLineEditor extends Component<MultiLineEditorProps, MultiLineEditorState> {
  brunoAutoCompleteCleanup: any;
  cachedValue: any;
  editor: any;
  editorRef: any;
  ignoreChangeEvent: any;
  maskedEditor: any;
  readOnly: boolean;
  variables: Record<string, unknown>;
  constructor(props: MultiLineEditorProps) {
    super(props);
    // Keep a cached version of the value, this cache will be updated when the
    // editor is updated, which can later be used to protect the editor from
    // unnecessary updates during the update lifecycle.
    this.cachedValue = props.value || '';
    this.editorRef = React.createRef();
    this.variables = {};
    this.readOnly = props.readOnly || false;

    this.state = {
      maskInput: props.isSecret || false // Always mask the input by default (if it's a secret)
    };
  }

  componentDidMount() {
    /** @type {import("codemirror").Editor} */
    const variables = getAllVariables(this.props.collection, this.props.item);

    this.editor = CodeMirror(this.editorRef.current, {
      lineWrapping: false,
      lineNumbers: false,
      theme: this.props.theme === 'dark' ? 'monokai' : 'default',
      placeholder: this.props.placeholder,
      mode: 'brunovariables',
      brunoVarInfo: this.props.enableBrunoVarInfo !== false ? {
        variables,
        collection: this.props.collection,
        item: this.props.item
      } : false,
      readOnly: this.props.readOnly,
      tabindex: 0,
      extraKeys: {
        'Ctrl-Enter': () => {
          if (this.props.onRun) {
            this.props.onRun();
          }
        },
        'Cmd-Enter': () => {
          if (this.props.onRun) {
            this.props.onRun();
          }
        },
        'Cmd-S': () => {},
        'Ctrl-S': () => {},
        'Cmd-F': () => {},
        'Ctrl-F': () => {},
        'Tab': false,
        'Shift-Tab': false
      }
    });

    const getAllVariablesHandler = () => getAllVariables(this.props.collection, this.props.item);
    const getAnywordAutocompleteHints = () => this.props.autocomplete || [];

    const autoCompleteOptions = {
      showHintsFor: ['variables'],
      getAllVariables: getAllVariablesHandler,
      getAnywordAutocompleteHints
    };

    this.brunoAutoCompleteCleanup = setupAutoComplete(
      this.editor,
      autoCompleteOptions
    );

    setupLinkAware(this.editor);

    this.editor.setValue(String(this.props.value) || '');
    this.editor.on('change', this._onEdit);
    this.addOverlay(variables);

    this.setState({ maskInput: this.props.isSecret });
    this._enableMaskedEditor(this.props.isSecret);
  }

  _onEdit = () => {
    if (!this.ignoreChangeEvent && this.editor) {
      this.cachedValue = this.editor.getValue();
      if (this.props.onChange) {
        this.props.onChange(this.cachedValue);
      }
    }
  };

  /** Enable or disable masking the rendered content of the editor */
  _enableMaskedEditor = (enabled: any) => {
    if (typeof enabled !== 'boolean') return;

    if (enabled == true) {
      if (!this.maskedEditor) this.maskedEditor = new MaskedEditor(this.editor, '*');
      this.maskedEditor.enable();
    } else {
      if (this.maskedEditor) {
        this.maskedEditor.disable();
        this.maskedEditor.destroy();
        this.maskedEditor = null;
      }
    }
  };

  componentDidUpdate(prevProps: MultiLineEditorProps) {
    // user-input changes which could otherwise result in an infinite
    // event loop.
    this.ignoreChangeEvent = true;

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
      if (this.props.enableBrunoVarInfo !== false && this.editor.options.brunoVarInfo) {
        this.editor.options.brunoVarInfo.variables = variables;
      }
      this.addOverlay(variables);
    }

    // (e.g., activeEnvironmentUid, environment variables, draft changes)
    if (this.props.enableBrunoVarInfo !== false && this.editor.options.brunoVarInfo) {
      this.editor.options.brunoVarInfo.collection = this.props.collection;
      this.editor.options.brunoVarInfo.item = this.props.item;
    }
    if (this.props.theme !== prevProps.theme && this.editor) {
      this.editor.setOption('theme', this.props.theme === 'dark' ? 'monokai' : 'default');
    }
    if (this.props.readOnly !== prevProps.readOnly && this.editor) {
      this.editor.setOption('readOnly', this.props.readOnly);
    }
    if (this.props.value !== prevProps.value && this.props.value !== this.cachedValue && this.editor) {
      const cursor = this.editor.getCursor();
      this.cachedValue = String(this.props.value);
      this.editor.setValue(String(this.props.value) || '');
      this.editor.setCursor(cursor);
    }
    if (this.props.isSecret !== prevProps.isSecret) {
      // If the secret flag has changed, update the editor to reflect the change
      this._enableMaskedEditor(this.props.isSecret);
      this.setState({ maskInput: this.props.isSecret });
    }
    if (this.props.readOnly !== prevProps.readOnly && this.editor) {
      this.editor.setOption('readOnly', this.props.readOnly || false);
    }
    this.ignoreChangeEvent = false;
  }

  componentWillUnmount() {
    if (this.brunoAutoCompleteCleanup) {
      this.brunoAutoCompleteCleanup();
    }
    if (this.editor?._destroyLinkAware) {
      this.editor._destroyLinkAware();
    }
    if (this.maskedEditor) {
      this.maskedEditor.destroy();
      this.maskedEditor = null;
    }
    this.editor.getWrapperElement().remove();
  }

  addOverlay = (variables: any) => {
    this.variables = variables;
    defineCodeMirrorBrunoVariablesMode(variables, 'text/plain', false, true);
    this.editor.setOption('mode', 'brunovariables');
  };

  /**
   * @brief Toggle the visibility of the secret value
   */
  toggleVisibleSecret = () => {
    const isVisible = !this.state.maskInput;
    this.setState({ maskInput: isVisible });
    this._enableMaskedEditor(isVisible);
  };

  /**
   * @brief Eye icon to show/hide the secret value
   * @returns ReactComponent The eye icon
   */
  secretEye = (isSecret: any) => {
    return isSecret === true ? (
      <button className="mx-2" onClick={() => this.toggleVisibleSecret()}>
        {this.state.maskInput === true ? (
          <IconEyeOff size={18} strokeWidth={2} />
        ) : (
          <IconEye size={18} strokeWidth={2} />
        )}
      </button>
    ) : null;
  };

  render() {
    const wrapperClass = `multi-line-editor grow ${this.props.readOnly ? 'read-only' : ''}`;
    return (
      <div className={`flex flex-row justify-between w-full overflow-x-auto ${this.props.className}`}>
        <StyledWrapper ref={this.editorRef} className={wrapperClass} />
        {this.secretEye(this.props.isSecret)}
      </div>
    );
  }
}
export default MultiLineEditor;
