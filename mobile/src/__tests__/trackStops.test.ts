import { deriveStopSegmentsFromTracks, formatDurationMinutes } from '../utils/trackStops';
import { OrderLocationTrack } from '../types';

const t = (key: string, opts?: Record<string, unknown>) => {
  if (key === 'tracking.minutesShort') {return `${opts?.count} min`;}
  if (key === 'tracking.hoursShort') {return `${opts?.count} h`;}
  if (key === 'tracking.hoursMinutesShort') {return `${opts?.hours}h ${opts?.minutes}m`;}
  if (key === 'tracking.lessThanMinute') {return '<1m';}
  return key;
};

function track(lat: number, lng: number, timestamp: string): OrderLocationTrack {
  return { id: Date.parse(timestamp), lat, lng, timestamp };
}

describe('trackStops', () => {
  it('returns empty list for fewer than two points', () => {
    expect(deriveStopSegmentsFromTracks([track(41, 69, '2026-06-08T10:00:00Z')])).toEqual([]);
  });

  it('detects a stop when points stay within 30m for at least one minute', () => {
    const tracks = [
      track(41.0, 69.0, '2026-06-08T10:00:00Z'),
      track(41.00001, 69.00001, '2026-06-08T10:01:00Z'),
      track(41.00002, 69.00002, '2026-06-08T10:02:00Z'),
      track(41.5, 69.5, '2026-06-08T10:03:00Z'),
    ];
    const stops = deriveStopSegmentsFromTracks(tracks);
    expect(stops).toHaveLength(1);
    expect(stops[0].durationMinutes).toBe(2);
    expect(stops[0].isOngoing).toBe(false);
    expect(stops[0].lat).toBe(41.0);
  });

  it('marks the last segment as ongoing when still stopped', () => {
    const tracks = [
      track(41.0, 69.0, '2026-06-08T10:00:00Z'),
      track(41.00001, 69.00001, '2026-06-08T10:02:00Z'),
    ];
    const stops = deriveStopSegmentsFromTracks(tracks);
    expect(stops).toHaveLength(1);
    expect(stops[0].isOngoing).toBe(true);
    expect(stops[0].endedAt).toBeNull();
  });

  it('ignores brief pauses under one minute', () => {
    const tracks = [
      track(41.0, 69.0, '2026-06-08T10:00:00Z'),
      track(41.00001, 69.00001, '2026-06-08T10:00:30Z'),
      track(41.5, 69.5, '2026-06-08T10:01:00Z'),
    ];
    expect(deriveStopSegmentsFromTracks(tracks)).toHaveLength(0);
  });

  it('formats duration minutes for display', () => {
    expect(formatDurationMinutes(0, t)).toBe('<1m');
    expect(formatDurationMinutes(15, t)).toBe('15 min');
    expect(formatDurationMinutes(60, t)).toBe('1 h');
    expect(formatDurationMinutes(90, t)).toBe('1h 30m');
  });
});
