import type { Page, Route } from '@playwright/test';

// A believable backend for the site's pages, in the browser (no real server): health, libraries, chunks, Q&A, uploads
// and deletes, and the stored logs of a few runs. Cross-origin JSON requests are preflighted, so each route answers the
// OPTIONS request too. Calls are recorded so a test can assert what the page sent, and when.

const cors = { 'access-control-allow-origin': '*' };

export const KB_READY = { kb_id: 'kb1', name: 'Health KB', source_type: 'file', source_name: 'who.pdf', doc_count: 3, chunk_count: 48, size_bytes: 120000, status: 'ready', created_at: '2026-09-01', tags: [] };
export const KB_INDEXING = { kb_id: 'kb2', name: 'Climate reports', source_type: 'url', source_name: 'https://example.org', doc_count: 5, chunk_count: 210, size_bytes: 2400000, status: 'indexing', created_at: '2026-09-02', tags: [] };
export const KB_ERROR = { kb_id: 'kb3', name: 'Old notes', source_type: 'text', source_name: 'pasted', doc_count: 1, chunk_count: 0, size_bytes: 0, status: 'error', created_at: '2026-09-02', tags: [] };

export const CHUNKS = [
  { index: 0, char_count: 312, text: 'Adults aged 18 to 64 should do at least 150 minutes of moderate-intensity aerobic physical activity throughout the week, or at least 75 minutes of vigorous-intensity activity, or an equivalent combination.' },
  { index: 1, char_count: 280, text: 'For additional health benefits, adults should increase their moderate-intensity aerobic physical activity to 300 minutes per week.' },
  { index: 2, char_count: 130, text: 'Older adults with poor mobility should do physical activity to enhance balance and prevent falls on three or more days per week.' },
];

export const QA_OK = {
  run_id: 'qa1',
  question: 'How much exercise does WHO recommend per week?',
  kb_id: 'kb1',
  kb_name: 'Health KB',
  latency_ms: 800,
  answer: 'Adults should do at least 150 minutes of moderate-intensity activity a week [0]. Up to 300 minutes brings added benefit [1].',
  citations: [
    { chunk_index: 0, score: 0.71, excerpt: CHUNKS[0].text },
    { chunk_index: 1, score: 0.52, excerpt: CHUNKS[1].text },
    { chunk_index: 2, score: 0.31, excerpt: CHUNKS[2].text },
  ],
};
export const QA_OUT = {
  run_id: 'qa2',
  question: 'Who won the 1998 football World Cup?',
  kb_id: 'kb1',
  kb_name: 'Health KB',
  latency_ms: 700,
  answer: 'The knowledge base does not contain information about this.',
  citations: [
    { chunk_index: 2, score: 0.22, excerpt: CHUNKS[2].text },
    { chunk_index: 0, score: 0.18, excerpt: CHUNKS[0].text },
    { chunk_index: 1, score: 0.15, excerpt: CHUNKS[1].text },
  ],
};

export interface Calls {
  health: number;
  runsPosted: { at: number; body: unknown }[];
  uploads: number;
  deleted: string[];
  asked: string[];
}

export interface MockOptions {
  /** /health never answers until `answerHealth()` is called. */
  coldStart?: boolean;
  libraries?: object[];
  /** What POST /runs answers: the run id the page then opens. */
  runId?: string;
}

function answer(route: Route, json: unknown, status = 200) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  }
  return route.fulfill({ status, json, headers: cors });
}

export async function mockBackend(page: Page, opts: MockOptions = {}) {
  const calls: Calls = { health: 0, runsPosted: [], uploads: 0, deleted: [], asked: [] };
  let libraries = [...(opts.libraries ?? [KB_READY, KB_INDEXING, KB_ERROR])];
  let release: () => void = () => {};
  const warm = opts.coldStart ? new Promise<void>((r) => (release = r)) : Promise.resolve();

  await page.route(/\/health$/, async (route) => {
    calls.health += 1;
    await warm;
    await answer(route, { status: 'ok', pipeline_mode: 'online', kb_count: libraries.length });
  });
  await page.route(/\/kb\/list$/, (route) => answer(route, { total: libraries.length, knowledge_bases: libraries }));
  await page.route(/\/kb\/upload$/, async (route) => {
    if (route.request().method() === 'POST') {
      calls.uploads += 1;
      const added = { ...KB_READY, kb_id: 'kb9', name: 'Uploaded notes', doc_count: 1, chunk_count: 7 };
      libraries = [...libraries, added];
      return answer(route, { kb_id: 'kb9', name: 'Uploaded notes', source_type: 'file', chunk_count: 7, size_bytes: 2048, status: 'ready', created_at: 'now', message: 'ok' });
    }
    return answer(route, {});
  });
  await page.route(/\/kb\/(kb\d+)\/chunks$/, (route) => answer(route, { kb_id: 'kb1', name: 'Health KB', chunk_count: CHUNKS.length, chunks: CHUNKS }));
  await page.route(/\/kb\/(kb\d+)$/, async (route) => {
    const id = /\/kb\/(kb\d+)$/.exec(route.request().url())![1];
    if (route.request().method() === 'DELETE') {
      calls.deleted.push(id);
      libraries = libraries.filter((k) => (k as { kb_id: string }).kb_id !== id);
      return answer(route, { kb_id: id, deleted: true, message: 'deleted' });
    }
    const kb = libraries.find((k) => (k as { kb_id: string }).kb_id === id);
    return kb ? answer(route, kb) : answer(route, { detail: 'not found' }, 404);
  });
  await page.route(/\/qa$/, async (route) => {
    if (route.request().method() === 'POST') {
      const q = (JSON.parse(route.request().postData() || '{}') as { question?: string }).question ?? '';
      calls.asked.push(q);
      return answer(route, /1998|unrelated/i.test(q) ? QA_OUT : QA_OK);
    }
    return answer(route, {});
  });
  await page.route(/\/runs$/, async (route) => {
    // The page itself is /runs: only the API's POST (and its preflight) is answered here.
    if (route.request().method() === 'GET') return route.fallback();
    if (route.request().method() === 'POST') {
      calls.runsPosted.push({ at: Date.now(), body: JSON.parse(route.request().postData() || '{}') });
      return route.fulfill({
        status: 202,
        json: { run_id: opts.runId ?? 'sample-exercise-mixed', events_url: '/x', case_url: '/y' },
        headers: cors,
      });
    }
    return answer(route, {});
  });

  return { calls, answerHealth: () => release() };
}

/** Put a library choice or run history into localStorage before the page loads. */
export async function seedStorage(page: Page, values: Record<string, unknown>) {
  await page.addInitScript((entries) => {
    try {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    } catch {
      // storage blocked: the page works without it
    }
  }, values);
}
