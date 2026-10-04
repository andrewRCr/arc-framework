/** In-process Vitest adapter for repository-wide local test admission. */

import { parseCLI } from "vitest/node";

import { withLocalHeavyTestAdmission, type LocalHeavyTestTier } from "./local-test-admission.js";
import { discoverVitestSelection } from "./vitest-discovery.js";

/**
 * Integration suites that read this repository's own tracked content rather than temporary fixtures, so a
 * docs-only change can break them; the docs-only tier runs them. Each entry is a Vitest filename filter.
 */
export const ARC_CONTRACT_SUITES = [
  "framework-sync",
  "live-transition-records",
  "pr-open-extensions",
  "review-gate-workflows",
] as const;

/**
 * Execute one configured tier through Vitest's supported in-process API.
 *
 * @param tier - Logical package-script tier.
 * @param forwardedArguments - User-supplied Vitest filters and flags.
 * @returns Completion after Vitest has closed its controller resources.
 */
export async function runLocalVitestTier(
  tier: LocalHeavyTestTier,
  forwardedArguments: string[],
): Promise<void> {
  const { filter, options } = parseCLI([
    "vitest",
    "run",
    ...localVitestTierArguments(tier),
    ...forwardedArguments,
  ]);
  const selection = await discoverVitestSelection(filter, options);
  const lifetime = { closed: false };
  const execute = async (): Promise<void> => {
    try { await selection.controller.runTestSpecifications(selection.specifications, true); }
    finally { lifetime.closed = true; await selection.controller.close(); }
  };
  try {
    if (selection.requiresRuntime) {
      await withLocalHeavyTestAdmission({ cwd: process.cwd(), env: process.env, tier }, execute);
    } else await execute();
  } finally { if (!lifetime.closed) await selection.controller.close(); }
}

function localVitestTierArguments(tier: LocalHeavyTestTier): string[] {
  switch (tier) {
    case "full":
      return [];
    case "unit":
      return ["--project", "unit", "--project", "unit-mocks"];
    case "lane":
      return [
        "--project",
        "unit",
        "--project",
        "unit-mocks",
        "--project",
        "integration",
      ];
    case "integration":
      return ["--project", "integration"];
    case "arc-contracts":
      return ["--project", "integration", ...ARC_CONTRACT_SUITES];
    case "e2e":
    case "e2e-focused":
      return ["--project", "e2e"];
    case "portability":
      return [
        "fs.test.ts",
        "local-test-admission.test.ts",
        "worktree-marker.test.ts",
        "commit-message-retry-store.test.ts",
        "advisory-lock",
        "user-sync-notes-lock",
        "ref-tree-cas",
        "state-ref-race.e2e",
        "git-executor",
        "delivery-transfer.e2e",
      ];
  }
}
