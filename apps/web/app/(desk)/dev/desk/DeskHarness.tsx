'use client';

import { useRouter } from 'next/navigation';
import { ClaimInput } from '@/components/desk/ClaimInput';
import { openCase } from '@/lib/transitions';

/** Opens the recorded `exercise-mixed` case at 20× speed, the way the real Desk opens a case after POST /runs. */
export function DeskHarness() {
  const router = useRouter();
  return <ClaimInput onSubmit={async () => openCase(router, 'fixture-exercise-mixed', '?speed=20')} />;
}
