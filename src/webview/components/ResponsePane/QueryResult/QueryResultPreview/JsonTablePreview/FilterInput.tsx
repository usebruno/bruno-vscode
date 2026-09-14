import React, { useEffect, useMemo, useState } from 'react';
import debounce from 'lodash/debounce';

interface FilterInputProps {
  onChange: (value: string) => void;
  placeholder?: string;
  resetToken?: number;
}

const FilterInput: React.FC<FilterInputProps> = ({ onChange, placeholder = 'Filter rows…', resetToken }) => {
  const [value, setValue] = useState('');

  const debounced = useMemo(
    () => debounce((v: string) => onChange(v), 200),
    [onChange]
  );

  useEffect(() => () => debounced.cancel(), [debounced]);

  useEffect(() => {
    if (resetToken === undefined) return;
    setValue('');
    debounced.cancel();
    onChange('');
  }, [resetToken]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="json-table-filter">
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          setValue(e.target.value);
          debounced(e.target.value);
        }}
        aria-label="Filter table rows"
      />
    </div>
  );
};

export default FilterInput;
