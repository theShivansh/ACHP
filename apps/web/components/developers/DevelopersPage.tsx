'use client';

import { Copy } from 'lucide-react';
import { useMemo } from 'react';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { whatIf } from '@/components/assay/AssayBench';
import { BENCH_SAMPLES } from '@/lib/assay/samples';
import { copyText } from '@/lib/clipboard';
import { EVENT_DOCS, restExamples } from '@/lib/developers';
import { MCP, mcpSetup } from '@/lib/mcp';
import { apiBase } from '@/lib/runs/api';
import { EVENT_TYPES } from '@/lib/runs/types';

// For developers (07 §9): how to start a check, follow it and read what it produced, and what each event carries.
// The code is in IBM Plex Mono with a copy button. The MCP tab lists what the server really offers: the list is
// generated from the server's own discovery (scripts/gen_mcp_manifest.py). No example here pretends to be live output.

function Code({ code, label }: { code: string; label: string }) {
  return (
    <div className="relative">
      <pre
        tabIndex={0}
        role="region"
        aria-label={label}
        className="overflow-x-auto rounded-card border-(length:--rule) border-desk-line bg-desk-raised px-4 py-3 font-code text-[0.8125rem] leading-relaxed text-desk-ink"
      >
        <code>{code}</code>
      </pre>
      <div className="mt-2">
        <ConfirmButton icon={Copy} label="Copy" doneLabel="Copied" announcement={`${label} copied.`} run={() => copyText(code)} variant="secondary" className="text-desk-ink" />
      </div>
    </div>
  );
}

