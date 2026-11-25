/** Registered activation preserves current-name and former-name dependency ties. */
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { repairCli, repairCliFixture } from "../helpers/repair-cli.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createClashDouble } from "../helpers/store/clash-double.js";
import { recordKey } from "../helpers/store/model.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";

it.each([false, true])("activates while the dependency stays held at its written name, former=%s", async former => {
  const f = await repairCliFixture(), h = createLifecycleHarness();
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project", uid: randomUUID() })), "{}");
  const first = await h.seedMeta("target"), second = await h.seedMeta("other");
  const edge = former ? "former" : "target";
  if (former) {
    const raw = h.store.state.records.get(recordKey(first.reference));
    if (raw === undefined) throw new Error("Expected the first holder");
    raw.formerSlugs.push(edge);
  }
  const dependent = await h.seedMeta("dependent", { state: "Planning", currentWorkflow: "draft-design", dependsOn: [edge] });
  if (former) {
    const raw = h.store.state.records.get(recordKey(second.reference));
    if (raw === undefined) throw new Error("Expected the second holder");
    raw.formerSlugs.push(edge);
  }
  const store = former ? h.store : createClashDouble(h.store, { slug: edge, holders: [first.reference, second.reference] });
  const before = await Promise.all([first, second].map(record => h.store.read({ reference: record.reference }).then(lifecycleSuccess)));
  const result = await repairCli(f, ["activate", "dependent", "--type", "feat", "--task", "Implement", "--action", "Continue"], { store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(lifecycleSuccess(await h.store.read({ reference: dependent.reference })).fields).toMatchObject({ state: "Active", dependsOn: [edge] });
  expect(await Promise.all([first, second].map(record => h.store.read({ reference: record.reference }).then(lifecycleSuccess)))).toEqual(before);
}, 60_000);
