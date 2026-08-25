import { useEffect, useState } from 'react';

/** Live minutes since current_stop_started_at (ticks every 30s). */
export function useLiveStopDuration(
  currentStopStartedAt: string | null | undefined,
  status?: string,
): number | null {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!currentStopStartedAt || status !== 'stopped') {return undefined;}
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [currentStopStartedAt, status]);

  if (!currentStopStartedAt || status !== 'stopped') {return null;}
  const started = new Date(currentStopStartedAt).getTime();
  if (Number.isNaN(started)) {return null;}
  return Math.max(0, Math.floor((now - started) / 60000));
}
