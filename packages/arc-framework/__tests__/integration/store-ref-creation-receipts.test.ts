/** Native operation receipts are complete on every published physical state commit. */
import { describe, expect, it } from "vitest";
import { BatchCreationReceiptSchema, CreatedOwnerSchema, RecordReferenceSchema, compareCreatedOwners } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { createRefFixture, type RefConformanceFixture } from "../helpers/store/ref-fixture.js";
import { mutationOf, seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";

async function git(f: RefConformanceFixture, args: string[]): Promise<string> {
  return (await f.ports.exec("git", [...f.gitDir ? [`--git-dir=${f.gitDir}`] : [], ...args], { cwd: f.root })).stdout;
}

async function stateTips(f: RefConformanceFixture): Promise<Map<string, string>> {
  const output = await git(f, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/work/", "refs/arc/cohort/",
    "refs/arc/archive/", "refs/arc/history/", "refs/arc/project/"]);
  return new Map(output.trim().split("\n").filter(Boolean).map(line => {
    const [ref = "", oid = ""] = line.split(" ");
    return [ref, oid] as const;
  }));
}

describe.each(["default", "separate"] as const)("native accepted receipts in %s layout", layout => {
  it("puts the complete accepted operation inventory on every touched ref", async () => {
    const f = await createRefFixture({}, layout);
    const refs = [f.reference("work-item/meta"), f.reference("cohort/document"), f.reference("personal/document")];
    const batch = success(await f.store.batch({ writes: refs.map(reference => ({ action: "put" as const, reference,
      expected: null, content: f.content(reference),
      ...(reference.kind === "work-item/meta" ? { placement: { kind: "backlog" as const, commitment: "planned" as const } } : {}) })),
    provenance: testProvenance }));
    const createdOwners = batch.writes.filter(({ reference }) => reference.owner.type !== "person")
      .map(({ reference }) => CreatedOwnerSchema.parse(reference)).sort(compareCreatedOwners);
    const receipt = BatchCreationReceiptSchema.parse({ schemaVersion: 1, batchId: batch.batchId, createdOwners });
    const published = (await git(f, ["for-each-ref", "--format=%(refname)", "refs/arc/work/", "refs/arc/cohort/", "refs/arc/user/"]))
      .trim().split("\n");
    expect(published).toHaveLength(3);
    for (const ref of published) {
      const message = await git(f, ["show", "-s", "--format=%B", ref]);
      expect(message.split("\n").filter(line => line.startsWith("Arc-Creation-Receipt:")))
        .toEqual([`Arc-Creation-Receipt: ${canonicalize(receipt)}`]);
      expect(message).toContain(`Arc-Batch: ${batch.batchId}\n`);
    }
  });

  it("advertises complete-none on a single write and both physical commits of a clashing batch", async () => {
    const f = await createRefFixture({}, layout);
    const base = await seed(f, f.reference("personal/document"), "base\n");
    const ref = "refs/arc/user/test-user/personal";
    const history = success(await f.store.history({ reference: base.reference }));
    const provenance = history[0]!.provenance;
    if (!("verb" in provenance) || provenance.batchId === undefined) throw new Error("Expected a native operation batch ID");
    expect((await git(f, ["show", "-s", "--format=%B", ref])).split("\n").filter(line => line.startsWith("Arc-Creation-Receipt:")))
      .toEqual([`Arc-Creation-Receipt: ${canonicalize({ schemaVersion: 1, batchId: provenance.batchId, createdOwners: [] })}`]);
    success(await f.store.write(update(f, base, "current\n")));
    const clash = success(await f.store.batch({ writes: [mutationOf(update(f, base, "incoming\n"))], provenance: testProvenance }));
    expect(clash.writes[0]?.conflicts).toHaveLength(1);
    const messages = (await git(f, ["log", "-2", "--format=%B%x00", ref])).split("\0").filter(value => value.trim());
    expect(messages).toHaveLength(2);
    for (const message of messages) {
      expect(message).toContain(`Arc-Batch: ${clash.batchId}\n`);
      expect(message.split("\n").filter(line => line.startsWith("Arc-Creation-Receipt:")))
        .toEqual([`Arc-Creation-Receipt: ${canonicalize({ schemaVersion: 1, batchId: clash.batchId, createdOwners: [] })}`]);
    }
  });

  it.each(["archive", "reopen", "refresh"] as const)("preserves whole-batch births on every %s publication", async mode => {
    const f = await createRefFixture({}, layout);
    let work = await seed(f, f.reference("work-item/meta"));
    if (mode !== "archive") {
      success(await f.store.write({ ...update(f, work),
        placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
      work = success(await f.store.read({ reference: work.reference }));
    }
    const before = await stateTips(f);
    const cohort = f.reference("cohort/document", "two");
    const change = { ...mutationOf(update(f, work, f.content(work.reference, "changed-again"))), ...(mode === "archive" ? {
      placement: { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") },
    } : mode === "reopen" ? { placement: { kind: "backlog" as const, commitment: "planned" as const } } : {}) };
    const batch = success(await f.store.batch({ writes: [change,
      { action: "put", reference: cohort, expected: null, content: f.content(cohort) }], provenance: testProvenance }));
    const created = CreatedOwnerSchema.parse(batch.writes[1]!.reference);
    const expected = `Arc-Creation-Receipt: ${canonicalize({ schemaVersion: 1, batchId: batch.batchId, createdOwners: [created] })}`;
    const changed = [...await stateTips(f)].filter(([ref, oid]) => before.get(ref) !== oid);
    expect(changed).toHaveLength(mode === "archive" ? 4 : 3);
    if (mode === "archive") expect(changed.map(([ref]) => ref)).toContain("refs/arc/project/registry");
    for (const [ref] of changed) expect((await git(f, ["show", "-s", "--format=%B", ref])).split("\n")
      .filter(line => line.startsWith("Arc-Creation-Receipt:"))).toEqual([expected]);
  });


  it("retains the complete inventory on empty retirement and lineage registry commits", async () => {
    const f = await createRefFixture({}, layout);
    const work = await seed(f, f.reference("work-item/meta"));
    const before = await stateTips(f);
    const lineage = RecordReferenceSchema.parse({ owner: work.reference.owner, kind: "lineage/transition" });
    const cohort = f.reference("cohort/document", "two");
    const batch = success(await f.store.batch({ writes: [
      { action: "put", reference: lineage, expected: null, content: f.content(lineage) },
      { action: "remove", reference: work.reference, expected: work.version },
      { action: "put", reference: cohort, expected: null, content: f.content(cohort) },
    ], provenance: { verb: "decompose", lifecycleAction: "terminal" } }));
    const created = CreatedOwnerSchema.parse(batch.writes[2]!.reference);
    const expected = `Arc-Creation-Receipt: ${canonicalize({ schemaVersion: 1, batchId: batch.batchId, createdOwners: [created] })}`;
    const changed = [...await stateTips(f)].filter(([ref, oid]) => before.get(ref) !== oid);
    expect(changed).toHaveLength(3);
    for (const [ref] of changed) expect((await git(f, ["show", "-s", "--format=%B", ref])).split("\n")
      .filter(line => line.startsWith("Arc-Creation-Receipt:"))).toEqual([expected]);
    expect(await f.store.read({ reference: work.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await f.store.read({ reference: lineage })).reference).toEqual(lineage);
  });

});
