'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { deskNav, isCurrent } from './nav';
import { nextTheme, useThemeChoice } from './ThemeToggle';

// The nav in a sheet (07 §1). Navigation is desk chrome, so the sheet is on the desk surface. Loaded the first time
// the menu opens (MobileMenu); focus goes back to the menu button when it closes.
export default function MobileMenuSheet({
  open,
  onOpenChange,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocus: () => void;
}) {
  const pathname = usePathname();
  const theme = useThemeChoice();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        surface="desk"
        // Open on the page you are on; close back to the menu button (there is no Radix Trigger to return to).
        onOpenAutoFocus={(e) => {
          const current = document.querySelector<HTMLElement>('[data-slot="sheet-content"] a[aria-current="page"]');
          if (current) {
            e.preventDefault();
            current.focus();
          }
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocus();
        }}
      >
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription className="sr-only">The places in ACHP, and the theme.</SheetDescription>
        </SheetHeader>
        <nav aria-label="Main" className="px-2">
          <ul className="flex flex-col">
            {deskNav.map((item) => (
              <li key={item.href}>
                <SheetClose asChild>
                  <Link
                    href={item.href}
                    aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
                    className="flex min-h-11 items-center rounded-button border-l-2 border-transparent px-3 type-body text-desk-ink-2 transition-colors duration-(--dur-quick) hover:bg-surface-tint hover:text-desk-ink aria-[current=page]:border-desk-ink aria-[current=page]:text-desk-ink"
                  >
                    {item.label}
                  </Link>
                </SheetClose>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-4 border-t-(length:--rule) border-desk-line px-2 pt-3">
          <button
            type="button"
            onClick={theme.cycle}
            data-theme-choice={theme.mounted ? theme.current : undefined}
            className="flex min-h-11 w-full cursor-pointer items-center justify-between rounded-button px-3 text-left type-body text-desk-ink-2 hover:bg-surface-tint hover:text-desk-ink"
          >
            <span>Theme</span>
            <span className="text-desk-ink">{theme.current === 'system' ? 'Follow the system' : theme.current === 'light' ? 'Light' : 'Dark'}</span>
            <span className="sr-only">. Change to {nextTheme(theme.current)}</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
