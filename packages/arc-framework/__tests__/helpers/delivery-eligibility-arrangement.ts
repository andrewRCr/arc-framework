/**
 * A two-member candidate chain, its eligibility dependencies, and the base movement under it.
 *
 * The dependency set mirrors what `delivery-execution.ts` composes for the real verbs, including the
 * completeness precedence — dropped, then invented, then mismatched — because which reason a moved base
 * produces is the observation several probes here are taking.
 */

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { workUnitPathTreatmentContext } from "../../src/lib/base-drift/current-adapters.js";
import type {
  DeliveryEligibilityCloseDependencies,
  DeliveryEligibilitySnapshot,
} from "../../src/lib/delivery/eligibility.js";
import { prepareDeliveryEligibility } from "../../src/lib/delivery/eligibility.js";
import {
  compareGitNormalizedDeliveryTrees,
  inspectDeliveryCandidateCheckout,
  observeDeliveryEligibilityRef,
} from "../../src/lib/delivery/git-eligibility.js";
import { revalidateDeliveryLifecycleContribution } from
  "../../src/lib/delivery/git-lifecycle-contribution.js";
import { RepositoryDeliveryStateStore } from "../../src/lib/delivery/local-stores.js";
import type { DeliveryMaterializationRefPort } from "../../src/lib/delivery/materialization.js";
import type { DeliveryPlanV1 } from "../../src/lib/delivery/schema.js";
import { analyzeRevisionOverlap } from "../../src/lib/git/base-overlap.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { readAncestry } from "../../src/lib/work-unit/git-decomposition-object-readers.js";
import { deliveryStackPlanFixture } from "../fixtures/delivery-plan.js";
import { createTempRepoCore } from "../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);

/** The lifecycle path the arrangement regenerates on the base, as the disjoint fixture does. */
export const LIFECYCLE_PATH = ".arc/backlog/ROADMAP.md";
/** A tracked path present from the chain base onwards, so a base change to it can collide. */
export const SHARED_PATH = "shared.txt";

export interface CandidateChainArrangement {
  readonly repository: string;
  readonly git: (args: readonly string[]) => Promise<string>;
  readonly exec: GitExec;
  readonly plan: DeliveryPlanV1;
  readonly deps: DeliveryEligibilityCloseDependencies;
  readonly candidates: readonly { readonly deliverableId: string; readonly ref: string }[];
  readonly refs: DeliveryMaterializationRefPort;
  /** Every ref the materialization port was asked to observe, in call order. */
  readonly observedRefs: string[];
  readonly stateStore: RepositoryDeliveryStateStore;
  readonly chainBase: string;
  readonly observedTip: string;
}

/**
 * Cut a two-member candidate chain from a base that has since regenerated a lifecycle path.
 *
 * This is the disjoint-ahead arrangement `delivery-disjoint-eligibility.test.ts` establishes, which is
 * the state every probe over these surfaces starts from.
 *
 * @param prefix - Temporary repository prefix, so a failing run names the probe that made it.
 * @returns The repository, its plan and dependencies, and the two base coordinates.
 */
export async function arrangeCandidateChain(prefix: string): Promise<CandidateChainArrangement> {
  const repository = await createTempRepoCore({ prefix });
  const git = async (args: readonly string[]): Promise<string> => (
    await execFileAsync("git", [...args], { cwd: repository })
  ).stdout.trim();
  const exec: GitExec = async (command, args) => {
    const result = await execFileAsync(command, args, { cwd: repository });
    return { stdout: result.stdout, stderr: result.stderr };
  };

  await mkdir(join(repository, ".arc", "backlog"), { recursive: true });
  await writeFile(join(repository, ".gitattributes"), `${LIFECYCLE_PATH} merge=arc-roadmap\n`, "utf8");
  await writeFile(join(repository, LIFECYCLE_PATH), "base readiness\n", "utf8");
  await writeFile(join(repository, SHARED_PATH), "shared at the chain base\n", "utf8");
  await git(["add", ".gitattributes", LIFECYCLE_PATH, SHARED_PATH]);
  await git(["commit", "-m", "base readiness"]);
  const chainBase = await git(["rev-parse", "HEAD"]);

  await git(["switch", "-c", "candidate/first"]);
  await writeFile(join(repository, "first.txt"), "reviewed first member\n", "utf8");
  await git(["add", "first.txt"]);
  await git(["commit", "-m", "first member"]);
  await git(["switch", "-c", "candidate/top"]);
  await writeFile(join(repository, "top.txt"), "reviewed terminal\n", "utf8");
  await git(["add", "top.txt"]);
  await git(["commit", "-m", "terminal member"]);

  await git(["switch", "main"]);
  await writeFile(join(repository, LIFECYCLE_PATH), "advanced readiness\n", "utf8");
  await git(["add", LIFECYCLE_PATH]);
  await git(["commit", "-m", "regenerate readiness"]);
  const observedTip = await git(["rev-parse", "HEAD"]);
  await git(["config", "merge.arc-roadmap.driver", "false"]);

  const plan = deliveryStackPlanFixture();
  const candidates = ["candidate/first", "candidate/top"].map((ref, index) => ({
    deliverableId: plan.members[index]!.deliverableId,
    ref: `refs/heads/${ref}`,
  }));

  const publisher = new RepositoryGitCommonStatePublisher(exec, repository);
  const observedRefs: string[] = [];
  const refs: DeliveryMaterializationRefPort = {
    observe: async (ref: string) => {
      observedRefs.push(ref);
      try {
        return { status: "observed" as const, head: await git(["rev-parse", "--verify", ref]) };
      } catch {
        return { status: "absent" as const };
      }
    },
    publish: async (ref: string, head: string) => {
      await git(["update-ref", ref, head]);
      return { status: "published" as const };
    },
  };

  return {
    repository, git, exec, plan, candidates, refs, observedRefs, chainBase, observedTip,
    deps: eligibilityDependencies(exec, plan),
    stateStore: new RepositoryDeliveryStateStore(publisher),
  };
}

