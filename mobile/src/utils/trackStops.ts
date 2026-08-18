import { OrderLocationTrack } from '../types';
import { haversineMeters } from './mapTracking';

const STOP_DISTANCE_METERS = 30;

export interface TrackStopSegment {
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  lat: number;
  lng: number;
  isOngoing: boolean;
}

function parseTrackPoint(track: OrderLocationTrack): { lat: number; lng: number; ts: string } | null {
  const lat = typeof track.lat === 'number' ? track.lat : parseFloat(String(track.lat));
  const lng = typeof track.lng === 'number' ? track.lng : parseFloat(String(track.lng));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !track.timestamp) return null;
  return { lat, lng, ts: track.timestamp };
}

/** Mirrors backend stop detection (30m threshold) for client-side stop history. */
export function deriveStopSegmentsFromTracks(tracks: OrderLocationTrack[]): TrackStopSegment[] {
  const ordered = [...tracks]
    .map(parseTrackPoint)
    .filter((p): p is NonNullable<typeof p> => p != null)
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  if (ordered.length < 2) return [];

  const stops: TrackStopSegment[] = [];
  let segmentStart: (typeof ordered)[0] | null = null;

  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const curr = ordered[i];
    const dist = haversineMeters(
      { latitude: prev.lat, longitude: prev.lng },
      { latitude: curr.lat, longitude: curr.lng },
    );
    const isStop = dist < STOP_DISTANCE_METERS;

    if (isStop) {
      if (!segmentStart) segmentStart = prev;
    } else if (segmentStart) {
      const durationMinutes = Math.max(
        Math.floor((new Date(prev.ts).getTime() - new Date(segmentStart.ts).getTime()) / 60000),
        0,
      );
      if (durationMinutes >= 1) {
        stops.push({
          startedAt: segmentStart.ts,
          endedAt: prev.ts,
          durationMinutes,
          lat: segmentStart.lat,
          lng: segmentStart.lng,
          isOngoing: false,
        });
      }
      segmentStart = null;
    }
  }

  if (segmentStart) {
    const last = ordered[ordered.length - 1];
    const durationMinutes = Math.max(
      Math.floor((new Date(last.ts).getTime() - new Date(segmentStart.ts).getTime()) / 60000),
      0,
    );
    stops.push({
      startedAt: segmentStart.ts,
      endedAt: null,
      durationMinutes,
      lat: segmentStart.lat,
      lng: segmentStart.lng,
      isOngoing: true,
    });
  }

  return stops.reverse();
}

export function formatDurationMinutes(minutes: number, t: (key: string, opts?: object) => string): string {
  if (minutes < 1) return t('tracking.lessThanMinute');
  if (minutes < 60) return t('tracking.minutesShort', { count: minutes });
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0
    ? t('tracking.hoursMinutesShort', { hours, minutes: mins })
    : t('tracking.hoursShort', { count: hours });
}
