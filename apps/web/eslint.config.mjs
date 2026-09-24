import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The pre-upgrade UI. P2 deletes the fake-progress pieces and P9 retires the rest
// (07 §1.1). Until then its known React-compiler findings are warnings, not errors,
// so new code stays under the full rule set.
const legacyUi = [
  "app/page.tsx",
  "components/AtomicClaims.tsx",
  "components/KBManager.tsx",
  "components/MetricsRadar.tsx",
  "components/PerspectivePanel.tsx",
  "components/PipelineProgress.tsx",
  "components/PipelineTimeline.tsx",
  "components/QueryInput.tsx",
  "components/RAGAnswer.tsx",
  "components/Sidebar.tsx",
  "components/TopBar.tsx",
  "components/TransparencyReport.tsx",
  "components/VerdictCard.tsx",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: legacyUi,
    rules: {
      "react/no-unescaped-entities": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;
