import React, { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { useTheme } from 'providers/Theme';
import { saveCollectionSettings } from 'providers/ReduxStore/slices/collections/actions';
import MultiLineEditor from 'components/MultiLineEditor';
import InfoTip from 'components/InfoTip';
import EditableTable from 'components/EditableTable';
import VarsDataTypeSelector from 'components/DataTypeSelector/VarsDataTypeSelector';
import StyledWrapper from './StyledWrapper';
import toast from 'react-hot-toast';
import { variableNameRegex } from 'utils/common/regex';
import { setCollectionVars } from 'providers/ReduxStore/slices/collections/index';
import { valueToString } from '@usebruno/common/utils';

interface VarsTableProps {
  collection?: React.ReactNode;
  vars?: React.ReactNode;
  varType?: React.ReactNode;
}


const VarsTable = ({
  collection,
  vars,
  varType
}: any) => {
  const dispatch = useDispatch();
  const { storedTheme } = useTheme();

  const onSave = () => dispatch(saveCollectionSettings(collection.uid));

  const handleVarsChange = useCallback((updatedVars: any) => {
    dispatch(setCollectionVars({ collectionUid: collection.uid, vars: updatedVars, type: varType }));
  }, [dispatch, collection.uid, varType]);

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
      width: '40%'
    },
    {
      key: 'value',
      name: varType === 'request' ? 'Value' : (
        <div className="flex items-center">
          <span>Expr</span>
          <InfoTip content="You can write any valid JS Template Literal here" infotipId={`collection-${varType}-var`} />
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
              collection={collection}
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
        testId={`collection-vars-${varType === 'request' ? 'req' : 'res'}`}
        columns={columns}
        rows={vars}
        onChange={handleVarsChange}
        defaultRow={defaultRow}
        getRowError={getRowError}
      />
    </StyledWrapper>
  );
};

export default VarsTable;
