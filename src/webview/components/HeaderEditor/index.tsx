import React, { useCallback } from 'react';
import SingleLineEditor from 'components/SingleLineEditor';
import { IconAlertCircle } from '@tabler/icons';
import { Tooltip } from 'react-tooltip';
import { headers as StandardHTTPHeaders } from 'know-your-http-well';
import { MimeTypes } from 'utils/codemirror/autocompleteConstants';

const headerNameRegex = /^[^\s\r\n]*$/;
const headerValueRegex = /^[^\r\n]*$/;

export const headerAutoCompleteList = StandardHTTPHeaders.map((e: any) => e.header);

export const getHeaderRowError = (row: any, _index: any, key: any): string | null => {
  if (key === 'name') {
    if (!row.name || row.name.trim() === '') return null;
    if (!headerNameRegex.test(row.name)) {
      return 'Header name cannot contain spaces or newlines';
    }
  }
  if (key === 'value') {
    if (!row.value) return null;
    if (!headerValueRegex.test(row.value)) {
      return 'Header value cannot contain newlines';
    }
  }
  return null;
};

interface HeaderEditorProps {
  value: string;
  theme: any;
  onSave: () => void;
  onChange: (value: string) => void;
  onRun?: () => void;
  collection: any;
  item?: any;
  placeholder?: string;
  type: 'name' | 'value';
  rowUid?: string;
  isLastEmptyRow?: boolean;
}

const HeaderEditor = ({
  value,
  theme,
  onSave,
  onChange,
  onRun,
  collection,
  item,
  placeholder,
  type,
  rowUid,
  isLastEmptyRow
}: HeaderEditorProps) => {
  const error = type === 'name'
    ? (value && !headerNameRegex.test(value) ? 'Header name cannot contain spaces or newlines' : null)
    : (value && !headerValueRegex.test(value) ? 'Header value cannot contain newlines' : null);

  const handleChange = type === 'name'
    ? (newValue: string) => onChange(newValue.replace(/[\r\n]/g, ''))
    : onChange;

  return (
    <div className="flex items-center w-full">
      <div className="flex-1 min-w-0">
        <SingleLineEditor
          value={value || ''}
          theme={theme}
          onSave={onSave}
          onChange={handleChange}
          onRun={onRun}
          autocomplete={type === 'name' ? headerAutoCompleteList : MimeTypes}
          collection={collection}
          item={item}
          placeholder={placeholder}
        />
      </div>
      {error && !isLastEmptyRow && (
        <span className="ml-1 shrink-0">
          <IconAlertCircle
            data-tooltip-id={`error-${rowUid}-${type}`}
            className="text-red-600 cursor-pointer"
            size={20}
          />
          <Tooltip className="tooltip-mod" id={`error-${rowUid}-${type}`} html={error} />
        </span>
      )}
    </div>
  );
};

export default HeaderEditor;
