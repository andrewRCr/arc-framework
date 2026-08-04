import { describe, expect, it, vi } from "vitest";

import {
  DeliveryAuthoringManager,
  resolveExistingDeliveryAuthoringMap,
} from "../../../src/lib/delivery/authoring-resolution.js";
import {
  createDeliveryAuthoringSnapshot,
} from "../../../src/lib/delivery/authoring-schema.js";
import type {
  DeliveryAuthoringPair,
  DeliveryAuthoringRecord,
  DeliveryAuthoringStore,
} from "../../../src/lib/delivery/authoring-store.js";
import type { DeliveryRenameTransitionSource } from "../../../src/lib/delivery/plan-resolution.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import type { ReachableReferenceTransition } from "../../../src/lib/work-unit/reference-reconcile.js";

function pair(originalWorkUnitId = "original-unit"): DeliveryAuthoringPair {
  const taskDigest = canonicalDigest({ goal: "Implement" });
  return {
    snapshot: createDeliveryAuthoringSnapshot({
      mapId: "authoring-map",
      originalWorkUnitId,
      planId: "4bce3788-2bd7-49ee-9f7f-af6c28f47bc1",
      expectedCurrentPlanDigest: null,
      design: {
        artifacts: [{ artifactId: "spec.md", revisionDigest: canonicalDigest({ spec: 1 }) }],
        elements: [],
      },
      tasks: {
        inventoryDigest: canonicalDigest([{ taskId: "1.1", semanticDigest: taskDigest }]),
        implementation: [{ taskId: "1.1", semanticDigest: taskDigest }],
        verificationTaskId: "2.1",
      },
      source: {
        entry: "from-tasks",
        inputs: { taskListPath: "tasks.md" },
        facts: {},
        identitySequence: ["task:1.1"],
      },
    }),
    markdown: "# Map\n",
  };
}

function store(records: readonly DeliveryAuthoringRecord[], refused = false): DeliveryAuthoringStore {
  const create = vi.fn<DeliveryAuthoringStore["create"]>(async (proposed) => (
    { status: "ok", value: proposed }
  ));
  const enumerate = vi.fn<DeliveryAuthoringStore["enumerate"]>(async () => refused
    ? { status: "refused", reason: "authoring-state-corrupt" }
    : { status: "ok", value: records });
  const abandon = vi.fn<DeliveryAuthoringStore["abandon"]>(async () => (
    { status: "ok", value: { removed: true } }
  ));
  return {
    create,
    enumerate,
    abandon,
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
  readonly records?: readonly DeliveryAuthoringRecord[];
  readonly transitions?: readonly ReachableReferenceTransition[];
  readonly refused?: boolean;
  readonly source?: DeliveryRenameTransitionSource;
  readonly authority?: { readonly status: "established"; readonly ref: string }
    | { readonly status: "unestablished" };
}) {
  return resolveExistingDeliveryAuthoringMap({
    store: store(input.records ?? [], input.refused),
    currentWorkUnitId: "current-unit",
    authority: input.authority ?? { status: "established", ref: "refs/heads/main" },
    transitionSource: input.source ?? transitionSource(input.transitions ?? []),
  });
}

describe("delivery authoring map resolution", () => {
  it("resolves one outstanding map through a chained rename", async () => {
    const existing = pair();
    await expect(resolve({
      records: [existing],
      transitions: [
        { subject: "original-unit", outcome: { kind: "rename", targetSlug: "middle-unit" } },
        { subject: "middle-unit", outcome: { kind: "rename", targetSlug: "current-unit" } },
      ],
    })).resolves.toEqual({ status: "match", record: existing });
  });

  it("preserves terminal retirement and cycles as safe absence", async () => {
    await expect(resolve({
      records: [pair()],
      transitions: [{ subject: "original-unit", outcome: { kind: "removed" } }],
    })).resolves.toEqual({ status: "no-match" });
    await expect(resolve({
      records: [pair()],
      transitions: [
        { subject: "original-unit", outcome: { kind: "rename", targetSlug: "middle-unit" } },
        { subject: "middle-unit", outcome: { kind: "rename", targetSlug: "original-unit" } },
      ],
    })).resolves.toEqual({ status: "no-match" });
  });

  it("preserves corrupt, ambiguous, unreachable, and unestablished authority", async () => {
    await expect(resolve({ refused: true })).resolves.toEqual({
      status: "indeterminate",
      reason: "namespace-corrupt",
    });
    await expect(resolve({
      records: [pair()],
      transitions: [
        { subject: "original-unit", outcome: { kind: "rename", targetSlug: "current-unit" } },
        { subject: "original-unit", outcome: { kind: "removed" } },
      ],
    })).resolves.toEqual({ status: "indeterminate", reason: "ambiguous-subject" });
    await expect(resolve({
      records: [pair()],
      source: { enumerate: async () => ({ status: "refused", reason: "substrate-unreachable" }) },
    })).resolves.toEqual({ status: "indeterminate", reason: "substrate-unreachable" });
    await expect(resolve({
      records: [pair()],
      authority: { status: "unestablished" },
    })).resolves.toEqual({ status: "indeterminate", reason: "reachability-unestablished" });
  });

  it("refuses a second map and abandons the outstanding map idempotently", async () => {
    const existing = pair("current-unit");
    const records = store([existing]);
    const manager = new DeliveryAuthoringManager(records, transitionSource([]));
    const authority = { status: "established", ref: "refs/heads/main" } as const;

    await expect(manager.create({
      pair: pair("current-unit"),
      currentWorkUnitId: "current-unit",
      authority,
    })).resolves.toEqual({ status: "refused", reason: "authoring-state-exists" });
    expect(records.create).not.toHaveBeenCalled();
    await expect(manager.abandon({
      currentWorkUnitId: "current-unit",
      authority,
    })).resolves.toEqual({ status: "ok", value: { removed: true } });
    expect(records.abandon).toHaveBeenCalledWith("authoring-map");

    const empty = store([]);
    await expect(new DeliveryAuthoringManager(empty, transitionSource([])).abandon({
      currentWorkUnitId: "current-unit",
      authority,
    })).resolves.toEqual({ status: "ok", value: { removed: false } });
  });
});
