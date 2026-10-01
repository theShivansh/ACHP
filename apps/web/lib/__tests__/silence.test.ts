import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// ACHP is silent (CLAUDE.md non-negotiable 8; 05 §4.1). The anti-slop hook blocks audio on every edit; this is the
// same promise checked from the test run: no audio files, no audio APIs, no sound packages, no sound toggle.

const ROOT = path.resolve(__dirname, '..', '..');
const SKIP = /(node_modules|\.next|__tests__|\.test\.)/;

function all(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (SKIP.test(p)) return [];
    return statSync(p).isDirectory() ? all(p) : [p];
  });
}

describe('silence', () => {
  const files = ['app', 'components', 'lib', 'public', 'e2e'].flatMap((d) => {
    try {
      return all(path.join(ROOT, d));
    } catch {
      return [];
    }
  });

  it('has no audio files', () => {
    expect(files.filter((f) => /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(f))).toEqual([]);
  });

  it('uses no audio API, sound package, speech synthesis or sound toggle', () => {
    const bad = /AudioContext|webkitAudioContext|new Audio\(|<audio\b|speechSynthesis|use-sound|howler|sound[-_ ]?(toggle|enabled)|mute[-_ ]?button/i;
    const hits = files
      .filter((f) => /\.(tsx?|css)$/.test(f))
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          .flatMap((l, i) =>
            bad.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l) ? [`${path.relative(ROOT, f)}:${i + 1}  ${l.trim().slice(0, 100)}`] : [],
          ),
      );
    expect(hits).toEqual([]);
  });

  it('declares no audio dependency', () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: object;
      devDependencies?: object;
    };
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(names.filter((n) => /howler|^tone$|use-sound|wavesurfer|pizzicato|audio/i.test(n))).toEqual([]);
  });
});
