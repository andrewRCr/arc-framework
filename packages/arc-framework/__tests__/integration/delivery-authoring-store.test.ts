import { mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  RepositoryDeliveryAuthoringStore,
} from "../../src/lib/delivery/authoring-store.js";
import { DeliveryAuthoringManager } from "../../src/lib/delivery/authoring-resolution.js";
import type { DeliveryRenameTransitionSource } from "../../src/lib/delivery/plan-resolution.js";
import {
  createDeliveryAuthoringSnapshot,
} from "../../src/lib/delivery/authoring-schema.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function authoringStore() {
  const root = await mkdtemp(join(tmpdir(), "arc-delivery-authoring-"));
  roots.push(root);
  const commonDir = join(root, "common.git");
  const exec: GitExec = async () => ({ stdout: `${commonDir}\n` });
  const createStore = () => new RepositoryDeliveryAuthoringStore(
    new RepositoryGitCommonStatePublisher(exec, root),
  );
  return {
    commonDir,
    store: createStore(),
    createStore,
  };
}

function snapshot(mapId = "authoring-map") {
  const taskDigest = canonicalDigest({ goal: "Implement" });
  const parents = [
    { taskId: "1.1", semanticDigest: taskDigest, role: { kind: "implementation" as const } },
    {
      taskId: "2.1",
      semanticDigest: null,
      role: { kind: "verification" as const, scope: "work-unit" },
    },
  ];
  return createDeliveryAuthoringSnapshot({
    mapId,
    originalWorkUnitId: "delivery-plan-record",
    planId: "4bce3788-2bd7-49ee-9f7f-af6c28f47bc1",
    expectedCurrentPlanDigest: null,
    design: {
      artifacts: [{ artifactId: "spec.md", revisionDigest: canonicalDigest({ spec: 1 }) }],
      elements: [],
    },
    tasks: {
      inventoryDigest: canonicalDigest(parents),
      parents,
    },
    source: {
      entry: "from-tasks",
      inputs: { taskListPath: ".arc/active/tasks-delivery-plan-record.md" },
      facts: { phaseGroups: [{ phaseId: "1", taskIds: ["1.1"] }] },
      identitySequence: ["phase:1", "task:1.1"],
    },
  });
}

