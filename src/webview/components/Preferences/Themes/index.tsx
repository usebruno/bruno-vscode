import React from 'react';
import { IconPalette, IconInfoCircle } from '@tabler/icons';
import { useTheme } from 'providers/Theme';
import StyledWrapper from './StyledWrapper';

interface ThemesProps {
  close?: () => void;
}

const Themes: React.FC<ThemesProps> = () => {
  const { displayedTheme } = useTheme();

  return (
    <StyledWrapper>
      <div className="flex flex-col gap-4 w-full appearance-container">
        <div>
          <div className="section-header flex items-center gap-2">
            <IconPalette size={20} strokeWidth={1.5} />
            <span>Appearance</span>
          </div>
        </div>

        <div className="theme-info">
          <IconInfoCircle size={20} strokeWidth={1.5} className="theme-info-icon" />
          <div className="theme-info-text">
            The Bruno extension automatically follows your VS Code theme settings.
            To change the theme, go to VS Code Settings and change your Color Theme.
          </div>
        </div>

        <div className="current-theme">
          <span className="current-theme-label">Current mode:</span>
          <span className="current-theme-value">
            {displayedTheme === 'dark' ? 'Dark' : 'Light'}
          </span>
        </div>
      </div>
    </StyledWrapper>
  );
};

export default Themes;
