import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";

const own = ArchiveQuarterSchema.parse("2027-q1"), published = ArchiveQuarterSchema.parse("2026-q4");

describe.each(["default", "separate"] as const)("independent competing ends in the %s layout", (layout) => {
  it("withdraws every unpublished end in one pull while keeping the published ends", async () => {
    const h = await refSyncFixture(layout), references = [];
    for (const name of ["first-item", "second-item"]) {
      references.push(success(await h.a.store.write({ action: "put", expected: null,
        reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name }, kind: "work-item/meta" }),
        content: makeMetaFixture(name), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } })).reference);
    }
    success(await h.a.store.push()); success(await h.b.store.pull());
    for (const reference of references) for (const [side, quarter] of [[h.a, own], [h.b, published]] as const) {
      const current = success(await side.store.read({ reference }));
      success(await side.store.write({ action: "put", reference, expected: current.version, content: current.content,
        placement: { kind: "completed", quarter }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    }
    success(await h.b.store.push());
    const notices = success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices);
    for (const reference of references) {
      expect(notices).toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: reference.owner }));
      expect(success(await h.a.store.read({ reference })).placement).toMatchObject({ kind: "completed", quarter: published });
    }
    expect((await h.a.git(["ls-tree", "--name-only", `refs/arc/archive/${own}`])).stdout).toBe("");
    expect(success(await h.a.store.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
    expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
  });
});
