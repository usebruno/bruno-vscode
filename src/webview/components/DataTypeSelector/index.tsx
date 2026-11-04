import React from 'react';
import { IconAlertCircle, IconCaretDown } from '@tabler/icons';
import { Tooltip } from 'react-tooltip';
import { BRUNO_VARIABLE_DATATYPES, parseValueByDataType, validateDataTypeValue } from '@usebruno/common/utils';
import type { BrunoVariableDataType } from '@bruno-types';
import MenuDropdown from 'ui/MenuDropdown';
import StyledWrapper from './StyledWrapper';

interface DataTypeSelectorProps {
  variable: { uid?: string; name?: string; value?: unknown; dataType?: BrunoVariableDataType };
  onChange: (fields: { dataType?: BrunoVariableDataType }) => void;
}

const DataTypeSelector = ({ variable, onChange }: DataTypeSelectorProps) => {
  const selectedType: BrunoVariableDataType = variable.dataType || 'string';
  const coercedValue = parseValueByDataType(variable.value, selectedType);
  const typeError = validateDataTypeValue(coercedValue, selectedType);

  // 'string' is the implicit default — clear the field rather than materialize it.
  const handleTypeChange = (type: BrunoVariableDataType) => {
    onChange({ dataType: type === 'string' ? undefined : type });
  };

  const items = BRUNO_VARIABLE_DATATYPES.map((type) => ({
    id: type,
    label: type,
    onClick: () => handleTypeChange(type)
  }));

  return (
    <StyledWrapper>
      <div className="flex items-center relative">
        <MenuDropdown
          items={items}
          selectedItemId={selectedType}
          placement="bottom-end"
          showTickMark={true}
          appendTo={() => document.body}
          data-testid={`datatype-selector-${variable.name || 'new'}`}
        >
          <div className="flex items-center cursor-pointer select-none">
            <span className="type-label">{selectedType}</span>
            <IconCaretDown className="caret-icon ml-1" size={14} strokeWidth={2} />
          </div>
        </MenuDropdown>
        {typeError && (
          <span className="ml-1">
            <IconAlertCircle
              data-tooltip-id={`type-error-${variable.uid}`}
              className="text-yellow-600 cursor-pointer"
              size={16}
            />
            <Tooltip className="tooltip-mod" id={`type-error-${variable.uid}`} content={typeError} place="top" />
          </span>
        )}
      </div>
    </StyledWrapper>
  );
};

export default React.memo(DataTypeSelector);
