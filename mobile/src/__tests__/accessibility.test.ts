import { a11yButton, a11yHeader, a11yLiveRegion, a11yTab, a11ySearchField } from '../utils/accessibility';

describe('accessibility helpers', () => {
  it('a11yButton sets role and label', () => {
    expect(a11yButton('Save')).toEqual({
      accessibilityRole: 'button',
      accessibilityLabel: 'Save',
    });
  });

  it('a11yButton includes hint when provided', () => {
    expect(a11yButton('Pay', 'Opens payment form')).toEqual({
      accessibilityRole: 'button',
      accessibilityLabel: 'Pay',
      accessibilityHint: 'Opens payment form',
    });
  });

  it('a11yHeader sets header role', () => {
    expect(a11yHeader('Profile')).toEqual({
      accessibilityRole: 'header',
      accessibilityLabel: 'Profile',
    });
  });

  it('a11yLiveRegion announces politely', () => {
    expect(a11yLiveRegion('Offline')).toMatchObject({
      accessibilityLiveRegion: 'polite',
      accessibilityLabel: 'Offline',
    });
  });

  it('a11yTab sets tab role and selected state', () => {
    expect(a11yTab('Overview', true)).toEqual({
      accessibilityRole: 'tab',
      accessibilityLabel: 'Overview',
      accessibilityState: { selected: true },
    });
  });

  it('a11ySearchField sets search role', () => {
    expect(a11ySearchField('Search orders')).toEqual({
      accessibilityRole: 'search',
      accessibilityLabel: 'Search orders',
    });
  });
});
