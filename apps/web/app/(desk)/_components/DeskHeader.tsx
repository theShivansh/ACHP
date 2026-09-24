import Link from 'next/link';
import { BackendStatusChip } from './BackendStatusChip';
import { MobileMenu } from './MobileMenu';
import { ThemeToggle } from './ThemeToggle';
import { deskNav } from './nav';

// Global desk chrome (07 §1): wordmark · nav · backend status chip · theme toggle.
// Mobile: wordmark + status chip + a menu sheet. No sound control: ACHP is silent.
export function DeskHeader() {
  return (
    <header className="sticky top-0 z-40 border-b-(length:--rule) border-desk-line bg-desk-raised">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-4 md:px-6">
        <Link
          href="/"
          className="font-display text-[1.375rem] leading-none font-medium text-desk-ink [font-variation-settings:'opsz'_36]"
        >
          ACHP
        </Link>

        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {deskNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex h-9 items-center rounded-button px-3 type-ui text-desk-ink-2 transition-colors duration-(--dur-quick) hover:bg-surface-tint hover:text-desk-ink"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <BackendStatusChip />
          <ThemeToggle />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
