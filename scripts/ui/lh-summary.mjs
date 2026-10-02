// Median Lighthouse numbers per URL from apps/web/.lighthouseci (written by `pnpm lhci`), for PROGRESS.md.
//   node scripts/ui/lh-summary.mjs [--scripts]      --scripts also lists the heaviest script files (transfer size)
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('apps/web/.lighthouseci');
const reports = fs
  .readdirSync(dir)
  .filter((f) => f.startsWith('lhr-') && f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const byUrl = new Map();
for (const r of reports) {
  const u = r.finalDisplayedUrl || r.requestedUrl;
  if (!byUrl.has(u)) byUrl.set(u, []);
  byUrl.get(u).push(r);
}

for (const [url, rs] of byUrl) {
  const a = (id) => median(rs.map((r) => r.audits[id]?.numericValue ?? NaN));
  const js = median(rs.map((r) => r.audits['resource-summary'].details.items.find((i) => i.resourceType === 'script')?.transferSize ?? 0));
  console.log(
    `${new URL(url).pathname}${new URL(url).search} · perf ${Math.round(median(rs.map((r) => r.categories.performance.score)) * 100)} · ` +
      `LCP ${(a('largest-contentful-paint') / 1000).toFixed(2)}s · TBT ${Math.round(a('total-blocking-time'))}ms · ` +
      `CLS ${a('cumulative-layout-shift').toFixed(3)} · JS ${Math.round(js / 1024)}KB (n=${rs.length})`,
  );
  if (process.argv.includes('--scripts')) {
    const items = rs[0].audits['network-requests'].details.items
      .filter((i) => i.resourceType === 'Script')
      .sort((x, y) => y.transferSize - x.transferSize)
      .slice(0, 12);
    for (const i of items) console.log(`   ${Math.round(i.transferSize / 1024)}KB  ${i.url.replace(/^https?:\/\/[^/]+/, '')}`);
  }
}
