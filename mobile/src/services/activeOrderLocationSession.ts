import { AppState, type AppStateStatus } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import {
  ensureBackgroundLocationPermission,
  postLocationUpdate,
  isLocationUpdateRejected,
  LOCATION_POST_INTERVAL_MS,
  LOCATION_MOVEMENT_THRESHOLD_METERS,
  isAcceptableGpsAccuracy,
  motionFromCoords,
  type LocationMotionExtras,
} from './locationTrackingService';
import {
  startBackgroundTrackingSession,
  stopBackgroundTrackingSession,
} from './backgroundTrackingService';
import { haversineMeters } from '../utils/mapTracking';

export type ActiveLocationFix = {
  lat: number;
  lng: number;
  heading?: number | null;
  speedMps?: number | null;
  updatedAtMs: number;
};

type LocationListener = (fix: ActiveLocationFix) => void;
type TranslateFn = (key: string, options?: Record<string, string>) => string;

type SessionState = {
  orderId: number;
  watchId: number | null;
  heartbeat: ReturnType<typeof setInterval> | null;
  appStateSub: { remove: () => void } | null;
  lastFix: ActiveLocationFix | null;
  lastPosted: ActiveLocationFix | null;
  lastMotion: LocationMotionExtras;
  appState: AppStateStatus;
};

let session: SessionState | null = null;
const listeners = new Set<LocationListener>();
let postInFlight = false;
let pendingPost: {
  orderId: number;
  lat: number;
  lng: number;
  motion: LocationMotionExtras;
  state: AppStateStatus;
} | null = null;

function appStatePayload(state: AppStateStatus): 'foreground' | 'background' | 'inactive' {
  return state === 'active' ? 'foreground' : 'background';
}

function emit(fix: ActiveLocationFix) {
  listeners.forEach((listener) => listener(fix));
}

function postFix(orderId: number, lat: number, lng: number, motion: LocationMotionExtras, state: AppStateStatus) {
  if (postInFlight) {
    pendingPost = { orderId, lat, lng, motion, state };
    return;
  }
  postInFlight = true;
  pendingPost = null;
  postLocationUpdate(orderId, lat, lng, appStatePayload(state), motion)
    .catch((error) => {
      if (isLocationUpdateRejected(error) && session?.orderId === orderId) {
        void stopActiveOrderLocationSession();
      }
    })
    .finally(() => {
      postInFlight = false;
      const queued = pendingPost;
      pendingPost = null;
      if (queued && session?.orderId === queued.orderId) {
        postFix(queued.orderId, queued.lat, queued.lng, queued.motion, queued.state);
      }
    });
}

export function getActiveOrderLocationFix(): ActiveLocationFix | null {
  return session?.lastFix ?? null;
}

export function getActiveOrderLocationOrderId(): number | null {
  return session?.orderId ?? null;
}

export function subscribeActiveOrderLocation(listener: LocationListener): () => void {
  listeners.add(listener);
  if (session?.lastFix) {
    listener(session.lastFix);
  }
  return () => {
    listeners.delete(listener);
  };
}

export async function startActiveOrderLocationSession(
  orderId: number,
  t: TranslateFn,
): Promise<boolean> {
  if (session?.orderId === orderId && session.watchId != null) {
    return true;
  }
  if (session && session.orderId !== orderId) {
    await stopActiveOrderLocationSession();
  }

  const granted = await ensureBackgroundLocationPermission(t);
  if (!granted) {
    return false;
  }

  await startBackgroundTrackingSession(orderId, t);

  const next: SessionState = {
    orderId,
    watchId: null,
    heartbeat: null,
    appStateSub: null,
    lastFix: session?.orderId === orderId ? session.lastFix : null,
    lastPosted: null,
    lastMotion: {},
    appState: AppState.currentState,
  };
  session = next;

  Geolocation.getCurrentPosition(
    (position) => {
      if (!session || session.orderId !== orderId) {
        return;
      }
      if (!isAcceptableGpsAccuracy(position.coords.accuracy)) {
        return;
      }
      const motion = motionFromCoords(position.coords);
      const fix: ActiveLocationFix = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        heading: motion.heading,
        speedMps: motion.speedMps,
        updatedAtMs: Date.now(),
      };
      session.lastFix = fix;
      session.lastPosted = fix;
      session.lastMotion = motion;
      emit(fix);
      postFix(orderId, fix.lat, fix.lng, session.lastMotion, session.appState);
    },
    () => undefined,
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 1000 },
  );

  next.watchId = Geolocation.watchPosition(
    (position) => {
      if (!session || session.orderId !== orderId) {
        return;
      }
      if (!isAcceptableGpsAccuracy(position.coords.accuracy)) {
        return;
      }
      const motion = motionFromCoords(position.coords);
      const fix: ActiveLocationFix = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        heading: motion.heading,
        speedMps: motion.speedMps,
        updatedAtMs: Date.now(),
      };
      session.lastFix = fix;
      session.lastMotion = motion;
      emit(fix);
      const lastPosted = session.lastPosted;
      const movedEnough =
        !lastPosted ||
        haversineMeters(
          { latitude: lastPosted.lat, longitude: lastPosted.lng },
          { latitude: fix.lat, longitude: fix.lng },
        ) >= LOCATION_MOVEMENT_THRESHOLD_METERS;
      if (movedEnough) {
        session.lastPosted = fix;
        postFix(orderId, fix.lat, fix.lng, session.lastMotion, session.appState);
      }
    },
    () => undefined,
    {
      enableHighAccuracy: true,
      distanceFilter: 2,
      interval: LOCATION_POST_INTERVAL_MS,
      fastestInterval: Math.max(500, Math.floor(LOCATION_POST_INTERVAL_MS / 2)),
      showsBackgroundLocationIndicator: true,
      forceRequestLocation: true,
    },
  );

  next.heartbeat = setInterval(() => {
    if (!session || session.orderId !== orderId || !session.lastFix) {
      return;
    }
    postFix(
      orderId,
      session.lastFix.lat,
      session.lastFix.lng,
      session.lastMotion,
      session.appState,
    );
  }, LOCATION_POST_INTERVAL_MS);

  next.appStateSub = AppState.addEventListener('change', (nextState) => {
    if (!session || session.orderId !== orderId) {
      return;
    }
    session.appState = nextState;
    if (!session.lastFix) {
      return;
    }
    postFix(
      orderId,
      session.lastFix.lat,
      session.lastFix.lng,
      session.lastMotion,
      nextState,
    );
  });

  return true;
}

export async function stopActiveOrderLocationSession(): Promise<void> {
  if (!session) {
    return;
  }
  if (session.watchId != null) {
    Geolocation.clearWatch(session.watchId);
  }
  if (session.heartbeat) {
    clearInterval(session.heartbeat);
  }
  session.appStateSub?.remove();
  session = null;
  pendingPost = null;
  await stopBackgroundTrackingSession().catch(() => undefined);
}

export async function stopActiveOrderLocationSessionIfOrder(orderId: number): Promise<void> {
  if (session?.orderId === orderId) {
    await stopActiveOrderLocationSession();
  }
}
