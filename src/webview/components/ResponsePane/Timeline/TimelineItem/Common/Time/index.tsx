import { useState, useEffect } from 'react';
import { useTheme } from 'providers/Theme';

interface getRelativeTimeProps {
  timestamp?: React.ReactNode;
}


const getRelativeTime = (date: Date) => {
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const diff = (date.getTime() - new Date().getTime()) / 1000;

  const timeUnits = [
    { unit: 'year', seconds: 31536000 },
    { unit: 'month', seconds: 2592000 },
    { unit: 'week', seconds: 604800 },
    { unit: 'day', seconds: 86400 },
    { unit: 'hour', seconds: 3600 },
    { unit: 'minute', seconds: 60 },
    { unit: 'second', seconds: 1 }
  ];

  for (const { unit, seconds } of timeUnits) {
    if (Math.abs(diff) >= seconds || unit === 'second') {
      return rtf.format(Math.round(diff / seconds), unit as Intl.RelativeTimeFormatUnit);
    }
  }
};

export const RelativeTime = ({
  timestamp
}: any) => {
  const [relativeTime, setRelativeTime] = useState(getRelativeTime(new Date(timestamp)));
  const { theme } = useTheme();

  useEffect(() => {
    const interval = setInterval(() => {
      setRelativeTime(getRelativeTime(new Date(timestamp)));
    }, 1000);

    return () => clearInterval(interval);
  }, [timestamp]);

  return (
    <span
      title={new Date(timestamp).toLocaleString()}
      style={{
        fontSize: theme.font.size.xs,
        color: theme.colors.text.muted
      }}
    >
      {relativeTime}
    </span>
  );
};
