/** A copied-store perturbation must reach every exact record a writer reads. */
import { expect, it } from "vitest";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { createClashDouble } from "../helpers/store/clash-double.js";
import { archiveWriter, fenceChanges } from "../helpers/store/fence-repository.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";

it("perturbs both same-slug cohort holders read while preparing an archive", async () => {
  const h = createLifecycleHarness();
  h.store.environment.identity = "test-user";
  await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" })),
    "# Cohort: group\n\n**Purpose:** Deliver all members.\n");
  const first = await h.seedMeta("first", { cohort: "group" });
  const second = await h.seedMeta("second", { cohort: "group" });
  await h.seedMeta("subject", { cohort: "group" });
  const store = createClashDouble(h.store, { slug: "shared", holders: [first.reference, second.reference] });
  const writer = archiveWriter({ kind: "archive", name: "subject", prUrl: "https://github.com/o/r/pull/1",
    clock: new Date("2026-10-14T12:00:00Z") }, "/repo");

  const changes = (await fenceChanges(store, writer, "test-user")).filter(change => change.name === "edit work-item/meta:shared");
  expect(changes).toHaveLength(2);
  for (const change of changes) await change.apply(store);
  for (const holder of [first, second]) {
    const current = lifecycleSuccess(await h.store.read({ reference: holder.reference }));
    expect(current.version).not.toBe(holder.version);
  }
});
