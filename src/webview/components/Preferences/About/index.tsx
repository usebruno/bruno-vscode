import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  IconBook,
  IconBrandDiscord,
  IconBrandGithub,
  IconCopy,
  IconFileText,
  IconSpeakerphone,
  IconWorld
} from '@tabler/icons';
import Bruno from 'components/Bruno';
import { ipcRenderer } from 'utils/ipc';
import StyledWrapper from './StyledWrapper';

interface AppInfo {
  version: string | null;
  vscodeVersion: string;
  appName: string;
  platform: string;
  arch: string;
}

const LINKS = [
  { label: 'Documentation', url: 'https://docs.usebruno.com', icon: IconBook },
  { label: 'Website', url: 'https://www.usebruno.com', icon: IconWorld },
  { label: 'GitHub', url: 'https://github.com/usebruno/bruno-vscode', icon: IconBrandGithub },
  { label: 'Changelog', url: 'https://github.com/usebruno/bruno-vscode/blob/main/CHANGELOG.md', icon: IconFileText },
  { label: 'Report an Issue', url: 'https://github.com/usebruno/bruno-vscode/issues', icon: IconSpeakerphone },
  { label: 'Discord', url: 'https://discord.com/invite/KgcZUncpjq', icon: IconBrandDiscord }
];

const About = () => {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    ipcRenderer
      .invoke<AppInfo>('renderer:get-app-info')
      .then(setAppInfo)
      .catch((err: unknown) => console.error('Failed to load app info', err));
  }, []);

  const details = appInfo
    ? [
        { label: 'Version', value: appInfo.version || 'Unknown' },
        { label: appInfo.appName || 'VS Code', value: appInfo.vscodeVersion },
        { label: 'OS', value: `${appInfo.platform} (${appInfo.arch})` }
      ]
    : [];

  const copyDetails = async () => {
    const text = ['Bruno for VS Code', ...details.map((d) => `${d.label}: ${d.value}`)].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch (err) {
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <StyledWrapper className="w-full" data-testid="preferences-about">
      <div className="flex items-center gap-4">
        <Bruno width={48} />
        <div>
          <div className="app-name">Bruno for VS Code</div>
          <div className="muted">Open-source API client for exploring and testing APIs</div>
        </div>
      </div>

      <div className="settings-section about-section">
        <div className="section-title">Details</div>
        <table className="info-table">
          <tbody>
            {details.map((d) => (
              <tr key={d.label}>
                <td>{d.label}</td>
                <td data-testid={`about-${d.label.toLowerCase().replace(/\s+/g, '-')}`}>{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="setting-control">
          <button type="button" className="btn-secondary" disabled={!appInfo} onClick={copyDetails}>
            <IconCopy size={16} strokeWidth={1.5} />
            Copy Details
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="section-title">Resources</div>
        <div className="links">
          {LINKS.map(({ label, url, icon: Icon }) => (
            <button key={label} type="button" className="link" onClick={() => ipcRenderer.openExternal(url)}>
              <Icon size={16} strokeWidth={1.5} />
              {label}
            </button>
          ))}
        </div>
      </div>
    </StyledWrapper>
  );
};

export default About;
