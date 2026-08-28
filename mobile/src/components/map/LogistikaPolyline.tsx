import React, { useMemo } from 'react';
import { ShapeSource, LineLayer } from '@maplibre/maplibre-react-native';
import { coordinatesToLineString, type LatLng } from '../../utils/mapGeo';
import { useAppTheme } from '../../theme/useAppTheme';
import { shouldRenderRouteGlow } from '../../utils/liveTrackingPerf';

export type RouteLineKind = 'remaining' | 'traveled' | 'planned' | 'track';

interface LogistikaPolylineProps {
  id: string;
  coordinates: LatLng[];
  strokeColor?: string;
  strokeWidth?: number;
  lineDashPattern?: number[];
  kind?: RouteLineKind;
}

const KIND_WIDTH: Record<RouteLineKind, number> = {
  remaining: 9,
  traveled: 6.5,
  planned: 5,
  track: 5.5,
};

function zoomLineWidth(width: number, extra = 0) {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    8,
    width * 0.4 + extra,
    12,
    width * 0.7 + extra,
    15,
    width + extra,
    18,
    width * 1.35 + extra,
  ];
}

export const LogistikaPolyline: React.FC<LogistikaPolylineProps> = ({
  id,
  coordinates,
  strokeColor,
  strokeWidth,
  lineDashPattern,
  kind = 'track',
}) => {
  const { colors, isDark } = useAppTheme();
  const resolvedStrokeColor =
    strokeColor ??
    (kind === 'traveled'
      ? isDark
        ? '#5B6B82'
        : '#A8B4C4'
      : kind === 'planned'
        ? colors.textTertiary
        : colors.primary);
  const width = strokeWidth ?? KIND_WIDTH[kind];
  const casingColor = isDark ? '#071116' : '#FFFFFF';

  const shape = useMemo(() => {
    if (coordinates.length < 2) {
      return null;
    }
    return coordinatesToLineString(coordinates);
  }, [coordinates]);

  if (!shape) {
    return null;
  }

  const dash = lineDashPattern ? { lineDasharray: lineDashPattern } : {};
  const showGlow = shouldRenderRouteGlow() && (kind === 'remaining' || kind === 'track');
  const glowStyle = {
    lineColor: resolvedStrokeColor,
    lineWidth: zoomLineWidth(width, 8) as unknown as number,
    lineCap: 'round' as const,
    lineJoin: 'round' as const,
    lineOpacity: 0.22,
    lineBlur: 1.1,
  };
  const casingStyle = {
    lineColor: casingColor,
    lineWidth: zoomLineWidth(width, 4.5) as unknown as number,
    lineCap: 'round' as const,
    lineJoin: 'round' as const,
    lineOpacity: kind === 'planned' ? 0.28 : 0.95,
    ...dash,
  };
  const lineStyle = {
    lineColor: resolvedStrokeColor,
    lineWidth: zoomLineWidth(width) as unknown as number,
    lineCap: 'round' as const,
    lineJoin: 'round' as const,
    lineOpacity: kind === 'traveled' ? 0.62 : 1,
    ...dash,
  };

  return (
    <ShapeSource id={id} shape={shape}>
      {showGlow ? (
        <LineLayer
          id={`${id}-glow`}
          style={glowStyle}
        />
      ) : null}
      <LineLayer
        id={`${id}-casing`}
        style={casingStyle}
      />
      <LineLayer
        id={`${id}-line`}
        style={lineStyle}
      />
    </ShapeSource>
  );
};
