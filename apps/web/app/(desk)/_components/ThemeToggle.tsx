'use client';

import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';

export const THEME_ORDER = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof THEME_ORDER)[number];

/** The theme after this one: system → light → dark → system. */
export function nextTheme(current: string | undefined): ThemeChoice {
  const i = THEME_ORDER.indexOf((current ?? 'system') as ThemeChoice);
  return THEME_ORDER[(i + 1) % THEME_ORDER.length];
}

const WORDS: Record<ThemeChoice, string> = { system: 'the system setting', light: 'light', dark: 'dark' };

// Light, dark or follow the system (07 §1). One button cycles through the three and says which is current, in its name
// and in the icon. The choice is known only in the browser, so the first render shows the neutral icon.
export function useThemeChoice() {
  const { theme, setTheme } = useTheme();
  // false on the server and in the first client render, true after: no effect and no state to set.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const current: ThemeChoice = mounted && theme && THEME_ORDER.includes(theme as ThemeChoice) ? (theme as ThemeChoice) : 'system';
  return { current, mounted, cycle: () => setTheme(nextTheme(current)) };
}

export function ThemeToggle({ className }: { className?: string }) {
  const { current, mounted, cycle } = useThemeChoice();
  const Icon = current === 'light' ? SunIcon : current === 'dark' ? MoonIcon : MonitorIcon;
  return (
    <Button
      variant="ghost"
      size="icon"
      data-theme-choice={mounted ? current : undefined}
      className={className}
      aria-label={`Theme: ${WORDS[current]}. Change theme`}
      onClick={cycle}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
