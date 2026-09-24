'use client';

import { MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

// "Lamp off" (dark) and back. The icon follows [data-theme] through CSS, so the server render
// and the first client render match; only the click needs the resolved theme.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle dark theme"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <MoonIcon aria-hidden="true" className="in-data-[theme=dark]:hidden" />
      <SunIcon aria-hidden="true" className="hidden in-data-[theme=dark]:block" />
    </Button>
  );
}
