/** Saved comparison damage names historical repair rather than an ineffective forward write. */
import { expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
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

it.each(["live", "completed"] as const)("keeps name-restricted saved %s metadata remedies historical after a current lookup and forward repair", async placement => {
  const f = await createRefFixture(), name = f.reference("work-item/meta");
  let record = await seed(f, name);
  if (placement === "completed") success(await f.store.write({ ...update(f, record),
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
  record = success(await f.store.read({ reference: record.reference }));
  const home = expandStoredPath(record.reference, { registry: f.ports.registry, placement: record.placement });
  const original = await capturedEntries(f, home.ref), from = await f.settle();
  const parent = (await f.ports.exec("git", ["rev-parse", home.ref])).stdout.trim();
  const broken = await plantRef(f.root, home.ref, original.map(entry => entry.path === home.metadataPath
    ? { path: entry.path, content: "broken metadata" } : entry), { parents: [parent] });
  const to = await f.settle();
  const current = await f.store.read({ reference: name });
  expect(current).toMatchObject({ status: "refused", refusal: { remedy: { text: expect.stringContaining("forward") } } });
  const query = { from, to, references: [name] };
  const refused = await f.store.changes(query);
  expect(refused).toMatchObject({ status: "refused", refusal: { remedy: { text: expect.stringMatching(/historical|ancestor/iu) } } });
  await plantRef(f.root, home.ref, original, { parents: [broken.tip] });
  expect(await f.store.changes(query)).toEqual(refused);
  const repaired = await f.settle();
  const healthy = success(await f.store.read({ reference: name }));
  const changed = success(await f.store.write(update(f, healthy, f.content(healthy.reference, placement === "completed" ? "valid" : "changed"))));
  expect(success(await f.store.changes({ from: repaired, to: await f.settle(), references: [name] })))
    .toEqual([expect.objectContaining({ reference: changed.reference, version: changed.version })]);
});
