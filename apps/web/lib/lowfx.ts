// Low-end devices get no line boil (05 §3.2): four or fewer cores, or the browser's data-saver. `html[data-lowfx]` is
// read by globals.css. Set once on load; nothing else changes with it.

interface Env {
  hardwareConcurrency?: number;
  connection?: { saveData?: boolean };
}

export function isLowFx(nav: Env | undefined): boolean {
  if (!nav) return false;
  return (nav.hardwareConcurrency != null && nav.hardwareConcurrency <= 4) || nav.connection?.saveData === true;
}
