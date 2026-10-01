import { ViewTransition } from 'react';

/**
 * The claim text that flies from the Desk's input to the case header (05 §4, S2.4). Both ends wrap their claim
 * in this one component so the shared name always matches. Only a shared pair animates (the Desk's "sent" line
 * and the case headline, in the one navigation `openCase` starts), at --dur-deliberate on --ease-in-out (the
 * `.morph` class, globals.css); nothing else about the page transitions, and under reduced motion nothing does.
 * The new page must already hold the claim on its first paint (the stored log has it), or there is nothing to pair.
 */
export function ClaimMorph({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition name="claim-text" share="morph" default="none">
      {children}
    </ViewTransition>
  );
}
