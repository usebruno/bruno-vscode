import React, { useState, useCallback } from 'react';
import get from 'lodash/get';
import { useDispatch } from 'react-redux';
import { useTheme } from 'providers/Theme';
import { setCollectionHeaders } from 'providers/ReduxStore/slices/collections';
import { saveCollectionSettings } from 'providers/ReduxStore/slices/collections/actions';
import EditableTable from 'components/EditableTable';
import HeaderEditor, { getHeaderRowError } from 'components/HeaderEditor';
import StyledWrapper from './StyledWrapper';
import BulkEditor from 'components/BulkEditor/index';
import Button from 'ui/Button';

const Headers = ({
  collection
}: any) => {
  const dispatch = useDispatch();
  const { storedTheme } = useTheme();
  const headers = collection.draft?.root
    ? get(collection, 'draft.root.request.headers', [])
    : get(collection, 'root.request.headers', []);
  const [isBulkEditMode, setIsBulkEditMode] = useState(false);

  const toggleBulkEditMode = () => {
    setIsBulkEditMode(!isBulkEditMode);
  };

  const handleHeadersChange = useCallback((updatedHeaders: any) => {
    dispatch(setCollectionHeaders({ collectionUid: collection.uid, headers: updatedHeaders }));
  }, [dispatch, collection.uid]);

  const handleSave = () => dispatch(saveCollectionSettings(collection.uid));

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
          collection={collection} rowUid={row.uid} isLastEmptyRow={isLastEmptyRow}
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
      <StyledWrapper className="h-full w-full">
        <div className="text-xs mb-4 text-muted">
          Add request headers that will be sent with every request in this collection.
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
    <StyledWrapper className="h-full w-full">
      <div className="text-xs mb-4 text-muted">
        Add request headers that will be sent with every request in this collection.
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
        <Button type="submit" size="sm" onClick={handleSave} data-testid="collection-settings-save">
          Save
        </Button>
      </div>
    </StyledWrapper>
  );
};

export default Headers;
