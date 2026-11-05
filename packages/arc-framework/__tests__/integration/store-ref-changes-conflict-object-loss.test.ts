/** Saved change enumeration distinguishes lost conflict payloads from undecodable paths. */
import { describe, expect, it } from "vitest";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("lineage conflict change object loss in %s", layout => {
  it("restores a missing conflict blob before enumerating the same change window", async () => {
    const f = await createRefFixture({}, layout), from = await f.settle();
    const reference = RecordReferenceSchema.parse({ kind: "lineage/conflict-record",
      owner: { type: "work-item", name: "lost-origin", uid: "abcdef12-1234-4234-8234-123456789abc" }, key: "lineage-clash" });
    const content = f.content(reference);
    success(await f.store.write({ action: "put", reference, expected: null, content, provenance: testProvenance }));
    const input = { from, to: await f.settle() }, home = expandStoredPath(reference);
    const args = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const oid = (await f.ports.exec("git", [...args, "rev-parse", `${home.ref}:${home.path}`])).stdout.trim();
    const bytes = (await f.ports.rawExec([...args, "cat-file", "blob", oid])).stdout;
    await removeLooseObject(f.root, oid, f.gitDir);
    expect(await f.store.changes(input)).toMatchObject({ status: "refused", refusal: {
      code: "state-unresolvable", class: "recoverable", historyRefs: [],
      remedy: { text: expect.stringMatching(/restore|fetch/iu) },
    } });
    const restored = await f.ports.rawExec([...args, "hash-object", "-w", "--stdin"], { input: bytes });
    expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
    expect(success(await f.store.changes(input))).toEqual(expect.arrayContaining([expect.objectContaining({ reference, content })]));
    expect(success(await f.store.read({ reference })).content).toBe(content);
  });
});
