/**
 * What the two delivery windows return when the protected base advances while they are open.
 *
 * Eligibility and materialization each observe the protected base once and then act on that
 * observation later. Between the two moments the base can advance on a path no member touches, which
 * is the ordinary shape of a protected base moving under an independent checkout. The two windows
 * disagree about it: one refuses at the very end and discards every gate result already completed,
 * the other stops observing the tip once its target is bound.
 */

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { workUnitPathTreatmentContext } from "../../src/lib/base-drift/current-adapters.js";
import {
  closeDeliveryEligibility,
  closeDeliveryEligibilityForPublication,
  prepareDeliveryEligibility,
  type DeliveryCandidateGateResult,
  type DeliveryEligibilityCloseDependencies,
  type DeliveryEligibilitySnapshot,
} from "../../src/lib/delivery/eligibility.js";
import {
  compareGitNormalizedDeliveryTrees,
  inspectDeliveryCandidateCheckout,
  observeDeliveryEligibilityRef,
} from "../../src/lib/delivery/git-eligibility.js";
import { revalidateDeliveryLifecycleContribution } from
  "../../src/lib/delivery/git-lifecycle-contribution.js";
import {
  bindInitialDeliveryRef,
  deriveDeliveryMaterialization,
  materializeBoundDeliveryChain,
  type DeliveryMaterializationPlan,
  type DeliveryMaterializationRefPort,
} from "../../src/lib/delivery/materialization.js";
import { RepositoryDeliveryStateStore } from "../../src/lib/delivery/local-stores.js";
import type { DeliveryPlanV1 } from "../../src/lib/delivery/schema.js";
import { analyzeRevisionOverlap } from "../../src/lib/git/base-overlap.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { readAncestry } from "../../src/lib/work-unit/git-decomposition-object-readers.js";
import { deliveryStackPlanFixture } from "../fixtures/delivery-plan.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";
import { expectPinnedObservation } from "../helpers/pinned-observation.js";

const execFileAsync = promisify(execFile);
const LIFECYCLE_PATH = ".arc/backlog/ROADMAP.md";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => removeGitBackedDir(root)));
});

interface Arrangement {
  readonly repository: string;
  readonly git: (args: readonly string[]) => Promise<string>;
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
 * A two-member candidate chain cut from a base that has since regenerated a lifecycle path.
 *
 * This is the same disjoint-ahead arrangement `delivery-disjoint-eligibility.test.ts` establishes,
 * which is the arrangement the windows below are open over.
 */
async function arrangeCandidateChain(): Promise<Arrangement> {
  const repository = await createTempRepoCore({ prefix: "arc-delivery-window-" });
  roots.push(repository);
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
  await git(["add", ".gitattributes", LIFECYCLE_PATH]);
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
  const deps: DeliveryEligibilityCloseDependencies = {
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
      const result = await compareGitNormalizedDeliveryTrees({
        exec,
        protectedBaseTree: input.protectedBase.tree,
        chainBaseTree: input.chainBase.tree,
        topTree: input.top.tree,
        finalCandidateTree: input.finalCandidate.tree,
        lifecyclePaths: input.lifecyclePaths,
        regenerablePaths: input.regenerablePaths,
      });
      return result.status === "unavailable"
        ? { status: "refused" as const, reason: "unavailable" as const }
        : result.status === "match"
          ? result
          : { status: "refused" as const, reason: "mismatched" as const };
    },
    readCurrentPlan: async () => plan,
    resolveMember: async () => ({ status: "ok" as const, value: null }),
    inspectCheckout: (path: string) => inspectDeliveryCandidateCheckout(exec, path),
    resolveLifecyclePaths: async () => [LIFECYCLE_PATH],
  };

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
    repository, git, plan, deps, candidates, refs, observedRefs,
    stateStore: new RepositoryDeliveryStateStore(publisher),
    chainBase,
    observedTip,
  };
}


/** Advance the protected base on a path neither candidate member touches. */
async function advanceProtectedBase(arrangement: Arrangement): Promise<string> {
  await writeFile(join(arrangement.repository, "unrelated.txt"), "independent checkout landed\n", "utf8");
  await arrangement.git(["add", "unrelated.txt"]);
  await arrangement.git(["commit", "-m", "independent landing"]);
  return arrangement.git(["rev-parse", "main"]);
}

async function prepareWindow(arrangement: Arrangement): Promise<DeliveryEligibilitySnapshot> {
  const prepared = await prepareDeliveryEligibility({
    plan: arrangement.plan,
    protectedBaseRef: "refs/heads/main",
    topRef: "refs/heads/candidate/top",
    candidates: arrangement.candidates,
    lifecyclePaths: [LIFECYCLE_PATH],
  }, arrangement.deps);
  expect(prepared.status, JSON.stringify(prepared)).toBe("prepared");
  if (prepared.status !== "prepared") throw new Error("unreachable");
  return prepared.snapshot;
}

/** Every member's Tier 2 result, reported passing against the exact coordinates gates ran on. */
function passingGateResults(snapshot: DeliveryEligibilitySnapshot): readonly DeliveryCandidateGateResult[] {
  return snapshot.members.map((member) => ({
    deliverableId: member.deliverableId,
    head: member.head,
    tree: member.tree,
    status: "passed" as const,
  }));
}

