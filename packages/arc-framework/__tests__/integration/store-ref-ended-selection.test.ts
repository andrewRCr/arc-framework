/** Live presence and prepared completed state select the same owner across every read surface. */
import { describe, expect, it } from "vitest";
import { RecordReferenceSchema, type LookupInput, type WriteCheck } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { seed, success, update, mutationOf, testProvenance } from "../helpers/store/suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), nextQuarter = ArchiveQuarterSchema.parse("2027-q1");

describe.each(["default", "separate"] as const)("ended-owner selection in %s", layout => {
  it.each(["readable", "empty", "unreadable"] as const)("supersedes a pending end's folder while its %s live ref stands", async state => {
    const h = await refSyncFixture(layout), name = "pending-end";
    const sha = (await h.a.exec("git", ["rev-parse", "HEAD"])).stdout.trim();
    const repository = "example/code", branch = "refs/heads/feat/pending-end";
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture(name),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
      placement: { kind: "active" }, provenance: testProvenance, links: {
        branches: [{ repository, ref: branch, linkedAs: "created", excluded: [] }],
        taskCaptures: { "1.1": [{ repository, sha }] },
      } }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const before = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version,
      content: before.content, placement: { kind: "completed", quarter }, provenance: testProvenance }));
    success(await h.a.store.push());
    const owner = made.reference.owner;
    if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected an allocated owner");
    const live = `refs/arc/work/${owner.uid}`, history = `refs/arc/history/work/${owner.uid}`;
    await h.remote("git", ["update-ref", "-d", history]);
    success(await h.b.store.pull());
    if (state !== "readable") {
      const tip = (await h.b.git(["rev-parse", live])).stdout;
      await plantRef(h.b.root, live, state === "empty" ? [] : [
        { path: `metadata-${owner.uid}.json`, content: "broken metadata" },
        { path: `meta-${name}.md`, content: makeMetaFixture(name) },
      ], { parents: [tip], gitDir: h.b.gitDir });
    }
    const queries: LookupInput[] = [{ kind: "claim", claim: { kind: "work-unit", slug: owner.name, uid: owner.uid } },
      { kind: "ref", repository, ref: branch }, { kind: "commit", repository, sha }];
    for (const query of queries) {
      const result = await h.b.store.lookup(query);
      if (state === "readable") expect(success(result).reference).toEqual(made.reference);
      else expect(result).toMatchObject({ status: "refused", refusal: { code: state === "empty" ? "not-found" : "namespace-corrupt" } });
    }
  });

  it("gives checked reads and listings the moved quarter and the number the batch commits", async () => {
    let armed = false, selectedName = "";
    const check: WriteCheck = async ({ after, reference }) => {
      if (!armed || reference.owner.name !== selectedName) return [];
      const placement = { kind: "completed", quarter: nextQuarter, sequence: "03" };
      expect(success(await after.read({ reference })).placement).toEqual(placement);
      const listed = success(await after.list({ family: "work-item", owner: reference.owner, kind: "work-item/meta" }));
      expect(listed).toMatchObject({ status: "complete", records: [expect.objectContaining({ placement })] });
      const found = success(await after.lookup({ kind: "slug", slug: reference.owner.name }));
      expect(success(await after.read({ reference: found.reference })).placement).toEqual(placement);
      return [];
    };
    const f = await createRefFixture({ "work-item/meta": { check } }, layout);
    const first = await seed(f, f.reference("work-item/meta"));
    success(await f.store.write({ ...update(f, first), placement: { kind: "completed", quarter } }));
    const occupant = await seed(f, f.reference("work-item/meta", "occupant"));
    success(await f.store.write({ ...update(f, occupant), placement: { kind: "completed", quarter: nextQuarter } }));
    const another = await seed(f, f.reference("work-item/meta", "another"));
    const ended = success(await f.store.read({ reference: first.reference }));
    selectedName = ended.reference.owner.name; armed = true;
    success(await f.store.batch({ writes: [
      mutationOf({ ...update(f, ended), placement: { kind: "completed", quarter: nextQuarter } }),
      mutationOf({ ...update(f, another), placement: { kind: "completed", quarter: nextQuarter } }),
    ], provenance: testProvenance }));
    expect(success(await f.store.read({ reference: ended.reference })).placement)
      .toEqual({ kind: "completed", quarter: nextQuarter, sequence: "03" });
  });
});
