import classnames from 'classnames';
import React, { useState } from 'react';
import { IconSettings, IconInfoCircle } from '@tabler/icons';

import General from './General';
import About from './About';

import StyledWrapper from './StyledWrapper';

const TABS = [
  { key: 'general', label: 'General', icon: IconSettings },
  { key: 'about', label: 'About', icon: IconInfoCircle }
];

const Preferences = () => {
  const [tab, setTab] = useState('general');

  const getTabPanel = (tab: any) => {
    switch (tab) {
      case 'general': {
        return <General />;
      }

      case 'about': {
        return <About />;
      }
    }
  };

  return (
    <StyledWrapper className="flex flex-col overflow-hidden" data-testid="preferences">
      <div className="preferences-header">
        <h1>Preferences</h1>
        <p>Changes are saved automatically and apply to all collections.</p>
      </div>
      <div className="preferences-body">
        <div className="tabs" role="tablist" aria-orientation="vertical">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={classnames('tab', { active: tab === key })}
              role="tab"
              aria-selected={tab === key}
              data-testid={`preferences-tab-${key}`}
              onClick={() => setTab(key)}
            >
              <Icon size={16} strokeWidth={1.5} />
              {label}
            </button>
          ))}
        </div>
        <section className="tab-panel" role="tabpanel">
          {getTabPanel(tab)}
        </section>
      </div>
    </StyledWrapper>
  );
};

export default Preferences;
