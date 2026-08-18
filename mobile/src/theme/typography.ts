import { fontSize, fontWeight } from './spacing';

export const typography = {
  display: {
    fontSize: fontSize.xxxl,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.3,
    lineHeight: 26,
  },
  subtitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    letterSpacing: 0.1,
    lineHeight: 20,
  },
  body: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    letterSpacing: 0.1,
    lineHeight: 22,
  },
  caption: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.2,
    lineHeight: 18,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.6,
    lineHeight: 14,
    textTransform: 'uppercase' as const,
  },
};
