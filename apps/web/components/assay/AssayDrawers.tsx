'use client';

import { ChevronRight } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import type { AssayComputed } from '@/lib/runs/types';
import { AgreementDial } from './AgreementDial';
import { AssayBench } from './AssayBench';
import { LineageDiagram } from './LineageDiagram';

// The Assay tab's three drawers (07 §4.1): where the numbers come from, how far humans agreed with each
// score, and the what-if Bench. Reference material on paper; each opens from a text link and returns focus.

function Drawer({
  label,
  title,
  description,
  wide = false,
  children,
}: {
  label: string;
  title: string;
  description: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-6 cursor-pointer items-center gap-1 type-ui text-pencil-blue underline decoration-(length:--rule) underline-offset-4 hover:decoration-2 pointer-coarse:min-h-11"
        >
          <ChevronRight aria-hidden="true" className="size-4 stroke-[1.5]" />
          {label}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className={wide ? 'w-[min(94vw,760px)] overflow-y-auto' : 'w-[min(92vw,600px)] overflow-y-auto'}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-8">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

export function AssayDrawers({ assay }: { assay: AssayComputed }) {
  const bench = assay.mode === 'code' && assay.ledger != null;
  return (
    <nav aria-label="More about the Assay" data-assay-drawers className="flex flex-col items-start gap-1">
      <Drawer
        label="Where the numbers come from"
        title="Signal lineage"
        description="Which raw signals feed which scores, and where the code differs from the paper."
        wide
      >
        <LineageDiagram judgeNss={assay.signals.jNSS != null} />
      </Drawer>
      <Drawer
        label="How much humans agreed"
        title="Agreement with people"
        description="From the paper's calibration study. It is agreement, not accuracy."
      >
        <AgreementDial />
      </Drawer>
      {bench && (
        <Drawer
          label="Try the formula"
          title="Assay Bench"
          description="Move the signals and watch the published formulas recompute. Nothing here changes the check."
          wide
        >
          <AssayBench assay={assay} />
        </Drawer>
      )}
    </nav>
  );
}
