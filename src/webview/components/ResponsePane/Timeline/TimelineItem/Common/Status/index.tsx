import React from 'react';
import { useTheme } from 'providers/Theme';
import { rgba } from 'polished';

/**
 * A request that never reached the server reports `status: 0` (HTTP) or `'-'` (OAuth2 token call),
 * so neither is a status to display.
 */
export const toNumericStatus = (value: unknown): number | null =>
  (typeof value === 'number' && value > 0 ? value : null);

export const getStatusColor = (theme: any, statusCode: unknown): string => {
  if (typeof statusCode !== 'number') return theme.colors.text.muted;
  if (statusCode >= 200 && statusCode < 300) return theme.requestTabPanel.responseOk;
  if (statusCode >= 300 && statusCode < 400) return theme.colors.text.warning;
  if (statusCode >= 400 && statusCode < 600) return theme.requestTabPanel.responseError;
  return theme.colors.text.muted;
};

const Status = ({
  statusCode
}: any) => {
  const { theme } = useTheme();
  const color = getStatusColor(theme, statusCode);
  const isStatusKnown = toNumericStatus(statusCode) != null || (typeof statusCode === 'string' && statusCode.length > 0);

  return (
    <span
      className="timeline-status"
      data-testid="timeline-status"
      style={{
        color,
        background: isStatusKnown ? rgba(color, 0.12) : 'transparent',
        fontWeight: 600,
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 3,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap'
      }}
    >
      {statusCode}
    </span>
  );
};

export default Status;
