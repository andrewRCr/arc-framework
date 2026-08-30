import { describe, expect, it, vi } from "vitest";

import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  composePreBindingDeliveryReviewTargets,
  type PreBindingDeliveryReviewTargetDependencies,
} from "../../../../../src/scripts/review-gate/policy/pre-publication-delivery-targets.js";
import { deliveryThreeMemberStackPlanFixture } from "../../../../fixtures/delivery-plan.js";

const oid = (character: string): string => character.repeat(40);

type EvidenceFailure = "missing" | "dirty" | "moved" | "reordered" | "incoherent";

function dependencies(failure?: EvidenceFailure): PreBindingDeliveryReviewTargetDependencies {
  const plan = deliveryThreeMemberStackPlanFixture();
  const coordinates = new Map([
    ["refs/heads/main", { head: oid("a"), tree: oid("1") }],
    ["refs/heads/feat/example", { head: oid("d"), tree: oid("4") }],
    [`refs/arc/delivery-candidates/${plan.planId}/first`, { head: oid("b"), tree: oid("2") }],
    [`refs/arc/delivery-candidates/${plan.planId}/second`, { head: oid("c"), tree: oid("3") }],
    [`refs/arc/delivery-candidates/${plan.planId}/third`, { head: oid("e"), tree: oid("4") }],
  ]);
  const treeByHead = new Map([...coordinates.values()].map(({ head, tree }) => [head, tree]));
  return {
    resolveDelivery: vi.fn(async () => ({ status: "planned" as const, plan })),
    resolveGitCommonDir: vi.fn(async () => "/repo/.git"),
    resolveOriginatingTop: vi.fn(async () => "refs/heads/feat/example"),
    resolveLifecyclePaths: vi.fn(async () => [".arc/active/meta-example.md"]),
    eligibility: {
      observeRef: vi.fn(async (ref) => failure === "missing" && ref.endsWith("/first")
        ? null
        : coordinates.get(ref) ?? null),
      readAncestry: vi.fn(async () => "ancestor" as const),
      revalidateLifecycleContribution: vi.fn(async () => ({ status: "ok" as const })),
      compareNormalizedCompleteness: vi.fn(async () => failure === "incoherent"
        ? { status: "refused" as const, reason: "mismatched" as const }
        : { status: "match" as const }),
      readCurrentPlan: vi.fn(async () => failure === "reordered"
        ? { ...plan, planRevision: plan.planRevision + 1, members: [...plan.members].reverse() }
        : plan),
      resolveMember: vi.fn(async () => ({ status: "ok" as const, value: null })),
      inspectCheckout: vi.fn(async (path) => {
        const chunkKey = path.split("/").at(-1);
        const candidate = coordinates.get(`refs/arc/delivery-candidates/${plan.planId}/${chunkKey}`);
        if (candidate === undefined) return null;
        if (failure === "dirty" && chunkKey === "first") {
          return { ...candidate, trackedDirty: true };
        }
        if (failure === "moved" && chunkKey === "first") {
          return { ...candidate, head: oid("f"), trackedDirty: false };
        }
        return { ...candidate, trackedDirty: false };
      }),
    },
    composeTarget: vi.fn(async ({ baseRef, base, head }) => createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "delivery-member",
      repositoryId: "github.com/owner/repo",
      baseRef,
      diffBaseSha: base,
      diffBaseTree: treeByHead.get(base)!,
      headSha: head,
      headTree: treeByHead.get(head)!,
    })),
  };
}

describe("composePreBindingDeliveryReviewTargets", () => {
  it("projects every member in plan order and uses the originating top for the terminal target", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const result = await composePreBindingDeliveryReviewTargets({
      workUnitId: plan.workUnitId,
      baseRef: "main",
    }, dependencies());

    expect(result).toMatchObject({
      status: "composed",
      planId: plan.planId,
      targets: [
        {
          target: { kind: "delivery-member", diffBaseSha: oid("a"), headSha: oid("b") },
          vehicle: {
            kind: "delivery-member",
            planId: plan.planId,
            deliverableId: plan.members[0]!.deliverableId,
            workUnitId: plan.workUnitId,
            head: oid("b"),
          },
        },
        {
          target: { kind: "delivery-member", diffBaseSha: oid("b"), headSha: oid("c") },
          vehicle: {
            kind: "delivery-member",
            deliverableId: plan.members[1]!.deliverableId,
            head: oid("c"),
          },
        },
        {
          target: { kind: "delivery-member", diffBaseSha: oid("c"), headSha: oid("d") },
          vehicle: {
            kind: "delivery-member",
            deliverableId: plan.members[2]!.deliverableId,
            head: oid("d"),
          },
        },
      ],
    });
    expect(result).not.toHaveProperty("target");
  });

  it.each([
    ["missing", "candidate-unavailable"],
    ["dirty", "checkout-dirty"],
    ["moved", "checkout-moved"],
    ["reordered", "plan-moved"],
    ["incoherent", "completeness-mismatched"],
  ] as const)("refuses %s authoring evidence without exposing an aggregate fallback", async (failure, reason) => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const result = await composePreBindingDeliveryReviewTargets({
      workUnitId: plan.workUnitId,
      baseRef: "main",
    }, dependencies(failure));

    expect(result).toMatchObject({ status: "refused", reason });
    expect(result).not.toHaveProperty("targets");
    expect(result).not.toHaveProperty("target");
  });

  it("distinguishes true plan absence from a bound delivery", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const absent = dependencies();
    absent.resolveDelivery = vi.fn(async () => ({ status: "absent" as const }));
    await expect(composePreBindingDeliveryReviewTargets({
      workUnitId: plan.workUnitId,
      baseRef: "main",
    }, absent)).resolves.toEqual({ status: "absent" });

    const bound = dependencies();
    bound.resolveDelivery = vi.fn(async () => ({ status: "bound" as const, plan }));
    const result = await composePreBindingDeliveryReviewTargets({
      workUnitId: plan.workUnitId,
      baseRef: "main",
    }, bound);
    expect(result).toEqual({ status: "refused", reason: "delivery-bound" });
    expect(result).not.toHaveProperty("targets");
    expect(result).not.toHaveProperty("target");
  });

  it("refuses a member target that does not retain the protected base ref", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const deps = dependencies();
    const composeTarget = deps.composeTarget.bind(deps);
    deps.composeTarget = (input) => composeTarget({ ...input, baseRef: "trunk" });

    await expect(composePreBindingDeliveryReviewTargets({
      workUnitId: plan.workUnitId,
      baseRef: "main",
    }, deps)).resolves.toMatchObject({
      status: "refused",
      reason: "target-mismatch",
      deliverableId: plan.members[0]!.deliverableId,
    });
  });
});
