import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update, mutationOf, testProvenance } from "../helpers/store/suite-tools.js";
import { makeGitExec } from "../helpers/integration.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { plantRef, removeLooseObject, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { writeLineageRecord } from "../../src/lib/store/kinds/lineage/index.js";

describe("local ref retirement", () => {
  it.each(["abandon", "decompose"] as const)("sweeps the origin into empty retained history with its %s lineage and children atomically", async (kind) => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference("work-item/meta"));
    const companion = await seed(f, f.reference("work-item/companion"));
    const lineage = RecordReferenceSchema.parse({ owner: primary.reference.owner, kind: "lineage/transition" });
    const child = f.reference("work-item/meta", "child");
    const owner = primary.reference.owner;
    if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected minted work item");
    const content = writeLineageRecord({ schemaVersion: 2, origin: { name: owner.name, uid: owner.uid }, kind,
      successors: kind === "decompose" ? [{ name: child.owner.name }] : [], incoming: [], ...(kind === "decompose" ? { outgoing: [] } : {}) });
    const live = `refs/arc/work/${owner.uid}`, history = `refs/arc/history/work/${owner.uid}`, git = makeGitExec(f.root);
    const parent = (await git("git", ["rev-parse", live])).stdout.trim();
    const result = success(await f.store.batch({ writes: [
      { action: "remove", reference: primary.reference, expected: primary.version },
      { action: "put", reference: lineage, expected: null, content },
      ...(kind === "decompose" ? [mutationOf({ action: "put" as const, reference: child, expected: null,
        content: f.content(child), placement: { kind: "backlog" as const, commitment: "provisional" as const }, provenance: testProvenance })] : []),
    ], provenance: { ...testProvenance, verb: kind } }));
    expect((await git("git", ["for-each-ref", "--format=%(refname)", live])).stdout.trim()).toBe("");
    expect((await git("git", ["ls-tree", "-r", history])).stdout).toBe("");
    expect((await git("git", ["rev-parse", `${history}^`])).stdout.trim()).toBe(parent);
    expect(success(await f.store.read({ reference: lineage })).content).toBe(content);
    for (const record of [primary, companion]) {
      expect(await f.store.read({ reference: record.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      const log = success(await f.store.history({ reference: record.reference }));
      expect(log[0]).toMatchObject({ content: null, version: null, provenance: { batchId: result.batchId } });
      expect(log[1]?.content).toBe(record.content);
    }
    if (kind === "decompose") expect(success(await f.store.read({ reference: child })).placement).toEqual({ kind: "backlog", commitment: "provisional" });
  });
  it.each(["lineage first", "removal first"] as const)("ends on the write completing both facts with %s", async (order) => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference("work-item/meta"));
    const companion = await seed(f, f.reference("work-item/companion"));
    const lineage = RecordReferenceSchema.parse({ owner: primary.reference.owner, kind: "lineage/transition" });
    const uid = "uid" in primary.reference.owner ? primary.reference.owner.uid : undefined;
    const live = `refs/arc/work/${uid}`, history = `refs/arc/history/work/${uid}`, git = makeGitExec(f.root);
    const writeLineage = () => f.store.write({ action: "put", reference: lineage, expected: null,
      content: f.content(lineage), provenance: testProvenance });
    const removePrimary = () => f.store.write({ action: "remove", reference: primary.reference, expected: primary.version, provenance: testProvenance });
    success(await (order === "lineage first" ? writeLineage() : removePrimary()));
    expect((await git("git", ["for-each-ref", "--format=%(refname)", live])).stdout.trim()).toBe(live);
    expect((await git("git", ["for-each-ref", "--format=%(refname)", history])).stdout.trim()).toBe("");
    expect(success(await f.store.read({ reference: companion.reference })).content).toBe(companion.content);
    if (order === "lineage first") expect(success(await f.store.read({ reference: primary.reference })).content).toBe(primary.content);
    success(await (order === "lineage first" ? removePrimary() : writeLineage()));
    expect((await git("git", ["for-each-ref", "--format=%(refname)", live])).stdout.trim()).toBe("");
    expect((await git("git", ["ls-tree", "-r", history])).stdout).toBe("");
    expect(success(await f.store.history({ reference: companion.reference }))[0]).toMatchObject({ content: null, version: null });
  });

  it("refuses missing retired history by name and reads it after restoring the exact ref", async () => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference("work-item/meta"));
    const lineage = RecordReferenceSchema.parse({ owner: primary.reference.owner, kind: "lineage/transition" });
    await seed(f, lineage);
    success(await f.store.write({ action: "remove", reference: primary.reference, expected: primary.version, provenance: testProvenance }));
    const uid = "uid" in primary.reference.owner ? primary.reference.owner.uid : undefined;
    const history = `refs/arc/history/work/${uid}`, git = makeGitExec(f.root);
    const tip = (await git("git", ["rev-parse", history])).stdout.trim();
    await git("git", ["update-ref", "-d", history]);
    expect(await f.store.history({ reference: primary.reference })).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable",
      historyRefs: [history], remedy: { text: expect.stringContaining(history) } } });
    await git("git", ["update-ref", history, tip]);
    expect(success(await f.store.history({ reference: primary.reference })).map(({ content }) => content)).toEqual([null, primary.content]);
  });

  it("refuses other origin puts in pending retirement and admits a primary restoration in the same batch", async () => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference("work-item/meta"));
    const companion = await seed(f, f.reference("work-item/companion"));
    const lineage = RecordReferenceSchema.parse({ owner: primary.reference.owner, kind: "lineage/transition" });
    const uid = "uid" in primary.reference.owner ? primary.reference.owner.uid : undefined;
    const live = `refs/arc/work/${uid}`, git = makeGitExec(f.root);
    const original = (await git("git", ["rev-parse", live])).stdout.trim();
    success(await f.store.write({ action: "remove", reference: primary.reference, expected: primary.version, provenance: testProvenance }));
    const removed = (await git("git", ["rev-parse", live])).stdout.trim();
    const records = await entriesAt(f.root, live);
    await git("git", ["update-ref", live, original]);
    await seed(f, lineage);
    await plantRef(f.root, live, records, { parents: [original, removed] });
    const before = (await git("git", ["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"])).stdout;
    expect(await f.store.write(update(f, companion))).toMatchObject({ status: "refused", refusal: { code: "record-malformed", reference: lineage,
      remedy: { text: expect.stringMatching(/restore/iu) } } });
    expect((await git("git", ["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"])).stdout).toBe(before);
    success(await f.store.batch({ writes: [mutationOf(update(f, companion)), { action: "put", reference: primary.reference, expected: null,
      content: primary.content, placement: { kind: "active" } }], provenance: testProvenance }));
    expect(success(await f.store.read({ reference: primary.reference })).content).toBe(primary.content);
    expect(success(await f.store.read({ reference: companion.reference })).content).toBe(f.content(companion.reference, "changed"));
    expect((await git("git", ["for-each-ref", "--format=%(refname)", `refs/arc/history/work/${uid}`])).stdout.trim()).toBe("");
  });

  it("refuses an unavailable lineage tree before changing the origin and retires after object repair", async () => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference("work-item/meta"));
    const lineage = RecordReferenceSchema.parse({ owner: primary.reference.owner, kind: "lineage/transition" });
    await seed(f, lineage);
    const git = makeGitExec(f.root), registry = "refs/arc/project/registry";
    const tree = (await git("git", ["rev-parse", `${registry}^{tree}`])).stdout.trim();
    const bytes = (await f.ports.rawExec(["cat-file", "tree", tree])).stdout;
    await removeLooseObject(f.root, tree);
    const before = (await git("git", ["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"])).stdout;
    const write = { action: "remove" as const, reference: primary.reference, expected: primary.version, provenance: testProvenance };
    expect(await f.store.write(write)).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", namespace: registry } });
    expect((await git("git", ["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"])).stdout).toBe(before);
    await f.ports.rawExec(["hash-object", "-w", "-t", "tree", "--stdin"], { input: bytes });
    success(await f.store.write(write));
    expect(success(await f.store.history({ reference: primary.reference }))[0]).toMatchObject({ content: null, version: null });
  });

});

async function entriesAt(root: string, ref: string): Promise<PlantTreeEntry[]> {
  const { stdout } = await makeGitExec(root)("git", ["ls-tree", "-r", "-z", ref]);
  return stdout.split("\0").filter(Boolean).map((row) => {
    const match = /^100644 blob ([0-9a-f]+)\t(.*)$/su.exec(row);
    if (!match?.[1] || !match[2]) throw new Error("The fixture expects regular record blobs");
    return { path: match[2], mode: "100644", oid: match[1] };
  });
}
