import React from 'react';
import type { BrunoVariableDataType } from '@bruno-types';
import DataTypeSelector from './index';

interface Var {
  uid?: string;
  name?: string;
  value?: unknown;
  dataType?: BrunoVariableDataType;
}

interface VarsDataTypeSelectorProps {
  row: Var;
  vars: Var[] | undefined;
  isLastEmptyRow?: boolean;
  varType?: string;
  onVarsChange: (vars: Var[]) => void;
}

/**
 * Data-type selector for a Vars-table row. Updates the matching variable's type and hands the full
 * array back to the table's change handler. Only request-scoped literal vars get a type — response
 * vars hold a JS expression, and the trailing empty row has nothing to type.
 */
const VarsDataTypeSelector = ({ row, vars, isLastEmptyRow, varType, onVarsChange }: VarsDataTypeSelectorProps) => {
  if (isLastEmptyRow || varType !== 'request') {
    return null;
  }
  return (
    <DataTypeSelector
      variable={row}
      onChange={(fields) => {
        onVarsChange((vars || []).map((v) => (v.uid === row.uid ? { ...v, ...fields } : v)));
      }}
    />
  );
};

export default VarsDataTypeSelector;
