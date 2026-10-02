'use client';

import { challengerSentence, dominantSlant, integrityWords, significanceWords, sourceBalance, stanceWords } from '@/lib/debate';
import type { FindingsRecorded } from '@/lib/runs/types';

// The debate tab: what each reviewer concluded about the message, laid out like a transparency report. Conclusions only:
// no reasoning is requested, stored or shown. The names of the reviewers come from the run (run.started agents[]).

interface Props {
  findings: FindingsRecorded | null;
  names: { challenger: string; auditor: string; integrity: string };
  claims: { claim_id: string; evidence_for?: string[]; evidence_against?: string[] }[];
  onOpenSources: () => void;
}

function Heading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="type-ui font-semibold text-ink">
      {children}
    </h3>
  );
}

export function DebateTab({ findings, names, claims, onOpenSources }: Props) {
  if (!findings) {
    return (
      <section aria-labelledby="debate-title" data-debate="none">
        <h2 id="debate-title" className="type-h2 text-ink">
          The debate
        </h2>
        <p className="mt-2 max-w-[60ch] type-body text-ink-2">
          This check has no record of what the reviewers found. The server that ran it did not store it, so it cannot be
          shown or rebuilt here. A check run on an up-to-date server has it.
        </p>
      </section>
    );
  }
  const { challenger, auditor, integrity } = findings;
  const slant = dominantSlant(integrity.summary);
  const balance = sourceBalance(claims);
  return (
    <section aria-labelledby="debate-title" data-debate="found" className="flex flex-col gap-8">
      <header>
        <h2 id="debate-title" className="type-h2 text-ink">
          The debate
        </h2>
        <p className="mt-1 max-w-[60ch] type-body text-ink-2">
          What each reviewer concluded about this message. Their reasoning is not shown, only what they found.
        </p>
      </header>

      <section aria-labelledby="debate-challenger" data-debate-part="challenger" className="max-w-[68ch]">
        <Heading id="debate-challenger">{names.challenger}</Heading>
        <p className="mt-1 type-body text-ink-2">{challengerSentence(challenger)}</p>
        {challenger.flaws.length > 0 && (
          <>
            <p className="mt-3 type-meta font-semibold text-ink-2">Flaws it named</p>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 type-body text-ink-2">
              {challenger.flaws.map((f) => (
                <li key={f} dir="auto">
                  {f}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="debate-auditor" data-debate-part="auditor" className="max-w-[68ch]">
        <Heading id="debate-auditor">{names.auditor}</Heading>
        <p className="mt-1 type-body text-ink-2">It read the message as {stanceWords(auditor.stance)}.</p>
        {auditor.missing.length > 0 ? (
          <>
            <p className="mt-3 type-meta font-semibold text-ink-2">Viewpoints the message leaves out</p>
            <ul data-missing className="mt-1 flex flex-col gap-3">
              {auditor.missing.map((m) => (
                <li key={m.who} className="type-body text-ink-2">
                  <span dir="auto" className="font-semibold text-ink">
                    {m.who}
                  </span>{' '}
                  <span className="type-meta text-ink-2">({significanceWords(m.significance)})</span>
                  <span dir="auto" className="mt-0.5 block">
                    {m.viewpoint}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 type-body text-ink-2">It found no viewpoint missing.</p>
        )}
        {auditor.represented.length > 0 && (
          <p className="mt-3 type-body text-ink-2">
            <span className="type-meta font-semibold">Voices the message already includes: </span>
            {auditor.represented.join(', ')}.
          </p>
        )}
      </section>

      <section aria-labelledby="debate-integrity" data-debate-part="integrity" className="max-w-[68ch]">
        <Heading id="debate-integrity">{names.integrity}</Heading>
        <p className="mt-1 type-body text-ink-2">
          Its reading of the wording: <span className="font-semibold text-ink">{integrityWords(integrity.verdict)}</span>
          {slant ? <>, mainly {slant}</> : null}. The exact signals are on The Assay tab.
        </p>
      </section>

      {balance.length > 0 && (
        <section aria-labelledby="debate-sources" data-debate-part="sources" className="max-w-[68ch]">
          <Heading id="debate-sources">Where the sources stand</Heading>
          <ul className="mt-1 flex flex-col gap-1 type-body text-ink-2">
            {balance.map((b) => (
              <li key={b.claimId}>
                Part {b.part}: {b.for} {b.for === 1 ? 'source backs' : 'sources back'} it, {b.against}{' '}
                {b.against === 1 ? 'speaks' : 'speak'} against it.
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onOpenSources}
            className="mt-2 inline-flex min-h-6 cursor-pointer items-center text-pencil-blue underline decoration-(length:--rule) underline-offset-4 hover:decoration-2 pointer-coarse:min-h-11"
          >
            Open the sources
          </button>
        </section>
      )}
    </section>
  );
}
