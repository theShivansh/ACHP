'use client';

import { cn } from 'cn';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BackendStatusChip } from './BackendStatusChip';
import { CommandMenu } from './CommandMenu';
import { MobileMenu } from './MobileMenu';
import { ThemeToggle } from './ThemeToggle';
import { deskNav, isCurrent } from './nav';

// Global desk chrome (07 §1): wordmark · nav · backend status chip · theme toggle.
// Mobile, and the case pages at every width, put the nav in a menu sheet to give the sheet room.
// No sound control: ACHP is silent.
export function DeskHeader() {
  const pathname = usePathname();
  const compact = pathname.startsWith('/case/');

  return (
    <header className="sticky top-0 z-40 border-b-(length:--rule) border-desk-line bg-desk-raised">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-4 md:px-6">
        <Link
          href="/"
          className="translate-y-px font-display text-[1.375rem] leading-none font-medium text-desk-ink [font-variation-settings:'opsz'_36]"
        >
          ACHP
        </Link>

        {!compact && (
          <nav aria-label="Main" className="hidden md:block">
            <ul className="flex items-center gap-4">
              {deskNav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
                    className="inline-flex h-14 items-center border-b-2 border-transparent px-1 type-ui text-desk-ink-2 transition-colors duration-(--dur-quick) hover:text-desk-ink aria-[current=page]:border-desk-ink aria-[current=page]:text-desk-ink"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="ml-auto flex items-center gap-2">
          <BackendStatusChip />
          {/* On a phone the header is the wordmark, the status and the menu (07 §1); the theme is in the menu. */}
          <CommandMenu className="max-md:hidden" />
          <ThemeToggle className="max-md:hidden" />
          <MobileMenu className={cn(!compact && 'md:hidden')} />
        </div>
      </div>
    </header>
  );
}
