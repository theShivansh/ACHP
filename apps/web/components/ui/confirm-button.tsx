'use client';

import { cn } from 'cn';
import { Check, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { copiedMs } from '@/lib/motion';

/**
 * A button for an action with no visible result of its own (copy, share). When `run` says it worked, the icon morphs
 * to a check and the label reads the done word for 1.6s, then both revert (05 §4, S9.2). The confirmation is visible
 * and spoken: one `role="status"` sentence says it, so it works on a muted phone and with a screen reader. ACHP makes
 * no sound. The button keeps its width (both labels share one grid cell) so nothing around it moves.
 *
 * `run` returns true when the action happened and false when it did not or was cancelled; a failure that needs
 * telling (a blocked clipboard) is `run`'s to show.
 */
export function ConfirmButton({
  icon: Icon,
  label,
  doneLabel,
  announcement,
  run,
  variant = 'secondary',
  className,
}: {
  icon: LucideIcon;
  label: string;
  doneLabel: string;
  /** The sentence the status region speaks when it worked ("Summary copied."). */
  announcement: string;
  run: () => Promise<boolean>;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
}) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const click = async () => {
    if (!(await run())) return;
    clearTimeout(timer.current);
    setDone(true);
    timer.current = setTimeout(() => setDone(false), copiedMs);
  };

  return (
    <>
      <Button variant={variant} className={cn('pointer-coarse:h-11', className)} data-confirm={done ? 'done' : 'idle'} onClick={click}>
        {/* Two glyphs in one slot; the one that isn't current shrinks and fades, so the icon morphs in place. */}
        <span aria-hidden="true" className="relative size-4 shrink-0">
          {/* The glyph leaving is quicker than the one arriving (05 §1: exits are about 30% shorter). */}
          <Icon
            className={cn(
              'absolute inset-0 size-4 transition-[opacity,scale] ease-out motion-reduce:transition-none',
              done ? 'scale-50 opacity-0 duration-(--dur-instant)' : 'scale-100 opacity-100 duration-(--dur-quick)',
            )}
          />
          <Check
            className={cn(
              'absolute inset-0 size-4 transition-[opacity,scale] ease-out motion-reduce:transition-none',
              done ? 'scale-100 opacity-100 duration-(--dur-quick)' : 'scale-50 opacity-0 duration-(--dur-instant)',
            )}
          />
        </span>
        <span className="grid justify-items-start">
          <span className={cn('col-start-1 row-start-1', done && 'invisible')}>{label}</span>
          <span className={cn('col-start-1 row-start-1', !done && 'invisible')}>{doneLabel}</span>
        </span>
      </Button>
      <span role="status" className="sr-only">
        {done ? announcement : ''}
      </span>
    </>
  );
}
