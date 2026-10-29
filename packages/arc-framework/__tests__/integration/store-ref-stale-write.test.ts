import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";
import { makeGitExec } from "../helpers/integration.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { parseLineageRecord } from "../../src/lib/store/kinds/lineage/parser.js";

describe("writes over captured record versions", () => {
  it.each(["work-item/meta", "work-item/record"] as const)("requires absence when the existing primary is %s", async (kind) => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference(kind));
    const reference = RecordReferenceSchema.parse({ owner: record.reference.owner,
      kind: kind === "work-item/meta" ? "work-item/record" : "work-item/meta" });
    const before = await f.settle();
    expect(await f.store.write({ action: "put", reference, expected: null, content: f.content(reference),
      placement: { kind: "active" }, provenance: testProvenance })).toMatchObject({ status: "refused", refusal: {
      code: "version-conflict", records: [reference],
    } });
    expect(await f.settle()).toBe(before);
  });

  it("rejects current-version updates to create-only and write-once records", async () => {
    const f = await createRefFixture();
    for (const kind of ["lineage/transition", "personal/routing-receipt"] as const) {
      const record = await seed(f, f.reference(kind));
      const before = await f.settle();
      expect(await f.store.write(update(f, record))).toMatchObject({ status: "refused", refusal: {
        code: "version-conflict", records: [record.reference],
      } });
      expect(await f.settle()).toBe(before);
    }
  });

  it.each(["save", "repair-lineage"])("admits only a current-version missing terminal snapshot repair with %s", async (verb) => {
    const f = await createRefFixture({ "lineage/transition": { parser: (content) => {
      const data = parseLineageRecord(content);
      return data ? { success: true, data } : { success: false, error: "Invalid lineage" };
    } } });
    const reference = f.reference("lineage/transition");
    const original = JSON.stringify({ schemaVersion: 2, origin: { name: reference.owner.name }, kind: "abandon", successors: [], incoming: [] });
    const record = await seed(f, reference, original);
    const repair = JSON.stringify({ ...JSON.parse(original), retiredBranches: [] });
    const bad = JSON.stringify({ ...JSON.parse(original), kind: "rename", successors: [{ name: "replacement" }], retiredBranches: undefined });
    expect(await f.store.write({ ...update(f, record, bad), provenance: { ...testProvenance, verb: "repair-lineage" } }))
      .toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
    const fixed = success(await f.store.write({ ...update(f, record, repair), provenance: { ...testProvenance, verb } }));
    expect(JSON.parse(success(await f.store.read({ reference })).content)).toEqual(JSON.parse(repair));
    expect(fixed.version).not.toBe(record.version);
    expect(await f.store.write({ ...update(f, record, repair), provenance: { ...testProvenance, verb: "repair-lineage" } }))
      .toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
  });

  it("keeps an identical rewrite out of ref history and preserves metadata-only changes", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("work-item/meta"));
    const ref = `refs/arc/work/${record.reference.owner.type === "work-item" ? record.reference.owner.uid : ""}`;
    const git = makeGitExec(f.root);
    const before = (await git("git", ["rev-parse", ref])).stdout;
    expect(success(await f.store.write(update(f, record, record.content))).version).toBe(record.version);
    expect((await git("git", ["rev-parse", ref])).stdout).toBe(before);
    expect(success(await f.store.history({ reference: record.reference }))).toHaveLength(1);
    const moved = success(await f.store.write({ ...update(f, record, record.content), placement: { kind: "backlog", commitment: "planned" } }));
    expect(moved.version).not.toBe(record.version);
    expect((await git("git", ["rev-parse", ref])).stdout).not.toBe(before);
  });

  it("merges line edits from the named historical version and refuses an unknown base", async () => {
    const f = await createRefFixture();
    const base = await seed(f, f.reference("personal/document"), "one\ntwo\nthree\n");
    success(await f.store.write(update(f, base, "ONE\ntwo\nthree\n")));
    const merged = success(await f.store.write(update(f, base, "one\ntwo\nTHREE\n")));
    const record = success(await f.store.read({ reference: base.reference }));
    expect(record.content).toBe("ONE\ntwo\nTHREE\n");
    expect(merged.version).toBe(record.version);
    expect(merged.conflicts).toEqual([]);
    const missing = "f".repeat(64) as typeof base.version;
    expect(await f.store.write({ ...update(f, base, "next\n"), expected: missing }))
      .toMatchObject({ status: "refused", refusal: { code: "version-conflict", records: [base.reference] } });
    expect(success(await f.store.read({ reference: base.reference })).version).toBe(record.version);
  });

  it("merges entry additions and makes a retried hand-typed addition a no-op", async () => {
    const f = await createRefFixture();
    const base = await seed(f, f.reference("personal/inbox"), "# Inbox\n\n## Errand\n\n## Work Unit\n");
    const first = "# Inbox\n\n## Errand\n\n### [ ] First\n\nFirst entry.\n\n## Work Unit\n";
    const incoming = "# Inbox\n\n## Errand\n\n## Work Unit\n\n### [ ] Second\n\nSecond entry.\n";
    success(await f.store.write(update(f, base, first)));
    const write = update(f, base, incoming);
    success(await f.store.write(write));
    const after = success(await f.store.read({ reference: base.reference }));
    expect(after.content).toContain("First entry.");
    expect(after.content).toContain("Second entry.");
    expect(after.content.match(/_Id:_/gu)).toHaveLength(2);
    const version = await f.settle();
    expect(success(await f.store.write(write)).version).toBe(after.version);
    expect(await f.settle()).toBe(version);
    expect(success(await f.store.history({ reference: base.reference }))).toHaveLength(3);
  });

  it("retains stale-base clashes and resolves one while keeping the subject's stored version", async () => {
    const f = await createRefFixture();
    const base = await seed(f, f.reference("personal/document"), "base\n");
    const currentWrite = success(await f.store.write(update(f, base, "current\n")));
    const stale = update(f, base, "incoming\n");
    const clash = success(await f.store.write(stale));
    expect(clash.conflicts).toHaveLength(1);
    const conflict = clash.conflicts[0]!;
    const filed = success(await f.store.read({ reference: conflict }));
    expect(JSON.parse(filed.content)).toMatchObject({ baseVersion: base.version, currentLines: 1, incomingLines: 1 });
    const current = success(await f.store.read({ reference: base.reference }));
    expect(current.version).toBe(currentWrite.version);
    expect(current.conflicts).toEqual([conflict]);
    const history = success(await f.store.history({ reference: base.reference }));
    success(await f.store.write({ ...update(f, current, current.content), resolves: [conflict] }));
    expect(success(await f.store.read({ reference: base.reference }))).toMatchObject({ version: current.version, conflicts: [] });
    expect(await f.store.read({ reference: conflict })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await f.store.history({ reference: base.reference }))).toEqual(history);
    const before = await f.settle();
    success(await f.store.write({ ...update(f, current, current.content), resolves: [conflict] }));
    expect(await f.settle()).toBe(before);
  });

  it("resolves a conflict on another ref in the same transaction", async () => {
    const f = await createRefFixture();
    const base = await seed(f, f.reference("work-item/companion"), "base\n");
    success(await f.store.write(update(f, base, "current\n")));
    const clash = success(await f.store.write(update(f, base, "incoming\n")));
    const document = await seed(f, f.reference("personal/document"), "old\n");
    success(await f.store.write({ ...update(f, document, "resolved\n"), resolves: clash.conflicts }));
    expect(success(await f.store.read({ reference: document.reference })).content).toBe("resolved\n");
    expect(success(await f.store.read({ reference: base.reference })).conflicts).toEqual([]);
    expect(await f.store.read({ reference: clash.conflicts[0]! })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
});
