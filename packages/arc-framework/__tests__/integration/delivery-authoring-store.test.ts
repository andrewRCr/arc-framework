import { mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  RepositoryDeliveryAuthoringStore,
} from "../../src/lib/delivery/authoring-store.js";
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
  return {
    commonDir,
    store: new RepositoryDeliveryAuthoringStore(
      new RepositoryGitCommonStatePublisher(exec, root),
    ),
  };
}

function snapshot() {
  const taskDigest = canonicalDigest({ goal: "Implement" });
  return createDeliveryAuthoringSnapshot({
    mapId: "authoring-map",
    originalWorkUnitId: "delivery-plan-record",
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
      inputs: { taskListPath: ".arc/active/tasks-delivery-plan-record.md" },
      facts: { phaseGroups: [{ phaseId: "1", taskIds: ["1.1"] }] },
      identitySequence: ["phase:1", "task:1.1"],
    },
  });
}

describe("repository delivery authoring store", () => {
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
});
