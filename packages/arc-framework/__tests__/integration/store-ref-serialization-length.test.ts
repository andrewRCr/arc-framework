import { describe, expect, it } from "vitest";
import { RecordReferenceSchema, type RecordReference, type StoreResult } from "../../src/lib/store/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { makeGitExec } from "../helpers/integration.js";
import { seed, success, testProvenance } from "../helpers/store/suite-tools.js";

const put = (reference: RecordReference) => ({ action: "put" as const, reference, expected: null, content: "text" });

describe("companion serialized name boundaries", () => {
  for (const operation of ["write", "batch"] as const) {
    it(`stores verbatim paths and retains both byte limits through ${operation}, including repaired retries`, async () => {
      const fixture = await createRefFixture();
      const root = await seed(fixture, fixture.reference("work-item/meta"));
      const companion = (key: string) => RecordReferenceSchema.parse({ owner: root.reference.owner, kind: "work-item/companion", key });
      const apply = (reference: RecordReference): Promise<StoreResult<unknown>> => operation === "write"
        ? fixture.store.write({ ...put(reference), provenance: testProvenance })
        : fixture.store.batch({ writes: [put(reference)], provenance: testProvenance });
      const admitted = [`scratch/${"a".repeat(2_030)}.md`, `scratch/${"é".repeat(2_048)}`, "a".repeat(2_040)];
      for (const key of admitted) {
        success(await apply(companion(key)));
        expect(success(await fixture.store.read({ reference: companion(key) })).content).toBe("text");
      }
      const listed = success(await fixture.store.list({ family: "work-item", kind: "work-item/companion" }));
      expect(listed.status).toBe("complete");
      if (listed.status !== "complete") throw new Error("Companion listing is incomplete");
      expect(listed.records.map((record) => record.reference.key).sort()).toEqual([...admitted].sort());
      expect(listed.diagnostics).toEqual([]);
      const git = makeGitExec(fixture.root);
      for (const [index, key] of [`scratch/${"é".repeat(2_048)}x`, "a".repeat(2_041)].entries()) {
        const before = (await git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
        expect(await apply(companion(key))).toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: "store.git-path" } });
        expect((await git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
        success(await apply(companion(`scratch/repaired-${index}.md`)));
      }
    });
  }
});
