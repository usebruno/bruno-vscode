import React, { useState, useCallback } from 'react';
import get from 'lodash/get';
import { useDispatch } from 'react-redux';
import { useTheme } from 'providers/Theme';
import { setFolderHeaders } from 'providers/ReduxStore/slices/collections';
import { saveFolderRoot } from 'providers/ReduxStore/slices/collections/actions';
import EditableTable from 'components/EditableTable';
import HeaderEditor, { getHeaderRowError } from 'components/HeaderEditor';
import StyledWrapper from './StyledWrapper';
import BulkEditor from 'components/BulkEditor/index';
import Button from 'ui/Button';

const Headers = ({
  collection,
  folder
}: any) => {
  const dispatch = useDispatch();
  const { storedTheme } = useTheme();
  const headers = folder.draft
    ? get(folder, 'draft.root.request.headers', [])
    : get(folder, 'root.request.headers', []);
  const [isBulkEditMode, setIsBulkEditMode] = useState(false);

  const toggleBulkEditMode = () => {
    setIsBulkEditMode(!isBulkEditMode);
  };

  const handleHeadersChange = useCallback((updatedHeaders: any) => {
    dispatch(setFolderHeaders({
      collectionUid: collection.uid,
      folderUid: folder.uid,
      headers: updatedHeaders
    }));
  }, [dispatch, collection.uid, folder.uid]);

  const handleSave = () => dispatch(saveFolderRoot(collection.uid, folder.uid));

  const columns = [
    {
      key: 'name',
      name: 'Name',
      isKeyField: true,
      placeholder: 'Name',
      width: '30%',
      render: ({ row, value, onChange, isLastEmptyRow }: any) => (
        <HeaderEditor type="name" value={value} theme={storedTheme} onSave={handleSave} onChange={onChange}
          collection={collection} rowUid={row.uid} isLastEmptyRow={isLastEmptyRow}
          placeholder={isLastEmptyRow ? 'Name' : ''} />
      )
    },
    {
      key: 'value',
      name: 'Value',
      placeholder: 'Value',
      render: ({ row, value, onChange, isLastEmptyRow }: any) => (
        <HeaderEditor type="value" value={value} theme={storedTheme} onSave={handleSave} onChange={onChange}
          collection={collection} item={folder} rowUid={row.uid} isLastEmptyRow={isLastEmptyRow}
          placeholder={isLastEmptyRow ? 'Value' : ''} />
      )
    }
  ];

  const defaultRow = {
    name: '',
    value: '',
    description: ''
  };

  if (isBulkEditMode) {
    return (
      <StyledWrapper className="w-full h-full flex flex-col min-h-0">
        <div className="text-xs mb-4 text-muted shrink-0">
          Request headers that will be sent with every request inside this folder.
        </div>
        <BulkEditor
          params={headers}
          onChange={handleHeadersChange}
          onToggle={toggleBulkEditMode}
          onSave={handleSave}
        />
      </StyledWrapper>
    );
  }

  return (
    <StyledWrapper className="w-full">
      <div className="text-xs mb-4 text-muted">
        Request headers that will be sent with every request inside this folder.
      </div>
      <EditableTable
        columns={columns}
        rows={headers}
        onChange={handleHeadersChange}
        defaultRow={defaultRow}
        getRowError={getHeaderRowError}
      />
      <div className="flex justify-end mt-2">
        <button className="text-link select-none" onClick={toggleBulkEditMode}>
          Bulk Edit
        </button>
      </div>
      <div className="mt-6">
        <Button type="submit" size="sm" onClick={handleSave}>
          Save
        </Button>
      </div>
    </StyledWrapper>
  );
};

export default Headers;
