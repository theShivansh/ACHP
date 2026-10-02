// Lighthouse CI (09 §3, S9.3): the mobile budgets, asserted against a production build (`next start`).
//
//   pnpm build && ACHP_FIXTURES=1 pnpm start -p 3100      # in one shell
//   pnpm lhci                                             # in another (LHCI_BASE_URL overrides the address)
//
// Lighthouse's default mobile profile is a Moto G Power-class phone on slow 4G. INP cannot be measured in the lab;
// Total Blocking Time stands in for it. The case is the completed fixture (speed=50 ends at once).
const base = process.env.LHCI_BASE_URL || 'http://localhost:3100';

const budget = (lcp, cls, jsKb) => [
  ['categories:performance', ['error', { minScore: 0.9 }]],
  ['largest-contentful-paint', ['error', { maxNumericValue: lcp }]],
  ['cumulative-layout-shift', ['error', { maxNumericValue: cls }]],
  ['total-blocking-time', ['error', { maxNumericValue: 200 }]],
  ['resource-summary:script:size', ['error', { maxNumericValue: jsKb * 1024 }]],
];

module.exports = {
  ci: {
    collect: {
      url: [`${base}/`, `${base}/case/fixture-exercise-mixed?speed=50`],
      numberOfRuns: 3,
      settings: {
        chromeFlags: '--no-sandbox',
        // The first visit compiles nothing (a production build), but the backend's /health is remote: do not let a
        // slow third party decide the score.
        blockedUrlPatterns: ['*hf.space*'],
        // simulate (the Lighthouse default) or devtools (a real throttled load): LHCI_THROTTLING=devtools
        throttlingMethod: process.env.LHCI_THROTTLING || 'simulate',
      },
    },
    assert: {
      assertMatrix: [
        { matchingUrlPattern: '.*:\\d+/$', assertions: Object.fromEntries(budget(2000, 0.03, 120)) },
        { matchingUrlPattern: '.*/case/.*', assertions: Object.fromEntries(budget(2200, 0.05, 180)) },
      ],
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
};
