/**
 * ACHP Assay — TypeScript port of assay.py (the source of truth). Pinned by vectors.json (see assay.test.mjs).
 * Used client-side by the Assay Bench (what-if) and for rendering; the server emits the same values in the
 * `assay.computed` event. Pure functions, no dependencies.
 *
 * Metric full forms: CTS Consensus Truth Score · PCS Perspective Completeness Score · BIS Bias Impact Score
 * (higher = more bias) · NSS Narrative Stance Score · EPS Epistemic Position Score.
 * Composite C = (CTS + PCS + (1 − BIS) + NSS + EPS) / 5.
 */

export const FORMULA_VERSION = 'achp-metrics/1.0';
export type Mode = 'paper' | 'code';
export type Verdict = 'FALSE' | 'MOSTLY_FALSE' | 'MIXED' | 'MOSTLY_TRUE' | 'TRUE';
export type Frame = 'neutral' | 'alarm' | 'delegitimize' | 'conspiracy';
export type MetricName = 'CTS' | 'PCS' | 'BIS' | 'NSS' | 'EPS';

export const METRICS: MetricName[] = ['CTS', 'PCS', 'BIS', 'NSS', 'EPS'];
export const FULL_FORMS: Record<MetricName, string> = {
  CTS: 'Consensus Truth Score',
  PCS: 'Perspective Completeness Score',
  BIS: 'Bias Impact Score',
  NSS: 'Narrative Stance Score',
  EPS: 'Epistemic Position Score',
};
/** Paper Fig. 13: Pearson r against human annotation, n = 200 claims. */
export const HUMAN_AGREEMENT_R: Record<MetricName, number> = { CTS: 0.81, PCS: 0.74, BIS: 0.69, NSS: 0.72, EPS: 0.78 };

const SCALE: [number, Verdict][] = [[0.85, 'TRUE'], [0.70, 'MOSTLY_TRUE'], [0.50, 'MIXED'], [0.30, 'MOSTLY_FALSE'], [0, 'FALSE']];
export const VERDICT_ORDER: Verdict[] = ['FALSE', 'MOSTLY_FALSE', 'MIXED', 'MOSTLY_TRUE', 'TRUE'];
const FRAME_BOOST: Record<string, number> = { delegitimize: 0.15, conspiracy: 0.15, alarm: 0.05 };
export const FRAMES: Frame[] = ['neutral', 'alarm', 'delegitimize'];

export interface Signals {
  fA: number; jCTS: number; s_nil: number; s_fr: number; pol: number; frame: Frame;
  fB: number; s_pcs: number; n_miss: number; v_eps: number; hr: number;
  a_narr?: number | null; jNSS?: number | null;
}
type SignalName = keyof Signals;
type Kind = 'continuous' | 'categorical' | 'count';

export const SIGNAL_INFO: Record<SignalName, [string, Kind]> = {
  fA: ['Adversary A factual score', 'continuous'],
  jCTS: ['Judge raw CTS', 'continuous'],
  s_nil: ['NIL bias score (BiasGroq)', 'continuous'],
  s_fr: ['Framing score (FramingCosine)', 'continuous'],
  pol: ['|VADER polarity|', 'continuous'],
  frame: ['Dominant frame', 'categorical'],
  fB: ['Adversary B perspective score', 'continuous'],
  s_pcs: ['NIL perspective score', 'continuous'],
  n_miss: ['Missing perspectives (count)', 'count'],
  a_narr: ['Narrative alignment', 'continuous'],
  jNSS: ['Judge raw NSS', 'continuous'],
  v_eps: ['VADER epistemic score', 'continuous'],
  hr: ['Hedge ratio', 'continuous'],
};
const FACTUAL: SignalName[] = ['fA', 'jCTS'];

export const REFERENCE: Signals = { fA: 0.5, jCTS: 0.5, s_nil: 0.5, s_fr: 0.5, pol: 0.5, frame: 'neutral',
  fB: 0.5, s_pcs: 0.5, n_miss: 5, v_eps: 0.5, hr: 1 / 6, a_narr: 0.5, jNSS: 0.5 };

