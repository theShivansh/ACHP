'use client';

import { SearchIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

// ⌘K (07 §1, 04 §7 CommandMenu): the places and actions of the desk in one searchable list, from anywhere. On a case
// it also opens that case's Assay and Trace, or replays it. It opens on paper, closes with Escape, and returns focus
// to where it was. Every command is also reachable without it (the nav, the tabs); this is a shortcut, not the only way.
// The dialog (cmdk) is a separate chunk, fetched when the button is hovered or focused, or on the first ⌘K.

const loadPalette = () => import('./CommandPalette');
const CommandPalette = dynamic(loadPalette, { ssr: false });

export function CommandMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [wanted, setWanted] = useState(false);
  const pathname = usePathname();
  const trigger = useRef<HTMLButtonElement>(null);
  // Where focus was when the menu opened: it goes back there when the menu closes (WCAG 2.4.3).
  const returnTo = useRef<HTMLElement | null>(null);
  const remember = () => {
    const el = document.activeElement;
    returnTo.current = el instanceof HTMLElement && el !== document.body ? el : trigger.current;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setWanted(true);
        setOpen((o) => {
          if (!o) remember();
          return !o;
        });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Open the command menu"
        aria-keyshortcuts="Control+K Meta+K"
        aria-haspopup="dialog"
        aria-expanded={open}
        ref={trigger}
        data-command-trigger
        className={className}
        onPointerEnter={() => void loadPalette()}
        onFocus={() => void loadPalette()}
        onClick={() => {
          remember();
          setWanted(true);
          setOpen(true);
        }}
      >
        <SearchIcon aria-hidden="true" />
      </Button>
      {wanted && <CommandPalette open={open} setOpen={setOpen} pathname={pathname} returnFocus={() => returnTo.current?.focus()} />}
    </>
  );
}
