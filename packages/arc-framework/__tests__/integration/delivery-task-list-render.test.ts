import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  RepositoryDeliveryTaskListRenderer,
} from "../../src/lib/delivery/task-list-render.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { DeliveryPlanV1Schema } from "../../src/lib/delivery/schema.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

function plan() {
  const deliverableId = canonicalDigest({ deliverable: 1 });
  return DeliveryPlanV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "delivery-plan/v1",
    workUnitId: "delivery-plan-record",
    planId: "4bce3788-2bd7-49ee-9f7f-af6c28f47bc1",
    planRevision: 1,
    previousPlanDigest: null,
    design: {
      artifacts: [{ artifactId: "spec.md", revisionDigest: canonicalDigest({ spec: 1 }) }],
      elements: [],
    },
    tasks: {
      inventoryDigest: canonicalDigest({ tasks: 1 }),
      implementation: [{ taskId: "1.1", semanticDigest: canonicalDigest({ task: 1 }) }],
      verificationTaskId: "2.1",
    },
    entry: "from-tasks",
    projection: { kind: "wu-integration-target" },
    members: [{
      status: "live",
      chunkKey: "only",
      title: "Only member",
      contract: "Publish the contract",
      taskIds: ["1.1"],
      designElementIds: [],
      mainlineLandability: "integration-only",
      deliverableId,
      assuranceSubjectId: canonicalDigest({ assurance: 1 }),
      semanticFingerprint: canonicalDigest({ fingerprint: 1 }),
    }],
    seams: [],
    planDigest: canonicalDigest({ plan: 1 }),
  });
}

describe("repository delivery task-list renderer", () => {
  it("atomically writes a valid replacement and leaves a refused locus unchanged", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-delivery-task-render-"));
    roots.push(root);
    const taskPath = join(root, "tasks.md");
    const initial = "# Tasks\n\n## Delivery Plan\n\n_TBD._\n\n## **Phase 1:** Build\n";
    await writeFile(taskPath, initial, "utf8");
    const renderer = new RepositoryDeliveryTaskListRenderer(root, "tasks.md");

    await expect(renderer.render(plan())).resolves.toMatchObject({ status: "rendered" });
    const rendered = await readFile(taskPath, "utf8");
    expect(rendered).toContain("<!-- arc:delivery-plan:start -->");

    await writeFile(taskPath, "# Tasks\n", "utf8");
    await expect(renderer.render(plan())).resolves.toEqual({
      status: "refused",
      reason: "replacement-locus-missing",
    });
    await expect(readFile(taskPath, "utf8")).resolves.toBe("# Tasks\n");
  });

  it("refuses a task-list path escaping the repository", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-delivery-task-render-"));
    roots.push(root);
    await expect(new RepositoryDeliveryTaskListRenderer(root, "../outside.md").render(plan()))
      .resolves.toEqual({ status: "refused", reason: "task-list-path-invalid" });
  });
});
