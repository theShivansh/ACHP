'use client';

import {
  BookOpenIcon,
  CodeIcon,

  HistoryIcon,
  LibraryIcon,
  MessageCircleQuestionIcon,
  PaletteIcon,
  PlayIcon,
  PlusIcon,
  ScaleIcon,
  SearchIcon,
  TableIcon,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command';
import { useThemeChoice } from './ThemeToggle';

// ⌘K (07 §1, 04 §7 CommandMenu): the places and actions of the desk in one searchable list, from anywhere. On a case
// it also opens that case's Assay and Trace, or replays it. It opens on paper, closes with Escape, and returns focus
// to where it was. Every command is also reachable without it (the nav, the tabs); this is a shortcut, not the only way.

export function CommandMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const theme = useThemeChoice();
  const caseId = /^\/case\/([^/]+)/.exec(pathname)?.[1] ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const go = (href: string) => run(() => router.push(href));
  // A tab changes in place, as the case's own tabs do (the native history call; Next syncs it into the page).
  const tab = (name: string) =>
    run(() => {
      const q = new URLSearchParams(window.location.search);
      q.set('tab', name);
      window.history.replaceState(null, '', `${pathname}?${q}`);
    });

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Open the command menu"
        aria-keyshortcuts="Control+K Meta+K"
        aria-haspopup="dialog"
        data-command-trigger
        className={className}
        onClick={() => setOpen(true)}
      >
        <SearchIcon aria-hidden="true" />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Command menu" description="Search for a place or an action">
        <CommandInput placeholder="Go to, or do…" />
        <CommandList>
          <CommandEmpty>Nothing matches that.</CommandEmpty>
          {caseId && (
            <CommandGroup heading="This case">
              <CommandItem onSelect={tab('assay')}>
                <ScaleIcon />
                Open the Assay
              </CommandItem>
              <CommandItem onSelect={tab('trace')}>
                <TableIcon />
                Open the trace
              </CommandItem>
              <CommandItem onSelect={go(`/case/${caseId}?replay=1`)}>
                <PlayIcon />
                Replay this case
              </CommandItem>
            </CommandGroup>
          )}
          <CommandGroup heading="Go to">
            <CommandItem onSelect={go('/')}>
              <PlusIcon />
              New check
            </CommandItem>
            <CommandItem onSelect={go('/ask')}>
              <MessageCircleQuestionIcon />
              Ask a library
            </CommandItem>
            <CommandItem onSelect={go('/library')}>
              <LibraryIcon />
              Libraries
            </CommandItem>
            <CommandItem onSelect={go('/runs')}>
              <HistoryIcon />
              Your checks
            </CommandItem>
            <CommandItem onSelect={go('/method')}>
              <BookOpenIcon />
              How ACHP decides
            </CommandItem>
            <CommandItem onSelect={go('/developers')}>
              <CodeIcon />
              For developers
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Settings">
            <CommandItem onSelect={run(theme.cycle)} keywords={['dark', 'light', 'theme', 'system']}>
              <PaletteIcon />
              Change theme
              <CommandShortcut>{theme.mounted ? theme.current : ''}</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