const clamp = (x: number) => Math.min(1, Math.max(0, x));
/** Round to 4 dp. Matches Python's round() except on exact binary ties (documented; parity tolerance 1e-4). */
const r4 = (x: number) => Number(x.toFixed(4));
const nz = (v: number | null | undefined): v is number => v !== null && v !== undefined;

export function features(mode: Mode, s: Signals): SignalName[] {
  const names: SignalName[] = ['fA', 'jCTS', 's_nil', 's_fr', 'pol', 'frame', 'fB', 's_pcs', 'n_miss', 'v_eps', 'hr'];
  if (mode === 'paper') names.push('a_narr', 'jNSS');
  else if (nz(s.jNSS)) names.push('jNSS');
  return names;
}

export interface Result {
  mode: Mode; formula_version: string; metrics: Record<MetricName, number>; composite: number;
  formula_verdict: Verdict; clamped: MetricName[];
}

function metricsOf(s: Signals, mode: Mode, round: boolean) {
  const rr = round ? r4 : (x: number) => x;
  const clamped: MetricName[] = [];
  const cl = (name: MetricName, x: number) => { const y = clamp(x); if (y !== x) clamped.push(name); return rr(y); };
  const boost = FRAME_BOOST[s.frame] ?? 0;
  const BIS = cl('BIS', 0.55 * s.s_nil + 0.25 * s.s_fr + 0.12 * s.pol + boost);
  const EPS = cl('EPS', 0.70 * s.v_eps + 0.20 * (1 - s.s_fr) + 0.10 * Math.min(1, s.hr * 3));
  const CTS = cl('CTS', 0.40 * s.fA + 0.35 * s.jCTS + 0.15 * (1 - BIS) + 0.10 * EPS);
  const PCS = cl('PCS', 0.50 * s.fB + 0.30 * s.s_pcs + 0.20 * (1 - Math.min(1, s.n_miss / 10)));
  let aNarr: number, jNss: number;
  if (mode === 'paper') { aNarr = nz(s.a_narr) ? s.a_narr : 0.5; jNss = nz(s.jNSS) ? s.jNSS : 0.5; }
  else { aNarr = 1 - s.s_fr; jNss = nz(s.jNSS) ? s.jNSS : rr(Math.max(0, 1 - 0.6 * BIS - 0.4 * s.s_fr)); }
  const NSS = cl('NSS', 0.40 * (1 - s.s_fr) + 0.35 * aNarr + 0.25 * jNss);
  const composite = rr((CTS + PCS + (1 - BIS) + NSS + EPS) / 5);
  return { metrics: { CTS, PCS, BIS, NSS, EPS }, composite, clamped };
}

export function verdictOf(c: number): Verdict {
  for (const [t, v] of SCALE) if (c >= t) return v;
  return 'FALSE';
}

export function compute(s: Signals, mode: Mode = 'code'): Result {
  const m = metricsOf(s, mode, true);
  return { mode, formula_version: FORMULA_VERSION, ...m, formula_verdict: verdictOf(m.composite) };
}
const C = (s: Signals, mode: Mode) => metricsOf(s, mode, true).composite;
const Cu = (s: Signals, mode: Mode) => metricsOf(s, mode, false).composite;

