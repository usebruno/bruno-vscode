import React, { useState, useCallback } from 'react';
import get from 'lodash/get';
import { useDispatch } from 'react-redux';
import { useTheme } from 'providers/Theme';
import { moveRequestHeader, setRequestHeaders } from 'providers/ReduxStore/slices/collections';
import { sendRequest, saveRequest } from 'providers/ReduxStore/slices/collections/actions';
import EditableTable from 'components/EditableTable';
import HeaderEditor, { getHeaderRowError } from 'components/HeaderEditor';
import StyledWrapper from './StyledWrapper';
import BulkEditor from '../../BulkEditor';

const RequestHeaders = ({
  item,
  collection,
  addHeaderText
}: any) => {
  const dispatch = useDispatch();
  const { storedTheme } = useTheme();
  const headers = item.draft ? get(item, 'draft.request.headers') : get(item, 'request.headers');
  const [isBulkEditMode, setIsBulkEditMode] = useState(false);

  const onSave = () => dispatch(saveRequest(item.uid, collection.uid));
  const handleRun = () => dispatch(sendRequest(item, collection.uid));

  const handleHeadersChange = useCallback((updatedHeaders: any) => {
    dispatch(setRequestHeaders({
      collectionUid: collection.uid,
      itemUid: item.uid,
      headers: updatedHeaders
    }));
  }, [dispatch, collection.uid, item.uid]);

  const handleHeaderDrag = useCallback(({
    updateReorderedItem
  }: any) => {
    dispatch(moveRequestHeader({
      collectionUid: collection.uid,
      itemUid: item.uid,
      updateReorderedItem
    }));
  }, [dispatch, collection.uid, item.uid]);

  const toggleBulkEditMode = () => {
    setIsBulkEditMode(!isBulkEditMode);
  };

  const columns = [
    {
      key: 'name',
      name: 'Name',
      isKeyField: true,
      placeholder: 'Name',
      width: '30%',
      render: ({ row, value, onChange, isLastEmptyRow }: any) => (
        <HeaderEditor type="name" value={value} theme={storedTheme} onSave={onSave} onChange={onChange}
          onRun={handleRun} collection={collection} item={item} rowUid={row.uid}
          isLastEmptyRow={isLastEmptyRow} placeholder={isLastEmptyRow ? 'Name' : ''} />
      )
    },
    {
      key: 'value',
      name: 'Value',
      placeholder: 'Value',
      render: ({ row, value, onChange, isLastEmptyRow }: any) => (
        <HeaderEditor type="value" value={value} theme={storedTheme} onSave={onSave} onChange={onChange}
          onRun={handleRun} collection={collection} item={item} rowUid={row.uid}
          isLastEmptyRow={isLastEmptyRow} placeholder={isLastEmptyRow ? 'Value' : ''} />
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
      <StyledWrapper className="w-full h-full mt-3 flex flex-col min-h-0">
        <BulkEditor
          params={headers}
          onChange={handleHeadersChange}
          onToggle={toggleBulkEditMode}
          onSave={onSave}
          onRun={handleRun}
        />
      </StyledWrapper>
    );
  }

  return (
    <StyledWrapper className="w-full">
      <EditableTable
        columns={columns}
        rows={headers || []}
        onChange={handleHeadersChange}
        defaultRow={defaultRow}
        getRowError={getHeaderRowError}
        reorderable={true}
        onReorder={handleHeaderDrag}
      />
      <div className="flex justify-end mt-2">
        <button className="btn-action text-link select-none" onClick={toggleBulkEditMode}>
          Bulk Edit
        </button>
      </div>
    </StyledWrapper>
  );
};

export default RequestHeaders;
