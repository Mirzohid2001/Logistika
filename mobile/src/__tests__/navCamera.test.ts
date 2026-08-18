import {
  lerpHeading,
  navLookAheadMeters,
  navPitchFromSpeed,
  navZoomFromSpeed,
} from '../utils/navCamera';

describe('navCamera', () => {
  it('lerps heading across 360 wrap', () => {
    expect(lerpHeading(350, 10, 0.5)).toBeCloseTo(0, 1);
  });

  it('zooms out and pitches up as speed rises', () => {
    const stoppedZoom = navZoomFromSpeed(0);
    const fastZoom = navZoomFromSpeed(25);
    expect(fastZoom).toBeLessThan(stoppedZoom);
    expect(navPitchFromSpeed(25)).toBeGreaterThan(navPitchFromSpeed(0));
    expect(navLookAheadMeters(25)).toBeGreaterThan(navLookAheadMeters(0));
  });
});
