'use client';

import { useId } from 'react';
import { useKBList } from '@/lib/api';
import { setActiveLibrary, useActiveLibrary } from '@/lib/activeLibrary';

// "Library: none ▾" (07 §2, §6): which of the reader's own libraries a check or a question uses. A native select, so
// it works with every keyboard and screen reader. Only ready libraries can be used; none exist → the control is not shown.

export function LibrarySelect({ id: idProp, className, label = 'Library' }: { id?: string; className?: string; label?: string }) {
  const auto = useId();
  const id = idProp ?? auto;
  const list = useKBList();
  const active = useActiveLibrary();
  const ready = (list.data?.knowledge_bases ?? []).filter((k) => k.status === 'ready');
  if (ready.length === 0) return null;
  const value = ready.some((k) => k.kb_id === active) ? (active as string) : '';
  return (
    <div className={className}>
      <label htmlFor={id} className="type-meta text-desk-ink-2">
        {label}:{' '}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => setActiveLibrary(e.target.value || null)}
        className="min-h-9 cursor-pointer rounded-button border-(length:--rule) border-desk-ink-2 bg-desk-raised px-2 type-ui text-desk-ink pointer-coarse:min-h-11"
      >
        <option value="">None</option>
        {ready.map((k) => (
          <option key={k.kb_id} value={k.kb_id}>
            {k.name}
          </option>
        ))}
      </select>
    </div>
  );
}
