import { describe, expect, it, vi } from "vitest";

import type { DeliveryContributionEndpoints } from "../../../src/lib/delivery/contribution-proof.js";
import type { DeliveryEligibilityCloseDependencies } from "../../../src/lib/delivery/eligibility.js";
import type { DeliveryPlanV1, DeliveryStateV1 } from "../../../src/lib/delivery/schema.js";

import {
  closeDeliveryEligibilityForPublication,
  prepareDeliveryEligibility,
} from "../../../src/lib/delivery/eligibility.js";
import {
  reconcileLinkedNativeDeliverySuffix,
} from "../../../src/lib/delivery/native-landing.js";
import {
  beginNativeDeliverySettlement,
  beginNativeDeliverySubmission,
  reserveDeliveryOperation,
  validateDeliveryActiveOperation,
} from "../../../src/lib/delivery/operation.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";
import {
  deliveryFourMemberStackPlanFixture,
} from "../../fixtures/delivery-plan.js";
import {
  casStateStore,
  linkedSuffixFixture,
  mergePolicy,
  movedSuffixCoordinates,
} from "../../helpers/native-landing-fixtures.js";

describe("native delivery landing suffix settlement", () => {
  it("observes and reconciles every member in the rewritten remaining suffix", async () => {
    const { bound, newTarget, reconcileInput, observeRequest, observeRef } = linkedSuffixFixture();
    const provedHeads = new Set<string>();
    const absorbedTop = { head: "9".repeat(40), tree: "8".repeat(40) };
    let topPublished = false;
    let publishCount = 0;
    const localHeads = new Map(bound.members.slice(1, -1).map((member) => [
      member.ref!, member.coordinates!.head,
    ]));

    const result = await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async (endpoints) => {
        const valid = endpoints.after.member.head === "a".repeat(40)
          ? endpoints.after.predecessor.head === newTarget.head
          : endpoints.after.member.head === "c".repeat(40)
            && endpoints.after.predecessor.head === "a".repeat(40);
        if (valid) provedHeads.add(endpoints.after.member.head);
        return valid
          ? { status: "accepted" as const, proof: "mechanical-reapply" as const }
          : { status: "refused" as const, reason: "contribution-diverged" as const, paths: ["unexpected"] };
      },
      observeMemberRefCheckouts: async () => ({ status: "observed", checkouts: [] }),
      absorbTop: async (input) => provedHeads.size === 2
        && input.top.head === bound.members[3]!.coordinates!.head
        && input.highestMember.head === "c".repeat(40)
        ? { status: "absorbed" as const, ...absorbedTop }
        : { status: "refused" as const, reason: "coordinate-invalid" as const },
      publishTop: async (input) => {
        if (input.ref !== "refs/heads/member-4"
          || input.beforeHead !== bound.members[3]!.coordinates!.head
          || input.requestedHead !== absorbedTop.head) {
          return { status: "refused" as const, reason: "collision" as const };
        }
        topPublished = true;
        return { status: "published" as const };
      },
      rewriteLocalRef: async ({ ref, beforeHead, requestedHead }) => {
        const current = localHeads.get(ref);
        if (current === requestedHead) return { status: "adopted" as const };
        if (current !== beforeHead) return { status: "refused" as const };
        localHeads.set(ref, requestedHead);
        return { status: "rewritten" as const };
      },
      stateStore: { publish: async (_id, value, expectedRevision) => {
        publishCount += 1;
        // Two phase publishes now: the member record before the rewrite loop, then the absorbed top's own
        // record between the absorb and the top publication. Only the third write lands after the top is up.
        const phasePublish = publishCount <= 2;
        if (publishCount > 3 || expectedRevision !== publishCount + 2 || provedHeads.size !== 2
          || (!phasePublish && !topPublished)) {
          return { status: "refused" as const, reason: "version-conflict" as const };
        }
        return { status: "ok" as const, value: { revision: expectedRevision + 1, value } };
      } },
    });

    expect(result).toMatchObject({
      status: "applied",
      state: {
        revision: 6,
        value: {
          members: [
            {},
            { coordinates: { base: newTarget.head, head: "a".repeat(40), tree: "b".repeat(40) } },
            { coordinates: { base: "a".repeat(40), head: "c".repeat(40), tree: "f".repeat(40) } },
            { coordinates: { base: "c".repeat(40), ...absorbedTop } },
          ],
        },
      },
    });
    expect(publishCount).toBe(3);
    expect([...localHeads.values()]).toEqual(["a".repeat(40), "c".repeat(40)]);

    const rewriteLocalRef = vi.fn();
    const absorbTop = vi.fn();
    const publishTop = vi.fn();
    const publishState = vi.fn();
    await expect(reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      observeMemberRefCheckouts: async (refs) => ({
        status: "observed",
        checkouts: [{ ref: refs[0]!, path: "/tmp/checked-out-member" }],
      }),
      absorbTop,
      publishTop,
      rewriteLocalRef,
      stateStore: { publish: publishState },
    })).resolves.toEqual({
      status: "blocked",
      reason: "member-ref-checked-out",
      paths: ["/tmp/checked-out-member"],
      recommendedActionText:
        "Keep the reservation and release the listed member-ref checkouts before retrying settlement.",
    });
    expect(rewriteLocalRef).not.toHaveBeenCalled();
    expect(absorbTop).not.toHaveBeenCalled();
    expect(publishTop).not.toHaveBeenCalled();
    expect(publishState).not.toHaveBeenCalled();

    await expect(reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async (endpoints) => endpoints.after.member.head === "c".repeat(40)
        ? {
            status: "refused",
            reason: "contribution-conflicted",
            paths: ["src/conflict.ts"],
          }
        : { status: "accepted", proof: "mechanical-reapply" },
      observeMemberRefCheckouts: async () => ({ status: "observed", checkouts: [] }),
      absorbTop: async () => { throw new Error("rejected suffix reached top absorption"); },
      publishTop: async () => { throw new Error("rejected suffix reached top publication"); },
      rewriteLocalRef: async () => { throw new Error("rejected suffix reached local ref rewrite"); },
      stateStore: {
        publish: async () => { throw new Error("rejected suffix reached state publication"); },
      },
    })).resolves.toMatchObject({
      status: "conflict-resolution-required",
      conflicts: [{ deliverableId: bound.members[2]!.deliverableId, paths: ["src/conflict.ts"] }],
    });
  });

  it("reports every conflicted suffix member with its own paths", async () => {
    const { bound, reconcileInput, observeRequest, observeRef, unreachedSettlement } = linkedSuffixFixture();

    await expect(reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async (endpoints) => ({
        status: "refused",
        reason: "contribution-conflicted",
        paths: endpoints.after.member.head === "a".repeat(40) ? ["src/second.ts"] : ["src/third.ts"],
      }),
      ...unreachedSettlement,
    })).resolves.toMatchObject({
      status: "conflict-resolution-required",
      conflicts: [
        { deliverableId: bound.members[1]!.deliverableId, paths: ["src/second.ts"] },
        { deliverableId: bound.members[2]!.deliverableId, paths: ["src/third.ts"] },
      ],
    });
  });
  it("reports only the conflicted member when the rest of the suffix proves clean", async () => {
    const { bound, reconcileInput, observeRequest, observeRef, unreachedSettlement } = linkedSuffixFixture(5);

    await expect(reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async (endpoints) => endpoints.after.member.head === "c".repeat(40)
        ? { status: "refused", reason: "contribution-conflicted", paths: ["src/third.ts"] }
        : { status: "accepted", proof: "mechanical-reapply" },
      ...unreachedSettlement,
    })).resolves.toMatchObject({
      status: "conflict-resolution-required",
      conflicts: [{ deliverableId: bound.members[2]!.deliverableId, paths: ["src/third.ts"] }],
    });
  });
  it("stops collection on a refusal that is not a contribution conflict", async () => {
    const { reconcileInput, observeRequest, observeRef, unreachedSettlement } = linkedSuffixFixture(5);
    const divergedAfterConflict = async (endpoints: DeliveryContributionEndpoints) => {
      if (endpoints.after.member.head === "a".repeat(40)) {
        return { status: "refused" as const, reason: "contribution-conflicted" as const, paths: ["src/second.ts"] };
      }
      return endpoints.after.member.head === "c".repeat(40)
        ? { status: "refused" as const, reason: "contribution-diverged" as const, paths: ["src/diverged.ts"] }
        : { status: "accepted" as const, proof: "mechanical-reapply" as const };
    };

    await expect(reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: divergedAfterConflict,
      ...unreachedSettlement,
    })).resolves.toEqual({
      status: "blocked",
      reason: "contribution-diverged",
      paths: ["src/diverged.ts"],
      guidance:
        "Keep the reservation and rebuild the listed paths onto the member's new predecessor, then rerun "
        + "`arc delivery native land-status` to reprove the rebuilt suffix.",
    });

    await expect(reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async (endpoints) => endpoints.after.member.head === "a".repeat(40)
        ? { status: "refused", reason: "contribution-conflicted", paths: ["src/second.ts"] }
        : { status: "refused", reason: "merge-tree-write-tree-unsupported" },
      ...unreachedSettlement,
    })).resolves.toEqual({
      status: "blocked",
      reason: "merge-tree-write-tree-unsupported",
      recommendedActionText:
        "Keep the reservation and rerun `arc delivery native land-status` to settle the suffix before review.",
    });
  });
  it("discloses a conflicted suffix as a resubmittable native resolution", async () => {
    const { bound, reconcileInput, observeRequest, observeRef, unreachedSettlement } = linkedSuffixFixture();
    const conflicts = [
      { deliverableId: bound.members[1]!.deliverableId, paths: ["src/second.ts"] },
      { deliverableId: bound.members[2]!.deliverableId, paths: ["src/third.ts"] },
    ];

    const result = await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async (endpoints) => ({
        status: "refused",
        reason: "contribution-conflicted",
        paths: endpoints.after.member.head === "a".repeat(40) ? ["src/second.ts"] : ["src/third.ts"],
      }),
      ...unreachedSettlement,
    });

    expect(result).toMatchObject({
      status: "conflict-resolution-required",
      conflicts,
      resolutionInput: {
        planId: reconcileInput.plan.planId,
        scope: { kind: "native-suffix", operationId: "operation-1" },
        expectedStateRevision: 3,
        conflicts,
      },
    });
    expect(result).not.toHaveProperty("externalRefRestorations");
  });

  const conflictedSecondMember = async (endpoints: DeliveryContributionEndpoints) =>
    endpoints.after.member.head === "a".repeat(40)
      ? {
          status: "refused" as const,
          reason: "contribution-conflicted" as const,
          paths: ["src/second.ts"],
        }
      : { status: "accepted" as const, proof: "mechanical-reapply" as const };

  /** What the terminal absorber returns when the top and the highest member disagree on a path. */
  const conflictedTop = {
    status: "refused" as const,
    reason: "content-conflict" as const,
    paths: ["docs/top.md"],
  };

  function reachedSettlement() {
    const absorbedTop = { head: "9".repeat(40), tree: "8".repeat(40) };
    const { writes, stateStore } = casStateStore();
    return {
      absorbedTop,
      writes,
      deps: {
        observeMemberRefCheckouts: async () => ({ status: "observed" as const, checkouts: [] }),
        absorbTop: async () => ({ status: "absorbed" as const, ...absorbedTop }),
        publishTop: async () => ({ status: "published" as const }),
        rewriteLocalRef: async () => ({ status: "rewritten" as const }),
        stateStore,
      },
    };
  }

  it("settles under the held reservation on a resolution canonicalizing identically", async () => {
    const { reconcileInput, observeRequest, observeRef, unreachedSettlement } = linkedSuffixFixture();
    const disclosed = await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: conflictedSecondMember,
      ...unreachedSettlement,
    });
    if (disclosed.status !== "conflict-resolution-required") {
      throw new Error(`expected a disclosure, got ${disclosed.status}`);
    }
    const settlement = reachedSettlement();

    const result = await reconcileLinkedNativeDeliverySuffix(
      { ...reconcileInput, conflictResolution: disclosed.resolutionInput },
      {
        observeRequest,
        observeRef,
        proveContribution: conflictedSecondMember,
        ...settlement.deps,
      },
    );

    expect(result).toMatchObject({ status: "applied", state: { revision: 6 } });
    expect(settlement.writes).toHaveLength(3);
  });

  it("settles a resubmission the settle's own publish has since outrun", async () => {
    const { reconcileInput, observeRequest, observeRef, unreachedSettlement } = linkedSuffixFixture();
    const disclosed = await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: conflictedSecondMember,
      ...unreachedSettlement,
    });
    if (disclosed.status !== "conflict-resolution-required") {
      throw new Error(`expected a disclosure, got ${disclosed.status}`);
    }
    const settlement = reachedSettlement();
    const resubmitted = {
      ...reconcileInput,
      conflictResolution: disclosed.resolutionInput,
    };
    const observers = { observeRequest, observeRef, proveContribution: conflictedSecondMember };

    // The settle publishes its settlement phase before the terminal absorber runs, so a refusal past that
    // point leaves state one revision ahead of the disclosure the operator is holding.
    const wedged = await reconcileLinkedNativeDeliverySuffix(resubmitted, {
      ...observers,
      ...settlement.deps,
      absorbTop: async () => conflictedTop,
    });
    const settled = settlement.writes.at(-1);
    if (wedged.status !== "blocked" || settled === undefined) {
      throw new Error(`expected a wedge past the phase publish, got ${wedged.status}`);
    }

    // The operator resolves by hand and resubmits the disclosure byte-identical, as the wedge asked.
    const result = await reconcileLinkedNativeDeliverySuffix(
      {
        ...resubmitted,
        before: { revision: 4, value: settled.value },
        landed: { ...reconcileInput.landed, revision: 4 },
      },
      { ...observers, ...settlement.deps },
    );

    expect(settled.expectedRevision).toBe(3);
    expect(disclosed.resolutionInput.expectedStateRevision).toBe(3);
    expect(result).toMatchObject({ status: "applied" });
  });

  /** The observed suffix a held native landing reservation records, narrowed off the operation union. */
  function recordedSuffix(state: DeliveryStateV1) {
    const operation = state.activeOperation;
    if (operation === null || operation.kind !== "land" || operation.mode !== "native"
      || operation.native === null || operation.native === undefined) {
      throw new Error("expected a held native landing reservation");
    }
    return operation.native.observedSuffix;
  }

  async function wedgedPastTheAbsorb(publishTop: () => Promise<{ readonly status: "refused"; readonly reason: "collision" }>) {
    const { bound, newTarget, reconcileInput, observeRequest, observeRef } = linkedSuffixFixture();
    const settlement = reachedSettlement();
    const blocked = await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      ...settlement.deps,
      publishTop,
    });
    if (blocked.status !== "blocked") throw new Error(`expected a wedge, got ${JSON.stringify(blocked)}`);
    const recorded = settlement.writes.at(-1);
    if (recorded === undefined) throw new Error("expected the settle to publish before wedging");
    return {
      bound, newTarget, blocked, absorbedTop: settlement.absorbedTop, recorded, writes: settlement.writes,
    };
  }

  /**
   * Chain absorption rewrites the local terminal top under a lease of its own, and the observed suffix drops
   * its last element by construction. A decline taken after the absorb has to find the top in the inventory
   * it undoes, so the settle records it where it records the members.
   */
  it("records the absorbed top beside the suffix it observed", async () => {
    const { bound, newTarget, blocked, absorbedTop, recorded } = await wedgedPastTheAbsorb(
      async () => ({ status: "refused" as const, reason: "collision" as const }),
    );
    const terminal = bound.members.at(-1)!;
    const highest = movedSuffixCoordinates[1]!;

    expect(blocked).toMatchObject({ status: "blocked", reason: "top-publish-collision" });
    expect(recordedSuffix(recorded.value)).toEqual([
      ...bound.members.slice(1, -1).map((member, index) => ({
        deliverableId: member.deliverableId,
        ref: member.ref,
        coordinates: {
          ...movedSuffixCoordinates[index]!,
          base: index === 0 ? newTarget.head : movedSuffixCoordinates[index - 1]!.head,
        },
      })),
      {
        deliverableId: terminal.deliverableId,
        ref: terminal.ref,
        coordinates: { base: highest.head, head: absorbedTop.head, tree: absorbedTop.tree },
      },
    ]);
  });

  it("keeps a head it already recorded when a later run reobserves the suffix", async () => {
    const { bound, recorded, writes } = await wedgedPastTheAbsorb(
      async () => ({ status: "refused" as const, reason: "collision" as const }),
    );
    const established = recordedSuffix(recorded.value)!;

    // A rerun reobserves the members and knows nothing of the absorbed top. Reconciling keeps what the first
    // run established; replacing would drop the one ref only ARC can put back.
    const rerun = beginNativeDeliverySettlement(
      { revision: recorded.expectedRevision + 1, value: recorded.value },
      "operation-1",
      established.filter((member) => member.deliverableId !== bound.members.at(-1)!.deliverableId),
    );
    if (rerun.status !== "begun") throw new Error(`expected a settlement phase, got ${rerun.reason}`);

    expect(recordedSuffix(rerun.state)).toEqual(established);
    expect(writes).toHaveLength(2);
  });

  it("carries a suffix resolution through to a terminal collision in the same settle", async () => {
    const { reconcileInput, observeRequest, observeRef } = linkedSuffixFixture();
    const disclosed = await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: conflictedSecondMember,
      ...linkedSuffixFixture().unreachedSettlement,
    });
    if (disclosed.status !== "conflict-resolution-required") {
      throw new Error(`expected a disclosure, got ${disclosed.status}`);
    }

    // Neither lane covered the pair: the end-to-end terminal fixture has a clean suffix, and no unit test
    // supplied a resolution across a terminal wedge — which is where the revision moves underneath it.
    const result = await reconcileLinkedNativeDeliverySuffix(
      { ...reconcileInput, conflictResolution: disclosed.resolutionInput },
      {
        observeRequest,
        observeRef,
        proveContribution: conflictedSecondMember,
        ...reachedSettlement().deps,
        absorbTop: async () => conflictedTop,
      },
    );

    expect(result).toMatchObject({
      status: "blocked",
      reason: "contribution-conflicted",
      paths: ["docs/top.md"],
    });
  });

  it("refuses a resolution supplied when the suffix proves clean", async () => {
    const { reconcileInput, observeRequest, observeRef, unreachedSettlement } = linkedSuffixFixture();
    const disclosed = await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: conflictedSecondMember,
      ...unreachedSettlement,
    });
    if (disclosed.status !== "conflict-resolution-required") {
      throw new Error(`expected a disclosure, got ${disclosed.status}`);
    }

    const result = await reconcileLinkedNativeDeliverySuffix(
      { ...reconcileInput, conflictResolution: disclosed.resolutionInput },
      {
        observeRequest,
        observeRef,
        proveContribution: async () => ({ status: "accepted", proof: "tree-equality" }),
        ...unreachedSettlement,
      },
    );

    expect(result).toMatchObject({ status: "blocked", reason: "conflict-resolution-mismatch" });
  });

  it("refuses a resolution after an unrelated member moves under the same conflict set", async () => {
    const {
      bound, movedByRef, reconcileInput, observeRequest, observeRef, unreachedSettlement,
    } = linkedSuffixFixture();
    const disclosed = await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: conflictedSecondMember,
      ...unreachedSettlement,
    });
    if (disclosed.status !== "conflict-resolution-required") {
      throw new Error(`expected a disclosure, got ${disclosed.status}`);
    }

    movedByRef.set(bound.members[2]!.ref!, { head: "7".repeat(40), tree: "6".repeat(40) });
    const result = await reconcileLinkedNativeDeliverySuffix(
      { ...reconcileInput, conflictResolution: disclosed.resolutionInput },
      {
        observeRequest,
        observeRef,
        proveContribution: conflictedSecondMember,
        ...unreachedSettlement,
      },
    );

    expect(result).toMatchObject({ status: "blocked", reason: "conflict-resolution-mismatch" });
    expect(disclosed.resolutionInput.conflicts).toEqual([
      { deliverableId: bound.members[1]!.deliverableId, paths: ["src/second.ts"] },
    ]);
  });

  it.each(["tree-equality", "mechanical-reapply"] as const)(
    "settles a %s suffix with no disclosure and no resolution",
    async (proof) => {
      const { reconcileInput, observeRequest, observeRef } = linkedSuffixFixture();
      const settlement = reachedSettlement();

      const result = await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
        observeRequest,
        observeRef,
        proveContribution: async () => ({ status: "accepted", proof }),
        ...settlement.deps,
      });

      expect(result).toMatchObject({ status: "applied", state: { revision: 6 } });
      expect(result).not.toHaveProperty("conflicts");
      expect(result).not.toHaveProperty("resolutionInput");
      expect(settlement.writes).toHaveLength(3);
    },
  );

  it("directs the hand merge that clears a terminal absorption conflict", async () => {
    const { reconcileInput, observeRequest, observeRef, unreachedSettlement } = linkedSuffixFixture();

    await expect(reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      ...unreachedSettlement,
      stateStore: casStateStore().stateStore,
      rewriteLocalRef: async () => ({ status: "rewritten" }),
      absorbTop: async () => ({
        status: "refused",
        reason: "content-conflict",
        paths: ["docs/top.md"],
      }),
    })).resolves.toMatchObject({
      status: "blocked",
      reason: "contribution-conflicted",
      paths: ["docs/top.md"],
      guidance:
        "Keep the reservation and merge the highest member into the checked-out terminal top by hand, "
        + "resolving the listed paths, then rerun `arc delivery native land-status` to absorb the merged top.",
    });
  });

  it("names the refreshed predecessor the operator must merge into the terminal top", async () => {
    const { bound, reconcileInput, observeRequest, observeRef, unreachedSettlement } = linkedSuffixFixture();
    const refreshedHighest = movedSuffixCoordinates[1]!.head;
    expect(refreshedHighest).not.toBe(bound.members[2]!.coordinates!.head);

    await expect(reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      ...unreachedSettlement,
      stateStore: casStateStore().stateStore,
      rewriteLocalRef: async () => ({ status: "rewritten" }),
      absorbTop: async () => ({ status: "refused", reason: "content-conflict", paths: ["docs/top.md"] }),
    })).resolves.toMatchObject({
      conflictPreparation: { parents: { refreshedPredecessor: refreshedHighest } },
    });
  });

  it("discloses the exact terminal merge the absorption attempted", async () => {
    const { reconcileInput, observeRequest, observeRef, unreachedSettlement } = linkedSuffixFixture();
    type Dependencies = Parameters<typeof reconcileLinkedNativeDeliverySuffix>[1];
    let attempted: Parameters<Dependencies["absorbTop"]>[0] | undefined;

    const blocked = await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      ...unreachedSettlement,
      stateStore: casStateStore().stateStore,
      rewriteLocalRef: async () => ({ status: "rewritten" }),
      absorbTop: async (input) => {
        attempted = input;
        return { status: "refused", reason: "content-conflict", paths: ["docs/top.md"] };
      },
    });

    const merge = attempted!;
    expect(blocked).toEqual({
      status: "blocked",
      reason: "contribution-conflicted",
      paths: ["docs/top.md"],
      guidance: expect.any(String),
      conflictPreparation: {
        topRef: merge.topRef,
        logicalMergeBase: merge.previousHighestMember.head,
        parents: { top: merge.top.head, refreshedPredecessor: merge.highestMember.head },
        mergeTree: {
          argv: [
            "git", "merge-tree", "--write-tree", "--merge-base", merge.previousHighestMember.head,
            "--name-only", "-z", "--no-messages", merge.top.head, merge.highestMember.head,
          ],
        },
      },
      externalRefRestorations: expect.any(Array),
    });
  });

  it("returns every local ref it moved before the terminal conflict", async () => {
    const { reconcileInput, observeRequest, observeRef, unreachedSettlement } = linkedSuffixFixture();
    const rewrites: Array<{ ref: string; beforeHead: string; requestedHead: string }> = [];

    const blocked = await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      ...unreachedSettlement,
      stateStore: casStateStore().stateStore,
      rewriteLocalRef: async (moved) => {
        rewrites.push(moved);
        return { status: "rewritten" };
      },
      absorbTop: async () => ({ status: "refused", reason: "content-conflict", paths: ["docs/top.md"] }),
    });

    expect(rewrites).toHaveLength(2);
    expect(blocked).toMatchObject({
      externalRefRestorations: rewrites.map(({ ref, beforeHead, requestedHead }) => ({
        ref, observedHead: requestedHead, restoreHead: beforeHead,
      })),
    });
  });

  it("records the observed suffix in persisted state when the settle wedges", async () => {
    const { reconcileInput, observeRequest, observeRef, unreachedSettlement, movedByRef } = linkedSuffixFixture();
    const store = casStateStore();

    const blocked = await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      ...unreachedSettlement,
      stateStore: store.stateStore,
      rewriteLocalRef: async () => ({ status: "rewritten" }),
      absorbTop: async () => ({ status: "refused", reason: "content-conflict", paths: ["docs/top.md"] }),
    });

    expect(blocked).toMatchObject({ status: "blocked", reason: "contribution-conflicted" });
    expect(store.writes).toHaveLength(1);
    const wedged = store.writes[0]!.value.activeOperation;
    if (wedged?.kind !== "land" || wedged.native == null) throw new Error("expected a held native reservation");
    expect(wedged.native.observedSuffix).toEqual(
      [...movedByRef].map(([ref, coordinates]) => expect.objectContaining({
        ref,
        coordinates: expect.objectContaining({ head: coordinates.head, tree: coordinates.tree }),
      })),
    );
  });

  it("leaves the wedged reservation valid, so the landing verb can be re-run", async () => {
    const { reconcileInput, observeRequest, observeRef, unreachedSettlement } = linkedSuffixFixture();
    const store = casStateStore();

    await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      ...unreachedSettlement,
      stateStore: store.stateStore,
      rewriteLocalRef: async () => ({ status: "rewritten" }),
      absorbTop: async () => ({ status: "refused", reason: "content-conflict", paths: ["docs/top.md"] }),
    });

    expect(store.writes).toHaveLength(1);
    expect(validateDeliveryActiveOperation({
      revision: reconcileInput.before.revision + 1,
      value: store.writes[0]!.value,
    })).toMatchObject({ status: "valid" });
  });

  it("lands the terminal publish at the revision the phase publish returned", async () => {
    const { reconcileInput, observeRequest, observeRef } = linkedSuffixFixture();
    const settlement = reachedSettlement();

    const result = await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      ...settlement.deps,
    });

    expect(settlement.writes.map(({ expectedRevision }) => expectedRevision)).toEqual([3, 4, 5]);
    expect(result).toMatchObject({ status: "applied", state: { revision: 6 } });
  });

  it("keeps the landed members and target at their post-landing coordinates", async () => {
    const { reconcileInput, observeRequest, observeRef, newTarget } = linkedSuffixFixture();
    const settlement = reachedSettlement();

    const result = await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      ...settlement.deps,
    });

    if (result.status !== "applied") throw new Error(`expected a settled landing, got ${result.status}`);
    expect(result.state.value.target).toEqual({ ref: "refs/heads/delivery-target", coordinates: newTarget });
    expect(result.state.value.members[0]?.coordinates).toMatchObject({
      head: newTarget.head,
      tree: newTarget.tree,
    });
    expect(result.state.value.activeOperation).toBeNull();
  });

  it("refuses the phase publish against a competing write rather than overwriting it", async () => {
    const { reconcileInput, observeRequest, observeRef, unreachedSettlement } = linkedSuffixFixture();
    const store = casStateStore(reconcileInput.before.revision + 1);
    const rewriteLocalRef = vi.fn();

    await expect(reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      ...unreachedSettlement,
      stateStore: store.stateStore,
      rewriteLocalRef,
    })).resolves.toMatchObject({ status: "blocked", reason: "state-conflict" });
    expect(store.writes).toHaveLength(0);
    expect(rewriteLocalRef).not.toHaveBeenCalled();
  });

  it("writes no state at all when the suffix proof discloses a conflict", async () => {
    const { reconcileInput, observeRequest, observeRef, unreachedSettlement } = linkedSuffixFixture();
    const store = casStateStore();

    const disclosed = await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: conflictedSecondMember,
      ...unreachedSettlement,
      stateStore: store.stateStore,
    });

    expect(disclosed).toMatchObject({ status: "conflict-resolution-required" });
    expect(store.writes).toHaveLength(0);
  });

  it("discloses the terminal absorption conflict after the phase publish, with its restorations", async () => {
    const { reconcileInput, observeRequest, observeRef, unreachedSettlement } = linkedSuffixFixture();
    const store = casStateStore();
    const order: string[] = [];

    const blocked = await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      ...unreachedSettlement,
      stateStore: {
        publish: async (planId: string, value: DeliveryStateV1, expectedRevision: number) => {
          order.push("publish");
          return store.stateStore.publish(planId, value, expectedRevision);
        },
      },
      rewriteLocalRef: async () => {
        order.push("rewrite");
        return { status: "rewritten" };
      },
      absorbTop: async () => ({ status: "refused", reason: "content-conflict", paths: ["docs/top.md"] }),
    });

    expect(order).toEqual(["publish", "rewrite", "rewrite"]);
    expect(blocked).toMatchObject({
      status: "blocked",
      reason: "contribution-conflicted",
      externalRefRestorations: [expect.anything(), expect.anything()],
    });
  });

  it("restores nothing on the suffix arm, which refuses before any ref moves", async () => {
    const { reconcileInput, observeRequest, observeRef, unreachedSettlement } = linkedSuffixFixture(5);

    const blocked = await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async (endpoints) => endpoints.after.member.head === "c".repeat(40)
        ? { status: "refused", reason: "contribution-diverged", paths: ["src/diverged.ts"] }
        : { status: "accepted", proof: "mechanical-reapply" },
      ...unreachedSettlement,
    });

    expect(blocked).toMatchObject({ status: "blocked", reason: "contribution-diverged" });
    expect(blocked).not.toHaveProperty("externalRefRestorations");
  });

  function unmovedSuffixFixture() {
    const suffixPlan = deliveryFourMemberStackPlanFixture();
    const initial = deliveryStateFixture(suffixPlan);
    const bound = {
      ...initial,
      members: initial.members.map((member, index) => ({
        ...member,
        coordinates: member.coordinates === null ? null : {
          ...member.coordinates,
          base: index === 0
            ? initial.target!.coordinates!.head
            : initial.members[index - 1]!.coordinates!.head,
        },
        changeRequest: { providerId: "github", changeRequestId: String(41 + index) },
      })),
    };
    const first = bound.members[0]!;
    const beforeSnapshot = { target: bound.target, members: [first] };
    const reserved = reserveDeliveryOperation({ revision: 1, value: bound }, suffixPlan, {
      operationId: "operation-1",
      kind: "land",
      mode: "native",
      nativeArm: "linked-single",
      affectedDeliverableIds: [first.deliverableId],
      expectedStateRevision: 1,
      before: beforeSnapshot,
      requested: beforeSnapshot,
      effect: {
        providerId: "github",
        repository: "o/r",
        changeRequestId: "41",
        headSha: first.coordinates!.head,
        baseRef: "delivery-target",
        targetRef: "refs/heads/delivery-target",
        strategy: "merge", mergePolicy: mergePolicy("o/r"),
      },
    });
    if (reserved.status !== "reserved") throw new Error("fixture reservation failed");
    const submitted = beginNativeDeliverySubmission({ revision: 2, value: reserved.state }, "operation-1");
    if (submitted.status !== "begun") throw new Error("fixture submission transition failed");
    const landed = {
      ...bound,
      target: {
        ref: "refs/heads/delivery-target",
        coordinates: { head: first.coordinates!.head, tree: first.coordinates!.tree },
      },
      activeOperation: null,
    };
    const unmovedByRef = new Map(bound.members.slice(1, -1).map((member) => [
      member.ref!,
      { head: member.coordinates!.head, tree: member.coordinates!.tree },
    ]));
    return {
      reconcileInput: {
        plan: suffixPlan,
        before: { revision: 3, value: submitted.state },
        landed: { revision: 3, value: landed },
        repository: "o/r",
        protectedTargetRef: "refs/heads/delivery-target",
      },
      observeRequest: async (binding: NonNullable<typeof bound.members[number]["changeRequest"]>) => {
        const index = Number(binding.changeRequestId) - 41;
        const unmoved = unmovedByRef.get(`refs/heads/member-${index + 1}`);
        return unmoved === undefined ? { status: "absent" as const } : {
          status: "observed" as const,
          request: {
            binding,
            repository: "o/r",
            headRepository: "o/r",
            headRef: `member-${index + 1}`,
            headSha: unmoved.head,
            baseRef: index === 1 ? "delivery-target" : `member-${index}`,
            state: "open" as const,
            draft: false,
          },
        };
      },
      observeRef: async (ref: string) => unmovedByRef.get(ref) ?? null,
    };
  }

  it("settles a fast-forward landing whose suffix did not move", async () => {
    const { reconcileInput, observeRequest, observeRef } = unmovedSuffixFixture();
    const settlement = reachedSettlement();

    const result = await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async () => ({ status: "accepted", proof: "tree-equality" }),
      ...settlement.deps,
    });

    expect(result).toMatchObject({ status: "applied", state: { revision: 4 } });
    expect(settlement.writes).toHaveLength(1);
  });

  it("bases every settled member on its predecessor and clears the reservation", async () => {
    const { reconcileInput, observeRequest, observeRef } = unmovedSuffixFixture();
    const settlement = reachedSettlement();

    await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async () => ({ status: "accepted", proof: "tree-equality" }),
      ...settlement.deps,
    });

    const settled = settlement.writes.at(-1)?.value;
    expect(settled).toBeDefined();
    const heads = settled!.members.map((member) => member.coordinates!.head);
    expect(settled!.members.slice(1).map((member) => member.coordinates!.base)).toEqual(heads.slice(0, -1));
    expect(settled!.activeOperation).toBeNull();
  });

  it("reaches neither contribution proof nor top absorption when the suffix did not move", async () => {
    const { reconcileInput, observeRequest, observeRef } = unmovedSuffixFixture();
    const settlement = reachedSettlement();
    const proveContribution = vi.fn(async () => ({
      status: "accepted" as const,
      proof: "tree-equality" as const,
    }));
    const absorbTop = vi.fn(async () => ({
      status: "refused" as const,
      reason: "coordinate-invalid" as const,
    }));

    const result = await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution,
      ...settlement.deps,
      absorbTop,
    });

    expect(result).toMatchObject({ status: "applied" });
    expect(proveContribution).not.toHaveBeenCalled();
    expect(absorbTop).not.toHaveBeenCalled();
  });
});

