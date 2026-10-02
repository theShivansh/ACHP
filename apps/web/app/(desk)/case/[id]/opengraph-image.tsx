import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { GEOMETRY, W } from '@/components/assay/hallmarkGeometry';
import { fillLevel, METRIC_INFO, METRICS } from '@/lib/assay/present';
import { loadCase } from '@/lib/runs/loadCase';
import { excerpt, seededTilt, verdictInfo } from '@/lib/verdict';

// The share card (S6.x): 1200×630, the wordmark, the verdict as a stamp, and a claim excerpt. Per
// the Truth-first rule (11 §4) no score and no composite is ever drawn here: the stamp is the
// headline. A stored test log carries a watermark so it can't pass as a real check.

export const alt = 'An ACHP fact-check';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Design tokens (04 §3.1/3.3), as literals because an image has no CSS variables.
const SHEET = '#F3F5F6';
const INK = '#14181C';
const INK_2 = '#4B545D';
const RULE = '#D6DCE1';
const HATCH = '#B42F28';

/** One cartouche, drawn as the Hallmark draws it (shape, rising ink, hatched for bias). No letters: an image has no font. */
function Cartouche({ code, value }: { code: (typeof METRICS)[number]; value: number }) {
  const info = METRIC_INFO[code];
  const g = GEOMETRY[info.shape];
  const top = g.bottom - (g.bottom - g.top) * fillLevel(value);
  return (
    <svg width={62} height={62} viewBox={`0 0 ${W} ${W}`}>
      <defs>
        <clipPath id={`c-${code}`}>
          <path d={g.path} />
        </clipPath>
        <pattern id={`h-${code}`} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="3" stroke={HATCH} strokeWidth="1.25" />
        </pattern>
      </defs>
      <g clipPath={`url(#c-${code})`}>
        <rect x="0" y={top} width={W} height={W} fill={code === 'BIS' ? `url(#h-${code})` : INK_2} fillOpacity={code === 'BIS' ? 1 : 0.55} />
      </g>
      <path d={g.path} fill="none" stroke={INK} strokeWidth={info.fine ? 1 : 1.5} strokeLinejoin="round" />
      {g.extra && <path d={g.extra} fill="none" stroke={INK} strokeWidth={info.fine ? 1 : 1.5} />}
    </svg>
  );
}

const TONE = { support: '#23713F', red: '#B42F28', ochre: '#8A5A00', graphite: '#59636C' } as const;

/**
 * Newsreader for the claim and the stamp, from the bundled @fontsource files (WOFF, which the
 * renderer reads), so the image never depends on a network fetch.
 */
async function newsreader(weight: 500 | 600) {
  try {
    const file = path.join(/*turbopackIgnore: true*/ process.cwd(), 'node_modules', '@fontsource', 'newsreader', 'files', `newsreader-latin-${weight}-normal.woff`);
    const buf = await readFile(file);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadCase(id);
  const label = loaded?.state.verdict?.overall.label;
  const info = verdictInfo(label);
  const claim = loaded?.state.input?.text;
  // A synthetic unit-test log must never pass as a check; a recorded run is labelled as a replay.
  const note = loaded?.fixture
    ? loaded.fixture.startsWith('synthetic-')
      ? 'Test log, not a real check'
      : 'A recorded check, replayed'
    : 'Every statement in the report traces to a quoted source.';

  const metrics = label && label !== 'blocked' ? loaded?.state.assay?.metrics : undefined;
  const stamp = info?.stamp ?? 'ACHP';
  const line = claim ? `“${excerpt(claim, 150)}”` : 'A claim checked by seven agents against the sources.';
  const tone = info ? TONE[info.tone] : INK_2;
  const [regular, bold] = await Promise.all([newsreader(500), newsreader(600)]);
  const fonts = [
    ...(regular ? [{ name: 'Newsreader', data: regular, weight: 500 as const, style: 'normal' as const }] : []),
    ...(bold ? [{ name: 'Newsreader', data: bold, weight: 600 as const, style: 'normal' as const }] : []),
  ];
  const fontFamily = fonts.length ? 'Newsreader' : 'serif';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: SHEET,
          color: INK,
          padding: '64px 72px',
          fontFamily,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 44, fontWeight: 600 }}>ACHP</div>
          <div style={{ fontSize: 26, color: INK_2 }}>Checked against the sources</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          <div style={{ display: 'flex', fontSize: 58, lineHeight: 1.18, fontWeight: 500 }}>{line}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
            <div
              style={{
                display: 'flex',
                border: `6px solid ${tone}`,
                borderRadius: 8,
                color: tone,
                fontSize: 62,
                fontWeight: 600,
                letterSpacing: 2,
                flexShrink: 0,
                whiteSpace: 'nowrap',
                padding: '10px 32px',
                transform: `rotate(${info ? seededTilt(id) : 0}deg)`,
              }}
            >
              {stamp}
            </div>
            {metrics && (
              <div style={{ display: 'flex', gap: 10 }}>
                {METRICS.map((m) => (
                  <Cartouche key={m} code={m} value={metrics[m]} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', borderTop: `2px solid ${RULE}`, paddingTop: 20, fontSize: 24, color: INK_2 }}>
          {note}
        </div>
      </div>
    ),
    { ...size, ...(fonts.length ? { fonts } : {}) },
  );
}
