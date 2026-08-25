import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { getMediaUrl } from '../services/api';
import {
  playVoiceMessage,
  setVoicePlaybackCompleteListener,
  stopVoicePlayback,
} from '../services/voiceRecorderService';
import { useTranslation } from '../hooks/useTranslation';
import { spacing, borderRadius } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';

interface VoiceMessageBubbleProps {
  voicePath?: string | null;
  isMyMessage: boolean;
}

export const VoiceMessageBubble: React.FC<VoiceMessageBubbleProps> = ({ voicePath, isMyMessage }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const instanceId = useRef(`voice-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    setVoicePlaybackCompleteListener(() => {
      setPlaying(false);
      setLoading(false);
    });
    return () => {
      setVoicePlaybackCompleteListener(null);
      void stopVoicePlayback();
    };
  }, [instanceId]);

  const togglePlayback = async () => {
    const uri = getMediaUrl(voicePath);
    if (!uri) {
      return;
    }
    if (playing) {
      await stopVoicePlayback();
      setPlaying(false);
      return;
    }
    try {
      setLoading(true);
      await playVoiceMessage(uri);
      setPlaying(true);
    } catch {
      setPlaying(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.container, isMyMessage ? styles.myContainer : styles.otherContainer]}
      onPress={() => {
        void togglePlayback();
      }}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={playing ? t('chat.voicePause') : t('chat.voicePlay')}>
      {loading ? (
        <ActivityIndicator size="small" color={isMyMessage ? colors.textLight : colors.primary} />
      ) : (
        <MaterialIcons
          name={playing ? 'pause-circle-filled' : 'play-circle-filled'}
          size={32}
          color={isMyMessage ? colors.textLight : colors.primary}
        />
      )}
      <View style={styles.waveRow}>
        {[0, 1, 2, 3, 4].map((bar) => (
          <View
            key={bar}
            style={[
              styles.waveBar,
              isMyMessage ? styles.waveBarMy : styles.waveBarOther,
              playing ? styles.waveBarActive : null,
              { height: playing ? 10 + bar * 3 : 6 + bar * 2 },
            ]}
          />
        ))}
      </View>
    </TouchableOpacity>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.lg,
      minWidth: 148,
    },
    myContainer: {
      backgroundColor: colors.primaryDark,
    },
    otherContainer: {
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    waveRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 3,
      flex: 1,
      minHeight: 24,
    },
    waveBar: {
      width: 3,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    waveBarMy: {
      backgroundColor: colors.textLight + '66',
    },
    waveBarOther: {
      backgroundColor: colors.primary + '44',
    },
    waveBarActive: {
      backgroundColor: colors.primary,
    },
  });
