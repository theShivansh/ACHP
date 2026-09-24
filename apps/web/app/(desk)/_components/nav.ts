// 07 §1 global nav. The destinations beyond / and /case arrive in P9.
export const deskNav = [
  { href: '/', label: 'Check' },
  { href: '/ask', label: 'Ask' },
  { href: '/library', label: 'Library' },
  { href: '/runs', label: 'Runs' },
  { href: '/method', label: 'Method' },
  { href: '/developers', label: 'Developers' },
] as const;

/** A nav item is current on its own path and below it ("/" only matches itself). */
export function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
