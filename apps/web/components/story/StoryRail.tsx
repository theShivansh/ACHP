'use client';

import { cn } from 'cn';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { CHAPTER_IDS, CHAPTER_TITLES, type ChapterId } from '@/lib/runs/chapters';

// The story's rail (05 §2.2): seven ticks, the current one filled, each a real link to its chapter, and a
// "Skip to verdict" link that is always on screen. A fixed rail on the left of a wide screen, a bar along the
// bottom of a phone. The position is read with an IntersectionObserver; nothing listens to wheel or touch,
// and `End`, the keyboard and anchor links all work natively.

export function StoryRail({ className, embedded = false }: { className?: string; embedded?: boolean }) {
  const [current, setCurrent] = useState<ChapterId>('claim');
  // On a page with other content (the Desk), the rail belongs to the story only: shown while the story is on screen.
  const [inView, setInView] = useState(false);
  // Without IntersectionObserver the rail cannot tell, so it stays on screen. The server and the first client render
  // agree (supported), so a Desk never paints the rail before the story.
  const observable = useSyncExternalStore(
    () => () => {},
    () => typeof IntersectionObserver !== 'undefined',
    () => true,
  );
  const shown = !embedded || !observable || inView;

  useEffect(() => {
    if (!embedded) return;
    const story = document.querySelector('[data-story]');
    if (!story || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: '-35% 0px -35% 0px', threshold: 0 });
    io.observe(story);
    return () => io.disconnect();
  }, [embedded]);

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

  const at = CHAPTER_IDS.indexOf(current) + 1;
  return (
    <nav
      aria-label="Story chapters"
      data-story-rail
      hidden={!shown}
      className={cn(
        'fixed z-30 border-desk-line bg-desk text-desk-ink',
        'inset-x-0 bottom-0 border-t-(length:--rule) px-3 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]',
        'lg:inset-x-auto lg:top-1/2 lg:bottom-auto lg:left-[max(1rem,calc(50%-560px))] lg:w-44 lg:-translate-y-1/2 lg:border-t-0 lg:bg-transparent lg:p-0',
        className,
      )}
    >
      {/* On a phone: which chapter this is, then one row of ticks and the skip. */}
      <p data-story-current className="type-meta text-desk-ink-2 lg:sr-only">
        {CHAPTER_TITLES[current]} · {at} of {CHAPTER_IDS.length}
      </p>
      {/* Skip is first in the DOM (and in the tab order) and last on screen. */}
      <div className="flex items-center gap-2 max-[22.5rem]:flex-wrap lg:flex-col lg:items-stretch lg:gap-0">
        <a
          href="#chapter-verdict"
          data-skip-verdict
          className="order-2 inline-flex min-h-10 shrink-0 items-center justify-center rounded-button border-(length:--rule) border-desk-ink-2 px-3 type-ui text-desk-ink hover:bg-desk-raised max-[22.5rem]:basis-full lg:mt-2 lg:justify-start pointer-coarse:min-h-11"
        >
          Skip to verdict
        </a>
        <ol className="order-1 flex flex-1 items-center justify-between gap-0.5 max-[22.5rem]:basis-full lg:flex-col lg:items-stretch lg:justify-start">
          {CHAPTER_IDS.map((id) => {
            const active = current === id;
            return (
              <li key={id} className="flex-1 lg:flex-none">
                <a
                  href={`#chapter-${id}`}
                  data-tick={id}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'flex min-h-6 min-w-6 items-center justify-center gap-2 rounded-button px-1 type-ui lg:justify-start lg:px-2 pointer-coarse:min-h-11',
                    active ? 'font-semibold text-desk-ink' : 'text-desk-ink-2 hover:text-desk-ink',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'shrink-0 rounded-full border-(length:--rule)',
                      active ? 'size-4 border-desk-ink bg-desk-ink lg:size-3' : 'size-2.5 border-desk-ink-2',
                    )}
                  />
                  <span className="max-lg:sr-only">{CHAPTER_TITLES[id]}</span>
                </a>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
