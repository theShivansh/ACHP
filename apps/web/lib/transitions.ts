// Route transitions (05 §4: the Desk → Case morph). The shared <ViewTransition name="claim-text"> in
// components/case/ClaimMorph.tsx pairs the Desk's "sent" claim with the case headline. The navigation carries this
// type so the app can tell a case opened from the Desk from any other (React.addTransitionType, Next 16.2).

export const TO_CASE = 'to-case';

interface Pusher {
  push: (href: string, options?: { scroll?: boolean; transitionTypes?: string[] }) => void;
}

/** Go to a case, morphing the claim the reader just typed into the case's headline. */
export function openCase(router: Pusher, runId: string, query = ''): void {
  router.push(`/case/${runId}${query}`, { transitionTypes: [TO_CASE] });
}
