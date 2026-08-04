import { describe, expect, it } from "vitest";

import {
  resolveExistingDeliveryPlan,
  type DeliveryRenameTransitionSource,
} from "../../../src/lib/delivery/plan-resolution.js";
import type { DeliveryPlanStore } from "../../../src/lib/delivery/ports.js";
import type { ReachableReferenceTransition } from "../../../src/lib/work-unit/reference-reconcile.js";

interface TestPlan {
  readonly id: string;
  readonly workUnitId: string;
}

function plan(id: string, workUnitId: string): TestPlan {
  return { id, workUnitId };
}

function planStore(
  plans: readonly TestPlan[],
  refused = false,
): Pick<DeliveryPlanStore<TestPlan>, "enumerateCurrent"> {
  return {
    enumerateCurrent: async () => refused
      ? { status: "refused", reason: "namespace-corrupt" }
      : { status: "ok", value: plans },
  };
}

function transitionSource(
  transitions: readonly ReachableReferenceTransition[],
  expectedRef = "refs/heads/main",
): DeliveryRenameTransitionSource {
  return {
    enumerate: async (ref) => ref === expectedRef
      ? { status: "ok", value: transitions }
      : { status: "refused", reason: "substrate-unreachable" },
  };
}

function resolve(input: {
  readonly plans?: readonly TestPlan[];
  readonly transitions?: readonly ReachableReferenceTransition[];
  readonly currentWorkUnitId?: string;
  readonly authority?: { readonly status: "established"; readonly ref: string }
    | { readonly status: "unestablished" };
  readonly source?: DeliveryRenameTransitionSource;
  readonly storeRefused?: boolean;
}) {
  return resolveExistingDeliveryPlan({
    planStore: planStore(input.plans ?? [], input.storeRefused),
    currentWorkUnitId: input.currentWorkUnitId ?? "current-unit",
    planWorkUnitId: (value) => value.workUnitId,
    authority: input.authority ?? { status: "established", ref: "refs/heads/main" },
    transitionSource: input.source ?? transitionSource(input.transitions ?? []),
  });
}