describe("the terminal absorber's refusal remedy", () => {
  const absorberRefusals = [
    "top-ref-invalid",
    "coordinate-invalid",
    "top-not-checked-out",
    "top-moved",
    "worktree-dirty",
    "absorption-unavailable",
  ] as const;

  const blockedByAbsorber = async (reason: (typeof absorberRefusals)[number]) => {
    const { reconcileInput, observeRequest, observeRef, unreachedSettlement } = linkedSuffixFixture();
    const blocked = await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      ...unreachedSettlement,
      stateStore: casStateStore().stateStore,
      rewriteLocalRef: async () => ({ status: "rewritten" }),
      absorbTop: async () => ({ status: "refused", reason }),
    });
    return blocked as { status: string; reason: string; recommendedActionText: string; remedy?: { kind: string } };
  };

  // Spelled out per reason rather than compared against the table the code reads: an assertion sourced from the
  // mapping under test would pass for any mapping, which is the failure this boundary is correcting.
  it.each([
    ["top-ref-invalid", "delivery-record-repair-required", /repair the landing record/i],
    ["coordinate-invalid", "delivery-host-reobservation-required", /re-observe/i],
    ["top-not-checked-out", "delivery-terminal-checkout-required", /check out the terminal top/i],
    ["top-moved", "delivery-terminal-restore-required", /restore the exact terminal top/i],
    ["worktree-dirty", "delivery-worktree-clean-required", /commit or set aside/i],
    ["absorption-unavailable", "delivery-terminal-absorption-retry-required", /in-progress merge/i],
  ] as const)("answers %s with a remedy that clears it", async (reason, kind, names) => {
    const blocked = await blockedByAbsorber(reason);

    expect(blocked).toMatchObject({ status: "blocked", reason, remedy: { kind, automatedCommand: null } });
    expect(blocked.recommendedActionText).toMatch(names);
    expect(blocked.recommendedActionText).toMatch(/^Keep the reservation/);
  });

  it("answers each absorber refusal in its own words", async () => {
    const answers = await Promise.all(absorberRefusals.map(blockedByAbsorber));

    const texts = answers.map((answer) => answer.recommendedActionText);
    expect(new Set(texts).size).toBe(absorberRefusals.length);
  });
});

