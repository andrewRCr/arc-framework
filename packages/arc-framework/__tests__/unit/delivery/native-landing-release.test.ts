import { describe, expect, it, vi } from "vitest";

import type { DeliveryStateV1 } from "../../../src/lib/delivery/schema.js";
import { DeliveryStateV1Schema } from "../../../src/lib/delivery/schema.js";

import {
  admitNativeDeliveryLandingRelease,
  reconcileLinkedNativeDeliverySuffix,
  releaseNativeDeliveryLanding,
  restoreNativeDeliveryLandingRefs,
} from "../../../src/lib/delivery/native-landing.js";
import {
  attachDeliveryOperationEffectIdentity,
  beginNativeDeliverySubmission,
  reserveDeliveryOperation,
} from "../../../src/lib/delivery/operation.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";
import {
  casStateStore,
  linkedSuffixFixture,
  mergePolicy,
  plan,
} from "../../helpers/native-landing-fixtures.js";

describe("native delivery landing decline", () => {
  function heldNativeLandingFixture(options?: {
    readonly phase?: "prepared";
    readonly effectIdentity?: "persisted" | "absent";
  }) {
    const state = deliveryStateFixture(plan);
    const affectedDeliverableIds = state.members.slice(0, -1).map((member) => member.deliverableId);
    const before = { target: state.target, members: state.members.slice(0, -1) };
    const effect = {
      providerId: "github", repository: "o/r", changeRequestId: "42", headSha: "b".repeat(40),
      baseRef: "delivery-target", targetRef: "refs/heads/delivery-target", strategy: "merge",
      mergePolicy: mergePolicy("o/r"),
    } as const;
    const reserved = reserveDeliveryOperation({ revision: 1, value: state }, plan, {
      operationId: "operation-1", kind: "land", mode: "native", nativeArm: "linked-atomic",
      affectedDeliverableIds, expectedStateRevision: 1, before, requested: before, effect,
    });
    if (reserved.status !== "reserved") throw new Error("fixture reservation failed");
    if (options?.phase === "prepared") {
      return { current: { revision: 2, value: reserved.state }, effect, before, affectedDeliverableIds };
    }
    const submitting = beginNativeDeliverySubmission({ revision: 2, value: reserved.state }, "operation-1");
    if (submitting.status === "refused") throw new Error("fixture submission transition failed");
    if (options?.effectIdentity === "absent") {
      return { current: { revision: 3, value: submitting.state }, effect, before, affectedDeliverableIds };
    }
    const attached = attachDeliveryOperationEffectIdentity(
      { revision: 3, value: submitting.state }, "operation-1", { providerId: "github", effectId: "uuid-1" },
    );
    if (attached.status === "refused") throw new Error("fixture identity attachment failed");
    return { current: { revision: 4, value: attached.state }, effect, before, affectedDeliverableIds };
  }

  const declineSelector = (current: { readonly revision: number; readonly value: DeliveryStateV1 }) => ({
    planId: plan.planId, current, operationId: "operation-1", repository: "o/r",
  });

  it("resolves the settled reservation the decline selector names", async () => {
    const { current, effect, before, affectedDeliverableIds } = heldNativeLandingFixture();
    const host = { observeNativeMerge: vi.fn().mockResolvedValue({ status: "merged" }) };

    await expect(admitNativeDeliveryLandingRelease(declineSelector(current), {
      host,
      observeEffect: vi.fn().mockResolvedValue({ outcome: "all-landed", snapshot: before }),
    })).resolves.toEqual({
      status: "admitted",
      operationId: "operation-1",
      effect,
      before,
      affectedDeliverableIds,
      restorations: [],
    });
  });

  it("refuses a selector naming no held reservation without reading the host", async () => {
    const { current } = heldNativeLandingFixture();
    const unreserved = { revision: 1, value: deliveryStateFixture(plan) };
    const host = { observeNativeMerge: vi.fn() };
    const observeEffect = vi.fn();

    await expect(admitNativeDeliveryLandingRelease(
      { ...declineSelector(unreserved) },
      { host, observeEffect },
    )).resolves.toMatchObject({ status: "blocked", reason: "native-landing-reservation-missing" });
    await expect(admitNativeDeliveryLandingRelease(
      { ...declineSelector(current), operationId: "operation-2" },
      { host, observeEffect },
    )).resolves.toMatchObject({ status: "blocked", reason: "reservation-mismatch" });
    await expect(admitNativeDeliveryLandingRelease(
      { ...declineSelector(current), repository: "other/repo" },
      { host, observeEffect },
    )).resolves.toMatchObject({ status: "blocked", reason: "reservation-mismatch" });
    expect(host.observeNativeMerge).not.toHaveBeenCalled();
    expect(observeEffect).not.toHaveBeenCalled();
  });

  it("refuses a pending, partial, or ambiguous effect rather than declining it", async () => {
    const { current, before, affectedDeliverableIds } = heldNativeLandingFixture();
    const host = { observeNativeMerge: vi.fn().mockResolvedValue({ status: "pending" }) };

    await expect(admitNativeDeliveryLandingRelease(declineSelector(current), {
      host, observeEffect: vi.fn(),
    })).resolves.toMatchObject({ status: "blocked", reason: "effect-pending" });
    host.observeNativeMerge.mockResolvedValue({ status: "merged" });
    await expect(admitNativeDeliveryLandingRelease(declineSelector(current), {
      host,
      observeEffect: vi.fn().mockResolvedValue({
        outcome: "partial-landed", affectedDeliverableIds: [affectedDeliverableIds[0]],
      }),
    })).resolves.toMatchObject({ status: "blocked", reason: "partial-landed" });
    await expect(admitNativeDeliveryLandingRelease(declineSelector(current), {
      host, observeEffect: vi.fn().mockResolvedValue({ outcome: "none-landed" }),
    })).resolves.toMatchObject({ status: "blocked", reason: "ambiguous-result" });
    host.observeNativeMerge.mockResolvedValue({ status: "refused", reason: "unavailable" });
    await expect(admitNativeDeliveryLandingRelease(declineSelector(current), {
      host, observeEffect: vi.fn().mockResolvedValue({ outcome: "all-landed", snapshot: before }),
    })).resolves.toMatchObject({ status: "blocked", reason: "unavailable" });
  });

  it("routes a persisted failed effect that never landed to the verb that clears it", async () => {
    const { current, affectedDeliverableIds } = heldNativeLandingFixture();
    const host = { observeNativeMerge: vi.fn().mockResolvedValue({ status: "failed" }) };

    await expect(admitNativeDeliveryLandingRelease(declineSelector(current), {
      host, observeEffect: vi.fn().mockResolvedValue({ outcome: "none-landed" }),
    })).resolves.toEqual({
      status: "retryable",
      transition: "preserved",
      action: "delivery-native-land-status",
      selector: {
        planId: plan.planId,
        operationKind: "land",
        operationId: "operation-1",
        affectedDeliverableIds,
        mode: "native",
      },
      recommendedActionText: expect.stringContaining("arc delivery native land-status"),
    });
  });

  it("holds a reservation whose submission outran its persistence instead of routing it", async () => {
    const { current } = heldNativeLandingFixture({ effectIdentity: "absent" });
    const host = { observeNativeMerge: vi.fn() };

    await expect(admitNativeDeliveryLandingRelease(declineSelector(current), {
      host, observeEffect: vi.fn().mockResolvedValue({ outcome: "none-landed" }),
    })).resolves.toMatchObject({
      status: "blocked",
      reason: "submission-before-persist-unresolved",
    });
    expect(host.observeNativeMerge).not.toHaveBeenCalled();
  });

  it("names an enqueued effect rather than refusing it as ambiguous", async () => {
    const { current } = heldNativeLandingFixture();
    const host = { observeNativeMerge: vi.fn().mockResolvedValue({ status: "enqueued" }) };

    await expect(admitNativeDeliveryLandingRelease(declineSelector(current), {
      host, observeEffect: vi.fn(),
    })).resolves.toMatchObject({ status: "blocked", reason: "effect-enqueued" });
  });

  it("refuses a prepared reservation as one reconciliation abandons, not decline", async () => {
    const { current } = heldNativeLandingFixture({ phase: "prepared" });
    const host = { observeNativeMerge: vi.fn() };
    const observeEffect = vi.fn();

    const result = await admitNativeDeliveryLandingRelease(declineSelector(current), { host, observeEffect });

    expect(result).toMatchObject({ status: "blocked", reason: "reservation-not-submitted" });
    expect(result).not.toMatchObject({ status: "retryable" });
    expect(host.observeNativeMerge).not.toHaveBeenCalled();
    expect(observeEffect).not.toHaveBeenCalled();
  });

  async function wedgedSettlement() {
    const fixture = linkedSuffixFixture();
    const store = casStateStore();
    const moved: Array<{ ref: string; beforeHead: string; requestedHead: string }> = [];
    const blocked = await reconcileLinkedNativeDeliverySuffix(fixture.reconcileInput, {
      observeRequest: fixture.observeRequest,
      observeRef: fixture.observeRef,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      ...fixture.unreachedSettlement,
      stateStore: store.stateStore,
      rewriteLocalRef: async (input) => {
        moved.push(input);
        return { status: "rewritten" };
      },
      absorbTop: async () => ({ status: "refused", reason: "content-conflict", paths: ["docs/top.md"] }),
    });
    if (blocked.status !== "blocked") throw new Error(`expected a wedged settle, got ${blocked.status}`);
    const wedged = store.writes.at(-1);
    if (wedged === undefined) throw new Error("expected the settle to phase-publish before wedging");
    return {
      moved,
      planId: fixture.reconcileInput.plan.planId,
      current: { revision: fixture.reconcileInput.before.revision + 1, value: wedged.value },
    };
  }

  const localRefTable = (heads: ReadonlyMap<string, string>) => {
    const table = new Map(heads);
    return {
      table,
      observeLocalRef: async (ref: string) => {
        const head = table.get(ref);
        return head === undefined
          ? { status: "absent" as const }
          : { status: "observed" as const, head };
      },
      rewriteLocalRef: async (
        { ref, beforeHead, requestedHead }: { ref: string; beforeHead: string; requestedHead: string },
      ) => {
        const head = table.get(ref);
        if (head === requestedHead) return { status: "adopted" as const };
        if (head !== beforeHead) return { status: "refused" as const, reason: "collision" };
        table.set(ref, requestedHead);
        return { status: "rewritten" as const };
      },
    };
  };

  it("restores every member ref the wedged settle moved, swapping the rewrite", async () => {
    const { moved, planId, current } = await wedgedSettlement();
    expect(moved).toHaveLength(2);
    const refs = localRefTable(new Map(moved.map(({ ref, requestedHead }) => [ref, requestedHead])));

    const admitted = await admitNativeDeliveryLandingRelease({
      planId, current, operationId: "operation-1", repository: "o/r",
    }, {
      host: { observeNativeMerge: vi.fn() },
      observeEffect: vi.fn().mockResolvedValue({
        outcome: "all-landed",
        snapshot: current.value.activeOperation?.before,
      }),
    });
    if (admitted.status !== "admitted") throw new Error(`expected an admitted decline, got ${admitted.status}`);

    await expect(restoreNativeDeliveryLandingRefs(admitted.restorations, refs))
      .resolves.toEqual({
        status: "restored",
        restorations: moved.map(({ ref, beforeHead, requestedHead }) => ({
          ref, observedHead: requestedHead, restoreHead: beforeHead,
        })),
      });
    expect([...refs.table]).toEqual(moved.map(({ ref, beforeHead }) => [ref, beforeHead]));
  });

  it("restores nothing for a reservation whose settle never moved a ref", async () => {
    const { current } = heldNativeLandingFixture();
    const observeLocalRef = vi.fn();
    const rewriteLocalRef = vi.fn();

    const admitted = await admitNativeDeliveryLandingRelease(declineSelector(current), {
      host: { observeNativeMerge: vi.fn().mockResolvedValue({ status: "merged" }) },
      observeEffect: vi.fn().mockResolvedValue({
        outcome: "all-landed",
        snapshot: current.value.activeOperation?.before,
      }),
    });
    if (admitted.status !== "admitted") throw new Error(`expected an admitted decline, got ${admitted.status}`);

    expect(admitted.restorations).toEqual([]);
    await expect(restoreNativeDeliveryLandingRefs(admitted.restorations, {
      observeLocalRef, rewriteLocalRef,
    })).resolves.toEqual({ status: "restored", restorations: [] });
    expect(observeLocalRef).not.toHaveBeenCalled();
    expect(rewriteLocalRef).not.toHaveBeenCalled();
  });

  async function admittedDecline(
    planId: string,
    current: { readonly revision: number; readonly value: DeliveryStateV1 },
  ) {
    const admitted = await admitNativeDeliveryLandingRelease({
      planId, current, operationId: "operation-1", repository: "o/r",
    }, {
      host: { observeNativeMerge: vi.fn().mockResolvedValue({ status: "merged" }) },
      observeEffect: vi.fn().mockResolvedValue({
        outcome: "all-landed",
        snapshot: current.value.activeOperation?.before,
      }),
    });
    if (admitted.status !== "admitted") throw new Error(`expected an admitted decline, got ${admitted.status}`);
    return admitted;
  }

  it("clears the reservation in one write at the revision the decline read", async () => {
    const { moved, planId, current } = await wedgedSettlement();
    const refs = localRefTable(new Map(moved.map(({ ref, requestedHead }) => [ref, requestedHead])));
    const store = casStateStore(current.revision);

    const released = await releaseNativeDeliveryLanding(
      { planId, current, admitted: await admittedDecline(planId, current) },
      { ...refs, stateStore: store.stateStore },
    );

    expect(released).toMatchObject({ status: "released", state: { revision: current.revision + 1 } });
    expect(store.writes).toEqual([{
      expectedRevision: current.revision,
      value: { ...current.value, activeOperation: null },
    }]);
    expect(DeliveryStateV1Schema.safeParse(store.writes[0]?.value).success).toBe(true);
  });

  it("holds the reservation when the clear meets a competing write", async () => {
    const { moved, planId, current } = await wedgedSettlement();
    const refs = localRefTable(new Map(moved.map(({ ref, requestedHead }) => [ref, requestedHead])));
    const store = casStateStore(current.revision + 1);

    await expect(releaseNativeDeliveryLanding(
      { planId, current, admitted: await admittedDecline(planId, current) },
      { ...refs, stateStore: store.stateStore },
    )).resolves.toMatchObject({ status: "blocked", reason: "state-conflict" });
    expect(store.writes).toEqual([]);
  });

  it("names every ref it restored in the released result", async () => {
    const { moved, planId, current } = await wedgedSettlement();
    const refs = localRefTable(new Map(moved.map(({ ref, requestedHead }) => [ref, requestedHead])));
    const store = casStateStore(current.revision);

    const released = await releaseNativeDeliveryLanding(
      { planId, current, admitted: await admittedDecline(planId, current) },
      { ...refs, stateStore: store.stateStore },
    );

    expect(released).toMatchObject({
      status: "released",
      restorations: moved.map(({ ref, beforeHead, requestedHead }) => ({
        ref, observedHead: requestedHead, restoreHead: beforeHead,
      })),
    });
  });

  it("names the landed work the decline leaves standing", async () => {
    const { moved, planId, current } = await wedgedSettlement();
    const refs = localRefTable(new Map(moved.map(({ ref, requestedHead }) => [ref, requestedHead])));
    const store = casStateStore(current.revision);
    const admitted = await admittedDecline(planId, current);

    const released = await releaseNativeDeliveryLanding(
      { planId, current, admitted },
      { ...refs, stateStore: store.stateStore },
    );

    expect(released).toMatchObject({
      status: "released",
      landed: {
        effect: admitted.effect,
        affectedDeliverableIds: admitted.affectedDeliverableIds,
      },
    });
  });

  it("reports the ref and the head it found when a lease fails", async () => {
    const { moved, planId, current } = await wedgedSettlement();
    const displaced = moved[1]!;
    const heads = new Map(moved.map(({ ref, requestedHead }) => [ref, requestedHead]));
    heads.set(displaced.ref, "f".repeat(40));
    const store = casStateStore(current.revision);

    await expect(releaseNativeDeliveryLanding(
      { planId, current, admitted: await admittedDecline(planId, current) },
      { ...localRefTable(heads), stateStore: store.stateStore },
    )).resolves.toMatchObject({
      status: "blocked",
      reason: "local-ref-moved",
      lease: {
        ref: displaced.ref,
        expectedHead: displaced.requestedHead,
        observedHead: "f".repeat(40),
      },
    });
  });

  it("holds the reservation through a failed lease, so a repaired retry still releases it", async () => {
    const { moved, planId, current } = await wedgedSettlement();
    const displaced = moved[1]!;
    const heads = new Map(moved.map(({ ref, requestedHead }) => [ref, requestedHead]));
    heads.set(displaced.ref, "f".repeat(40));
    const refs = localRefTable(heads);
    const store = casStateStore(current.revision);
    const dependencies = { ...refs, stateStore: store.stateStore };

    await expect(releaseNativeDeliveryLanding(
      { planId, current, admitted: await admittedDecline(planId, current) }, dependencies,
    )).resolves.toMatchObject({ status: "blocked", reason: "local-ref-moved" });

    refs.table.set(displaced.ref, displaced.requestedHead);

    await expect(releaseNativeDeliveryLanding(
      { planId, current, admitted: await admittedDecline(planId, current) }, dependencies,
    )).resolves.toMatchObject({ status: "released", state: { revision: current.revision + 1 } });
    expect([...refs.table]).toEqual(moved.map(({ ref, beforeHead }) => [ref, beforeHead]));
  });

  /**
   * A1 — the settle also rewrites the local terminal top, under a lease of its own. Both wedges past that
   * rewrite hold the reservation with the top already moved, so both are declines the inventory has to cover.
   */
  async function wedgedPastTheAbsorb(wedge: "top-publish" | "state-conflict") {
    const fixture = linkedSuffixFixture();
    const absorbedTop = { head: "9".repeat(40), tree: "8".repeat(40) };
    const store = casStateStore();
    const moved: Array<{ ref: string; beforeHead: string; requestedHead: string }> = [];
    const terminal = fixture.bound.members.at(-1)!;
    const blocked = await reconcileLinkedNativeDeliverySuffix(fixture.reconcileInput, {
      observeRequest: fixture.observeRequest,
      observeRef: fixture.observeRef,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      observeMemberRefCheckouts: async () => ({ status: "observed", checkouts: [] }),
      absorbTop: async () => ({ status: "absorbed", ...absorbedTop }),
      publishTop: async () => (wedge === "top-publish"
        ? { status: "refused", reason: "collision" }
        : { status: "published" }),
      rewriteLocalRef: async (input) => {
        moved.push(input);
        return { status: "rewritten" };
      },
      stateStore: {
        // The state-conflict arm lets both phase records land and meets a competing write on the settle itself.
        publish: async (planId, value, expectedRevision) => (
          wedge === "state-conflict" && store.writes.length >= 2
            ? { status: "refused", reason: "version-conflict" }
            : store.stateStore.publish(planId, value, expectedRevision)
        ),
      },
    });
    const recorded = store.writes.at(-1);
    if (blocked.status !== "blocked" || recorded === undefined) {
      throw new Error(`expected a wedge past the absorb, got ${JSON.stringify(blocked)}`);
    }
    // The absorb moved the local top; the rewriter the settle used for members never saw it.
    const heads = new Map([
      ...moved.map(({ ref, requestedHead }) => [ref, requestedHead] as const),
      [terminal.ref!, absorbedTop.head] as const,
    ]);
    return {
      blocked,
      heads,
      moved,
      topRef: terminal.ref!,
      absorbedTop,
      restoreTop: terminal.coordinates!.head,
      planId: fixture.reconcileInput.plan.planId,
      current: { revision: recorded.expectedRevision + 1, value: recorded.value },
    };
  }

  it.each([
    ["a refused top publication", "top-publish" as const, "top-publish-collision"],
    ["a settle that met a competing write", "state-conflict" as const, "state-conflict"],
  ])("restores the absorbed top after %s", async (_label, wedge, reason) => {
    const { blocked, heads, moved, topRef, absorbedTop, restoreTop, planId, current }
      = await wedgedPastTheAbsorb(wedge);
    const refs = localRefTable(heads);

    expect(blocked).toMatchObject({ status: "blocked", reason });

    const admitted = await admittedDecline(planId, current);
    expect(admitted.restorations).toEqual([
      ...moved.map(({ ref, beforeHead, requestedHead }) => ({
        ref, observedHead: requestedHead, restoreHead: beforeHead,
      })),
      { ref: topRef, observedHead: absorbedTop.head, restoreHead: restoreTop },
    ]);

    await expect(releaseNativeDeliveryLanding(
      { planId, current, admitted },
      { ...refs, stateStore: casStateStore(current.revision).stateStore },
    )).resolves.toMatchObject({ status: "released" });
    expect(refs.table.get(topRef)).toBe(restoreTop);
  });

  it("holds the reservation when the absorbed top sits at neither end of its lease", async () => {
    const { heads, topRef, absorbedTop, planId, current } = await wedgedPastTheAbsorb("top-publish");
    heads.set(topRef, "f".repeat(40));
    const store = casStateStore(current.revision);

    await expect(releaseNativeDeliveryLanding(
      { planId, current, admitted: await admittedDecline(planId, current) },
      { ...localRefTable(heads), stateStore: store.stateStore },
    )).resolves.toMatchObject({
      status: "blocked",
      reason: "local-ref-moved",
      lease: { ref: topRef, expectedHead: absorbedTop.head, observedHead: "f".repeat(40) },
    });
    expect(store.writes).toEqual([]);
  });

  it("writes no state at all when a restoration fails", async () => {
    const { moved, planId, current } = await wedgedSettlement();
    const heads = new Map(moved.map(({ ref, requestedHead }) => [ref, requestedHead]));
    heads.set(moved[1]!.ref, "f".repeat(40));
    const store = casStateStore(current.revision);

    await expect(releaseNativeDeliveryLanding(
      { planId, current, admitted: await admittedDecline(planId, current) },
      { ...localRefTable(heads), stateStore: store.stateStore },
    )).resolves.toMatchObject({ status: "blocked" });
    expect(store.writes).toEqual([]);
  });
});
