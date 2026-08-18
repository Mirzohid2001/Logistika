import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import { DRIVER_WORKFLOW_STEPS, getDriverWorkflowStep, type DriverWorkflowStep } from '../utils/orderWorkflow';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';

const STEP_LABEL_KEYS: Record<DriverWorkflowStep, string> = {
  pending: 'orders.workflow.clientApprove',
  approved_by_client: 'orders.workflow.startTrip',
  in_progress: 'orders.workflow.pickup',
  in_transit: 'orders.workflow.deliver',
  completed: 'orders.workflow.done',
};

interface Props {
  statusCode: string;
}

export const DriverOrderWorkflowBar: React.FC<Props> = ({ statusCode }) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const current = getDriverWorkflowStep(statusCode);
  const currentIndex = DRIVER_WORKFLOW_STEPS.indexOf(current);

  return (
    <View style={styles.container}>
      {DRIVER_WORKFLOW_STEPS.map((step, index) => {
        const isDone = index < currentIndex;
        const isActive = index === currentIndex;
        return (
          <View key={step} style={styles.stepWrap}>
            <View
              style={[
                styles.dot,
                isDone && styles.dotDone,
                isActive && styles.dotActive,
              ]}>
              <Text style={[styles.dotText, (isDone || isActive) && styles.dotTextActive]}>
                {isDone ? '✓' : index + 1}
              </Text>
            </View>
            <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={2}>
              {t(STEP_LABEL_KEYS[step])}
            </Text>
            {index < DRIVER_WORKFLOW_STEPS.length - 1 && (
              <View style={[styles.connector, isDone && styles.connectorDone]} />
            )}
          </View>
        );
      })}
    </View>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  stepWrap: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.round,
    backgroundColor: colors.backgroundTertiary,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  dotDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  dotActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dotText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  dotTextActive: {
    color: colors.textLight,
  },
  label: {
    fontSize: 10,
    textAlign: 'center',
    color: colors.textTertiary,
    lineHeight: 13,
  },
  labelActive: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  connector: {
    position: 'absolute',
    top: 13,
    left: '58%',
    right: '-42%',
    height: 2,
    backgroundColor: colors.border,
    zIndex: -1,
  },
  connectorDone: {
    backgroundColor: colors.success,
  },
});
