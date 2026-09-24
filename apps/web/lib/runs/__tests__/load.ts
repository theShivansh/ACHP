import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { RunEvent } from '../types';

export const SYNTHETIC_DIR = path.resolve(__dirname, 'logs');
export const FIXTURE_DIR = path.resolve(__dirname, '../../../fixtures/runs');

export function readLog(file: string): RunEvent[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as RunEvent);
}

/** Synthetic unit-test logs plus every recorded fixture present in apps/web/fixtures/runs. */
export function allLogs(): { name: string; events: RunEvent[] }[] {
  const out: { name: string; events: RunEvent[] }[] = [];
  for (const dir of [SYNTHETIC_DIR, FIXTURE_DIR]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.jsonl')).sort()) {
      out.push({
        name: `${dir === FIXTURE_DIR ? 'fixture' : 'synthetic'}/${f.replace(/\.jsonl$/, '')}`,
        events: readLog(path.join(dir, f)),
      });
    }
  }
  return out;
}

export const log = (name: string) => readLog(path.join(SYNTHETIC_DIR, `synthetic-${name}.jsonl`));
