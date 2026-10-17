import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { META_REGISTRATION } from "../../src/lib/store/kinds/meta/registration.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { makeGitExec } from "../helpers/integration.js";
import { RecordReferenceSchema, StateVersionSchema, sameReference } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { seed, success, testProvenance, update, mutationOf } from "../helpers/store/suite-tools.js";

describe("changes between ref manifests", () => {
  it("orders normal ref logs by ref name and their writes oldest first", async () => {
    const f = await createRefFixture();
    const document = await seed(f, f.reference("personal/document"), "first\n");
    const counter = await seed(f, f.reference("project-registry/counter"));
    const from = await f.settle();
    success(await f.store.write({ ...update(f, document, "second\n"), provenance: { ...testProvenance, lifecycleAction: "document-first" } }));
    success(await f.store.write({ ...update(f, counter), provenance: { ...testProvenance, lifecycleAction: "counter" } }));
    const current = success(await f.store.read({ reference: document.reference }));
    success(await f.store.write({ ...update(f, current, "third\n"), provenance: { ...testProvenance, lifecycleAction: "document-last" } }));
    const to = await f.settle();
    const changes = success(await f.store.changes({ from, to }));
    expect(changes.map((entry) => [entry.reference.kind, entry.content, "lifecycleAction" in entry.provenance ? entry.provenance.lifecycleAction : "legacy"]))
      .toEqual([[counter.reference.kind, f.content(counter.reference, "changed"), "counter"],
        [document.reference.kind, "second\n", "document-first"], [document.reference.kind, "third\n", "document-last"]]);
  });

  it.each(["work-item/meta", "cohort/document"] as const)("reads an older-only %s end from retained history once", async (kind) => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference(kind));
    const from = await f.settle();
    success(await f.store.write({ ...update(f, record, record.content), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    const closed = success(await f.store.read({ reference: record.reference }));
    const changes = success(await f.store.changes({ from, to: await f.settle() }));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ reference: record.reference, version: closed.version, content: closed.content });
  });

  it.each(["archive", "abandon"] as const)("finds a work item created and ended by %s inside the window", async (ending) => {
    const f = await createRefFixture();
    const from = await f.settle();
    const record = await seed(f, f.reference("work-item/meta"));
    if (ending === "archive") success(await f.store.write({ ...update(f, record, record.content), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    else {
      const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: record.reference.owner });
      success(await f.store.batch({ writes: [{ action: "put", reference: lineage, expected: null, content: f.content(lineage) },
        { action: "remove", reference: record.reference, expected: record.version }], provenance: testProvenance }));
    }
    const changes = success(await f.store.changes({ from, to: await f.settle() }));
    const own = changes.filter(({ reference }) => sameReference(reference, record.reference));
    expect(own).toEqual(success(await f.store.history({ reference: record.reference })).reverse());
    expect(own).toHaveLength(2);
    if (ending === "abandon") expect(changes.some(({ reference }) => reference.kind === "lineage/transition")).toBe(true);
  });

  it("finds completed writes through their folder and reports each changed record once", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("work-item/meta"));
    const note = await seed(f, RecordReferenceSchema.parse({ ...record.reference, kind: "work-item/companion", key: "extra" }), "before");
    success(await f.store.write({ ...update(f, record, record.content), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    const closed = success(await f.store.read({ reference: record.reference }));
    const from = await f.settle();
    const batch = success(await f.store.batch({ writes: [mutationOf(update(f, closed)), mutationOf(update(f, note, "after"))], provenance: testProvenance }));
    const changes = success(await f.store.changes({ from, to: await f.settle() }));
    expect(changes).toHaveLength(2);
    expect(changes.every(({ provenance }) => "batchId" in provenance && provenance.batchId === batch.batchId)).toBe(true);
    expect(changes).toEqual(expect.arrayContaining([expect.objectContaining({ reference: record.reference, content: f.content(record.reference, "changed") }),
      expect.objectContaining({ reference: note.reference, content: "after" })]));
  });

  it("starts a reopened item at its reopen and reports no copied companion removal", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("work-item/meta"));
    await seed(f, RecordReferenceSchema.parse({ ...record.reference, kind: "work-item/companion", key: "extra" }), "unchanged");
    success(await f.store.write({ ...update(f, record, record.content), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    const closed = success(await f.store.read({ reference: record.reference })), from = await f.settle();
    success(await f.store.write({ ...update(f, closed, closed.content), placement: { kind: "active" } }));
    const reopened = success(await f.store.read({ reference: record.reference }));
    const changes = success(await f.store.changes({ from, to: await f.settle() }));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ reference: reopened.reference, version: reopened.version, content: reopened.content });
  });

  it("keeps reopen, live writes, and another archive in their landed order", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("work-item/meta"));
    const quarter = ArchiveQuarterSchema.parse("2026-q4");
    success(await f.store.write({ ...update(f, record, record.content), placement: { kind: "completed", quarter } }));
    const closed = success(await f.store.read({ reference: record.reference })), from = await f.settle();
    success(await f.store.write({ ...update(f, closed, closed.content), placement: { kind: "active" } }));
    const reopened = success(await f.store.read({ reference: record.reference }));
    success(await f.store.write(update(f, reopened)));
    const live = success(await f.store.read({ reference: record.reference }));
    success(await f.store.write({ ...update(f, live, live.content), placement: { kind: "completed", quarter } }));
    const final = success(await f.store.read({ reference: record.reference }));
    expect(success(await f.store.changes({ from, to: await f.settle() })).map(({ version }) => version)).toEqual([reopened.version, live.version, final.version]);
  });

  it("reports a reopened origin's live writes and retirement without replaying its old archive", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("work-item/meta"));
    const note = await seed(f, RecordReferenceSchema.parse({ ...record.reference, kind: "work-item/companion", key: "extra" }), "before");
    success(await f.store.write({ ...update(f, record, record.content), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    const closed = success(await f.store.read({ reference: record.reference })), from = await f.settle();
    success(await f.store.write({ ...update(f, closed, closed.content), placement: { kind: "active" } }));
    const reopened = success(await f.store.read({ reference: record.reference }));
    success(await f.store.write(update(f, note, "live write")));
    const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: record.reference.owner });
    success(await f.store.batch({ writes: [{ action: "put", reference: lineage, expected: null, content: f.content(lineage) },
      { action: "remove", reference: reopened.reference, expected: reopened.version }], provenance: testProvenance }));
    const changes = success(await f.store.changes({ from, to: await f.settle() }));
    expect(changes.filter(({ reference }) => sameReference(reference, record.reference)).map(({ version }) => version)).toEqual([reopened.version, null]);
    expect(changes.filter(({ reference }) => sameReference(reference, note.reference)).map(({ content }) => content)).toEqual(["live write", null]);
    expect(changes.filter(({ reference }) => reference.kind === "lineage/transition")).toHaveLength(1);
  });

  it.each(["missing", "stale"] as const)("refuses %s retained history and admits the restored copy", async (mode) => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("work-item/meta"));
    const from = await f.settle(), uid = "uid" in record.reference.owner ? record.reference.owner.uid : undefined;
    const history = `refs/arc/history/work/${uid}`, git = makeGitExec(f.root);
    success(await f.store.write({ ...update(f, record, record.content), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    const old = (await git("git", ["rev-parse", history])).stdout;
    if (mode === "stale") {
      const closed = success(await f.store.read({ reference: record.reference }));
      success(await f.store.write(update(f, closed)));
    }
    const complete = (await git("git", ["rev-parse", history])).stdout, to = await f.settle();
    if (mode === "missing") await git("git", ["update-ref", "-d", history]);
    else await git("git", ["update-ref", history, old]);
    expect(await f.store.changes({ from, to })).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable", historyRefs: [history],
      remedy: { text: expect.stringMatching(/pull.*retry/iu) } } });
    await git("git", ["update-ref", history, complete]);
    expect(success(await f.store.changes({ from, to }))).toHaveLength(mode === "missing" ? 1 : 2);
  });

  it("refuses an unavailable compared manifest and admits available anchors", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("personal/document")), from = await f.settle();
    success(await f.store.write(update(f, record)));
    const to = await f.settle(), missing = StateVersionSchema.parse("f".repeat(40));
    for (const input of [{ from: missing, to }, { from, to: missing }]) {
      expect(await f.store.changes(input)).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable", stateVersion: missing, historyRefs: [] } });
    }
    expect(success(await f.store.changes({ from, to }))).toHaveLength(1);
  });

  it.each(["created", "removed"] as const)("resolves a named %s lineage record over the compared registry maps", async (mode) => {
    const f = await createRefFixture();
    let from = await f.settle();
    const record = await seed(f, f.reference("lineage/transition"));
    if (mode === "removed") {
      from = await f.settle();
      success(await f.store.write({ action: "remove", reference: record.reference, expected: record.version, provenance: testProvenance }));
    }
    const changes = success(await f.store.changes({ from, to: await f.settle(), references: [f.reference("lineage/transition")] }));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ reference: record.reference, version: mode === "created" ? record.version : null });
  });

  it("restricts a renamed primary across both roles while excluding another record's writes", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("work-item/record"));
    const note = await seed(f, RecordReferenceSchema.parse({ ...record.reference, kind: "work-item/companion", key: "extra" }), "before");
    const from = await f.settle();
    const renamed = RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, record, record.content), reference: renamed }));
    const current = success(await f.store.read({ reference: renamed }));
    success(await f.store.write(update(f, note, "after")));
    const promoted = RecordReferenceSchema.parse({ ...renamed, kind: "work-item/meta" });
    success(await f.store.write({ ...update(f, current, current.content), reference: promoted }));
    const changes = success(await f.store.changes({ from, to: await f.settle(), references: [record.reference] }));
    expect(changes.map(({ reference }) => [reference.kind, reference.owner.name])).toEqual([["work-item/record", "renamed"], ["work-item/meta", "renamed"]]);
  });

  it("scopes an ended item without requiring an unrelated owner's history", async () => {
    const f = await createRefFixture();
    const first = await seed(f, f.reference("work-item/meta"));
    const other = await seed(f, f.reference("work-item/meta", "other"));
    const from = await f.settle(), quarter = ArchiveQuarterSchema.parse("2026-q4");
    for (const record of [first, other]) success(await f.store.write({ ...update(f, record, record.content), placement: { kind: "completed", quarter } }));
    const uid = "uid" in other.reference.owner ? other.reference.owner.uid : undefined;
    await makeGitExec(f.root)("git", ["update-ref", "-d", `refs/arc/history/work/${uid}`]);
    const changes = success(await f.store.changes({ from, to: await f.settle(), references: [first.reference] }));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.reference).toEqual(first.reference);
  });

  it("carries a newer-only identity's complete history and ignores the older-only identity", async () => {
    const f = await createRefFixture();
    const own = await seed(f, f.reference("personal/document"), "own first");
    success(await f.store.write(update(f, own, "own second")));
    f.identity("other");
    const other = await seed(f, RecordReferenceSchema.parse({ ...own.reference, owner: { type: "person", name: "other" } }), "other first");
    success(await f.store.write(update(f, other, "other second")));
    f.identity("test-user");
    const git = makeGitExec(f.root);
    const older = await plantRef(f.root, "refs/test/older", [{ path: "user/test-user/personal", mode: "160000",
      oid: (await git("git", ["rev-parse", "refs/arc/user/test-user/personal"])).stdout }]);
    const newer = await plantRef(f.root, "refs/test/newer", [{ path: "user/other/personal", mode: "160000",
      oid: (await git("git", ["rev-parse", "refs/arc/user/other/personal"])).stdout }]);
    const changes = success(await f.store.changes({ from: StateVersionSchema.parse(older.tree), to: StateVersionSchema.parse(newer.tree) }));
    expect(changes.map(({ reference, content }) => [reference.owner.name, content])).toEqual([["other", "other first"], ["other", "other second"]]);
  });

  it("omits identity history without configuration and admits a configured retry", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("personal/document")), from = await f.settle();
    success(await f.store.write(update(f, record)));
    const to = await f.settle();
    f.identity(undefined);
    expect(success(await f.store.changes({ from, to }))).toEqual([]);
    expect(await f.store.changes({ from, to, references: [record.reference] })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    f.identity("test-user");
    expect(success(await f.store.changes({ from, to, references: [record.reference] }))).toHaveLength(1);
  });

  it("keeps project references bound to the compared identity", async () => {
    const f = await createRefFixture();
    await seed(f, f.reference("project-registry/identity"));
    const record = await seed(f, f.reference("project-registry/counter")), from = await f.settle();
    success(await f.store.write(update(f, record)));
    const changes = success(await f.store.changes({ from, to: await f.settle() }));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.reference).toEqual(record.reference);
  });

  it("ends the comparison at its saved archive batch despite later reopen and archive", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("work-item/meta")), from = await f.settle();
    success(await f.store.write(update(f, record)));
    const live = success(await f.store.read({ reference: record.reference })), quarter = ArchiveQuarterSchema.parse("2026-q4");
    success(await f.store.write({ ...update(f, live, live.content), placement: { kind: "completed", quarter } }));
    const closed = success(await f.store.read({ reference: record.reference })), to = await f.settle();
    success(await f.store.write({ ...update(f, closed, closed.content), placement: { kind: "active" } }));
    const reopened = success(await f.store.read({ reference: record.reference }));
    success(await f.store.write({ ...update(f, reopened, reopened.content), placement: { kind: "completed", quarter } }));
    expect(success(await f.store.changes({ from, to })).map(({ version }) => version)).toEqual([live.version, closed.version]);
  });

  it("groups a stale merge and its generated conflict commit under one batch", async () => {
    const f = await createRefFixture({ "personal/document": { merge: "line", parser: null } });
    const record = await seed(f, f.reference("personal/document"), "a\nmiddle\nz\n"), from = await f.settle();
    success(await f.store.write(update(f, record, "A\nmiddle\nz\n")));
    const written = success(await f.store.batch({ writes: [mutationOf(update(f, record, "B\nmiddle\nZ\n"))],
      provenance: { ...testProvenance, verb: "save" } }));
    const result = written.writes[0];
    expect(result?.conflicts).toHaveLength(1);
    const changes = success(await f.store.changes({ from, to: await f.settle() }));
    expect(changes).toHaveLength(3);
    const batch = changes.filter(({ provenance }) => "batchId" in provenance && provenance.batchId === written.batchId);
    expect(batch).toHaveLength(2);
    expect(batch.find(({ reference }) => sameReference(reference, record.reference)))
      .toMatchObject({ content: "A\nmiddle\nZ\n", version: result?.version, provenance: { verb: "save" } });
    expect(batch.find(({ reference }) => reference.kind === "personal/conflict-record")?.provenance).toMatchObject({ verb: "merge" });
  });

  it("limits a requested record's paths without enumerating an unrelated malformed path", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("project-registry/counter")), from = await f.settle();
    const git = makeGitExec(f.root), ref = "refs/arc/project/registry";
    const parent = (await git("git", ["rev-parse", ref])).stdout;
    const rows = (await git("git", ["ls-tree", "-r", "-z", ref])).stdout.split("\0").filter(Boolean).map((row) => {
      const parsed = /^100644 blob ([0-9a-f]+)\t(.*)$/su.exec(row);
      if (!parsed?.[1] || !parsed[2]) throw new Error("Expected producer record blobs");
      return { path: parsed[2], oid: parsed[1], mode: "100644" as const };
    });
    await plantRef(f.root, ref, [...rows, { path: "unrecognized", content: "unrelated bytes" }], { parents: [parent] });
    success(await f.store.write(update(f, record)));
    const changes = success(await f.store.changes({ from, to: await f.settle(), references: [record.reference] }));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ reference: record.reference, content: f.content(record.reference, "changed") });
  });

  it("does not enumerate a carried empty manifest as a companion record", async () => {
    const f = await createRefFixture({ "work-item/meta": { parser: META_REGISTRATION.parser, anchorFields: META_REGISTRATION.anchorFields } });
    const from = await f.settle(), reference = f.reference("work-item/meta");
    const created = success(await f.store.write({ action: "put", reference, expected: null, placement: { kind: "active" },
      content: makeMetaFixture(reference.owner.name, { stateAtHandoff: from }), provenance: testProvenance }));
    const changes = success(await f.store.changes({ from, to: await f.settle() }));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ reference: created.reference, version: created.version });
  });

  it("refuses an ambiguous lineage name and admits an explicit UID restriction", async () => {
    const f = await createRefFixture(), from = await f.settle();
    const first = await seed(f, f.reference("lineage/transition"));
    const second = await seed(f, RecordReferenceSchema.parse({ ...first.reference, owner: { ...first.reference.owner, uid: randomUUID() } }));
    const to = await f.settle();
    expect(await f.store.changes({ from, to, references: [f.reference("lineage/transition")] }))
      .toMatchObject({ status: "refused", refusal: { code: "ambiguous-match", candidates: expect.arrayContaining([first.reference, second.reference]) } });
    const changes = success(await f.store.changes({ from, to, references: [first.reference] }));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.reference).toEqual(first.reference);
  });

});
