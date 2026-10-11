/** In-process Vitest adapter for repository-wide local test admission. */

import { parseCLI } from "vitest/node";

import type { LocalHeavyTestTier } from "./local-test-admission.js";
import { discoverVitestSelection } from "./vitest-discovery.js";
import { executeVitestSelection } from "./vitest-execution.js";
import { resolve } from "node:path";

/**
 * Integration suites that read this repository's own tracked content rather than temporary fixtures, so a
 * docs-only change can break them; the docs-only tier runs them. Each entry is a Vitest filename filter.
 */
export const ARC_CONTRACT_SUITES = [
  "framework-sync",
  "live-transition-records",
  "pr-open-extensions",
  "review-gate-workflows",
  "ci-check-plumbing",
] as const;

/**
 * Execute one configured tier through Vitest's supported in-process API.
 *
 * @param tier - Logical package-script tier.
 * @param forwardedArguments - Related source paths for the changed tier, or native Vitest filters and flags.
 * @returns Completion after Vitest has closed its controller resources.
 */
export async function runLocalVitestTier(
  tier: LocalHeavyTestTier,
  forwardedArguments: string[],
): Promise<void> {
  const { filter, options } = parseCLI([
    "vitest",
    tier === "changed" ? "related" : "run",
    ...localVitestTierArguments(tier),
    ...forwardedArguments,
  ]);
  const selection = await discoverVitestSelection(filter, options);
  await executeVitestSelection(selection, { cwd: process.cwd(), env: process.env, tier,
    packageRoot: resolve(import.meta.dirname, "../..") });
}

/**
 * Select configured project membership and portability boundaries for a local tier.
 * @param tier - Validated logical test tier
 * @returns Native Vitest selectors and run-mode flags
 */
export function localVitestTierArguments(tier: LocalHeavyTestTier): string[] {
  switch (tier) {
    case "full":
      return [];
    case "unit":
      return ["--project", "unit", "--project", "unit-mocks"];
    case "changed":
      return ["--run", "--project", "unit", "--project", "unit-mocks", "--passWithNoTests=false"];
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
        "build-context.test.ts",
        "build-cancellation.test.ts",
        "build-generation-lifetime.test.ts",
        "build-coordinator.test.ts",
        "build-publication.test.ts",
        "build-inventory.test.ts",
        "build-ownership.test.ts",
        "ci-build-transfer.test.ts",
        "ci-build-recovery.test.ts",
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
    case "portability-macos":
      return ["anchored-sequence", "git-identity", "locus-errand-roundtrip", "rename"];
  }
}
