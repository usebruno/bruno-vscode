import React from 'react';

interface SettingCheckboxProps {
  id: string;
  name: string;
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const SettingCheckbox = ({ id, name, label, description, checked, disabled = false, onChange }: SettingCheckboxProps) => (
  <div className={`setting setting-checkbox ${disabled ? 'disabled' : ''}`}>
    <input id={id} type="checkbox" name={name} checked={checked} disabled={disabled} onChange={onChange} className="mousetrap" />
    <div>
      <label className="setting-label" htmlFor={id}>{label}</label>
      {description && <div className="setting-description">{description}</div>}
    </div>
  </div>
);

export default SettingCheckbox;
