import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update, mutationOf, testProvenance } from "../helpers/store/suite-tools.js";
import { makeGitExec } from "../helpers/integration.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { randomUUID } from "node:crypto";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { renderStoreCommitMessage } from "../../src/lib/store/commit-provenance.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4");

describe("writes to completed ref records", () => {
  it("updates retained history and its folder atomically, keeps the end batch, and reopens the latest state", async () => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference("work-item/meta"));
    const companion = await seed(f, f.reference("work-item/companion"));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    const archived = success(await f.store.read({ reference: companion.reference }));
    const uid = "uid" in primary.reference.owner ? primary.reference.owner.uid : undefined;
    const history = `refs/arc/history/work/${uid}`, archive = `refs/arc/archive/${quarter}`;
    const path = `metadata-${uid}.json`, folder = `01_${primary.reference.owner.name}/`;
    const git = makeGitExec(f.root);
    const prior = (await git("git", ["rev-parse", history])).stdout.trim();
    const old = JSON.parse((await git("git", ["show", `${history}:${path}`])).stdout) as Record<string, unknown>;
    const changed = success(await f.store.write(update(f, archived)));
    expect((await git("git", ["rev-parse", `${history}^`])).stdout.trim()).toBe(prior);
    const metadata = JSON.parse((await git("git", ["show", `${history}:${path}`])).stdout) as Record<string, unknown>;
    expect(metadata.endBatch).toBe(old.endBatch);
    expect(metadata.batch).not.toBe(old.batch);
    expect(metadata.batch).toEqual(expect.any(String));
    expect((await git("git", ["show", `${archive}:${folder}${path}`])).stdout).toBe((await git("git", ["show", `${history}:${path}`])).stdout);
    const read = success(await f.store.read({ reference: companion.reference }));
    expect(read.content).toBe(f.content(companion.reference, "changed"));
    expect(read.version).toBe(changed.version);
    const log = success(await f.store.history({ reference: companion.reference }));
    expect(log.map(({ content }) => content)).toEqual([read.content, companion.content]);
    const meta = success(await f.store.read({ reference: primary.reference }));
    success(await f.store.write({ ...update(f, meta), placement: { kind: "active" }, provenance: { ...testProvenance, verb: "reopen" } }));
    expect(success(await f.store.read({ reference: companion.reference })).content).toBe(read.content);
    expect(success(await f.store.history({ reference: companion.reference }))).toHaveLength(2);
  });
  it.each(["same quarter", "another quarter"] as const)("reads and lists only the latest of two ends in %s, and refreshes both", async (location) => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference("work-item/meta"));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    const other = await seed(f, f.reference("work-item/meta", "other"));
    success(await f.store.write({ ...update(f, other), placement: { kind: "completed", quarter } }));
    const uid = "uid" in primary.reference.owner ? primary.reference.owner.uid : undefined;
    const history = `refs/arc/history/work/${uid}`, firstRef = `refs/arc/archive/${quarter}`;
    const metadataPath = `metadata-${uid}.json`, firstRoot = `01_${primary.reference.owner.name}/`;
    const git = makeGitExec(f.root);
    const previous = (await git("git", ["rev-parse", history])).stdout.trim();
    const nextQuarter = location === "same quarter" ? quarter : ArchiveQuarterSchema.parse("2027-q1");
    const ref = `refs/arc/archive/${nextQuarter}`, nextRoot = `06_${primary.reference.owner.name}/`;
    const metadata = JSON.parse((await git("git", ["show", `${history}:${metadataPath}`])).stdout) as Record<string, unknown>;
    const firstEnd = metadata.endBatch;
    const priorPrimary = metadata.primary;
    if (!priorPrimary || typeof priorPrimary !== "object" || Array.isArray(priorPrimary)) throw new Error("No archived primary metadata");
    metadata.primary = { ...priorPrimary, placement: { kind: "completed", quarter: nextQuarter } };
    const batch = randomUUID(); metadata.endBatch = batch; metadata.batch = batch;
    const records = (await entriesAt(f.root, history)).map((entry): PlantTreeEntry => entry.path === metadataPath
      ? { path: entry.path, content: canonicalize(metadata) }
      : entry.path === `meta-${primary.reference.owner.name}.md` ? { path: entry.path, content: f.content(primary.reference, "changed-again") } : entry);
    const message = renderStoreCommitMessage({ ...testProvenance, verb: "archive" }, primary.reference, batch);
    await plantRef(f.root, history, records, { parents: [previous], message });
    const priorQuarter = location === "same quarter" ? (await git("git", ["rev-parse", ref])).stdout.trim() : undefined;
    await plantRef(f.root, ref, [...(location === "same quarter" ? await entriesAt(f.root, ref) : []),
      ...records.map((entry) => ({ ...entry, path: nextRoot + entry.path }))], { parents: priorQuarter ? [priorQuarter] : [], message });
    const archived = success(await f.store.read({ reference: primary.reference }));
    expect(archived.content).toBe(f.content(primary.reference, "changed-again"));
    expect(archived.placement).toEqual({ kind: "completed", quarter: nextQuarter, sequence: "06" });
    const listed = success(await f.store.list({ family: "work-item", owner: primary.reference.owner }));
    expect(listed).toMatchObject({ status: "complete", missed: false, records: [archived] });
    const written = success(await f.store.write(update(f, archived)));
    const current = success(await f.store.read({ reference: primary.reference }));
    expect(current.content).toBe(f.content(primary.reference, "changed"));
    expect(current.version).toBe(written.version);
    for (const [quarterRef, root, end] of [[firstRef, firstRoot, firstEnd], [ref, nextRoot, batch]]) {
      const meta = JSON.parse((await git("git", ["show", `${quarterRef}:${root}${metadataPath}`])).stdout) as Record<string, unknown>;
      expect(meta.endBatch).toBe(end);
      expect(meta.batch).not.toBe(end);
      expect(meta.batch).toBe(JSON.parse((await git("git", ["show", `${history}:${metadataPath}`])).stdout).batch);
      expect((await git("git", ["show", `${quarterRef}:${root}meta-${primary.reference.owner.name}.md`])).stdout).toBe(current.content);
    }
    expect(success(await f.store.list({ family: "work-item", owner: primary.reference.owner }))).toMatchObject({ status: "complete", missed: false, records: [current] });
    expect(success(await f.store.read({ reference: other.reference })).placement).toEqual({ kind: "completed", quarter, sequence: "02" });
  });

  it("gives checks independent completed before and after reads and listings", async () => {
    const f = await createRefFixture({ "work-item/meta": { check: async ({ writer, reference, before, after }) => {
      if (writer.kind !== "verb" || writer.verb !== "completed-edit") return [];
      const old = success(await before.read({ reference })), next = success(await after.read({ reference }));
      expect(old.content).not.toBe(next.content);
      expect(old.placement).toEqual({ kind: "completed", quarter, sequence: "01" });
      expect(next.placement).toEqual(old.placement);
      expect(success(await before.list({ family: "work-item", owner: reference.owner }))).toMatchObject({ status: "complete", records: [old] });
      expect(success(await after.list({ family: "work-item", owner: reference.owner }))).toMatchObject({ status: "complete", records: [next] });
      return [];
    } } });
    const primary = await seed(f, f.reference("work-item/meta"));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    const archived = success(await f.store.read({ reference: primary.reference }));
    success(await f.store.write({ ...update(f, archived, f.content(archived.reference, "changed-again")), provenance: { ...testProvenance, verb: "completed-edit" } }));
  });

  it.each(["same owner", "another owner"] as const)("resolves a completed conflict from %s and refreshes its folder", async (subject) => {
    const f = await createRefFixture();
    const base = await seed(f, f.reference("work-item/companion"), "base\n");
    success(await f.store.write(update(f, base, "current\n")));
    const clash = success(await f.store.write(update(f, base, "incoming\n")));
    const conflict = clash.conflicts[0];
    if (!conflict) throw new Error("Expected a produced conflict");
    const primary = success(await f.store.read({ reference: { ...base.reference, kind: "work-item/meta", key: undefined } }));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    const archived = success(await f.store.read({ reference: base.reference }));
    expect(archived.conflicts).toEqual([conflict]);
    const target = subject === "same owner" ? archived : await seed(f, f.reference("personal/document"), "other\n");
    success(await f.store.write({ ...update(f, target, target.content), resolves: [conflict] }));
    expect(await f.store.read({ reference: conflict })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await f.store.read({ reference: base.reference }))).toMatchObject({ content: "current\n", conflicts: [] });
    const log = success(await f.store.history({ reference: conflict }));
    expect(log[0]).toMatchObject({ content: null, version: null });
    const meta = success(await f.store.read({ reference: primary.reference }));
    success(await f.store.write({ ...update(f, meta), placement: { kind: "active" } }));
    expect(success(await f.store.read({ reference: base.reference })).conflicts).toEqual([]);
  });

  it("creates stale-write conflicts directly on completed history and copies them to its folder", async () => {
    const f = await createRefFixture();
    const base = await seed(f, f.reference("work-item/companion"), "base\n");
    const primary = success(await f.store.read({ reference: { ...base.reference, kind: "work-item/meta", key: undefined } }));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    const archived = success(await f.store.read({ reference: base.reference }));
    success(await f.store.write(update(f, archived, "current\n")));
    const result = success(await f.store.write(update(f, archived, "incoming\n")));
    expect(result.conflicts).toHaveLength(1);
    const conflict = result.conflicts[0]!;
    expect(JSON.parse(success(await f.store.read({ reference: conflict })).content)).toMatchObject({ baseVersion: archived.version });
    expect(success(await f.store.read({ reference: base.reference }))).toMatchObject({ content: "current\n", conflicts: [conflict] });
  });

  it.each(["missing", "stale"] as const)("refuses writes and history with %s retained history and admits the unchanged retry after repair", async (condition) => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference("work-item/meta"));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    const archived = success(await f.store.read({ reference: primary.reference }));
    const uid = "uid" in primary.reference.owner ? primary.reference.owner.uid : undefined;
    const history = `refs/arc/history/work/${uid}`, git = makeGitExec(f.root);
    const tip = (await git("git", ["rev-parse", history])).stdout.trim();
    const parent = (await git("git", ["rev-parse", `${tip}^`])).stdout.trim();
    await git("git", condition === "missing" ? ["update-ref", "-d", history] : ["update-ref", history, parent]);
    const before = (await git("git", ["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"])).stdout;
    const write = update(f, archived, f.content(archived.reference, "changed-again"));
    for (const result of [await f.store.write(write), await f.store.history({ reference: primary.reference })]) {
      expect(result).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable", historyRefs: [history], remedy: { text: expect.stringMatching(/pull/iu) } } });
    }
    expect((await git("git", ["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"])).stdout).toBe(before);
    await git("git", ["update-ref", history, tip]);
    expect(success(await f.store.history({ reference: primary.reference }))).toHaveLength(2);
    success(await f.store.write(write));
    expect(success(await f.store.history({ reference: primary.reference }))).toHaveLength(3);
  });

  it("revalidates the completed history basis under its locks", async () => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference("work-item/meta"));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    const archived = success(await f.store.read({ reference: primary.reference }));
    const uid = "uid" in primary.reference.owner ? primary.reference.owner.uid : undefined;
    const history = `refs/arc/history/work/${uid}`, git = makeGitExec(f.root);
    const tip = (await git("git", ["rev-parse", history])).stdout.trim();
    const parent = (await git("git", ["rev-parse", `${tip}^`])).stdout.trim();
    let moved = false;
    const store = createRefStore({ ...f.ports, lock: async (ref, waitMs) => {
      if (!moved) { moved = true; await git("git", ["update-ref", history, parent]); }
      return f.ports.lock(ref, waitMs);
    } });
    const before = (await git("git", ["rev-parse", `refs/arc/archive/${quarter}`])).stdout;
    const write = update(f, archived, f.content(archived.reference, "changed-again"));
    expect(await store.write(write)).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable", historyRefs: [history] } });
    expect((await git("git", ["rev-parse", `refs/arc/archive/${quarter}`])).stdout).toBe(before);
    await git("git", ["update-ref", history, tip]);
    success(await store.write(write));
  });

  it("removes a completed companion from history and its folder", async () => {
    const f = await createRefFixture();
    const companion = await seed(f, f.reference("work-item/companion"));
    const primary = success(await f.store.read({ reference: { ...companion.reference, kind: "work-item/meta", key: undefined } }));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    const archived = success(await f.store.read({ reference: companion.reference }));
    success(await f.store.write({ action: "remove", reference: archived.reference, expected: archived.version, provenance: testProvenance }));
    expect(await f.store.read({ reference: companion.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await f.store.history({ reference: companion.reference }))[0]).toMatchObject({ content: null, version: null });
  });

  it("refreshes a completed item beside an archive and a reopen in one quarter", async () => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference("work-item/meta"));
    const reopening = await seed(f, f.reference("work-item/meta", "reopening"));
    const closing = await seed(f, f.reference("work-item/meta", "closing"));
    for (const record of [primary, reopening]) success(await f.store.write({ ...update(f, record), placement: { kind: "completed", quarter } }));
    const archived = success(await f.store.read({ reference: primary.reference }));
    const ended = success(await f.store.read({ reference: reopening.reference }));
    success(await f.store.batch({ writes: [mutationOf(update(f, archived, f.content(archived.reference, "changed-again"))), mutationOf({ ...update(f, ended), placement: { kind: "active" } }),
      mutationOf({ ...update(f, closing), placement: { kind: "completed", quarter } })], provenance: testProvenance }));
    expect(success(await f.store.read({ reference: primary.reference })).content).toBe(f.content(primary.reference, "changed-again"));
    expect(success(await f.store.read({ reference: reopening.reference })).placement).toEqual({ kind: "active" });
    const closed = success(await f.store.read({ reference: closing.reference }));
    expect(closed.placement).toMatchObject({ kind: "completed", quarter });
    expect(success(await f.store.list({ family: "work-item", kind: "work-item/meta" }))).toMatchObject({ status: "complete", missed: false, records: expect.arrayContaining([
      expect.objectContaining({ reference: primary.reference }), expect.objectContaining({ reference: reopening.reference }), expect.objectContaining({ reference: closing.reference }),
    ]) });
    const git = makeGitExec(f.root);
    expect((await git("git", ["ls-tree", "--name-only", `refs/arc/archive/${quarter}`])).stdout).not.toContain(reopening.reference.owner.name);
  });

  it("keeps an identical completed rewrite out of both ref logs", async () => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference("work-item/meta"));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    const archived = success(await f.store.read({ reference: primary.reference }));
    const git = makeGitExec(f.root);
    const before = (await git("git", ["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"])).stdout;
    expect(success(await f.store.write(update(f, archived, archived.content))).version).toBe(archived.version);
    expect((await git("git", ["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"])).stdout).toBe(before);
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
