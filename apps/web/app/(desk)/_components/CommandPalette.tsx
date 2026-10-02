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
  TableIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command';
import { useThemeChoice } from './ThemeToggle';

// The ⌘K dialog itself (cmdk). Loaded the first time the menu opens, so no page pays for it up front (09 §3).

export default function CommandPalette({
  open,
  setOpen,
  pathname,
  returnFocus,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  pathname: string;
  /** Called when the dialog closes; a command that navigates moves focus itself (the new page's main). */
  returnFocus: () => void;
}) {
  const router = useRouter();
  const theme = useThemeChoice();
  const caseId = /^\/case\/([^/]+)/.exec(pathname)?.[1] ?? null;

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
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command menu"
      description="Search for a place or an action"
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        returnFocus();
      }}
    >
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
  );
}
