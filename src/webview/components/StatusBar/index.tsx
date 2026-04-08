import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { IconSettings, IconCookie, IconTool, IconSearch, IconBrandGithub } from '@tabler/icons';
import Mousetrap from 'mousetrap';
import { getKeyBindingsForActionAllOS } from 'providers/Hotkeys/keyMappings';
import ToolHint from 'components/ToolHint';
import Preferences from 'components/Preferences';
import Cookies from 'components/Cookies';
import Notifications from 'components/Notifications';
import Portal from 'components/Portal';
import { showPreferences } from 'providers/ReduxStore/slices/app';
import { openConsole } from 'providers/ReduxStore/slices/logs';
import { useApp } from 'providers/App';
import { RootState } from 'providers/ReduxStore';
import StyledWrapper from './StyledWrapper';

const StatusBar = () => {
  const dispatch = useDispatch();
  const preferencesOpen = useSelector((state: RootState) => state.app.showPreferences);
  const logs = useSelector((state: RootState) => state.logs.logs);
  const [cookiesOpen, setCookiesOpen] = useState(false);
  const { version } = useApp();

  const errorCount = logs.filter((log: any) => log.type === 'error').length;

  const handleConsoleClick = () => {
    dispatch(openConsole());
  };

  const openGlobalSearch = () => {
    const bindings = getKeyBindingsForActionAllOS('globalSearch') || [];
    bindings.forEach((binding: any) => {
      Mousetrap.trigger(binding);
    });
  };

  return (
    <StyledWrapper>
      {preferencesOpen && (
        <Portal>
          <Preferences
            onClose={() => {
              dispatch(showPreferences(false));
              (document.querySelector('[data-trigger="preferences"]') as HTMLElement)?.focus();
            }}
            aria-modal="true"
            role="dialog"
            aria-labelledby="preferences-title"
            aria-describedby="preferences-description"
          />
        </Portal>
      )}

      {cookiesOpen && (
        <Portal>
          <Cookies
            onClose={() => {
              setCookiesOpen(false);
              (document.querySelector('[data-trigger="cookies"]') as HTMLElement)?.focus();
            }}
            aria-modal="true"
            role="dialog"
            aria-labelledby="cookies-title"
            aria-describedby="cookies-description"
          />
        </Portal>
      )}

      <div className="status-bar">
        <div className="status-bar-section">
          <div className="status-bar-group">
            <ToolHint text="Preferences" toolhintId="Preferences" place="top-start" offset={10}>
              <button
                className="status-bar-button preferences-button"
                data-trigger="preferences"
                onClick={() => dispatch(showPreferences(true))}
                tabIndex={0}
                aria-label="Open Preferences"
              >
                <IconSettings size={16} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </ToolHint>

            {/* Notifications — not needed in VS Code (use native notifications) */}
            {/* Search — VS Code has built-in Cmd+Shift+F */}
            {/* Dev Tools — VS Code has built-in Developer Tools */}
          </div>
        </div>

        <div className="status-bar-section">
          <div className="flex items-center gap-3">
            <button
              className="status-bar-button"
              data-trigger="cookies"
              data-testid="statusbar-cookies-btn"
              onClick={() => setCookiesOpen(true)}
              tabIndex={0}
              aria-label="Open Cookies"
            >
              <div className="console-button-content">
                <IconCookie size={16} strokeWidth={1.5} aria-hidden="true" />
                <span className="console-label">Cookies</span>
              </div>
            </button>

            <div className="status-bar-divider"></div>

            <div className="status-bar-version">
              v{version}
            </div>
          </div>
        </div>
      </div>
    </StyledWrapper>
  );
};

export default StatusBar;
