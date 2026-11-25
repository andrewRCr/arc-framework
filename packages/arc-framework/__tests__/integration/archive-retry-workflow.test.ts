import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, it } from "vitest";

import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { runArchive } from "../../src/lib/work-unit/verbs/archive.js";
import { storeOnlyTransition } from "../helpers/store/fence-repository.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createMemoryRemote } from "../helpers/store/sync.js";

it("routes a Shipped final member back to archive when publication still needs a retry", async () => {
  const { store, seed, seedMeta } = createLifecycleHarness();
  const remote = createMemoryRemote();
  store.context.publication.remote = remote;
  const group = OwnerIdentitySchema.parse({ type: "cohort", name: "group" });
  await seed(recordReferences["cohort/document"](group), "# Cohort: group\n\n**Purpose:** Deliver the group.\n");
  const member = await seedMeta("example", { state: "Integrating", currentWorkflow: "integrate-work-unit", cohort: "group" });
  const archive = () => runArchive({
    executor: storeOnlyTransition(store, "/repo"), fs: { readdir: async () => [] }, clock: () => new Date(2026, 9, 14),
  }, { name: "example" });

  remote.condition = "down";
  expect(await archive()).toMatchObject({ status: "rejected", persisted: true, remedy: { argv: ["arc", "archive", "example"] } });
  const persisted = lifecycleSuccess(await store.read({ reference: member.reference }));
  expect(persisted).toMatchObject({ fields: { state: "Shipped", currentWorkflow: null }, placement: { kind: "completed" } });
  remote.condition = "available";
  expect(await archive()).toMatchObject({ status: "archived", cohortSwept: expect.stringContaining("cohort-group") });

  const workflow = await readFile(resolve(import.meta.dirname, "../../arc/system/workflows/arc/work-unit-lifecycle/archive-work-unit.md"), "utf8");
  const gate = workflow.split(/^### 1\).*$/mu)[1]?.split(/^### /mu)[0];
  expect(gate, "The archive entry gate must admit a Shipped work unit with a pending archive retry").toMatch(/\bshipped\b/iu);
  expect(gate).toMatch(/completed/iu);
  expect(workflow).toMatch(/(?:skip|already)[^.]*`## Closeout`/iu);

  const integration = await readFile(resolve(import.meta.dirname,
    "../../arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"), "utf8");
  const resume = integration.split("\n").find(line => line.includes("`shipped` in `completed`; `open`"));
  expect(resume).toMatch(/Steps? 8.*Step 10|archive.*Step 10/iu);
});
