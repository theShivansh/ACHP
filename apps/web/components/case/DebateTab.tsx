'use client';

import {
  challengerSentence,
  dominantSlant,
  integrityWords,
  significanceWords,
  sourceBalance,
  stanceWords,
  type DebateView,
} from '@/lib/debate';
import type { FindingsRecorded } from '@/lib/runs/types';

// The debate tab: what was searched, what came back (the excerpts, verbatim), what each reviewer concluded, and why
// anything was left unsettled. All of it is read from the run's log. Conclusions and published notes only: no reasoning
// is requested, stored or shown. The names of the reviewers come from the run (run.started agents[]).

interface Props {
  view: DebateView;
  findings: FindingsRecorded | null;
  names: { retriever: string; challenger: string; auditor: string; integrity: string };
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

/** The sentence an agent published about its own work. */
function Said({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p data-said className="mt-2 type-body text-ink-2">
      <span className="type-meta font-semibold">In its words: </span>
      <span dir="auto">{text}</span>
    </p>
  );
}

export function DebateTab({ view, findings, names, claims, onOpenSources }: Props) {
  const balance = sourceBalance(claims);
  const slant = findings ? dominantSlant(findings.integrity.summary) : null;
  return (
    <section aria-labelledby="debate-title" data-debate={findings ? 'found' : 'partial'} className="flex flex-col gap-8">
      <header>
        <h2 id="debate-title" className="type-h2 text-ink">
          The debate
        </h2>
        <p className="mt-1 max-w-[60ch] type-body text-ink-2">
          What was searched, what came back, and what each reviewer concluded. Their reasoning is not shown, only what they
          found and the sentence each chose to publish.
        </p>
        {!findings && (
          <p data-debate-none className="mt-2 max-w-[60ch] type-body text-ink-2">
            The server that ran this check did not store the reviewers&apos; findings (flaws, missing viewpoints), so only
            the search, the excerpts and their published notes are shown.
          </p>
        )}
      </header>

      <section aria-labelledby="debate-search" data-debate-part="search" className="max-w-[68ch]">
        <Heading id="debate-search">{names.retriever}</Heading>
        {view.searches.length > 0 ? (
          <ul className="mt-1 flex flex-col gap-1 type-body text-ink-2">
            {view.searches.map((s, i) => (
              <li key={`${s.label}-${i}`}>
                {s.label}
                {s.detail ? (
                  <>
                    : <q dir="auto">{s.detail}</q>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-1 type-body text-ink-2">{view.retrieved ?? 'The search was not recorded.'}</p>
        {view.sources.length > 0 && (
          <ol data-excerpts className="mt-3 flex flex-col gap-4">
            {view.sources.map((s) => (
              <li key={s.id} data-excerpt={s.id} className="type-body text-ink-2">
                <p className="type-meta text-ink-2">
                  <span className="font-semibold text-ink">Source {s.n}</span>
                  {s.domain ? ` · ${s.domain}` : ''}
                </p>
                {s.title && (
                  <p dir="auto" className="type-ui font-semibold break-words text-ink">
                    {s.title}
                  </p>
                )}
                <blockquote className="mt-1 border-l-2 border-ink-3 pl-3 font-display type-body text-ink">
                  <p dir="auto" className="line-clamp-4 break-words">
                    “{s.quote}”
                  </p>
                </blockquote>
                <p className="mt-1 type-meta text-ink-2">{s.uses.length ? s.uses.join(', ') : 'Read, but not cited for or against any part.'}</p>
              </li>
            ))}
          </ol>
        )}
        {view.whyUnsettled && (
          <p data-why-unsettled className="mt-4 type-body text-ink">
            <span className="type-meta font-semibold text-ink-2">Why it was not settled: </span>
            {view.whyUnsettled}
          </p>
        )}
      </section>

      <section aria-labelledby="debate-challenger" data-debate-part="challenger" className="max-w-[68ch]">
        <Heading id="debate-challenger">{names.challenger}</Heading>
        {findings && <p className="mt-1 type-body text-ink-2">{challengerSentence(findings.challenger)}</p>}
        <Said text={view.notes.challenger} />
        {findings && findings.challenger.flaws.length > 0 && (
          <>
            <p className="mt-3 type-meta font-semibold text-ink-2">Flaws it named</p>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 type-body text-ink-2">
              {findings.challenger.flaws.map((f) => (
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
        {findings && <p className="mt-1 type-body text-ink-2">It read the message as {stanceWords(findings.auditor.stance)}.</p>}
        <Said text={view.notes.auditor} />
        {findings &&
          (findings.auditor.missing.length > 0 ? (
            <>
              <p className="mt-3 type-meta font-semibold text-ink-2">Viewpoints the message leaves out</p>
              <ul data-missing className="mt-1 flex flex-col gap-3">
                {findings.auditor.missing.map((m) => (
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
            <p className="mt-2 type-body text-ink-2">It did not list a specific viewpoint as missing.</p>
          ))}
        {findings && findings.auditor.represented.length > 0 && (
          <p className="mt-3 type-body text-ink-2">
            <span className="type-meta font-semibold">Voices the message already includes: </span>
            {findings.auditor.represented.join(', ')}.
          </p>
        )}
      </section>

      <section aria-labelledby="debate-integrity" data-debate-part="integrity" className="max-w-[68ch]">
        <Heading id="debate-integrity">{names.integrity}</Heading>
        {findings && (
          <p className="mt-1 type-body text-ink-2">
            Its reading of the wording: <span className="font-semibold text-ink">{integrityWords(findings.integrity.verdict)}</span>
            {slant ? <>, mainly {slant}</> : null}. The exact signals are on The Assay tab.
          </p>
        )}
        <Said text={view.notes.integrity} />
      </section>

      {balance.length > 0 && (
        <section aria-labelledby="debate-sources" data-debate-part="sources" className="max-w-[68ch]">
          <Heading id="debate-sources">Where the sources stand</Heading>
          <ul className="mt-1 flex flex-col gap-1 type-body text-ink-2">
            {balance.map((b) => (
              <li key={b.claimId}>
                {b.for + b.against === 0
                  ? `Part ${b.part}: none of the ${view.sources.length} sources was cited for or against it.`
                  : `Part ${b.part}: ${b.for} ${b.for === 1 ? 'source backs' : 'sources back'} it, ${b.against} ${b.against === 1 ? 'speaks' : 'speak'} against it.`}
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