describe("existing delivery plan resolution", () => {
  it("matches a stored plan through a transitive rename chain", async () => {
    const stored = plan("plan-1", "original-unit");

    await expect(resolve({
      plans: [stored],
      transitions: [
        { subject: "original-unit", outcome: { kind: "rename", targetSlug: "middle-unit" } },
        { subject: "middle-unit", outcome: { kind: "rename", targetSlug: "current-unit" } },
      ],
    })).resolves.toEqual({ status: "match", plan: stored });
  });

  it("treats terminal absence, another target, and non-renames as no match", async () => {
    await expect(resolve({ plans: [plan("absent", "unrelated-unit")] }))
      .resolves.toEqual({ status: "no-match" });
    await expect(resolve({
      plans: [plan("elsewhere", "old-unit")],
      transitions: [{ subject: "old-unit", outcome: { kind: "rename", targetSlug: "other-unit" } }],
    })).resolves.toEqual({ status: "no-match" });
    await expect(resolve({
      plans: [plan("removed", "old-unit")],
      transitions: [{ subject: "old-unit", outcome: { kind: "removed" } }],
    })).resolves.toEqual({ status: "no-match" });
    await expect(resolve({
      plans: [plan("decomposed", "old-unit")],
      transitions: [{ subject: "old-unit", outcome: { kind: "decompose" } }],
    })).resolves.toEqual({ status: "no-match" });
  });

  it("allows minting only when no stored plan resolves to the unit", async () => {
    await expect(resolve({ plans: [] })).resolves.toEqual({ status: "no-match" });
    await expect(resolve({ plans: [plan("direct", "current-unit")] }))
      .resolves.toMatchObject({ status: "match", plan: { id: "direct" } });
  });

  it("honors retirement evidence before accepting a reused direct slug", async () => {
    const stored = plan("retired", "current-unit");

    await expect(resolve({
      plans: [stored],
      transitions: [{ subject: "current-unit", outcome: { kind: "rename", targetSlug: "other-unit" } }],
    })).resolves.toEqual({ status: "no-match" });
    await expect(resolve({
      plans: [stored],
      transitions: [{ subject: "current-unit", outcome: { kind: "removed" } }],
    })).resolves.toEqual({ status: "no-match" });
    await expect(resolve({
      plans: [stored],
      transitions: [
        { subject: "current-unit", outcome: { kind: "rename", targetSlug: "other-unit" } },
        { subject: "current-unit", outcome: { kind: "removed" } },
      ],
    })).resolves.toEqual({ status: "indeterminate", reason: "ambiguous-subject" });
  });

  it("honors retirement evidence after a rename reaches a reused slug", async () => {
    const stored = plan("retired", "original-unit");

    await expect(resolve({
      plans: [stored],
      transitions: [
        { subject: "original-unit", outcome: { kind: "rename", targetSlug: "current-unit" } },
        { subject: "current-unit", outcome: { kind: "rename", targetSlug: "later-unit" } },
      ],
    })).resolves.toEqual({ status: "no-match" });
    await expect(resolve({
      plans: [stored],
      transitions: [
        { subject: "original-unit", outcome: { kind: "rename", targetSlug: "current-unit" } },
        { subject: "current-unit", outcome: { kind: "removed" } },
      ],
    })).resolves.toEqual({ status: "no-match" });
  });

  it("preserves ambiguous, corrupt, and unreachable histories as indeterminate", async () => {
    await expect(resolve({
      plans: [plan("ambiguous", "old-unit")],
      transitions: [
        { subject: "old-unit", outcome: { kind: "rename", targetSlug: "current-unit" } },
        { subject: "old-unit", outcome: { kind: "removed" } },
      ],
    })).resolves.toEqual({ status: "indeterminate", reason: "ambiguous-subject" });
    await expect(resolve({ storeRefused: true }))
      .resolves.toEqual({ status: "indeterminate", reason: "namespace-corrupt" });
    await expect(resolve({
      plans: [plan("corrupt-evidence", "old-unit")],
      source: { enumerate: async () => ({ status: "refused", reason: "namespace-corrupt" }) },
    })).resolves.toEqual({ status: "indeterminate", reason: "namespace-corrupt" });
    await expect(resolve({
      plans: [plan("unreachable", "old-unit")],
      source: { enumerate: async () => ({ status: "refused", reason: "substrate-unreachable" }) },
    })).resolves.toEqual({ status: "indeterminate", reason: "substrate-unreachable" });
  });

  it("treats a cycle that never reaches the current unit as no match", async () => {
    await expect(resolve({
      plans: [plan("cycle", "unit-a")],
      transitions: [
        { subject: "unit-a", outcome: { kind: "rename", targetSlug: "unit-b" } },
        { subject: "unit-b", outcome: { kind: "rename", targetSlug: "unit-a" } },
      ],
    })).resolves.toEqual({ status: "no-match" });
  });

  it("uses only established reachability authority", async () => {
    const stored = plan("established", "old-unit");
    await expect(resolve({
      plans: [stored],
      authority: { status: "established", ref: "refs/heads/evidence" },
      source: transitionSource([
        { subject: "old-unit", outcome: { kind: "rename", targetSlug: "current-unit" } },
      ], "refs/heads/evidence"),
    })).resolves.toEqual({ status: "match", plan: stored });
    await expect(resolve({
      plans: [stored],
      authority: { status: "unestablished" },
      source: { enumerate: async () => { throw new Error("unestablished evidence must not be read"); } },
    })).resolves.toEqual({ status: "indeterminate", reason: "reachability-unestablished" });
  });

  it("refuses multiple stored plans that resolve to the same current unit", async () => {
    await expect(resolve({
      plans: [plan("first", "old-a"), plan("second", "old-b")],
      transitions: [
        { subject: "old-a", outcome: { kind: "rename", targetSlug: "current-unit" } },
        { subject: "old-b", outcome: { kind: "rename", targetSlug: "current-unit" } },
      ],
    })).resolves.toEqual({ status: "indeterminate", reason: "namespace-corrupt" });
  });
});