export function DevelopersPage() {
  const base = apiBase();
  const rest = useMemo(() => restExamples(base), [base]);
  const setup = useMemo(() => mcpSetup(base), [base]);
  // The sample is what the Assay computes for an illustrative quiet falsehood, in the shape of the event's data.
  const sample = useMemo(() => {
    const s = BENCH_SAMPLES.find((x) => x.id === 'quiet_falsehood')!;
    const a = whatIf(s.signals, s.judge);
    return JSON.stringify(
      {
        v: 2,
        run_id: 'r_example',
        seq: 31,
        type: 'assay.computed',
        agent: null,
        data: { ...a, tipping_point: a.tipping_point && { ...a.tipping_point, flips: a.tipping_point.flips.slice(0, 1) }, ledger: a.ledger && { ...a.ledger, entries: a.ledger.entries.slice(0, 2) } },
      },
      null,
      2,
    );
  }, []);

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[880px] flex-1 px-4 py-8 outline-none md:px-6 md:py-12">
      <h1 className="font-display text-[2rem] leading-tight font-medium text-desk-ink md:text-[2.25rem] [font-variation-settings:'opsz'_48]">For developers</h1>
      <p className="mt-2 max-w-[60ch] type-body text-desk-ink-2">
        Start a check, follow it as it happens and read what it produced. Everything the page shows is built from the events described here.
      </p>

      <Tabs defaultValue="mcp" className="mt-6">
        <TabsList aria-label="Ways to connect">
          <TabsTrigger value="mcp">MCP</TabsTrigger>
          <TabsTrigger value="rest">REST</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
        </TabsList>

        <TabsContent value="mcp" className="mt-6">
          <p data-mcp-status className="max-w-[64ch] type-body text-desk-ink">
            <span className="font-semibold">Available to run yourself.</span> The ACHP MCP server runs on your computer, or as your own web service, and checks claims through the backend at{' '}
            <span className="font-code text-[0.9375rem]">{base}</span>. Every check it starts is a real run with a case page. This deployment does not host it.
          </p>

          <ol className="mt-6 flex flex-col gap-8">
            {setup.map((s) => (
              <li key={s.title} data-mcp-setup={s.title}>
                <h2 className="type-h2 text-desk-ink">{s.title}</h2>
                <p className="mt-1 max-w-[64ch] type-body text-desk-ink-2">{s.note}</p>
                <div className="mt-3">
                  <Code code={s.code} label={`${s.title}: command`} />
                </div>
              </li>
            ))}
          </ol>

          <h2 className="mt-10 type-h2 text-desk-ink">Tools</h2>
          <p className="mt-1 max-w-[64ch] type-body text-desk-ink-2">
            What the server lists when a host asks it, {MCP.tools.length} tools. Two of them start a check; the rest only read.
          </p>
          <ul className="mt-4 flex flex-col gap-6">
            {MCP.tools.map((t) => (
              <li key={t.name} data-mcp-tool={t.name} className="border-t-(length:--rule) border-desk-line pt-4">
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-code text-[0.9375rem] text-desk-ink">{t.name}</span>
                  <span className="type-meta text-desk-ink-2">{t.read_only ? 'Reads only' : 'Starts a check'}</span>
                </p>
                <p className="mt-1 max-w-[64ch] type-body text-desk-ink-2">{t.description}</p>
                {t.params.length > 0 && (
                  <dl className="mt-2 grid max-w-[64ch] grid-cols-[auto_1fr] gap-x-4 gap-y-1 type-meta">
                    {t.params.map((p) => (
                      <div key={p.name} className="contents">
                        <dt className="font-code text-[0.8125rem] text-desk-ink">{p.name}</dt>
                        <dd className="text-desk-ink-2">
                          {p.required ? 'Required. ' : 'Optional. '}
                          {p.description}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
          </ul>

          <h2 className="mt-10 type-h2 text-desk-ink">Resources and a prompt</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {MCP.resources.map((r) => (
              <li key={r.uri} data-mcp-resource={r.uri}>
                <p className="font-code text-[0.8125rem] break-all text-desk-ink">{r.uri}</p>
                <p className="type-body text-desk-ink-2">{r.description}</p>
              </li>
            ))}
            {MCP.prompts.map((p) => (
              <li key={p.name} data-mcp-prompt={p.name}>
                <p className="font-code text-[0.8125rem] text-desk-ink">{p.name}</p>
                <p className="type-body text-desk-ink-2">{p.description}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-[64ch] type-body text-desk-ink-2">
            A host is told to lead with the Judge&apos;s label, quote sources word for word, and say so when a check failed or was not checked, instead of guessing a verdict.
          </p>
        </TabsContent>

        <TabsContent value="rest" className="mt-6">
          <p className="max-w-[64ch] type-body text-desk-ink-2">
            The backend answers at <span className="font-code text-[0.9375rem] text-desk-ink">{base}</span>.
          </p>
          <ol className="mt-4 flex flex-col gap-8">
            {rest.map((r) => (
              <li key={r.title} data-rest={r.title}>
                <h2 className="type-h2 text-desk-ink">{r.title}</h2>
                <p className="mt-1 max-w-[64ch] type-body text-desk-ink-2">{r.note}</p>
                <div className="mt-3">
                  <Code code={r.code} label={`${r.title}: curl command`} />
                </div>
              </li>
            ))}
          </ol>
        </TabsContent>

        <TabsContent value="events" className="mt-6">
          <p className="max-w-[64ch] type-body text-desk-ink-2">
            A check is a log of events, each with a sequence number that never skips. A page is a projection of the log: nothing it shows is invented on the client. Version 2 of the protocol has{' '}
            {EVENT_TYPES.length} event types.
          </p>
          <div tabIndex={0} role="region" aria-label="Event types, scrolls sideways on a narrow screen" className="mt-4 overflow-x-auto">
            <table data-event-table className="w-full min-w-[34rem] border-collapse text-left type-meta text-desk-ink">
              <caption className="sr-only">Event types, who sends each one and what it carries</caption>
              <thead>
                <tr className="border-b-(length:--rule) border-desk-line text-desk-ink-2">
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Event
                  </th>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Sent by
                  </th>
                  <th scope="col" className="py-2 font-semibold">
                    Carries
                  </th>
                </tr>
              </thead>
              <tbody>
                {EVENT_TYPES.map((t) => (
                  <tr key={t} data-event={t} className="border-b-(length:--rule) border-desk-line align-top">
                    <th scope="row" className="py-2 pr-3 text-left font-code text-[0.8125rem] font-normal">
                      {t}
                    </th>
                    <td className="py-2 pr-3">{EVENT_DOCS[t].by}</td>
                    <td className="py-2">{EVENT_DOCS[t].carries}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mt-8 type-h2 text-desk-ink">The Assay event</h2>
          <p className="mt-1 max-w-[64ch] type-body text-desk-ink-2">
            <span className="font-code text-[0.9375rem] text-desk-ink">assay.computed</span> arrives right after the verdict and before the run completes. It carries the signals, the five scores, the
            overall score, the formula&apos;s verdict beside the Judge&apos;s, the ledger, the tipping point, the masking check and the Integrity Map point. Nothing is sent for a blocked or failed
            check. Below, the same event for an illustrative case. It is shortened to two ledger entries and one flip, so its balances are those of the full ledger, not of the entries shown; the signals are made up for the example.
          </p>
          <div className="mt-3">
            <Code code={sample} label="Sample assay.computed event" />
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
