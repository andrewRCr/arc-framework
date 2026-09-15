/**
 * What the two delivery windows return when the protected base advances while they are open.
 *
 * Eligibility and materialization each observe the protected base once and then act on that
 * observation later. Between the two moments the base can advance on a path no member touches, which
 * is the ordinary shape of a protected base moving under an independent checkout. The two windows
 * disagree about it: one refuses at the very end and discards every gate result already completed,
 * the other stops observing the tip once its target is bound.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  closeDeliveryEligibility,
  closeDeliveryEligibilityForPublication,
  type DeliveryCandidateGateResult,
  type DeliveryEligibilitySnapshot,
} from "../../src/lib/delivery/eligibility.js";
import {
  bindInitialDeliveryRef,
  deriveDeliveryMaterialization,
  materializeBoundDeliveryChain,
  type DeliveryMaterializationPlan,
} from "../../src/lib/delivery/materialization.js";
import {
  advanceProtectedBase,
  arrangeCandidateChain,
  prepareWindow,
  type CandidateChainArrangement,
} from "../helpers/delivery-eligibility-arrangement.js";
import { removeGitBackedDir } from "../helpers/temp-repo.js";
import { expectPinnedObservation } from "../helpers/pinned-observation.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => removeGitBackedDir(root)));
});

async function arrange(): Promise<CandidateChainArrangement> {
  const arrangement = await arrangeCandidateChain("arc-delivery-window-");
  roots.push(arrangement.repository);
  return arrangement;
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
    const arrangement = await arrange();
    const snapshot = await prepareWindow(arrangement);

    const closed = await closeDeliveryEligibilityForPublication(
      { snapshot, gateResults: passingGateResults(snapshot) },
      arrangement.deps,
    );

    expect(closed).toMatchObject({ status: "eligible" });
  });

  it("discards them when the base advances on a path no member touches", async () => {
    const arrangement = await arrange();
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
    const arrangement = await arrange();
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
    const arrangement = await arrange();
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
    const arrangement = await arrange();
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
 * @param arrangement - The chain the base is moving under.
 * @param materialization - The derived plan the bound chain was published from.
 * @returns The pass status, which refs it observed, and whether the member landed at its planned head.
 */
async function republishBoundChain(
  arrangement: CandidateChainArrangement,
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
  arrangement: CandidateChainArrangement,
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