describe("the eligibility window a gate run is completed inside", () => {
  it("consumes every completed gate result when the base holds still", async () => {
    const arrangement = await arrangeCandidateChain();
    const snapshot = await prepareWindow(arrangement);

    const closed = await closeDeliveryEligibilityForPublication(
      { snapshot, gateResults: passingGateResults(snapshot) },
      arrangement.deps,
    );

    expect(closed).toMatchObject({ status: "eligible" });
  });

  it("discards them when the base advances on a path no member touches", async () => {
    const arrangement = await arrangeCandidateChain();
    const snapshot = await prepareWindow(arrangement);
    const gateResults = passingGateResults(snapshot);
    const advanced = await advanceProtectedBase(arrangement);

    const closed = await closeDeliveryEligibilityForPublication({ snapshot, gateResults }, arrangement.deps);

    expect(advanced).not.toBe(snapshot.protectedBase.head);
    expectPinnedObservation(closed, {
      behavior: "The gate results were completed against member coordinates that did not move, and the base "
        + "advanced on a path no member touches, so closing the window should consume the results it was "
        + "given rather than direct an entire fresh preparation and gate run.",
      observed: {
        status: "refused",
        reason: "source-moved",
        nextAction: { kind: "reprepare-delivery-eligibility" },
      },
      target: { status: "eligible" },
    });
  });

  it("refuses at the same point whether or not any gate result was supplied", async () => {
    const arrangement = await arrangeCandidateChain();
    const snapshot = await prepareWindow(arrangement);
    await advanceProtectedBase(arrangement);

    // Mechanical close takes no gate results at all; publication close validates them first. Both
    // reach the same refusal, which is what places the cost on the base movement and not the gates.
    const mechanical = await closeDeliveryEligibility(snapshot, arrangement.deps);
    const publication = await closeDeliveryEligibilityForPublication(
      { snapshot, gateResults: passingGateResults(snapshot) },
      arrangement.deps,
    );

    expect(mechanical).toMatchObject({ status: "refused", reason: "source-moved" });
    expect(publication).toEqual(mechanical);
  });
});

describe("the materialization window a bound chain is published inside", () => {
  it("refuses to bind a target over a base that advanced after the window opened", async () => {
    const arrangement = await arrangeCandidateChain();
    const snapshot = await prepareWindow(arrangement);
    const materialization = deriveDeliveryMaterialization(arrangement.plan, snapshot);
    expect(materialization.status).toBe("derived");
    if (materialization.status !== "derived") return;
    const bound = await bindInitialDeliveryRef({
      plan: arrangement.plan, materialization: materialization.value,
      stateStore: arrangement.stateStore, refs: arrangement.refs,
    });
    expect(bound.status).toBe("bound");
    await advanceProtectedBase(arrangement);

    arrangement.observedRefs.length = 0;
    const materialized = await materializeBoundDeliveryChain({
      plan: arrangement.plan, materialization: materialization.value,
      stateStore: arrangement.stateStore, refs: arrangement.refs,
    });

    expect(materialized).toMatchObject({ status: "refused" });
    expect(arrangement.observedRefs).toContain("refs/heads/main");
  });

  it("publishes the bound chain identically whether or not the base advanced", async () => {
    const arrangement = await arrangeCandidateChain();
    const snapshot = await prepareWindow(arrangement);
    const materialization = deriveDeliveryMaterialization(arrangement.plan, snapshot);
    expect(materialization.status).toBe("derived");
    if (materialization.status !== "derived") return;
    const settled = await materializeWithBoundTarget(arrangement, materialization.value);
    expect(settled.status).toBe("materialized");

    // Each pass drops the published member ref first, so the chain has to be republished rather than
    // confirmed and skipped: only a pass that writes can show which observations it reaches on the way.
    const held = await republishBoundChain(arrangement, materialization.value);
    const advanced = await advanceProtectedBase(arrangement);
    const moved = await republishBoundChain(arrangement, materialization.value);

    expect(advanced).not.toBe(snapshot.protectedBase.head);
    expect(moved).toEqual(held);
    expect(held).toMatchObject({
      status: "materialized",
      memberRepublishedAtPlannedHead: true,
      observedMemberRef: true,
      observedProtectedBase: false,
    });
  });
});

/**
 * Republish the bound chain from scratch and report what the pass decided, without naming any object id.
 *
 * The target head is reported as its relation to the protected base rather than as a value, since the
 * question is whether the pass noticed the base at all.
 */
async function republishBoundChain(
  arrangement: Arrangement,
  materialization: DeliveryMaterializationPlan,
): Promise<Record<string, unknown>> {
  const member = materialization.members[0]!;
  await arrangement.git(["update-ref", "-d", member.ref!]);
  arrangement.observedRefs.length = 0;
  const result = await materializeBoundDeliveryChain({
    plan: arrangement.plan, materialization,
    stateStore: arrangement.stateStore, refs: arrangement.refs,
  });
  return {
    status: result.status,
    observedProtectedBase: arrangement.observedRefs.includes("refs/heads/main"),
    // Reported alongside, so a pass that observed nothing at all cannot read as one that observed
    // everything but the base.
    observedMemberRef: arrangement.observedRefs.includes(member.ref!),
    memberRepublishedAtPlannedHead:
      (await arrangement.git(["rev-parse", "--verify", member.ref!])) === member.head,
  };
}

/** Drive the first pass while the base still holds, which is what binds the target. */
async function materializeWithBoundTarget(
  arrangement: Arrangement,
  materialization: DeliveryMaterializationPlan,
): Promise<{ readonly status: string }> {
  const bound = await bindInitialDeliveryRef({
    plan: arrangement.plan, materialization,
    stateStore: arrangement.stateStore, refs: arrangement.refs,
  });
  expect(bound.status).toBe("bound");
  return materializeBoundDeliveryChain({
    plan: arrangement.plan, materialization,
    stateStore: arrangement.stateStore, refs: arrangement.refs,
  });
}

