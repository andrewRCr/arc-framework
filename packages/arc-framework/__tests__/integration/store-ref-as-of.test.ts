import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RecordReferenceSchema, StateVersionSchema } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { makeGitExec } from "../helpers/integration.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";

describe("reads from saved ref manifests", () => {
  it("returns earlier record bytes and a listing token's complete saved family", async () => {
    const f = await createRefFixture();
    const first = await seed(f, f.reference("personal/document"), "first\n");
    const second = await seed(f, f.reference("personal/document", "two"), "second\n");
    const listing = success(await f.store.list({ family: "personal" }));
    if (listing.status !== "complete" || !listing.asOf) throw new Error("Expected a retained listing manifest");
    const asOf = await f.settle();
    expect(listing.asOf).toBe(asOf);
    success(await f.store.write(update(f, first, "later\n")));
    success(await f.store.write({ action: "remove", reference: second.reference, expected: second.version,
      provenance: { verb: "remove", lifecycleAction: "remove" } }));
    const third = await seed(f, f.reference("personal/document", "three"), "third\n");
    expect(success(await f.store.read({ reference: first.reference, asOf }))).toEqual(first);
    expect(success(await f.store.read({ reference: second.reference, asOf: listing.asOf }))).toEqual(second);
    expect(await f.store.read({ reference: third.reference, asOf })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await f.store.list({ family: "personal", asOf }))).toEqual(listing);
  });
  it("refuses an unavailable manifest and admits rebuilding from current state", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("personal/document"));
    const asOf = StateVersionSchema.parse("f".repeat(40));
    for (const result of [await f.store.read({ reference: record.reference, asOf }), await f.store.list({ family: "personal", asOf })]) {
      expect(result).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable", stateVersion: asOf,
        historyRefs: [], remedy: { text: expect.stringMatching(/rebuild.*current/iu) } } });
    }
    const rebuilt = await f.settle();
    expect(success(await f.store.read({ reference: record.reference, asOf: rebuilt }))).toEqual(record);
  });

  it.each([true, false])("confines another clone's manifest to this identity with own ref included %s", async (ownIncluded) => {
    const f = await createRefFixture();
    const own = await seed(f, f.reference("personal/document"), "earlier own bytes");
    f.identity("other");
    const other = await seed(f, RecordReferenceSchema.parse({ ...own.reference, owner: { type: "person", name: "other" } }), "other bytes");
    f.identity("test-user");
    const git = makeGitExec(f.root), foreignRef = "refs/arc/user/other/personal";
    const foreignTip = (await git("git", ["rev-parse", foreignRef])).stdout;
    const ownTip = (await git("git", ["rev-parse", "refs/arc/user/test-user/personal"])).stdout;
    const manifest = await plantRef(f.root, "refs/test/foreign-manifest", [
      { path: "user/other/personal", mode: "160000", oid: foreignTip },
      ...(ownIncluded ? [{ path: "user/test-user/personal", mode: "160000" as const, oid: ownTip }] : []),
    ]);
    const asOf = StateVersionSchema.parse(manifest.tree);
    await git("git", ["update-ref", "-d", foreignRef]);
    await removeLooseObject(f.root, foreignTip);
    success(await f.store.write(update(f, own, "current own bytes")));
    expect(await f.store.read({ reference: other.reference, asOf })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const listing = success(await f.store.list({ family: "personal", asOf }));
    if (ownIncluded) {
      expect(success(await f.store.read({ reference: own.reference, asOf }))).toEqual(own);
      expect(listing).toMatchObject({ status: "complete", records: [own], missed: false, asOf });
    } else {
      expect(await f.store.read({ reference: own.reference, asOf })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      expect(listing).toEqual({ status: "absent", asOf });
    }
  });

  it.each(["work-item/meta", "cohort/document"] as const)("names missing ended %s history and admits restored objects", async (kind) => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference(kind));
    const asOf = await f.settle();
    const uid = "uid" in record.reference.owner ? record.reference.owner.uid : undefined;
    const family = kind === "cohort/document" ? "cohort" : "work-item";
    const live = `refs/arc/${family === "cohort" ? "cohort" : "work"}/${uid}`, git = makeGitExec(f.root);
    const tip = (await git("git", ["rev-parse", live])).stdout;
    const bytes = (await f.ports.rawExec(["cat-file", "commit", tip])).stdout;
    success(await f.store.write({ ...update(f, record, record.content), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    await removeLooseObject(f.root, tip);
    const history = live.replace("refs/arc/", "refs/arc/history/");
    for (const result of [await f.store.read({ reference: record.reference, asOf }), await f.store.list({ family, asOf })]) {
      expect(result).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable", stateVersion: asOf,
        historyRefs: [history], remedy: { text: expect.stringMatching(/pull.*retry/iu) } } });
    }
    await f.ports.rawExec(["hash-object", "-t", "commit", "-w", "--stdin"], { input: bytes });
    expect(success(await f.store.read({ reference: record.reference, asOf }))).toEqual(record);
  });

  it("reads an older live tip after archive and reopen and ignores later names and roles", async () => {
    const f = await createRefFixture();
    const original = await seed(f, f.reference("work-item/record"));
    const asOf = await f.settle();
    success(await f.store.write({ ...update(f, original, original.content), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    const closed = success(await f.store.read({ reference: original.reference }));
    const endedAsOf = await f.settle();
    success(await f.store.write({ ...update(f, closed, closed.content), placement: { kind: "active" } }));
    const reopened = success(await f.store.read({ reference: original.reference }));
    const reference = RecordReferenceSchema.parse({ ...reopened.reference, kind: "work-item/meta", owner: { ...reopened.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, reopened, reopened.content), reference }));
    for (const handle of [original.reference, reference]) {
      expect(success(await f.store.read({ reference: handle, asOf }))).toEqual(original);
      expect(success(await f.store.read({ reference: handle, asOf: endedAsOf }))).toEqual(closed);
    }
    expect(success(await f.store.list({ family: "work-item", asOf }))).toMatchObject({ status: "complete", records: [original], missed: false });
  });

  it("needs no unrelated quarter tip when the manifest directly names the live owner", async () => {
    const f = await createRefFixture();
    const other = await seed(f, f.reference("work-item/meta", "other"));
    const quarter = ArchiveQuarterSchema.parse("2026-q4");
    success(await f.store.write({ ...update(f, other, other.content), placement: { kind: "completed", quarter } }));
    const record = await seed(f, f.reference("work-item/meta"));
    const asOf = await f.settle();
    const tip = (await makeGitExec(f.root)("git", ["rev-parse", `refs/arc/archive/${quarter}`])).stdout;
    await removeLooseObject(f.root, tip);
    expect(success(await f.store.read({ reference: record.reference, asOf }))).toEqual(record);
    expect(success(await f.store.list({ family: "work-item", owner: record.reference.owner, asOf })))
      .toMatchObject({ status: "complete", records: [record], missed: false, asOf });
  });

  it("binds saved project inbox reads and ownerless listings to the saved project identity", async () => {
    const f = await createRefFixture();
    const identity = await seed(f, f.reference("project-registry/identity"));
    const inbox = await seed(f, f.reference("project-inbox/inbox"));
    const asOf = await f.settle();
    success(await f.store.write({ action: "remove", reference: identity.reference, expected: identity.version,
      provenance: { verb: "remove", lifecycleAction: "remove" } }));
    const replacement = await seed(f, f.reference("project-registry/identity"), JSON.stringify({ projectId: randomUUID() }));
    expect(replacement.reference.owner).not.toEqual(identity.reference.owner);
    expect(success(await f.store.read({ reference: inbox.reference, asOf }))).toEqual(inbox);
    expect(success(await f.store.list({ family: "project-inbox", asOf })))
      .toMatchObject({ status: "complete", records: [inbox], missed: false, asOf });
  });

});
