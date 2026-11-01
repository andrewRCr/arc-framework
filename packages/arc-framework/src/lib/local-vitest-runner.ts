/** In-process Vitest adapter for repository-wide local test admission. */

import { parseCLI, type TestSpecification } from "vitest/node";

import type { GitExec } from "./git/exec.js";
import type { LocalHeavyTestTier } from "./local-test-admission.js";
import { discoverVitestSelection, EmptyVitestSelectionError } from "./vitest-discovery.js";
import { executeVitestSelection } from "./vitest-execution.js";
import { readFile } from "node:fs/promises";
import { checkVitestCompletion } from "./vitest-completion.js";
import { resolve, sep } from "node:path";

/**
 * Integration suites that read this repository's own tracked content rather than temporary fixtures, so a
 * docs-only change can break them; the docs-only tier runs them. Each entry is a Vitest filename filter.
 */
export const ARC_CONTRACT_SUITES = [
  "framework-sync",
  "live-transition-records",
  "pr-lifecycle",
  "review-gate-workflows",
  "ci-check-plumbing",
  "markdown/descriptor-spacing",
  "task-list/scanner",
  "work-unit/boundary-fit-workflow-contract",
  "work-unit/decompose-doctrine-contract",
  "work-unit/decompose-workflow-contract",
  "work-unit/decompose-v3-authority-boundary",
  "work-unit/decompose-v3-repository-plan",
  "work-unit/decompose-v3-topology",
  "work-unit/generate-tasks-delivery-authoring-contract",
  "work-unit/deliver-stack-entry-contract",
  "work-unit/delivery-branch-namespace",
  "scripts/integration/checkpoint-lifecycle-artifacts",
  "scripts/review-gate/core/disposition-report",
] as const;

/**
 * Reach declarations, package-relative, whose suites run by reach in their own check rather than in the tiers that
 * would otherwise run them whole.
 */
export const REACH_DECLARATIONS = ["__tests__/reach/store-suites.json"] as const;

/** Names the form of a portability run; a pull request's leaves its store suites to their own check. */
const PORTABILITY_FORM_VARIABLE = "ARC_PORTABILITY_FORM";

/**
 * Exit status of a related-tests run that no configured unit test reaches, so a caller can tell missing evidence
 * from a failing test. pytest exits with the same status when it collects no tests.
 */
export const EMPTY_RELATED_SELECTION_EXIT_CODE = 5;

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
  const packageRoot = resolve(import.meta.dirname, "../..");
  const { filter, options } = parseCLI([
    "vitest",
    tier === "changed" ? "related" : "run",
    ...await localVitestTierRunArguments(packageRoot, tier, process.env),
    ...forwardedArguments,
  ]);
  const guardPath = unitChangeGuard(tier, options.related);
  const originalCoverage = new Set<string>();
  const selection = await discoverVitestSelection(filter, options, guardPath === undefined ? undefined
    : async (specifications, controller) => {
      for (const specification of specifications) originalCoverage.add(specification.taskId);
      const guard = await controller.globTestSpecifications([guardPath]);
      return [...specifications, ...guard.filter(({ taskId, moduleId }) =>
        resolve(moduleId) === guardPath && !originalCoverage.has(taskId))];
    });
  await executeVitestSelection(selection, { cwd: process.cwd(), env: process.env, tier, packageRoot }, () => {
    if (guardPath === undefined) return;
    if (!selection.specifications.some(({ taskId }) => originalCoverage.has(taskId))) {
      throw new EmptyVitestSelectionError();
    }
    checkVitestCompletion({ unhandledErrors: selection.controller.state.getUnhandledErrors(),
      testModules: selection.controller.state.getTestModules()
        .filter((module) => originalCoverage.has(module.toTestSpecification().taskId)),
    }, selection.controller.logger);
  });
}

function unitChangeGuard(tier: LocalHeavyTestTier, related: string | string[] | undefined): string | undefined {
  if (tier !== "changed" || !Array.isArray(related)) return undefined;
  const unitDirectory = resolve(import.meta.dirname, "../../__tests__/unit");
  return related.some((path) => resolve(path).startsWith(`${unitDirectory}${sep}`))
    ? resolve(unitDirectory, "isolated-mock-files.guard.test.ts") : undefined;
}

