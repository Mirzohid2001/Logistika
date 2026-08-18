import { AccessibilityRole } from 'react-native';

type A11yProps = {
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: { disabled?: boolean; selected?: boolean; busy?: boolean };
};

export function a11yButton(label: string, hint?: string): A11yProps {
  return {
    accessibilityRole: 'button',
    accessibilityLabel: label,
    ...(hint ? { accessibilityHint: hint } : {}),
  };
}

export function a11yHeader(label: string): A11yProps {
  return { accessibilityRole: 'header', accessibilityLabel: label };
}

export function a11yLink(label: string): A11yProps {
  return { accessibilityRole: 'link', accessibilityLabel: label };
}

export function a11yImage(label: string): A11yProps {
  return { accessibilityRole: 'image', accessibilityLabel: label };
}

export function a11yLiveRegion(label: string): A11yProps & { accessibilityLiveRegion: 'polite' | 'assertive' } {
  return {
    accessibilityRole: 'text',
    accessibilityLabel: label,
    accessibilityLiveRegion: 'polite',
  };
}

export function a11yTab(label: string, selected = false): A11yProps {
  return {
    accessibilityRole: 'tab',
    accessibilityLabel: label,
    accessibilityState: { selected },
  };
}

export function a11ySearchField(label: string): A11yProps {
  return {
    accessibilityRole: 'search',
    accessibilityLabel: label,
  };
}