function eligibilityDependencies(exec: GitExec, plan: DeliveryPlanV1): DeliveryEligibilityCloseDependencies {
  return {
    observeRef: (ref: string) => observeDeliveryEligibilityRef(exec, ref),
    readAncestry: (ancestor: string, descendant: string) => readAncestry(exec, ancestor, descendant),
    readOverlap: (input) => analyzeRevisionOverlap({
      exec,
      leftRevision: input.leftRevision,
      rightRevision: input.rightRevision,
      treatmentContext: workUnitPathTreatmentContext(input.workUnitId),
    }),
    revalidateLifecycleContribution: (input) => revalidateDeliveryLifecycleContribution({ exec, ...input }),
    compareNormalizedCompleteness: async (input) => {
      const compared = await compareGitNormalizedDeliveryTrees({
        exec,
        protectedBaseTree: input.protectedBase.tree,
        chainBaseTree: input.chainBase.tree,
        topTree: input.top.tree,
        finalCandidateTree: input.finalCandidate.tree,
        lifecyclePaths: input.lifecyclePaths,
        regenerablePaths: input.regenerablePaths,
      });
      if (compared.status === "unavailable") return { status: "refused" as const, reason: "unavailable" as const };
      if (compared.status === "match") return compared;
      // The same precedence `delivery-execution.ts` applies, so the reason a probe reads is the one the
      // verb would return rather than an artifact of how the test collapsed the comparison.
      const reason = compared.droppedPaths.length > 0 ? "dropped" as const
        : compared.inventedPaths.length > 0 ? "invented" as const : "mismatched" as const;
      return { status: "refused" as const, reason };
    },
    readCurrentPlan: async () => plan,
    resolveMember: async () => ({ status: "ok" as const, value: null }),
    inspectCheckout: (path: string) => inspectDeliveryCandidateCheckout(exec, path),
    resolveLifecyclePaths: async () => [LIFECYCLE_PATH],
  };
}

/**
 * Advance the protected base by writing the given paths, none of which a candidate member touches.
 *
 * @param arrangement - The chain the base is moving under.
 * @param paths - Path-to-contents for the landing commit; defaults to one new unrelated file.
 * @returns The advanced protected-base head.
 */
export async function advanceProtectedBase(
  arrangement: CandidateChainArrangement,
  paths: Readonly<Record<string, string>> = { "unrelated.txt": "independent checkout landed\n" },
): Promise<string> {
  for (const [path, contents] of Object.entries(paths)) {
    await writeFile(join(arrangement.repository, path), contents, "utf8");
  }
  await arrangement.git(["add", ...Object.keys(paths)]);
  await arrangement.git(["commit", "-m", "independent landing"]);
  return arrangement.git(["rev-parse", "main"]);
}

/** Prepare the eligibility window over the arranged chain, failing loudly if it refuses. */
export async function prepareWindow(
  arrangement: CandidateChainArrangement,
  overrides: {
    readonly topRef?: string;
    readonly candidates?: readonly { readonly deliverableId: string; readonly ref: string }[];
  } = {},
): Promise<DeliveryEligibilitySnapshot> {
  const prepared = await prepareDeliveryEligibility({
    plan: arrangement.plan,
    protectedBaseRef: "refs/heads/main",
    topRef: overrides.topRef ?? "refs/heads/candidate/top",
    candidates: overrides.candidates ?? arrangement.candidates,
    lifecyclePaths: [LIFECYCLE_PATH],
  }, arrangement.deps);
  if (prepared.status !== "prepared") {
    throw new Error(`eligibility preparation refused: ${JSON.stringify(prepared)}`);
  }
  return prepared.snapshot;
}
