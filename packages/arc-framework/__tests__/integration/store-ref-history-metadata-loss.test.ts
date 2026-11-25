/** Historical metadata loss stays distinct from a revision whose complete namespace holds no records. */
import { describe, expect, it } from "vitest";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { fixtureGit } from "../helpers/store/ref-fixture-git.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { seed, success } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("historical metadata object loss in %s", layout => {
  it.each((["history", "changes"] as const).flatMap(query =>
    (["record-bearing", "record-free"] as const).map(shape => ({ query, shape }))))(
    "classifies a $shape revision in $query and recovers after exact object restoration", async ({ query, shape }) => {
      const f = await createRefFixture({}, layout), git = fixtureGit(f);
      const primary = await seed(f, f.reference("work-item/meta"));
      const reference = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: primary.reference.owner, key: "requested" });
      await seed(f, reference, "Retained companion.\n");
      const from = await f.settle(), home = expandStoredPath(primary.reference), selected = expandStoredPath(reference);
      const intact = await capturedEntries(f, home.ref), parent = (await git("git", ["rev-parse", home.ref])).stdout.trim();
      const scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
      const bytes = (await f.ports.rawExec([...scope, "cat-file", "blob", `${parent}:${home.metadataPath}`])).stdout;
      // Distinct bytes preserve the same metadata without losing the healthy descendant's shared object.
      const historicalBytes = Buffer.concat([bytes, Buffer.from("\n")]);
      const entries = shape === "record-bearing" ? intact.filter(entry => entry.path !== home.metadataPath && entry.path !== selected.path) : [];
      const ancestor = await plantRef(f.root, home.ref, [...entries, { path: home.metadataPath, content: historicalBytes }],
        { parents: [parent], gitDir: f.gitDir });
      await plantRef(f.root, home.ref, intact, { parents: [ancestor.tip], gitDir: f.gitDir });
      const to = await f.settle(), oid = ancestor.blobs.get(home.metadataPath);
      if (!oid) throw new Error("Expected a distinct historical metadata object");
      await removeLooseObject(f.root, oid, f.gitDir);
      expect(success(await f.store.read({ reference })).content).toBe("Retained companion.\n");
      const read = () => query === "history" ? f.store.history({ reference }) : f.store.changes({ from, to, references: [reference] });
      const result = await read();
      if (shape === "record-bearing") expect(result).toMatchObject({ status: "refused", refusal: {
        code: "state-unresolvable", class: "recoverable", historyRefs: [], remedy: { text: expect.stringMatching(/restore|fetch/iu) },
      } });
      else expect(success(result)).toEqual(expect.arrayContaining([expect.objectContaining({ content: "Retained companion.\n" })]));
      const restored = await f.ports.rawExec([...scope, "hash-object", "-w", "--stdin"], { input: historicalBytes });
      expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
      expect(success(await read())).toEqual(expect.arrayContaining([expect.objectContaining({ content: "Retained companion.\n" })]));
      if (shape === "record-free") expect(await read()).toEqual(result);
    });
});
