import React from 'react';
import { Checkbox, Inner, Label, Switch, SwitchButton } from './StyledWrapper';

type SwitchSize = '2xs' | 'xs' | 's' | 'm' | 'l' | 'xl' | '2xl';

interface ToggleSwitchProps {
  isOn?: boolean;
  handleToggle?: React.ReactNode;
  size?: SwitchSize;
  activeColor?: boolean;
}


const ToggleSwitch = ({
  isOn,
  handleToggle,
  size = 'm' as SwitchSize,
  activeColor,
  ...props
}: any) => {
  return (
    <Switch size={size as SwitchSize} {...props} onClick={handleToggle}>
      {/* @ts-expect-error - size prop conflicts with native input size attribute */}
      <Checkbox checked={isOn} id="toggle-switch" type="checkbox" size={size} activeColor={activeColor} onChange={() => {}} />
      <Label htmlFor="toggle-switch">
        <Inner size={size} />
        <SwitchButton size={size} />
      </Label>
    </Switch>
  );
};

export default ToggleSwitch;
