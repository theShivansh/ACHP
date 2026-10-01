import { describe, expect, it } from 'vitest';
import { nextTheme } from '../ThemeToggle';

describe('the theme choice', () => {
  it('cycles system, light, dark and back', () => {
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
    expect(nextTheme(undefined)).toBe('light');
  });
});
