# Real-time Tracking E2E Checklist

This checklist is for real-device field validation (driver + dispatcher).

Related: **`PUSH_NOTIFICATION_E2E_CHECKLIST.md`** — Firebase push on real devices.

## Environment
- Backend runs with ASGI/Channels (daphne/uvicorn) and Redis channel layer.
- Driver and dispatcher are logged in on separate real devices.
- At least one active order is assigned to the driver.

## 1) Live location stream
- Driver app sends location updates while moving.
- Dispatcher map receives marker movement in near-real-time without manual refresh.
- When websocket is interrupted (toggle airplane mode), dispatcher stream reconnects automatically.

## 2) Map behavior
- Follow mode keeps map centered on active markers.
- Disabling Follow allows manual pan/zoom and does not snap back unexpectedly.
- In dense areas, cluster markers render with counts and zoom-in on tap.

## 3) Route and playback
- Tapping a driver marker loads route polyline for selected order.
- **Multi-stop route:** dashed planned polyline + numbered pickup/delivery stop markers visible.
- Route stops list shows sequence, status (pending/arrived/completed), and metrics when optimized.
- Polyline is segmented by movement quality (stale/slow/normal/fast coloring).
- Playback starts/stops correctly on 1x and 2x speeds.

## 4) Stale and risk signals
- Marker color changes when location age increases (fresh -> warning -> stale).
- Live indicator timestamp updates continuously.

## 5) Performance and stability
- With many drivers, Perf mode reduces rendered markers and keeps UI responsive.
- No app crashes during 30+ minutes continuous tracking.
- Background/foreground transitions keep tracking healthy.

## 6) Acceptance criteria
- End-to-end latency: location update visible on dispatcher within target SLA.
- Reconnect recovers stream after temporary network loss.
- No duplicate markers, no map freeze, and no uncontrolled CPU spikes.
