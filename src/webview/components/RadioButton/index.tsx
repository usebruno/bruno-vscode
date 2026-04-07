import React from 'react';
import StyledWrapper from './StyledWrapper';

interface RadioButtonProps {
  checked?: boolean;
  disabled?: boolean;
  onChange?: (...args: unknown[]) => void;
  name?: React.ReactNode;
  value?: React.ReactNode;
  id?: string;
  className?: string;
  dataTestId?: string;
}


const RadioButton = ({
  checked,
  disabled = false,
  onChange,
  name,
  value,
  id,
  className = '',
  dataTestId = 'radio-button'
}: any) => {
  const handleChange = (e: any) => {
    if (!disabled && onChange) {
      onChange(e);
    }
  };

  return (
    <StyledWrapper>
      <div className={`radio-container ${className}`}>
        <input
          type="radio"
          id={id}
          name={name}
          value={value}
          checked={checked}
          disabled={disabled}
          onChange={handleChange}
          className="radio-input"
          data-testid={dataTestId}
        />
        <label htmlFor={id} className="radio-label" />
      </div>
    </StyledWrapper>
  );
};

export default RadioButton;