/**
 * Compose a tier's native selectors as the tier runs: its project membership and portability boundaries, less the
 * suites that run by reach in their own check.
 * @param packageRoot - Package root holding the reach declarations
 * @param tier - Logical test tier
 * @param env - Environment naming the portability run's form
 * @returns Native Vitest selectors and run-mode flags
 */
export async function localVitestTierRunArguments(packageRoot: string, tier: LocalHeavyTestTier,
  env: Readonly<Record<string, string | undefined>>): Promise<string[]> {
  return [...localVitestTierArguments(tier),
    ...reachSuiteExclusions(tier, env, await readReachSuites(packageRoot, tier, env))];
}

/**
 * Leave the suites that run by reach out of the tiers that would run them whole: the integration tier, the lane that
 * contains it, and a pull request's portability run.
 * @param tier - Logical package-script tier
 * @param env - The run's environment, which names a portability run's form
 * @param suites - Package-relative suite globs of every reach declaration
 * @returns Native exclusion arguments
 */
export function reachSuiteExclusions(tier: LocalHeavyTestTier, env: Readonly<Record<string, string | undefined>>,
  suites: readonly string[]): string[] {
  const excluded = tier === "integration" || tier === "lane"
    || (tier === "portability" && env[PORTABILITY_FORM_VARIABLE] === "pull-request");
  return excluded ? suites.flatMap((suite) => ["--exclude", suite]) : [];
}

async function readReachSuites(packageRoot: string, tier: LocalHeavyTestTier,
  env: Readonly<Record<string, string | undefined>>): Promise<string[]> {
  if (reachSuiteExclusions(tier, env, ["any"]).length === 0) return [];
  const { ReachDeclarationSchema } = await import("./vitest-reach.js");
  const suites: string[] = [];
  for (const path of REACH_DECLARATIONS) {
    const declaration = ReachDeclarationSchema.parse(JSON.parse(await readFile(resolve(packageRoot, path), "utf8")));
    const prefix = `${declaration.package}/`;
    for (const suite of declaration.suites) {
      if (!suite.startsWith(prefix)) throw new Error(`Reach suite ${suite} lies outside its package ${declaration.package}`);
      suites.push(suite.slice(prefix.length));
    }
  }
  return suites;
}

/**
 * Run the local E2E check over the paths its selection supplied, from the package root.
 *
 * @param checkoutRoot - Repository root the supplied paths are relative to.
 * @param paths - Repository-relative paths the check selected; none runs the whole suite.
 * @param changed - The check's base, when it named one, and the Git boundary that reads deletions since it.
 * @returns Completion after Vitest has closed its controller resources.
 */
export async function runLocalE2eCheck(
  checkoutRoot: string, paths: readonly string[], changed: { base?: string; git: GitExec },
): Promise<void> {
  const { filter, options } = parseCLI(["vitest", "run", ...localVitestTierArguments("e2e")]);
  const deleted = changed.base !== undefined && changed.base !== ""
    && await hasDeletedE2eFiles(changed.git, process.cwd(), changed.base);
  const requested = deleted ? [] : paths.map((path) => resolve(checkoutRoot, path));
  const chosen: { tier: LocalHeavyTestTier } = { tier: "e2e" };
  const selection = await discoverVitestSelection(filter, options, (specifications) => {
    const choice = selectLocalE2eSpecifications(requested, specifications);
    chosen.tier = choice.tier;
    return choice.specifications;
  });
  await executeVitestSelection(selection, { cwd: process.cwd(), env: process.env, tier: chosen.tier,
    packageRoot: resolve(import.meta.dirname, "../..") });
}

/**
 * Whether the E2E test tree lost a file since the base, comparing the working tree, or Git could not say. A check
 * drops deleted paths before its command runs, and a deleted support file may have served any specification.
 *
 * @param git - Git process boundary.
 * @param packageRoot - Package root holding the E2E test tree.
 * @param base - Commit the check compared against.
 * @returns True when a file under the E2E test tree was deleted or renamed away, or the read failed.
 */