describe("the settlement phase's refusal remedy", () => {
  type SettlementRecord = { readonly revision: number; readonly value: DeliveryStateV1 };

  /** The landing record advanced past the revision the reservation was written against. */
  const movedPastTheReservation = (before: SettlementRecord) => ({
    revision: before.revision + 1,
    value: before.value,
  });

  /** The terminal member carries a head no schema read accepts, so the record no longer validates. */
  const unreadableRecord = (before: SettlementRecord) => ({
    revision: before.revision,
    value: {
      ...before.value,
      members: before.value.members.map((member, index, all) => (
        index === all.length - 1 && member.coordinates !== null
          ? { ...member, coordinates: { ...member.coordinates, head: "not-a-sha" } }
          : member
      )),
    },
  });

  // `unreachedSettlement` throws on every dependency past the phase transition, so a refusal that did not come
  // from the transition itself fails loudly rather than being asserted into agreement.
  const blockedBySettlementPhase = async (wedge: (before: SettlementRecord) => SettlementRecord) => {
    const { reconcileInput, observeRequest, observeRef, unreachedSettlement } = linkedSuffixFixture();
    const blocked = await reconcileLinkedNativeDeliverySuffix(
      { ...reconcileInput, before: wedge(reconcileInput.before) },
      {
        observeRequest,
        observeRef,
        proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
        ...unreachedSettlement,
      },
    );
    return blocked as { status: string; reason: string; recommendedActionText: string };
  };

  it("sends a moved landing record back to be re-read, not restored", async () => {
    const blocked = await blockedBySettlementPhase(movedPastTheReservation);

    expect(blocked).toMatchObject({ status: "blocked", reason: "settlement-phase-operation-stale" });
    expect(blocked.recommendedActionText).toMatch(/re-read the landing state/);
    // Restoring the landing subject is the act the shared sentence named, and it clears nothing here: the
    // subject never moved, the revision did.
    expect(blocked.recommendedActionText).not.toMatch(/restore/i);
  });

  it("sends an unreadable landing record to repair", async () => {
    const blocked = await blockedBySettlementPhase(unreadableRecord);

    expect(blocked).toMatchObject({ status: "blocked", reason: "settlement-phase-state-invalid" });
    expect(blocked.recommendedActionText).toMatch(/repair the native landing record/);
  });

  it("answers the two causes a settled landing reaches in different words", async () => {
    const [stale, invalid] = await Promise.all([
      blockedBySettlementPhase(movedPastTheReservation),
      blockedBySettlementPhase(unreadableRecord),
    ]);

    expect(stale!.recommendedActionText).not.toBe(invalid!.recommendedActionText);
  });
});

