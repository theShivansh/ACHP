import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { allLogs } from '@/lib/runs/__tests__/load';
import { initialRunState, reduceRun } from '@/lib/runs/reducer';
import type { AssayComputed } from '@/lib/runs/types';
import { METRICS, METRIC_INFO } from '@/lib/assay/present';
import { AssayBench, signalsOf, whatIf } from '../AssayBench';
import { AssayTab } from '../AssayTab';
import { Hallmark } from '../Hallmark';
import { IntegrityLedger } from '../IntegrityLedger';
import { LineageDiagram } from '../LineageDiagram';
import { MaskingNotice } from '../MaskingNotice';
import { TippingLine } from '../TippingLine';
import { TwoKey } from '../TwoKey';

afterEach(cleanup);

const assayOf = (name: string): AssayComputed => {
  const log = allLogs().find((l) => l.name === `synthetic/synthetic-${name}`)!;
  return log.events.reduce(reduceRun, initialRunState()).assay!;
};
const deepFreeze = <T,>(o: T): T => {
  if (o && typeof o === 'object') {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

/** The words a reader (and a screen reader) meets, in order: SVG drawings are pictures, not prose. */
function prose(root: HTMLElement): string {
  const copy = root.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('svg').forEach((n) => n.remove());
  return (copy.textContent ?? '').replace(/\s+/g, ' ');
}

describe('Hallmark', () => {
  it('draws five cartouches, one shape per metric, filled to the score', () => {
    const a = assayOf('quiet-falsehood');
    const { container } = render(<Hallmark metrics={a.metrics} />);
    const marks = [...container.querySelectorAll<SVGElement>('svg[data-cartouche]')];
    expect(marks.map((m) => m.dataset.cartouche)).toEqual([...METRICS]);
    marks.forEach((m) => expect(m.dataset.fill).toBe(a.metrics[m.dataset.cartouche as (typeof METRICS)[number]].toFixed(2)));
  });

  it('names each mark in full with its score, and says BIS is better lower', () => {
    const a = assayOf('quiet-falsehood');
    render(<Hallmark metrics={a.metrics} />);
    const bis = screen.getByRole('img', { name: /^Bias Impact Score \(BIS\)/ });
    expect(bis.getAttribute('aria-label')).toBe(`Bias Impact Score (BIS) · ${Math.round(a.metrics.BIS * 100)} · lower is better`);
    expect(screen.getAllByRole('img')).toHaveLength(5);
  });

  it('hatches BIS and draws the finer line for the least-agreed measures', () => {
    const a = assayOf('quiet-falsehood');
    const { container } = render(<Hallmark metrics={a.metrics} />);
    expect(container.querySelector('svg[data-cartouche="BIS"] pattern')).not.toBeNull();
    expect(container.querySelector('svg[data-cartouche="CTS"] pattern')).toBeNull();
    const widths = METRICS.map((m) => container.querySelector(`svg[data-cartouche="${m}"] path[fill="none"]`)!.getAttribute('stroke-width'));
    expect(widths).toEqual(METRICS.map((m) => (METRIC_INFO[m].fine ? '1' : '1.5')));
  });
});

describe('Hallmark sizes and the tooltip', () => {
  it('prints letters only from 28px, and the score under each mark at 40px', () => {
    const a = assayOf('quiet-falsehood');
    const small = render(<Hallmark metrics={a.metrics} size={24} />).container;
    expect(small.querySelectorAll('svg text')).toHaveLength(0);
    cleanup();
    const big = render(<Hallmark metrics={a.metrics} size={40} />).container;
    expect([...big.querySelectorAll('[data-score]')].map((n) => n.textContent)).toEqual(
      METRICS.map((m) => String(Math.round(a.metrics[m] * 100))),
    );
  });

  it('is dismissed with Escape and comes back on the next hover or focus (WCAG 1.4.13)', () => {
    const a = assayOf('quiet-falsehood');
    render(<Hallmark metrics={a.metrics} />);
    const cts = screen.getByRole('img', { name: /^Consensus Truth Score/ });
    expect(cts.getAttribute('data-dismissed')).toBeNull();
    // Escape works while the mark is hovered or focused, wherever the keyboard focus is.
    fireEvent.pointerEnter(cts);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(cts.getAttribute('data-dismissed')).toBe('true');
    fireEvent.focus(cts);
    expect(cts.getAttribute('data-dismissed')).toBeNull();
  });
});

describe('Two-Key and masking', () => {
  it('turns the formula key fully, halfway or not at all', () => {
    const turns = (name: string) => {
      const { container, unmount } = render(<TwoKey assay={assayOf(name)} />);
      const t = container.querySelector('[data-key="formula"]')!.getAttribute('data-turn');
      unmount();
      return t;
    };
    expect(turns('paper-fig9-metrics')).toBe('45'); // close call
    expect(turns('quiet-falsehood')).toBe('0'); // split
    expect(turns('loud-falsehood')).toBe('90'); // agree
  });

  it('shows the masking notice for the quiet falsehood only', () => {
    const { container } = render(<MaskingNotice assay={assayOf('quiet-falsehood')} />);
    expect(container.querySelector('[data-masking]')).not.toBeNull();
    expect(container.textContent).toContain("didn't hold up");
    expect(container.textContent).toContain('experimental');
    cleanup();
    for (const n of ['true-but-loaded', 'paper-fig9-metrics']) {
      const r = render(<MaskingNotice assay={assayOf(n)} />);
      expect(r.container.querySelector('[data-masking]')).toBeNull();
      r.unmount();
    }
  });
});

describe('the ledger and the tipping line', () => {
  it('lists every entry once, with debits and credits that sum to closing minus opening', () => {
    const lg = assayOf('quiet-falsehood').ledger!;
    const { container } = render(<IntegrityLedger ledger={lg} />);
    expect(container.querySelectorAll('tr[data-signal]')).toHaveLength(lg.entries.length);
    const cells = [...container.querySelectorAll('tr[data-signal]')].map((tr) => {
      const td = tr.querySelectorAll('td');
      const parse = (s: string | null) => {
        const n = s?.match(/[+-]\d\.\d{3}/)?.[0];
        return n ? Number(n) : 0;
      };
      return parse(td[1].textContent) + parse(td[2].textContent);
    });
    const shown = cells.reduce((t, n) => t + n, 0);
    expect(Math.abs(shown - (lg.closing_balance - lg.opening_balance))).toBeLessThan(0.0006 * lg.entries.length);
    expect(container.querySelector('[data-closing]')!.textContent).toBe(lg.closing_balance.toFixed(3));
  });

  it('groups the rows in their own bodies, with a header over the bars and "none" for an empty cell', () => {
    const lg = assayOf('quiet-falsehood').ledger!;
    const { container } = render(<IntegrityLedger ledger={lg} />);
    expect(container.querySelectorAll('tbody')).toHaveLength(1 + 3); // the opening balance, then Facts, Perspectives, Wording
    expect(container.querySelector('thead')!.textContent).toContain('Effect');
    expect(container.querySelector('tr[data-signal] td .sr-only')!.textContent).toBe('none');
  });

  it('puts the case on the scale and names the nearest flip in the twin list', () => {
    const a = assayOf('quiet-falsehood');
    const { container } = render(<TippingLine assay={a} />);
    expect(container.querySelector('[data-tipping]')!.getAttribute('data-tipping')).toBe('fragile');
    expect(container.querySelector('circle[data-composite]')!.getAttribute('data-composite')).toBe(String(a.composite));
    expect(container.querySelectorAll('li[aria-current="true"]')).toHaveLength(1);
    expect(container.textContent).not.toContain('%');
  });
});

describe('metric names on first use (04 §7.1)', () => {
  const FULL: Record<string, RegExp> = {
    CTS: /Consensus Truth Score \(CTS\)/,
    PCS: /Perspective Completeness Score \(PCS\)/,
    BIS: /Bias Impact Score \(BIS[,)]/,
    NSS: /Narrative Stance Score \(NSS\)/,
    EPS: /Epistemic Position Score \(EPS\)/,
  };

  for (const name of ['quiet-falsehood', 'true-but-loaded', 'paper-fig9-metrics', 'mixed']) {
    it(`spells each metric out before any bare acronym in the Assay tab (${name})`, () => {
      const { container } = render(<AssayTab assay={assayOf(name)} />);
      const text = prose(container);
      for (const code of METRICS) {
        const bare = text.search(new RegExp(`\\b${code}\\b`));
        const full = text.search(FULL[code]);
        expect(full, `${code} is spelled out`).toBeGreaterThanOrEqual(0);
        expect(bare === -1 || bare >= full, `${code} appears bare before its full form`).toBe(true);
      }
      expect(text).toMatch(/lower is better/);
    });
  }

  it('never shows the composite as a heading or a stat', () => {
    const { container } = render(<AssayTab assay={assayOf('quiet-falsehood')} />);
    for (const h of container.querySelectorAll('h1,h2,h3')) expect(h.textContent).not.toMatch(/\d\.\d\d/);
  });

  it('says so when a run has no Assay readout, rather than inventing one', () => {
    const { container } = render(<AssayTab assay={null} />);
    expect(container.querySelector('[data-assay="none"]')).not.toBeNull();
    expect(container.textContent).toContain('no score readout');
  });

  it('says the test log has no ledger when it carries only published scores', () => {
    const { container } = render(<AssayTab assay={assayOf('paper-fig9-metrics')} />);
    expect(container.querySelector('[data-ledger]')).toBeNull();
    expect(container.querySelector('[data-assay-note]')!.textContent).toContain('no ledger');
  });
});

describe('the Bench is what-if and never touches the report', () => {
  it('recomputes the formula, marks the real values, and Reset restores them', async () => {
    const a = deepFreeze(structuredClone(assayOf('quiet-falsehood')));
    const before = JSON.stringify(a);
    const { container } = render(<AssayBench assay={a} />);
    expect(container.querySelector('[data-whatif]')!.textContent).toBe("What-if. This doesn't re-run the agents.");
    expect(container.querySelectorAll('[data-real-tick]').length).toBeGreaterThan(8);

    const composite = () => container.querySelector('[data-bench-composite]')!.textContent;
    expect(composite()).toBe(a.composite.toFixed(2));
    fireEvent.change(container.querySelector('#bench-fA')!, { target: { value: '0.95' } });
    fireEvent.change(container.querySelector('#bench-jCTS')!, { target: { value: '0.95' } });
    await waitFor(() => expect(composite()).not.toBe(a.composite.toFixed(2)));

    fireEvent.click(screen.getByRole('button', { name: 'Reset to the case' }));
    expect(composite()).toBe(a.composite.toFixed(2));
    expect(JSON.stringify(a)).toBe(before); // the stored readout is untouched (and frozen: a write would throw)
  });

  it('offers nothing to copy, share or stamp', () => {
    const { container } = render(<AssayBench assay={assayOf('quiet-falsehood')} />);
    const labels = [...container.querySelectorAll('button, a')].map((b) => b.textContent ?? '');
    expect(labels.join(' | ')).not.toMatch(/copy|share|stamp|download|save/i);
    expect(within(container).queryByRole('img', { name: /Verdict:/ })).toBeNull();
  });

  it('agrees with the server on the case’s own signals, and recomputes inside a frame', () => {
    const a = assayOf('quiet-falsehood');
    const local = whatIf(signalsOf(a), a.judge_verdict);
    for (const m of METRICS) expect(local.metrics[m]).toBeCloseTo(a.metrics[m], 3);
    expect(local.composite).toBeCloseTo(a.composite, 3);
    const t0 = performance.now();
    whatIf({ ...signalsOf(a), fA: 0.9 }, a.judge_verdict);
    expect(performance.now() - t0).toBeLessThan(150); // 50 ms on a laptop; the ceiling allows a loaded CI box
  });
});

describe('the lineage drawing', () => {
  it('switches between the paper and the production formulas and calls out the framing score', () => {
    const { container } = render(<LineageDiagram />);
    expect(container.querySelector('[data-lineage="code"]')).not.toBeNull();
    expect(container.querySelector('tr[data-signal-row="s_fr"] td:last-child')!.textContent).toBe('4');
    fireEvent.click(screen.getByRole('button', { name: 'Paper formulas' }));
    expect(container.querySelector('[data-lineage="paper"]')).not.toBeNull();
    expect(container.querySelector('tr[data-signal-row="s_fr"] td:last-child')!.textContent).toBe('3');
    expect(container.querySelectorAll('tr[data-signal-row]')).toHaveLength(13);
  });
});