export async function hasDeletedE2eFiles(git: GitExec, packageRoot: string, base: string): Promise<boolean> {
  try {
    const { stdout } = await git("git", ["diff", "--name-only", "--no-renames", "--diff-filter=D", "-z",
      "--end-of-options", base, "--", "__tests__/e2e"], { cwd: packageRoot });
    return stdout !== "";
  } catch {
    return true;
  }
}

/**
 * Keep only the requested E2E specifications when every requested path is one. Any other path, such as a helper,
 * fixture, or setup file, may reach any specification, so it keeps the whole suite, as does an empty request.
 *
 * @param requested - Absolute paths the check selected.
 * @param specifications - Configured E2E specifications in native order.
 * @returns The tier to admit and the specifications to run, in native order.
 */
export function selectLocalE2eSpecifications(
  requested: readonly string[], specifications: TestSpecification[],
): { tier: "e2e" | "e2e-focused"; specifications: TestSpecification[] } {
  const configured = new Set(specifications.map((specification) => resolve(specification.moduleId)));
  if (requested.length === 0 || requested.some((path) => !configured.has(path))) {
    return { tier: "e2e", specifications };
  }
  const named = new Set(requested);
  return { tier: "e2e-focused",
    specifications: specifications.filter((specification) => named.has(resolve(specification.moduleId))) };
}

/** Filename filters the portability tier runs on each supported platform. */
const PORTABILITY_SUITES = [
  "unit/paths.test.ts",
  "unit/git/linked-worktree.test.ts",
  "check-runner-home.e2e.test.ts",
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
  "store/projection/",
  "user-sync-notes-lock",
  "ref-tree-cas",
  "state-ref-race.e2e",
  "git-executor",
  "raw-git-files.test.ts",
  "check-source-git.test.ts",
  "delivery-transfer.e2e",
  "store-ref-bursts.test.ts",
  "store-ref-directory.test.ts",
  "store-ref-write-batching.test.ts",
  "store-ref-reader-lifetime.test.ts",
  "store-ref-archive-acquisition.test.ts",
  "store-ref-named-acquisition.test.ts",
  "store-ref-publication.test.ts",
  "git-batch-reader.test.ts",
  "store-ref-separate-conformance-records-",
  "store-ref-separate-conformance-reads-",
  "store-ref-separate-conformance-sync-",
  "store-ref-timing.test.ts",
  "store-ref-timing-isolation.test.ts",
  "checks/runner/",
  "lib/checks/result.test.ts",
  "lib/checks/batching.test.ts",
  "lib/checks/forecast.test.ts",
  "lib/checks/key.test.ts",
  "handlers/check/run-output",
  "check-runner-shard",
  "heavy-first-sequencer.test.ts",
  "duration-artifacts.test.ts",
  "duration-layout-workflow.test.ts",
  "vitest-discovery.test.ts",
  "vitest-completion",
  "vitest-mixed-shard.test.ts",
  "vitest-native-writers.test.ts",
  "vitest-native-closing.test.ts",
  "vitest-runtime-ownership.test.ts",
  "vitest-shard-",
  "check-runner-session.test.ts",
  "check-runner-conformance-wire.test.ts",
  "check-runner-conformance-groups.test.ts",
  "check-runner-execution-run.test.ts",
  "check-runner-platform-status.test.ts",
  "check-runner-platform-spelling.test.ts",
  "check-runner-platform.e2e.test.ts",
  "check-symlink-cwd.test.ts",
  "check-process.test.ts",
  "environment-inputs.test.ts",
  "repository-environment.test.ts",
  "ci-check-runner.test.ts",
  "check-execution.e2e.test.ts",
];

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
        "--project",
        "integration-timing",
        "--project",
        "integration-bursts",
      ];
    case "integration":
    case "store":
      return ["--project", "integration", "--project", "integration-timing", "--project", "integration-bursts"];
    case "arc-contracts":
      return ["--project", "integration", ...ARC_CONTRACT_SUITES];
    case "e2e":
    case "e2e-focused":
      return ["--project", "e2e"];
    case "portability":
      return [...PORTABILITY_SUITES];
    case "portability-macos":
      return ["anchored-sequence", "git-identity", "locus-errand-roundtrip", "rename"];
  }
}
