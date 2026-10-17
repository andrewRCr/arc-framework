import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update, mutationOf, testProvenance } from "../helpers/store/suite-tools.js";
import { makeGitExec } from "../helpers/integration.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { randomUUID } from "node:crypto";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { renderStoreCommitMessage } from "../../src/lib/store/commit-provenance.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4");

describe("local ref reopens", () => {
  it.each(["work-item/meta", "work-item/record"] as const)("moves history back to a live ref and removes the archive folder in the same batch (%s)", async (kind) => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference(kind));
    const child = RecordReferenceSchema.parse({ ...f.reference("work-item/companion"), owner: primary.reference.owner });
    const childWrite = success(await f.store.write({ action: "put", reference: child, expected: null,
      content: f.content(child), provenance: testProvenance }));
    const companion = success(await f.store.read({ reference: childWrite.reference }));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    const archived = success(await f.store.read({ reference: primary.reference }));
    const archivedCompanion = success(await f.store.read({ reference: companion.reference }));
    const uid = "uid" in primary.reference.owner ? primary.reference.owner.uid : undefined;
    const live = `refs/arc/work/${uid}`, history = `refs/arc/history/work/${uid}`;
    const git = makeGitExec(f.root);
    const parent = (await git("git", ["rev-parse", history])).stdout.trim();
    success(await f.store.batch({ writes: [mutationOf({ ...update(f, archived, f.content(archived.reference, "changed-again")), placement: { kind: "active" } }),
      mutationOf(update(f, archivedCompanion))], provenance: { ...testProvenance, verb: "reopen" } }));
    expect((await git("git", ["for-each-ref", "--format=%(refname)", history])).stdout.trim()).toBe("");
    expect((await git("git", ["rev-parse", `${live}^`])).stdout.trim()).toBe(parent);
    expect((await git("git", ["ls-tree", "--name-only", `refs/arc/archive/${quarter}`])).stdout.trim()).toBe("");
    const metadata = JSON.parse((await git("git", ["show", `${live}:metadata-${uid}.json`])).stdout) as Record<string, unknown>;
    expect(metadata).not.toHaveProperty("endBatch");
    expect(metadata).not.toHaveProperty("batch");
    const read = success(await f.store.read({ reference: primary.reference }));
    expect(read.placement).toEqual({ kind: "active" });
    expect(read.content).toBe(f.content(primary.reference, "changed-again"));
    expect(success(await f.store.read({ reference: companion.reference })).content).toBe(f.content(companion.reference, "changed"));
  });
  it("gives checks an archived before view and a live after view", async () => {
    const f = await createRefFixture({ "work-item/meta": { check: async ({ writer, reference, before, after }) => {
      if (writer.kind !== "verb" || writer.verb !== "reopen") return [];
      expect(success(await before.read({ reference })).placement).toEqual({ kind: "completed", quarter, sequence: "01" });
      expect(success(await after.read({ reference })).placement).toEqual({ kind: "active" });
      const prior = success(await before.list({ family: "work-item", owner: reference.owner }));
      const next = success(await after.list({ family: "work-item", owner: reference.owner }));
      expect(prior).toMatchObject({ status: "complete", missed: false, records: [expect.objectContaining({ placement: expect.objectContaining({ kind: "completed" }) })] });
      expect(next).toMatchObject({ status: "complete", missed: false, records: [expect.objectContaining({ placement: expect.objectContaining({ kind: "active" }) })] });
      expect(success(await after.lookup({ kind: "slug", slug: reference.owner.name })).reference.owner).toEqual(reference.owner);
      return [];
    } } });
    const primary = await seed(f, f.reference("work-item/meta"));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    const archived = success(await f.store.read({ reference: primary.reference }));
    success(await f.store.write({ ...update(f, archived), placement: { kind: "active" }, provenance: { ...testProvenance, verb: "reopen" } }));
  });

  it.each(["missing", "stale"] as const)("refuses %s history and admits the same reopen after restoring it", async (condition) => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference("work-item/meta"));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    const archived = success(await f.store.read({ reference: primary.reference }));
    const uid = "uid" in primary.reference.owner ? primary.reference.owner.uid : undefined;
    const ref = `refs/arc/history/work/${uid}`;
    const git = makeGitExec(f.root);
    const tip = (await git("git", ["rev-parse", ref])).stdout.trim();
    const parent = (await git("git", ["rev-parse", `${tip}^`])).stdout.trim();
    await git("git", condition === "missing" ? ["update-ref", "-d", ref] : ["update-ref", ref, parent]);
    const before = (await git("git", ["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"])).stdout;
    const write = { ...update(f, archived), placement: { kind: "active" as const } };
    expect(await f.store.write(write)).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable", historyRefs: [ref],
      remedy: { text: expect.stringMatching(/pull/iu) } } });
    expect((await git("git", ["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"])).stdout).toBe(before);
    await git("git", ["update-ref", ref, tip]);
    success(await f.store.write(write));
    expect(success(await f.store.read({ reference: primary.reference })).placement).toEqual({ kind: "active" });
  });

  it.each(["work-item/meta", "cohort/document"] as const)("refuses a reopen onto a live %s and admits it after releasing the slug", async (kind) => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference("work-item/meta"));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    const archived = success(await f.store.read({ reference: primary.reference }));
    const reference = RecordReferenceSchema.parse({ ...f.reference(kind), owner: { type: kind === "cohort/document" ? "cohort" : "work-item", name: primary.reference.owner.name } });
    const blocker = await seed(f, reference);
    expect(blocker.reference.owner).not.toEqual(archived.reference.owner);
    const before = success(await f.store.version());
    const write = { ...update(f, archived), placement: { kind: "active" as const } };
    expect(await f.store.write(write)).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match",
      candidates: expect.arrayContaining([archived.reference, blocker.reference]) } });
    expect(success(await f.store.version())).toBe(before);
    success(await f.store.write({ action: "remove", reference: blocker.reference, expected: blocker.version, provenance: testProvenance }));
    success(await f.store.write(write));
    expect(success(await f.store.read({ reference: primary.reference })).placement).toEqual({ kind: "active" });
  });

  it("revalidates the archive's batch when history changes before locks are acquired", async () => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference("work-item/meta"));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    const archived = success(await f.store.read({ reference: primary.reference }));
    const uid = "uid" in primary.reference.owner ? primary.reference.owner.uid : undefined;
    const history = `refs/arc/history/work/${uid}`;
    const git = makeGitExec(f.root);
    const tip = (await git("git", ["rev-parse", history])).stdout.trim();
    const parent = (await git("git", ["rev-parse", `${tip}^`])).stdout.trim();
    let changed = false;
    const store = createRefStore({ ...f.ports, lock: async (ref, waitMs) => {
      if (!changed) { changed = true; await git("git", ["update-ref", history, parent]); }
      return f.ports.lock(ref, waitMs);
    } });
    const write = { ...update(f, archived), placement: { kind: "active" as const } };
    expect(await store.write(write)).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable", historyRefs: [history] } });
    expect((await git("git", ["for-each-ref", "--format=%(refname)", `refs/arc/work/${uid}`])).stdout.trim()).toBe("");
    await git("git", ["update-ref", history, tip]);
    success(await store.write(write));
  });

  it.each(["same quarter", "another quarter"] as const)("removes both published ends in %s and preserves other owners", async (location) => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference("work-item/meta"));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    const other = await seed(f, f.reference("work-item/meta", "other"));
    success(await f.store.write({ ...update(f, other), placement: { kind: "completed", quarter } }));
    const uid = "uid" in primary.reference.owner ? primary.reference.owner.uid : undefined;
    const history = `refs/arc/history/work/${uid}`;
    const git = makeGitExec(f.root);
    const previous = (await git("git", ["rev-parse", history])).stdout.trim();
    const nextQuarter = location === "same quarter" ? quarter : ArchiveQuarterSchema.parse("2027-q1");
    const ref = `refs/arc/archive/${nextQuarter}`;
    const metadataPath = `metadata-${uid}.json`;
    const metadata = JSON.parse((await git("git", ["show", `${history}:${metadataPath}`])).stdout) as Record<string, unknown>;
    const priorPrimary = metadata.primary;
    if (!priorPrimary || typeof priorPrimary !== "object" || Array.isArray(priorPrimary)) throw new Error("No archived primary metadata");
    metadata.primary = { ...priorPrimary, placement: { kind: "completed", quarter: nextQuarter } };
    const batch = randomUUID();
    metadata.endBatch = batch; metadata.batch = batch;
    const records = (await entriesAt(f.root, history)).map((entry): PlantTreeEntry => entry.path === metadataPath
      ? { path: entry.path, content: canonicalize(metadata) }
      : entry.path === `meta-${primary.reference.owner.name}.md` ? { path: entry.path, content: f.content(primary.reference, "changed-again") } : entry);
    const message = renderStoreCommitMessage({ ...testProvenance, verb: "archive" }, primary.reference, batch);
    const final = await plantRef(f.root, history, records, { parents: [previous], message });
    const folder = `06_${primary.reference.owner.name}/`;
    const priorQuarter = location === "same quarter" ? (await git("git", ["rev-parse", ref])).stdout.trim() : undefined;
    await plantRef(f.root, ref, [...(location === "same quarter" ? await entriesAt(f.root, ref) : []),
      ...records.map((entry) => ({ ...entry, path: folder + entry.path }))], { parents: priorQuarter ? [priorQuarter] : [], message });
    const archived = success(await f.store.read({ reference: primary.reference }));
    expect(archived.content).toBe(f.content(primary.reference, "changed-again"));
    success(await f.store.write({ ...update(f, archived, archived.content), placement: { kind: "active" } }));
    expect((await git("git", ["rev-parse", `refs/arc/work/${uid}^`])).stdout.trim()).toBe(final.tip);
    expect((await git("git", ["ls-tree", "--name-only", `refs/arc/archive/${quarter}`])).stdout.trim()).toBe(`02_${other.reference.owner.name}`);
    if (location !== "same quarter") expect((await git("git", ["ls-tree", "--name-only", ref])).stdout.trim()).toBe("");
    expect(success(await f.store.read({ reference: other.reference })).placement).toEqual({ kind: "completed", quarter, sequence: "02" });
    expect(success(await f.store.read({ reference: primary.reference })).placement).toEqual({ kind: "active" });
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