describe("repository delivery authoring store", () => {
  it("admits only one concurrent map for the same resolved work unit", async () => {
    const records = await authoringStore();
    let transitionReads = 0;
    let releaseTransitionReads = () => {};
    const transitionBarrier = new Promise<void>((resolve) => { releaseTransitionReads = resolve; });
    const transitionSource: DeliveryRenameTransitionSource = {
      enumerate: async (ref) => {
        if (ref !== "refs/heads/main") {
          return { status: "refused", reason: "substrate-unreachable" };
        }
        transitionReads += 1;
        if (transitionReads === 2) releaseTransitionReads();
        await transitionBarrier;
        return { status: "ok", value: [] };
      },
    };
    const authority = { status: "established", ref: "refs/heads/main" } as const;
    const managers = [records.store, records.createStore()].map(
      (store) => new DeliveryAuthoringManager(store, transitionSource),
    );

    const results = await Promise.all(managers.map((manager, index) => {
      const proposed = snapshot(`authoring-map-${String(index + 1)}`);
      return manager.create({
        pair: { snapshot: proposed, markdown: `# Map ${String(index + 1)}\n` },
        currentWorkUnitId: "delivery-plan-record",
        authority,
      });
    }));

    expect(results.map((result) => result.status === "ok" ? "ok" : result.reason).sort())
      .toEqual(["authoring-state-exists", "ok"]);
    await expect(records.store.enumerate()).resolves.toMatchObject({
      status: "ok",
      value: [{ snapshot: { originalWorkUnitId: "delivery-plan-record" } }],
    });
  });

  it("does not overwrite an existing map id owned by another work unit", async () => {
    const records = await authoringStore();
    const original = snapshot();
    await records.store.create({ snapshot: original, markdown: "# Original\n" });
    const proposed = createDeliveryAuthoringSnapshot({
      ...original,
      originalWorkUnitId: "another-work-unit",
    });

    await expect(records.store.createResolved({
      pair: { snapshot: proposed, markdown: "# Replacement\n" },
      currentWorkUnitId: "another-work-unit",
      transitions: [],
    })).resolves.toEqual({ status: "refused", reason: "authoring-state-exists" });
    await expect(records.store.read(original.mapId)).resolves.toEqual({
      status: "ok",
      value: { snapshot: original, markdown: "# Original\n" },
    });
  });

  it("publishes and reads the canonical JSON and Markdown as one pair", async () => {
    const records = await authoringStore();
    const proposed = snapshot();
    const markdown = "# Delivery plan authoring map\n";

    await expect(records.store.create({ snapshot: proposed, markdown })).resolves.toEqual({
      status: "ok",
      value: { snapshot: proposed, markdown },
    });
    await expect(records.store.read("authoring-map")).resolves.toEqual({
      status: "ok",
      value: { snapshot: proposed, markdown },
    });
  });

  it("refuses a partial pair without a matching composed-plan receipt", async () => {
    const records = await authoringStore();
    const proposed = snapshot();
    await records.store.create({ snapshot: proposed, markdown: "# Map\n" });
    await unlink(join(records.commonDir, "arc", "delivery", "authoring", "authoring-map.md"));

    await expect(records.store.read("authoring-map")).resolves.toEqual({
      status: "refused",
      reason: "authoring-state-corrupt",
    });
  });

  it("enumerates snapshots and abandons complete or partial pairs idempotently", async () => {
    const records = await authoringStore();
    const proposed = snapshot();
    await records.store.create({ snapshot: proposed, markdown: "# Map\n" });

    await expect(records.store.enumerate()).resolves.toEqual({
      status: "ok",
      value: [{ snapshot: proposed, markdown: "# Map\n" }],
    });
    await unlink(join(records.commonDir, "arc", "delivery", "authoring", "authoring-map.md"));
    await expect(records.store.enumerate()).resolves.toEqual({
      status: "ok",
      value: [{ snapshot: proposed, markdown: null }],
    });
    await expect(records.store.abandon("authoring-map")).resolves.toEqual({
      status: "ok",
      value: { removed: true },
    });
    await expect(records.store.abandon("authoring-map")).resolves.toEqual({
      status: "ok",
      value: { removed: false },
    });
    await expect(records.store.enumerate()).resolves.toEqual({ status: "ok", value: [] });
  });

  it("records a candidate receipt and exposes Markdown-first cleanup as separate steps", async () => {
    const records = await authoringStore();
    const proposed = snapshot();
    const candidatePlanDigest = canonicalDigest({ plan: "candidate" });
    const candidateProjectionDigest = canonicalDigest({ projection: "candidate" });
    const candidateOutcome = { outcome: "accepted" as const, stateBinding: null };
    await records.store.create({ snapshot: proposed, markdown: "# Map\n" });

    const receipt = await records.store.recordCandidate(
      proposed.mapId,
      proposed,
      candidatePlanDigest,
      candidateProjectionDigest,
      candidateOutcome,
    );
    expect(receipt).toMatchObject({
      status: "ok",
      value: { candidatePlanDigest, candidateProjectionDigest, candidateOutcome },
    });
    await expect(records.store.deleteMarkdown(proposed.mapId)).resolves.toEqual({
      status: "ok",
      value: { removed: true },
    });
    await expect(records.store.enumerate()).resolves.toMatchObject({
      status: "ok",
      value: [{
        snapshot: { candidatePlanDigest, candidateProjectionDigest, candidateOutcome },
        markdown: null,
      }],
    });
    await expect(records.store.deleteSnapshot(proposed.mapId)).resolves.toEqual({
      status: "ok",
      value: { removed: true },
    });
  });
});
