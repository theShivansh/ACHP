'use client';

import { MenuIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

// The phone's menu button. The sheet it opens (MobileMenuSheet) is its own chunk, fetched on touch or hover and
// mounted on the first open, so no page pays for it up front (09 §3).
const loadSheet = () => import('./MobileMenuSheet');
const MobileMenuSheet = dynamic(loadSheet, { ssr: false });

export function MobileMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [wanted, setWanted] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        ref={button}
        className={className}
        onPointerDown={() => void loadSheet()}
        onPointerEnter={() => void loadSheet()}
        onFocus={() => void loadSheet()}
        onClick={() => {
          setWanted(true);
          setOpen(true);
        }}
      >
        <MenuIcon aria-hidden="true" />
      </Button>
      {wanted && <MobileMenuSheet open={open} onOpenChange={setOpen} returnFocus={() => button.current?.focus()} />}
    </>
  );
}
