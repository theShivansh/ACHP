// Parity + property tests for the web port (lib/assay/assay.ts) against vectors.json, which assay.py produced.
// Run: node --experimental-strip-types --test apps/web/lib/assay/assay.test.mjs
// The port and the vectors must be byte copies of reference/assay (checked below when the reference is present).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { compute, ledger, tippingPoint, twoKey, masking, integrityMapXY, leverage, fromMetrics } from './assay.ts';

const V = JSON.parse(readFileSync(new URL('./vectors.json', import.meta.url)));
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('formula version matches python', () => assert.equal(V.formula_version, 'achp-metrics/1.0'));

for (const c of V.cases) {
  test(`parity ${c.name} (${c.mode})`, () => {
    const s = c.signals;
    const r = compute(s, c.mode);
    for (const k of Object.keys(c.metrics)) close(r.metrics[k], c.metrics[k], 1e-4, `${k}`);
    close(r.composite, c.composite, 1e-4, 'composite');
    assert.equal(r.formula_verdict, c.formula_verdict);
    assert.equal(twoKey(c.judge, r.formula_verdict).state, c.two_key);
    const lg = ledger(s, c.mode);
    assert.ok(lg.check < 1e-9, 'ledger balances');
    close(lg.opening_balance, c.opening, 1e-9, 'opening');
    for (const e of lg.entries) close(e.amount, c.ledger[e.signal], 1e-7, `ledger ${e.signal}`);
    const tp = tippingPoint(s, c.mode);
    if (c.tipping_min === null) assert.equal(tp.min_distance, null);
    else close(tp.min_distance, c.tipping_min, 1e-5, 'tipping distance');
    assert.equal(tp.flips[0]?.signal ?? null, c.tipping_first);
    const m = masking(r);
    assert.equal(m.masking, c.masking.masking); assert.equal(m.quiet_falsehood, c.masking.quiet_falsehood);
    close(m.qfi, c.masking.qfi, 1e-4, 'qfi');
    assert.equal(integrityMapXY(r).quadrant, c.map.quadrant);
  });
}

test('leverage closed form (code mode)', () => {
  const s = { fA: .5, jCTS: .5, s_nil: .4, s_fr: .4, pol: .4, frame: 'neutral', fB: .5, s_pcs: .5, n_miss: 4, v_eps: .5, hr: .1 };
  const g = leverage(s, 'code').gradient;
  close(g.fA, 0.08, 1e-6, 'fA'); close(g.s_fr, -0.279, 1e-6, 's_fr');
});

test('paper Fig. 9 metrics are a two-key disagreement', () => {
  const r = fromMetrics({ CTS: .52, PCS: .51, BIS: .42, NSS: .75, EPS: .30 });
  close(r.composite, 0.532, 1e-9, 'C'); assert.equal(r.formula_verdict, 'MIXED');
  assert.equal(twoKey('MOSTLY_FALSE', r.formula_verdict).state, 'adjacent');
});

test('ledger performance is interactive-grade', () => {
  const s = V.cases.find(c => c.mode === 'paper').signals;
  const t0 = performance.now(); for (let i = 0; i < 10; i++) ledger(s, 'paper'); const ms = (performance.now() - t0) / 10;
  assert.ok(ms < 60, `ledger took ${ms.toFixed(1)}ms`);
});

const lf = (text) => text.replace(/\r\n/g, '\n');
for (const file of ['assay.ts', 'vectors.json']) {
  test(`${file} is a copy of the reference`, (t) => {
    const ref = new URL(`../../../../reference/assay/${file}`, import.meta.url);
    if (!existsSync(ref)) return t.skip('the reference is not in this checkout (a web-only deploy)');
    assert.equal(lf(readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')), lf(readFileSync(ref, 'utf8')),
      `${file} drifted from reference/assay/${file}`);
  });
}
