'use client';

import { cn } from 'cn';
import { useEffect, useState } from 'react';
import { CHAPTER_IDS, CHAPTER_TITLES, type ChapterId } from '@/lib/runs/chapters';

// The story's rail (05 §2.2): seven ticks, the current one filled, each a real link to its chapter, and a
// "Skip to verdict" link that is always on screen. A fixed rail on the left of a wide screen, a bar along the
// bottom of a phone. The position is read with an IntersectionObserver; nothing listens to wheel or touch,
// and `End`, the keyboard and anchor links all work natively.

export function StoryRail({ className }: { className?: string }) {
  const [current, setCurrent] = useState<ChapterId>('claim');

  useEffect(() => {
    // A chapter's reading gates carry its id too, so the rail stays on "Challenge" while a gate is pinned.
    const sections = [...document.querySelectorAll<HTMLElement>('[data-chapter]')];
    if (!sections.length || typeof IntersectionObserver === 'undefined') return;
    // The chapter crossing a thin band around the middle of the screen is the one being read.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent((e.target as HTMLElement).dataset.chapter as ChapterId);
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  return (
    <nav
      aria-label="Story chapters"
      data-story-rail
      className={cn(
        'fixed z-30 border-desk-line bg-desk text-desk-ink',
        'inset-x-0 bottom-0 border-t-(length:--rule) px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]',
        'lg:inset-x-auto lg:top-1/2 lg:bottom-auto lg:left-4 lg:w-44 lg:-translate-y-1/2 lg:border-t-0 lg:bg-transparent lg:p-0',
        className,
      )}
    >
      <ol className="flex items-center justify-between gap-1 lg:flex-col lg:items-stretch lg:justify-start lg:gap-0.5">
        {CHAPTER_IDS.map((id) => {
          const active = current === id;
          return (
            <li key={id} className="flex-1 lg:flex-none">
              <a
                href={`#chapter-${id}`}
                data-tick={id}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex min-h-6 items-center justify-center gap-2 rounded-button px-1 type-meta lg:justify-start lg:px-2 pointer-coarse:min-h-11',
                  active ? 'font-semibold text-desk-ink' : 'text-desk-ink-2 hover:text-desk-ink',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-2.5 shrink-0 rounded-full border-(length:--rule)',
                    active ? 'border-desk-ink bg-desk-ink' : 'border-desk-ink-2',
                  )}
                />
                <span className="max-lg:sr-only">{CHAPTER_TITLES[id]}</span>
              </a>
            </li>
          );
        })}
      </ol>
      <a
        href="#chapter-verdict"
        data-skip-verdict
        className="mt-2 inline-flex min-h-6 w-full items-center justify-center rounded-button border-(length:--rule) border-desk-ink-2 px-3 type-ui text-desk-ink hover:bg-desk-raised lg:w-auto lg:justify-start pointer-coarse:min-h-11"
      >
        Skip to verdict
      </a>
    </nav>
  );
}
