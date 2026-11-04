import React, { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { useTheme } from 'providers/Theme';
import { moveVar, setRequestVars } from 'providers/ReduxStore/slices/collections';
import { sendRequest, saveRequest } from 'providers/ReduxStore/slices/collections/actions';
import MultiLineEditor from 'components/MultiLineEditor';
import InfoTip from 'components/InfoTip';
import EditableTable from 'components/EditableTable';
import VarsDataTypeSelector from 'components/DataTypeSelector/VarsDataTypeSelector';
import StyledWrapper from './StyledWrapper';
import toast from 'react-hot-toast';
import { variableNameRegex } from 'utils/common/regex';
import { valueToString } from '@usebruno/common/utils';

interface VarsTableProps {
  item: any;
  collection: any;
  vars: any[];
  varType: 'request' | 'response';
}

const VarsTable = ({
  item,
  collection,
  vars,
  varType
}: VarsTableProps) => {
  const dispatch = useDispatch();
  const { storedTheme } = useTheme();

  const onSave = () => dispatch(saveRequest(item.uid, collection.uid));
  const handleRun = () => dispatch(sendRequest(item, collection.uid));

  const handleVarsChange = useCallback((updatedVars: any[]) => {
    const currentVars = item.draft?.request?.vars || item.request?.vars || { req: [], res: [] };
    const varKey = varType === 'request' ? 'req' : 'res';

    dispatch(setRequestVars({
      collectionUid: collection.uid,
      itemUid: item.uid,
      vars: {
        ...currentVars,
        [varKey]: updatedVars
      }
    }));
  }, [dispatch, collection.uid, item.uid, item.draft, item.request, varType]);

  const handleVarDrag = useCallback(({
    updateReorderedItem
  }: { updateReorderedItem: string[] }) => {
    const varTypeKey = varType === 'request' ? 'req' : 'res';
    dispatch(moveVar({
      varType: varTypeKey,
      collectionUid: collection.uid,
      itemUid: item.uid,
      updateReorderedItem
    }));
  }, [dispatch, varType, collection.uid, item.uid]);

  const getRowError = useCallback((row: any, index: any, key: any) => {
    if (key !== 'name') return null;
    if (!row.name || row.name.trim() === '') return null;
    if (!variableNameRegex.test(row.name)) {
      return 'Variable contains invalid characters. Must only contain alphanumeric characters, "-", "_", "."';
    }
    return null;
  }, []);

  const columns = [
    {
      key: 'name',
      name: 'Name',
      isKeyField: true,
      placeholder: 'Name',
      width: '35%'
    },
    {
      key: 'value',
      name: varType === 'request' ? 'Value' : (
        <div className="flex items-center">
          <span>Expr</span>
          <InfoTip content="You can write any valid JS expression here" infotipId={`request-${varType}-var`} />
        </div>
      ),
      placeholder: varType === 'request' ? 'Value' : 'Expr',
      render: ({
        row,
        value,
        onChange,
        isLastEmptyRow
      }: any) => (
        <div className="flex items-center w-full gap-2">
          <div className="flex-1 min-w-0">
            <MultiLineEditor
              value={valueToString(value)}
              theme={storedTheme}
              onSave={onSave}
              onChange={onChange}
              onRun={handleRun}
              collection={collection}
              item={item}
              placeholder={isLastEmptyRow ? (varType === 'request' ? 'Value' : 'Expr') : ''}
            />
          </div>
          <VarsDataTypeSelector row={row} vars={vars} isLastEmptyRow={isLastEmptyRow} varType={varType} onVarsChange={handleVarsChange} />
        </div>
      )
    }
  ];

  const defaultRow = {
    name: '',
    value: '',
    ...(varType === 'response' ? { local: false } : {})
  };

  return (
    <StyledWrapper className="w-full">
      <EditableTable
        testId={`request-vars-${varType === 'request' ? 'req' : 'res'}`}
        columns={columns}
        rows={vars || []}
        onChange={handleVarsChange}
        defaultRow={defaultRow}
        getRowError={getRowError}
        reorderable={true}
        onReorder={handleVarDrag}
      />
    </StyledWrapper>
  );
};

export default VarsTable;
