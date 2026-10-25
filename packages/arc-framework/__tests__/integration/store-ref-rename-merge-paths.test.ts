/** Concurrent rename reconciliation preserves every selected record and refuses colliding homes. */
import { describe, expect, it } from "vitest";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("rename merge paths in %s", layout => {
  it.each([false, true])("keeps a renamed record whose new path was another record's old path, reverse %s", async reverse => {
    const h = await scenario(layout, "login-auth", "memo-login");
    const [published, merging] = reverse ? [h.b, h.a] : [h.a, h.b];
    success(await published.store.push());
    const result = success(await merging.store.pull());
    expect(result.pulls.flatMap(({ notices }) => notices)).toEqual([]);
    const listed = success(await merging.store.list({ family: "work-item", kind: "work-item/companion" }));
    expect(listed).toMatchObject({ status: "complete", missed: false, records: expect.arrayContaining([
      expect.objectContaining({ reference: expect.objectContaining({ key: "memo" }), content: "original\n" }),
      expect.objectContaining({ reference: expect.objectContaining({ key: "memo-login" }), content: "concurrent\n" }),
    ]) });
    if (listed.status !== "complete") throw new Error("Expected complete companions");
    expect(listed.records).toHaveLength(2);
    success(await merging.store.push());
    success(await published.store.pull());
    expect(success(await published.store.list({ family: "work-item", kind: "work-item/companion" }))).toEqual(listed);
  });

  it.each([false, true])("holds the ref when two selected records acquire one home, reverse %s", async reverse => {
    const h = await scenario(layout, "login", "memo-login.md");
    const [published, merging] = reverse ? [h.b, h.a] : [h.a, h.b];
    success(await published.store.push());
    const before = (await merging.git(["rev-parse", h.ref])).stdout;
    const result = success(await merging.store.pull());
    expect(result.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({
      kind: "namespace-corrupt", ref: h.ref, condition: expect.stringContaining("memo-login.md"),
    }));
    expect((await merging.git(["rev-parse", h.ref])).stdout).toBe(before);
  });
});

async function scenario(layout: "default" | "separate", renamed: string, addedKey: string) {
  const h = await refSyncFixture(layout);
  const reference = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "auth" } });
  const made = success(await h.a.store.write({ action: "put", reference, expected: null, content: makeMetaFixture("auth"),
    placement: { kind: "active" }, provenance: testProvenance }));
  const companion = (key: string) => RecordReferenceSchema.parse({ owner: made.reference.owner, kind: "work-item/companion", key });
  success(await h.a.store.write({ action: "put", reference: companion("memo"), expected: null,
    content: "original\n", provenance: testProvenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const current = success(await h.a.store.read({ reference: made.reference }));
  success(await h.a.store.write({ action: "put", reference: RecordReferenceSchema.parse({ ...current.reference,
    owner: { ...current.reference.owner, name: renamed } }), expected: current.version, content: makeMetaFixture(renamed),
    placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "rename" } }));
  success(await h.b.store.write({ action: "put", reference: companion(addedKey), expected: null,
    content: "concurrent\n", provenance: testProvenance }));
  if (made.reference.owner.type !== "work-item" || !made.reference.owner.uid) throw new Error("Expected an allocated owner");
  return { ...h, ref: `refs/arc/work/${made.reference.owner.uid}` };
}
