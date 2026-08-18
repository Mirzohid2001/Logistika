import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LogistikaMarker } from './LogistikaMarker';
import type { LatLng } from '../../utils/mapGeo';
import type { AppColors } from '../../theme/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useAppTheme } from '../../theme/useAppTheme';

interface DriverMarkerProps {
  coordinate: LatLng;
  bearing?: number;
  presenceColor?: string;
  size?: number;
  moving?: boolean;
}

export const DriverMarker: React.FC<DriverMarkerProps> = ({
  coordinate,
  bearing = 0,
  presenceColor,
  size = 36,
  moving = false,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const bodyColor = presenceColor ?? colors.primary;
  const coneH = moving ? 34 : 22;

  return (
    <LogistikaMarker id="driver-live" coordinate={coordinate} size={size + 28} anchor={{ x: 0.5, y: 0.72 }}>
      <View style={styles.wrap}>
        <View style={[styles.rotator, { transform: [{ rotate: `${bearing}deg` }] }]}>
          <View
            style={[
              styles.beam,
              {
                height: coneH,
                backgroundColor: `${bodyColor}${moving ? '55' : '30'}`,
              },
            ]}
          />
          <View style={[styles.shadow, { backgroundColor: `${colors.shadow}55` }]} />
          <View style={[styles.body, { width: size * 0.72, height: size, backgroundColor: bodyColor }]}>
            <View style={styles.cabin} />
            <View style={styles.hood} />
          </View>
        </View>
      </View>
    </LogistikaMarker>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrap: {
      width: 72,
      height: 88,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rotator: {
      alignItems: 'center',
    },
    beam: {
      width: 16,
      borderTopLeftRadius: 10,
      borderTopRightRadius: 10,
      marginBottom: -6,
    },
    shadow: {
      position: 'absolute',
      bottom: 6,
      width: 28,
      height: 10,
      borderRadius: 5,
    },
    body: {
      borderRadius: 10,
      borderWidth: 2.5,
      borderColor: colors.textLight,
      alignItems: 'center',
      paddingTop: 6,
    },
    cabin: {
      width: '62%',
      height: 9,
      borderRadius: 3,
      backgroundColor: 'rgba(255,255,255,0.42)',
    },
    hood: {
      marginTop: 5,
      width: '38%',
      height: 5,
      borderRadius: 2,
      backgroundColor: 'rgba(255,255,255,0.22)',
    },
  });