/**
 * Success Criterion 2 — new member heads receive fresh applicability, review and checks before landing.
 *
 * The settle rewrites member coordinates under the held reservation, so the gate result an operator carries
 * into the next cycle was taken at a head that no longer exists. These drive the settle's own published state
 * back through the readiness gate rather than asserting the rule on coordinates assembled by hand.
 */
describe("the landing cycle after a settled suffix", () => {
  const targetRef = "refs/heads/delivery-target";

  /** A clean settle: no collision to disclose, and every suffix member rewritten to its reobserved head. */
  async function settledSuffix() {
    const { bound, reconcileInput, observeRequest, observeRef } = linkedSuffixFixture();
    const applied = await reconcileLinkedNativeDeliverySuffix(reconcileInput, {
      observeRequest,
      observeRef,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      observeMemberRefCheckouts: async () => ({ status: "observed", checkouts: [] }),
      absorbTop: async () => ({ status: "absorbed", head: "9".repeat(40), tree: "8".repeat(40) }),
      publishTop: async () => ({ status: "published" }),
      rewriteLocalRef: async () => ({ status: "rewritten" }),
      stateStore: casStateStore().stateStore,
    });
    if (applied.status !== "applied") throw new Error(`expected a settle, got ${JSON.stringify(applied)}`);
    return { before: bound, plan: reconcileInput.plan, settled: applied.state.value };
  }

  function eligibilityDependencies(
    settled: DeliveryStateV1,
    plan: DeliveryPlanV1,
  ): DeliveryEligibilityCloseDependencies {
    const tip = settled.target!.coordinates!;
    const observed = new Map<string, { head: string; tree: string }>(settled.members.flatMap((member) => (
      member.ref === null || member.coordinates === null
        ? []
        : [[member.ref, { head: member.coordinates.head, tree: member.coordinates.tree }] as const]
    )));
    observed.set(targetRef, { head: tip.head, tree: tip.tree });
    return {
      observeRef: vi.fn(async (ref: string) => observed.get(ref) ?? null),
      readAncestry: vi.fn(async () => "ancestor" as const),
      readOverlap: vi.fn(async () => ({
        status: "available" as const,
        mergeBase: tip.head,
        overlap: { status: "available" as const, substantivePaths: [], regenerablePaths: [] },
      })),
      revalidateLifecycleContribution: vi.fn(async () => ({ status: "ok" as const })),
      resolveLifecyclePaths: vi.fn(async ({ snapshot }) => snapshot.lifecyclePaths),
      compareNormalizedCompleteness: vi.fn(async () => ({ status: "match" as const })),
      readCurrentPlan: vi.fn(async () => plan),
      resolveMember: vi.fn(async () => ({ status: "ok" as const, value: null })),
      inspectCheckout: vi.fn(async () => null),
    };
  }

  /** The remaining chain an operator would carry forward once the bottom member has landed. */
  async function nextCycle() {
    const { before, plan, settled } = await settledSuffix();
    const deps = eligibilityDependencies(settled, plan);
    const suffix = before.members.slice(1);
    const candidates = suffix.map((member) => ({ deliverableId: member.deliverableId, ref: member.ref! }));
    const prepared = await prepareDeliveryEligibility({
      plan,
      protectedBaseRef: targetRef,
      topRef: suffix.at(-1)!.ref!,
      memberOffset: 1,
      candidates,
      lifecyclePaths: [],
    }, deps);
    if (prepared.status !== "prepared") {
      throw new Error(`expected a prepared cycle, got ${JSON.stringify(prepared)}`);
    }
    return { deps, suffix, snapshot: prepared.snapshot };
  }

  it("refuses a gate result taken before the settle rewrote the member", async () => {
    const { deps, suffix, snapshot } = await nextCycle();
    const staleResults = suffix.map((member) => ({
      deliverableId: member.deliverableId,
      head: member.coordinates!.head,
      tree: member.coordinates!.tree,
      status: "passed" as const,
    }));

    // The premise of the check: the settle really did move the head the decision was taken at.
    expect(staleResults[0]!.head).not.toBe(snapshot.members[0]!.head);

    await expect(closeDeliveryEligibilityForPublication({ snapshot, gateResults: staleResults }, deps))
      .resolves.toEqual({
        status: "refused",
        reason: "gate-result-stale",
        deliverableId: suffix[0]!.deliverableId,
      });
  });

  it("admits the cycle once the gates rerun on the heads the settle published", async () => {
    const { deps, snapshot } = await nextCycle();
    const freshResults = snapshot.members.map((member) => ({
      deliverableId: member.deliverableId,
      head: member.head,
      tree: member.tree,
      status: "passed" as const,
    }));

    await expect(closeDeliveryEligibilityForPublication({ snapshot, gateResults: freshResults }, deps))
      .resolves.toMatchObject({ status: "eligible" });
  });
});
