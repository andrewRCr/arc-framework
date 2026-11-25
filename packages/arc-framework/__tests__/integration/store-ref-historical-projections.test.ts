/** Record projections cannot establish that corrupt historical namespaces held no records. */
import { describe, expect, it } from "vitest";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { fixtureGit } from "../helpers/store/ref-fixture-git.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { seed, success, testProvenance } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("historical namespace evidence in %s", layout => {
  it.each((["history", "changes", "empty-selection"] as const).flatMap(query =>
    (["missing", "malformed"] as const).map(damage => ({ query, damage })) ))(
    "refuses $damage metadata behind an empty $query projection and admits restored history", async ({ query, damage }) => {
      const f = await createRefFixture({}, layout), git = fixtureGit(f);
      const primary = await seed(f, f.reference("work-item/meta"));
      const reference = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: primary.reference.owner, key: "requested" });
      if (query !== "empty-selection") await seed(f, reference, "before\n");
      const from = await f.settle(), home = expandStoredPath(primary.reference), selected = expandStoredPath(reference);
      const parent = (await git("git", ["rev-parse", home.ref])).stdout.trim();
      const intact = await capturedEntries(f, home.ref);
      const brokenEntries = intact.filter(entry => entry.path !== selected.path && (damage !== "missing" || entry.path !== home.metadataPath))
        .map(entry => entry.path === home.metadataPath ? { path: entry.path, content: "not metadata" } : entry);
      const broken = await plantRef(f.root, home.ref, brokenEntries, { parents: [parent], gitDir: f.gitDir });
      const repaired = await plantRef(f.root, home.ref, intact, { parents: [broken.tip], gitDir: f.gitDir });
      const to = await f.settle();
      expect(success(await f.store.read({ reference: primary.reference })).content).toBe(primary.content);
      const result = query === "history" ? await f.store.history({ reference })
        : await f.store.changes({ from, to, references: [reference] });
      expect(result).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", namespace: home.ref,
        remedy: { text: expect.stringMatching(/historical|ancestor/iu) } } });
      // A forward repair leaves the damaged ancestor intact. Explicitly restore the known healthy history instead.
      await git("git", ["update-ref", home.ref, parent, repaired.tip]);
      const current = await f.store.read({ reference });
      success(await f.store.write({ action: "put", reference, expected: current.status === "ok" ? current.result.version : null,
        content: "repaired query\n", provenance: testProvenance }));
      const restored = query === "history" ? await f.store.history({ reference })
        : await f.store.changes({ from, to: await f.settle(), references: [reference] });
      expect(success(restored)).toEqual(expect.arrayContaining([expect.objectContaining({ reference, content: "repaired query\n" })]));
    });
});