/* ─────────── Integrity Ledger: exact Shapley attribution (double-entry, always balances) ─────────── */
export interface LedgerEntry { signal: SignalName; label: string; value: unknown; reference: unknown; amount: number }
export function ledger(s: Signals, mode: Mode = 'code', reference: Signals = REFERENCE) {
  const names = features(mode, s);
  const n = names.length;
  const ref: Signals = mode === 'code' && !nz(s.jNSS) ? { ...reference, jNSS: null } : reference;
  const v = new Float64Array(1 << n);
  for (let m = 0; m < 1 << n; m++) {
    const x: Signals = { ...ref };
    names.forEach((name, i) => { if (m >> i & 1) (x as any)[name] = (s as any)[name]; });
    v[m] = Cu(x, mode);
  }
  const fact = [1]; for (let k = 1; k <= n; k++) fact[k] = fact[k - 1] * k;
  const phi = names.map((_, i) => {
    const bit = 1 << i; let acc = 0;
    for (let m = 0; m < 1 << n; m++) {
      if (m & bit) continue;
      let k = 0; for (let t = m; t; t &= t - 1) k++;
      acc += fact[k] * fact[n - k - 1] / fact[n] * (v[m | bit] - v[m]);
    }
    return acc;
  });
  const opening = v[0], closing = v[(1 << n) - 1];
  const entries: LedgerEntry[] = names.map((name, i) => ({ signal: name, label: SIGNAL_INFO[name][0],
    value: (s as any)[name], reference: (ref as any)[name], amount: phi[i] })).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const tot = phi.reduce((a, p) => a + Math.abs(p), 0) || 1e-12;
  return { mode, opening_balance: opening, entries, closing_balance: closing,
    check: Math.abs(opening + phi.reduce((a, p) => a + p, 0) - closing),
    credits: phi.filter(p => p > 0).reduce((a, p) => a + p, 0), debits: phi.filter(p => p < 0).reduce((a, p) => a + p, 0),
    factual_share: entries.filter(e => FACTUAL.includes(e.signal)).reduce((a, e) => a + Math.abs(e.amount), 0) / tot };
}

/* ─────────── Tipping Point: smallest single-signal change that flips the formula verdict ─────────── */
export interface Flip { signal: SignalName; label: string; from: unknown; to: unknown; distance: number; new_verdict: Verdict }
export function tippingPoint(s: Signals, mode: Mode = 'code') {
  const base = compute(s, mode); const v0 = base.formula_verdict; const flips: Flip[] = [];
  const at = (name: SignalName, val: unknown) => verdictOf(C({ ...s, [name]: val } as Signals, mode));
  for (const name of features(mode, s)) {
    const cur = (s as any)[name]; const kind = SIGNAL_INFO[name][1];
    let best: [unknown, number, Verdict] | null = null;
    if (kind === 'categorical') {
      for (const val of FRAMES) { if (val === cur) continue; const v1 = at(name, val); if (v1 !== v0) { best = [val, 1, v1]; break; } }
    } else if (kind === 'count') {
      const dom = Array.from({ length: 11 }, (_, i) => i).sort((a, b) => Math.abs(a - cur) - Math.abs(b - cur));
      for (const val of dom) { if (val === cur) continue; const v1 = at(name, val); if (v1 !== v0) { best = [val, Math.abs(val - cur) / 10, v1]; break; } }
    } else {
      for (const dir of [-1, 1]) {
        let prev = cur as number;
        const start = dir > 0 ? Math.floor(cur * 1000) + 1 : Math.ceil(cur * 1000) - 1;
        for (let k = start; dir > 0 ? k <= 1000 : k >= 0; k += dir) {
          const g = k / 1000; if (dir > 0 ? g <= cur : g >= cur) continue;
          const v1 = at(name, g);
          if (v1 !== v0) {
            let lo = prev, hi = g;
            for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (at(name, mid) === v0) lo = mid; else hi = mid; }
            const d = Math.abs(hi - cur);
            if (!best || d < best[1]) best = [hi, d, at(name, hi)];
            break;
          }
          prev = g;
        }
      }
    }
    if (best) flips.push({ signal: name, label: SIGNAL_INFO[name][0], from: cur, to: best[0], distance: best[1], new_verdict: best[2] });
  }
  flips.sort((a, b) => a.distance - b.distance);
  const cont = flips.filter(f => SIGNAL_INFO[f.signal][1] !== 'categorical');
  const d = cont.length ? cont[0].distance : null;
  const band = d === null || d >= 0.25 ? 'settled' : d >= 0.10 ? 'firm' : 'fragile';
  return { verdict: v0, composite: base.composite, flips, min_distance: d, band } as const;
}

/* ─────────── Two-Key Verdict ─────────── */
export function twoKey(judge: string, formula: Verdict) {
  if (judge === 'UNVERIFIABLE' || judge === 'BLOCKED') return { state: 'not_applicable', steps: null, judge, formula } as const;
  const steps = Math.abs(VERDICT_ORDER.indexOf(judge as Verdict) - VERDICT_ORDER.indexOf(formula));
  return { state: steps === 0 ? 'agree' : steps === 1 ? 'adjacent' : 'split', steps, judge, formula } as const;
}

