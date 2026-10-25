/** Saved comparison damage names historical repair rather than an ineffective forward write. */
import { expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";

it.each(["path", "identity"] as const)("keeps a saved %s refusal after forward repair and admits a later readable interval", async damage => {
  const f = await createRefFixture();
  await seed(f, f.reference("project-registry/identity"));
  const counter = await seed(f, f.reference("project-registry/counter"));
  const ref = "refs/arc/project/registry", original = await capturedEntries(f, ref), from = await f.settle();
  const parent = (await f.ports.exec("git", ["rev-parse", ref])).stdout.trim();
  const entries = damage === "identity"
    ? original.map(entry => entry.path === "identity.json" ? { path: entry.path, content: '{"projectId":"invalid"}' } : entry)
    : [...original, { path: "foreign.json", content: "{}" }];
  const broken = await plantRef(f.root, ref, entries, { parents: [parent] });
  const to = await f.settle();
  const refusal = await f.store.changes({ from, to });
  expect(refusal).toMatchObject({ status: "refused", refusal: {
    code: damage === "identity" ? "record-malformed" : "namespace-corrupt",
    remedy: { text: expect.stringMatching(/historical|ancestor/iu) },
  } });
  await plantRef(f.root, ref, original, { parents: [broken.tip] });
  expect(await f.store.changes({ from, to })).toEqual(refusal);
  const repaired = await f.settle();
  const changed = success(await f.store.write(update(f, counter)));
  const changes = success(await f.store.changes({ from: repaired, to: await f.settle() }));
  expect(changes).toHaveLength(1);
  expect(changes[0]).toMatchObject({ reference: counter.reference, version: changed.version });
});
