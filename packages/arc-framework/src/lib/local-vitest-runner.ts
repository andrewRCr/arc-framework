/** In-process Vitest adapter for repository-wide local test admission. */

import { parseCLI, startVitest } from "vitest/node";

import type { LocalHeavyTestTier } from "./local-test-admission.js";

type ParsedVitestOptions = ReturnType<typeof parseCLI>["options"];

interface VitestController {
  shouldKeepServer(): boolean;
  exit(): Promise<void>;
}

interface LocalVitestRunnerDependencies {
  parseCli(argv: string[]): { filter: string[]; options: ParsedVitestOptions };
  start(mode: "test", filters: string[], options: ParsedVitestOptions): Promise<VitestController>;
}

const DEFAULT_DEPENDENCIES: LocalVitestRunnerDependencies = {
  parseCli: parseCLI,
  start: async (mode, filters, options) => await startVitest(mode, filters, options),
};

/**
 * Execute one configured tier through Vitest's supported in-process API.
 *
 * @param tier - Logical package-script tier.
 * @param forwardedArguments - User-supplied Vitest filters and flags.
 * @param dependencies - Injectable parser and controller startup seams.
 * @returns Completion after Vitest has closed its controller resources.
 */
export async function runLocalVitestTier(
  tier: LocalHeavyTestTier,
  forwardedArguments: string[],
  dependencies: LocalVitestRunnerDependencies = DEFAULT_DEPENDENCIES,
): Promise<void> {
  const { filter, options } = dependencies.parseCli([
    "vitest",
    "run",
    ...localVitestTierArguments(tier),
    ...forwardedArguments,
  ]);
  const context = await dependencies.start("test", filter, normalizeCliOptions(options));
  if (!context.shouldKeepServer()) await context.exit();
}

function normalizeCliOptions(options: ParsedVitestOptions): ParsedVitestOptions {
  if (options.exclude === undefined) return options;
  const { exclude, ...normalized } = options;
  return { ...normalized, cliExclude: exclude };
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
      return [
        "--project",
        "integration",
        "framework-sync",
        "pr-open-extensions",
        "review-gate-workflows",
      ];
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