/* ─────────── Masking: Narrative Lift & Quiet Falsehood Index ─────────── */
export const QFI_FLAG = 0.45;
export function masking(r: Pick<Result, 'metrics' | 'composite' | 'formula_verdict'>) {
  const m = r.metrics;
  const calm = ((1 - m.BIS) + m.NSS + m.EPS) / 3;
  const lift = r.composite - m.CTS;
  const qfi = (1 - m.CTS) * calm;
  const weak = m.CTS < 0.40;
  const lifted = VERDICT_ORDER.indexOf(r.formula_verdict) >= VERDICT_ORDER.indexOf('MIXED');
  return { calm: r4(calm), narrative_lift: r4(lift), qfi: r4(qfi), masking: weak && lifted, quiet_falsehood: weak && qfi >= QFI_FLAG };
}

/* ─────────── Leverage: local dC/dsignal ─────────── */
export function leverage(s: Signals, mode: Mode = 'code', h = 1e-4) {
  const gradient: Partial<Record<SignalName, number>> = {};
  for (const name of features(mode, s)) {
    const kind = SIGNAL_INFO[name][1]; if (kind === 'categorical') continue;
    const cur = (s as any)[name] as number;
    const [lo, hi] = kind === 'count' ? [Math.max(0, cur - 1), cur + 1] : [Math.max(0, cur - h), Math.min(1, cur + h)];
    gradient[name] = (Cu({ ...s, [name]: hi } as Signals, mode) - Cu({ ...s, [name]: lo } as Signals, mode)) / (hi - lo);
  }
  const cont = Object.entries(gradient).filter(([k]) => SIGNAL_INFO[k as SignalName][1] === 'continuous') as [SignalName, number][];
  const total = cont.reduce((a, [, g]) => a + Math.abs(g), 0);
  const share = Object.fromEntries(cont.map(([k, g]) => [k, Math.abs(g) / total])) as Partial<Record<SignalName, number>>;
  const top = cont.reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a))[0];
  return { mode, gradient, share, factual_share: FACTUAL.reduce((a, k) => a + (share[k] ?? 0), 0), top };
}

/* ─────────── Lineage & Integrity Map ─────────── */
export const LINEAGE: Record<MetricName, string[]> = {
  BIS: ['s_nil', 's_fr', 'pol', 'frame'], EPS: ['v_eps', 's_fr', 'hr'], CTS: ['fA', 'jCTS', 'BIS', 'EPS'],
  PCS: ['fB', 's_pcs', 'n_miss'], NSS: ['s_fr', 'a_narr', 'jNSS'],
};
export function integrityMapXY(r: Pick<Result, 'metrics'>) {
  const m = r.metrics; const x = m.CTS; const y = ((1 - m.BIS) + m.NSS + m.EPS) / 3;
  const quadrant = x >= 0.5 ? (y >= 0.5 ? 'sound' : 'true_but_loaded') : (y >= 0.5 ? 'quiet_falsehood' : 'loud_falsehood');
  return { x: r4(x), y: r4(y), quadrant } as const;
}

export function fromMetrics(metrics: Record<MetricName, number>) {
  const c = r4((metrics.CTS + metrics.PCS + (1 - metrics.BIS) + metrics.NSS + metrics.EPS) / 5);
  return { metrics, composite: c, formula_verdict: verdictOf(c) };
}

export function assay(s: Signals, judgeVerdict: string, mode: Mode = 'code') {
  const r = compute(s, mode);
  return { ...r, signals: s, judge_verdict: judgeVerdict, two_key: twoKey(judgeVerdict, r.formula_verdict),
    ledger: ledger(s, mode), tipping_point: tippingPoint(s, mode), masking: masking(r), leverage: leverage(s, mode),
    integrity_map: integrityMapXY(r), human_agreement_r: HUMAN_AGREEMENT_R };
}
