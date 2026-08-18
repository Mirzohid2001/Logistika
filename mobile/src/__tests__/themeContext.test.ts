import { resolveIsDark } from '../context/ThemeContext';

describe('resolveIsDark', () => {
  it('forces dark when preference is dark', () => {
    expect(resolveIsDark('dark', 'light')).toBe(true);
  });

  it('forces light when preference is light', () => {
    expect(resolveIsDark('light', 'dark')).toBe(false);
  });

  it('follows system when preference is system', () => {
    expect(resolveIsDark('system', 'dark')).toBe(true);
    expect(resolveIsDark('system', 'light')).toBe(false);
  });
});
