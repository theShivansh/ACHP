import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { type Verdict } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format score 0–1 as percentage string */
export function fmt(v: number, decimals = 0): string {
  return `${(v * 100).toFixed(decimals)}%`;
}

/** Format score 0–1 as decimal label */
export function fmtDec(v: number): string {
  return v.toFixed(3);
}

/** Map verdict string → CSS class suffix */
export function verdictClass(v: Verdict | string): string {
  const map: Record<string, string> = {
    TRUE:         'verdict-TRUE',
    MOSTLY_TRUE:  'verdict-MOSTLY_TRUE',
    MIXED:        'verdict-MIXED',
    MOSTLY_FALSE: 'verdict-MOSTLY_FALSE',
    FALSE:        'verdict-FALSE',
    BLOCKED:      'verdict-BLOCKED',
    UNVERIFIABLE: 'verdict-MIXED',
  };
  return map[v] ?? 'verdict-MIXED';
}

/** Map verdict → human label */
export function verdictLabel(v: Verdict | string): string {
  const map: Record<string, string> = {
    TRUE:         'True',
    MOSTLY_TRUE:  'Mostly True',
    MIXED:        'Mixed / Unverified',
    MOSTLY_FALSE: 'Mostly False',
    FALSE:        'False',
    BLOCKED:      'Blocked',
    UNVERIFIABLE: 'Unverifiable',
  };
  return map[v] ?? v;
}

/** Map verdict → icon name (Lucide) */
export function verdictIcon(v: Verdict | string): string {
  const map: Record<string, string> = {
    TRUE:         'check-circle-2',
    MOSTLY_TRUE:  'check-circle',
    MIXED:        'help-circle',
    MOSTLY_FALSE: 'x-circle',
    FALSE:        'ban',
    BLOCKED:      'shield-off',
    UNVERIFIABLE: 'help-circle',
  };
  return map[v] ?? 'help-circle';
}

/** Score → semantic colour class */
export function scoreColour(v: number, invert = false): string {
  const eff = invert ? 1 - v : v;
  if (eff >= 0.75) return 'text-cyan-400';
  if (eff >= 0.50) return 'text-yellow-300';
  return 'text-rose-400';
}

/** Elapsed ms → friendly string */
export function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
