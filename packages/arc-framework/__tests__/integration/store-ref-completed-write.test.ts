import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRefFixture, type RefConformanceFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update, mutationOf, testProvenance } from "../helpers/store/suite-tools.js";
import { makeGitExec } from "../helpers/integration.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { randomUUID } from "node:crypto";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { renderStoreCommitMessage } from "../../src/lib/store/commit-provenance.js";
import { plantRef, removeLooseObject, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema, sameOwner, type RecordReference } from "../../src/lib/store/index.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4");
const later = ArchiveQuarterSchema.parse("2027-q1");

describe("writes to completed ref records", () => {
  it.each(["same quarter", "another quarter"] as const)("refuses to move two ended folders in %s, then admits a reopen and one end", async location => {
    const f = await createRefFixture();
    const { primary, firstRef, firstRoot, ref, nextRoot, metadataPath } = await endTwice(f, location);
    const git = makeGitExec(f.root), destination = ArchiveQuarterSchema.parse("2027-q2");
    const archived = success(await f.store.read({ reference: primary.reference }));
    const before = (await git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
    const result = await f.store.write({ ...update(f, archived), placement: { kind: "completed", quarter: destination } });
    expect(result).toMatchObject({ status: "refused", refusal: { code: "record-malformed", class: "recoverable" } });
    if (result.status !== "refused") throw new Error("Expected a refused multi-folder move");
    expect(result.refusal.condition).toMatch(/more than one.*folder/iu);
    expect(result.refusal.remedy.text).toMatch(/reopen.*every.*once/iu);
    expect((await git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
    for (const [quarterRef, root] of [[firstRef, firstRoot], [ref, nextRoot]] as const) {
      expect((await git("git", ["ls-tree", "-r", "--name-only", quarterRef])).stdout).toContain(root + metadataPath);
    }
    success(await f.store.write({ ...update(f, archived), placement: { kind: "active" } }));
    const reopened = success(await f.store.read({ reference: primary.reference }));
    for (const quarterRef of new Set([firstRef, ref])) {
      expect((await git("git", ["ls-tree", "-r", "--name-only", quarterRef])).stdout).not.toContain(metadataPath);
    }
    success(await f.store.write({ ...update(f, reopened), placement: { kind: "completed", quarter: destination } }));
    expect(success(await f.store.read({ reference: primary.reference })).placement)
      .toEqual({ kind: "completed", quarter: destination, sequence: "01" });
  });

  it.each(["default", "separate"] as const)("updates retained history and its folder atomically, keeps the end batch, and reopens the latest state (%s)", async (layout) => {
    const f = await createRefFixture({}, layout);
    const primary = await seed(f, f.reference("work-item/meta"));
    const companion = await seed(f, f.reference("work-item/companion"));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    const archived = success(await f.store.read({ reference: companion.reference }));
    const uid = "uid" in primary.reference.owner ? primary.reference.owner.uid : undefined;
    const history = `refs/arc/history/work/${uid}`, archive = `refs/arc/archive/${quarter}`;
    const path = `metadata-${uid}.json`, folder = `01_${primary.reference.owner.name}/`;
    const native = makeGitExec(f.root);
    const git = (command: string, args: string[]) => native(command, [...f.gitDir ? [`--git-dir=${f.gitDir}`] : [], ...args]);
    const prior = (await git("git", ["rev-parse", history])).stdout.trim();
    const old = JSON.parse((await git("git", ["show", `${history}:${path}`])).stdout) as Record<string, unknown>;
    let batches = 0, singles = 0, objects = 0;
    const measured = createRefStore({ ...f.ports, rawExec: (args, options) => {
      if (args.includes("hash-object") || args.includes("mktree")) objects++;
      if (args.includes("hash-object") && args.includes("--stdin-paths")) batches++;
      if (args.includes("hash-object") && args.includes("--stdin")) singles++;
      return f.ports.rawExec(args, options);
    } });
    const changed = success(await measured.write(update(f, archived)));
    expect(batches).toBe(1);
    expect(singles).toBe(0);
    expect(objects).toBeLessThanOrEqual(3);
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
    const { primary, other, history, firstRef, firstRoot, firstEnd, metadataPath, nextQuarter, ref, nextRoot, batch } = await endTwice(f, location);
    const git = makeGitExec(f.root);
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

  it("refuses a twice-ended item's read, history, write, and check view while its later quarter's tree is unavailable, and refreshes both folders after repair", async () => {
    const f = await createRefFixture();
    const { primary, firstRef, firstRoot, ref, nextRoot } = await endTwice(f, "another quarter");
    const archived = success(await f.store.read({ reference: primary.reference }));
    const versions = success(await f.store.history({ reference: primary.reference }));
    const target = await seed(f, f.reference("personal/document"), "original\n");
    const git = makeGitExec(f.root);
    const tree = (await git("git", ["rev-parse", `${ref}^{tree}`])).stdout.trim();
    const path = join(f.root, ".git", "objects", tree.slice(0, 2), tree.slice(2));
    const bytes = await readFile(path);
    await rm(path);
    const unavailable = { status: "refused", refusal: { code: "namespace-corrupt", namespace: ref } };
    const write = update(f, archived, f.content(primary.reference, "valid"));
    const observed = { writes: [mutationOf(update(f, target, "accepted\n"))], provenance: testProvenance,
      observations: [{ reference: primary.reference, expected: { version: archived.version, conflicts: [] } }] };
    expect(await f.store.read({ reference: primary.reference })).toMatchObject(unavailable);
    expect(await f.store.history({ reference: primary.reference })).toMatchObject(unavailable);
    expect(await f.store.write(write)).toMatchObject(unavailable);
    expect(await f.store.batch(observed)).toMatchObject(unavailable);
    await writeFile(path, bytes);
    expect(success(await f.store.history({ reference: primary.reference }))).toEqual(versions);
    success(await f.store.batch(observed));
    const written = success(await f.store.write(write));
    expect(success(await f.store.read({ reference: primary.reference })).version).toBe(written.version);
    for (const [quarterRef, root] of [[firstRef, firstRoot], [ref, nextRoot]]) {
      expect((await git("git", ["show", `${quarterRef}:${root}meta-${primary.reference.owner.name}.md`])).stdout).toBe(f.content(primary.reference, "valid"));
    }
  });

  it.each([["unparseable", "one end"], ["unparseable", "two ends"], ["removed", "one end"], ["removed", "two ends"]] as const)("refuses an ended item's read, history, write, and check view while a folder of it has its metadata %s (%s), and serves the repaired folder", async (damage, ends) => {
    const f = await createRefFixture();
    const twice = ends === "two ends" ? await endTwice(f, "another quarter") : undefined;
    const primary = twice?.primary ?? await seed(f, f.reference("work-item/meta"));
    if (!twice) success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    const ref = twice?.ref ?? `refs/arc/archive/${quarter}`, root = twice?.nextRoot ?? `01_${primary.reference.owner.name}/`;
    const uid = "uid" in primary.reference.owner ? primary.reference.owner.uid : undefined;
    const archived = success(await f.store.read({ reference: primary.reference }));
    const versions = success(await f.store.history({ reference: primary.reference }));
    const target = await seed(f, f.reference("personal/document"), "original\n");
    const git = makeGitExec(f.root);
    const intact = await entriesAt(f.root, ref);
    const tip = (await git("git", ["rev-parse", ref])).stdout.trim();
    const metadata = `${root}metadata-${uid}.json`;
    const broken = await plantRef(f.root, ref, damage === "removed" ? intact.filter(({ path }) => path !== metadata)
      : intact.map((entry): PlantTreeEntry => entry.path === metadata ? { path: entry.path, content: "not metadata\n" } : entry), { parents: [tip] });
    const unavailable = { status: "refused", refusal: { code: "namespace-corrupt", namespace: ref } };
    const write = update(f, archived, f.content(primary.reference, "valid"));
    const observed = { writes: [mutationOf(update(f, target, "accepted\n"))], provenance: testProvenance,
      observations: [{ reference: primary.reference, expected: { version: archived.version, conflicts: [] } }] };
    expect(await f.store.read({ reference: primary.reference })).toMatchObject(unavailable);
    expect(await f.store.history({ reference: primary.reference })).toMatchObject(unavailable);
    expect(await f.store.write(write)).toMatchObject(unavailable);
    expect(await f.store.batch(observed)).toMatchObject(unavailable);
    await plantRef(f.root, ref, intact, { parents: [broken.tip] });
    expect(success(await f.store.history({ reference: primary.reference }))).toEqual(versions);
    success(await f.store.batch(observed));
    const written = success(await f.store.write(write));
    expect(success(await f.store.read({ reference: primary.reference }))).toMatchObject({ content: write.content, version: written.version });
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
    const owner = primary.reference.owner;
    if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected stored work-item owner");
    expect((await f.ports.exec("git", ["log", "-1", "--format=%B", `refs/arc/archive/${quarter}`])).stdout)
      .toContain(`Arc-Owner: ${owner.uid}\n`);
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

  it("keeps an ended item's folder in place when a review record is written to it or resolves its conflict", async () => {
    const f = await createRefFixture();
    const base = await seed(f, f.reference("work-item/companion"), "base\n");
    const primary = success(await f.store.read({ reference: { ...base.reference, kind: "work-item/meta", key: undefined } }));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    const archived = success(await f.store.read({ reference: base.reference }));
    success(await f.store.write(update(f, archived, "current\n")));
    const conflict = success(await f.store.write(update(f, archived, "incoming\n"))).conflicts[0];
    if (!conflict) throw new Error("Expected a produced conflict");
    const review = (key: string) => RecordReferenceSchema.parse({ owner: base.reference.owner, kind: "review/evidence", key });
    success(await f.store.write({ action: "put", reference: review("first"), expected: null, content: f.content(review("first")), provenance: testProvenance }));
    success(await f.store.write({ action: "put", reference: review("second"), expected: null, content: f.content(review("second")),
      resolves: [conflict], provenance: testProvenance }));
    const folder = `01_${base.reference.owner.name}/`, git = makeGitExec(f.root);
    const paths = (await git("git", ["ls-tree", "-r", "--name-only", `refs/arc/archive/${quarter}`])).stdout.split("\n").filter(Boolean);
    expect(paths.filter((path) => !path.startsWith(folder) || path.startsWith(`${folder}review/metadata-`))).toEqual([]);
    expect(success(await f.store.read({ reference: primary.reference })).placement).toEqual({ kind: "completed", quarter, sequence: "01" });
    expect(success(await f.store.read({ reference: base.reference }))).toMatchObject({ content: "current\n", conflicts: [] });
    for (const key of ["first", "second"]) expect(success(await f.store.read({ reference: review(key) })).content).toBe(f.content(review(key)));
    expect(success(await f.store.list({ family: "work-item", kind: "work-item/meta" }))).toMatchObject({ status: "complete", records: [expect.anything()] });
  });

  it("reads, writes, logs, and reopens a twice-ended item by its later folder while its history names the earlier quarter", async () => {
    const f = await createRefFixture();
    const { primary, history, metadataPath, nextQuarter, firstRef, firstRoot, ref, nextRoot } = await endTwice(f, "another quarter", "reversed");
    const read = success(await f.store.read({ reference: primary.reference }));
    expect(read.placement).toMatchObject({ kind: "completed", quarter: nextQuarter });
    expect(success(await f.store.history({ reference: primary.reference }))[0]?.version).toBe(read.version);
    const written = success(await f.store.write(update(f, read)));
    const after = success(await f.store.read({ reference: primary.reference }));
    expect(after).toMatchObject({ version: written.version, content: f.content(primary.reference, "changed"), placement: { quarter: nextQuarter } });
    expect(success(await f.store.history({ reference: primary.reference }))[0]?.version).toBe(after.version);
    const git = makeGitExec(f.root);
    expect(JSON.parse((await git("git", ["show", `${history}:${metadataPath}`])).stdout)).toMatchObject({ primary: { placement: { kind: "completed", quarter: nextQuarter } } });
    for (const path of [`${firstRef}:${firstRoot}`, `${ref}:${nextRoot}`]) {
      expect((await git("git", ["show", `${path}meta-${primary.reference.owner.name}.md`])).stdout).toBe(after.content);
    }
    success(await f.store.write({ ...update(f, after, after.content), placement: { kind: "active" } }));
    expect(success(await f.store.read({ reference: primary.reference })).placement).toEqual({ kind: "active" });
  });

  it("reports a twice-ended item's change at the version its read returns while its history names the earlier quarter", async () => {
    const f = await createRefFixture();
    const { primary, from } = await endTwice(f, "another quarter", "reversed");
    const read = success(await f.store.read({ reference: primary.reference }));
    const changes = success(await f.store.changes({ from, to: await f.settle() }));
    expect(changes.filter(({ reference }) => sameOwner(reference.owner, primary.reference.owner)).map(({ version }) => version)).toEqual([read.version]);
  });

  it.each(["work-item/meta", "work-item/record", "cohort/document"] as const)("moves an ended %s written with another quarter into one folder there", async (kind) => {
    const f = await createRefFixture();
    const seeded = await seed(f, f.reference(kind));
    success(await f.store.write({ ...update(f, seeded), placement: { kind: "completed", quarter } }));
    const archived = success(await f.store.read({ reference: seeded.reference }));
    const content = f.content(archived.reference, "changed-again");
    const moved = success(await f.store.write({ ...update(f, archived, content), placement: { kind: "completed", quarter: later } }));
    const read = success(await f.store.read({ reference: seeded.reference }));
    expect(read).toMatchObject({ version: moved.version, content, placement: { kind: "completed", quarter: later } });
    const git = makeGitExec(f.root), name = seeded.reference.owner.name;
    const folders = async (at: string) => (await git("git", ["ls-tree", "--name-only", `refs/arc/archive/${at}`])).stdout.split("\n").filter((path) => path.includes(name));
    expect(await folders(quarter)).toEqual([]);
    expect(await folders(later)).toHaveLength(1);
    const listing = success(await f.store.list({ family: kind === "cohort/document" ? "cohort" : "work-item", kind }));
    if (listing.status !== "complete") throw new Error("Expected a complete listing");
    expect(listing.records.filter(({ reference }) => sameOwner(reference.owner, read.reference.owner))).toEqual([read]);
    expect(success(await f.store.history({ reference: seeded.reference }))[0]?.version).toBe(read.version);
    success(await f.store.write(update(f, read)));
  });

  it("archives a companion's same-batch clash into the folder and its archived read", async () => {
    const f = await createRefFixture();
    const base = await seed(f, f.reference("work-item/companion"), "base\n");
    success(await f.store.write(update(f, base, "current\n")));
    const primary = success(await f.store.read({ reference: { ...base.reference, kind: "work-item/meta", key: undefined } }));
    const result = success(await f.store.batch({ writes: [mutationOf(update(f, base, "incoming\n")),
      mutationOf({ ...update(f, primary), placement: { kind: "completed", quarter } })], provenance: testProvenance }));
    const conflict = result.writes[0]?.conflicts[0];
    if (!conflict) throw new Error("Expected a same-batch conflict");
    expect(success(await f.store.read({ reference: base.reference }))).toMatchObject({ content: "current\n", conflicts: [conflict],
      placement: { kind: "completed", quarter } });
    expect(JSON.parse(success(await f.store.read({ reference: conflict })).content)).toMatchObject({ baseVersion: base.version });
    const paths = (await makeGitExec(f.root)("git", ["ls-tree", "-r", "--name-only", `refs/arc/archive/${quarter}`])).stdout;
    expect(paths).toContain(`01_${base.reference.owner.name}/conflicts/`);
  });

  it("leaves an untouched quarter's tip in place when a reopen shares its batch with an identical rewrite there", async () => {
    const f = await createRefFixture();
    const reopening = await seed(f, f.reference("work-item/meta", "reopening"));
    const kept = await seed(f, f.reference("work-item/meta", "kept"));
    success(await f.store.write({ ...update(f, reopening), placement: { kind: "completed", quarter } }));
    success(await f.store.write({ ...update(f, kept), placement: { kind: "completed", quarter: later } }));
    const ended = success(await f.store.read({ reference: reopening.reference }));
    const unchanged = success(await f.store.read({ reference: kept.reference }));
    const git = makeGitExec(f.root), tips = async () => (await git("git", ["for-each-ref", "--format=%(objectname) %(refname)",
      `refs/arc/archive/${later}`, `refs/arc/history/work/${ownerUid(kept.reference)}`])).stdout;
    const before = await tips();
    success(await f.store.batch({ writes: [mutationOf({ ...update(f, ended), placement: { kind: "active" } }),
      mutationOf(update(f, unchanged, unchanged.content))], provenance: testProvenance }));
    expect(success(await f.store.read({ reference: reopening.reference })).placement).toEqual({ kind: "active" });
    expect(await tips()).toBe(before);
  });

  it("writes to an ended item whose folder metadata names no end batch, leaving it absent", async () => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference("work-item/meta"));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    const archive = `refs/arc/archive/${quarter}`, path = `01_${primary.reference.owner.name}/metadata-${ownerUid(primary.reference)}.json`;
    const git = makeGitExec(f.root), tip = (await git("git", ["rev-parse", archive])).stdout.trim();
    const metadata = JSON.parse((await git("git", ["show", `${archive}:${path}`])).stdout) as Record<string, unknown>;
    delete metadata.endBatch;
    await plantRef(f.root, archive, (await entriesAt(f.root, archive)).map((entry) => entry.path === path ? { path, content: canonicalize(metadata) } : entry), { parents: [tip] });
    const archived = success(await f.store.read({ reference: primary.reference }));
    const written = success(await f.store.write(update(f, archived, f.content(archived.reference, "changed-again"))));
    expect(success(await f.store.read({ reference: primary.reference })).version).toBe(written.version);
    expect(JSON.parse((await git("git", ["show", `${archive}:${path}`])).stdout)).not.toHaveProperty("endBatch");
  });

  it("refuses an ended item's history and write while its retained metadata names no slug, and serves both after repair", async () => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference("work-item/meta"));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    const archived = success(await f.store.read({ reference: primary.reference }));
    const history = `refs/arc/history/work/${ownerUid(primary.reference)}`, path = `metadata-${ownerUid(primary.reference)}.json`;
    const git = makeGitExec(f.root), tip = (await git("git", ["rev-parse", history])).stdout.trim();
    const metadata = JSON.parse((await git("git", ["show", `${history}:${path}`])).stdout) as Record<string, unknown>;
    delete metadata.slug;
    await plantRef(f.root, history, (await entriesAt(f.root, history)).map((entry) => entry.path === path ? { path, content: canonicalize(metadata) } : entry), { parents: [tip] });
    for (const result of [await f.store.history({ reference: primary.reference }), await f.store.write(update(f, archived))]) {
      expect(result).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", namespace: history } });
    }
    await git("git", ["update-ref", history, tip]);
    expect(success(await f.store.history({ reference: primary.reference }))).toHaveLength(2);
    success(await f.store.write(update(f, archived)));
  });

  it.each(["tree", "commit"] as const)("refuses an ended item's write and history while its retained history's tip %s is missing, naming restoration", async (damage) => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference("work-item/meta"));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    const archived = success(await f.store.read({ reference: primary.reference }));
    const history = `refs/arc/history/work/${ownerUid(primary.reference)}`, path = `metadata-${ownerUid(primary.reference)}.json`;
    const git = makeGitExec(f.root), tip = (await git("git", ["rev-parse", history])).stdout.trim();
    // A distinct metadata blob keeps the planted tree from being the folder's own subtree.
    const metadata = { ...JSON.parse((await git("git", ["show", `${history}:${path}`])).stdout) as Record<string, unknown>, batch: randomUUID() };
    const planted = await plantRef(f.root, history, (await entriesAt(f.root, history)).map((entry) => entry.path === path ? { path, content: canonicalize(metadata) } : entry), { parents: [tip] });
    const oid = damage === "tree" ? planted.tree : planted.tip;
    const object = (await f.ports.rawExec(["cat-file", damage, oid])).stdout;
    await removeLooseObject(f.root, oid);
    for (const result of [await f.store.write(update(f, archived)), await f.store.history({ reference: primary.reference })]) {
      expect(result).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", namespace: history,
        remedy: { text: expect.stringMatching(/restore|fetch/iu) } } });
    }
    expect(success(await f.store.read({ reference: primary.reference })).version).toBe(archived.version);
    await f.ports.rawExec(["hash-object", "-w", "-t", damage, "--stdin"], { input: object });
    success(await f.store.write(update(f, archived)));
  });

});

function ownerUid(reference: RecordReference): string {
  if (!("uid" in reference.owner) || !reference.owner.uid) throw new Error("Expected a resolved owner");
  return reference.owner.uid;
}

/**
 * End one item a second time, as another clone's published end leaves it: a later folder in the same or the next quarter.
 * A reversed history keeps naming the first end's quarter while the later folder names its own, as a history commit made
 * outside the store can leave it.
 */
async function endTwice(f: RefConformanceFixture, location: "same quarter" | "another quarter", order: "agreeing" | "reversed" = "agreeing") {
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
  const ended = { ...priorPrimary, placement: { kind: "completed", quarter: nextQuarter } };
  const batch = randomUUID(); metadata.endBatch = batch; metadata.batch = batch;
  const records = async (named: unknown) => (await entriesAt(f.root, history)).map((entry): PlantTreeEntry => entry.path === metadataPath
    ? { path: entry.path, content: canonicalize({ ...metadata, primary: named }) }
    : entry.path === `meta-${primary.reference.owner.name}.md` ? { path: entry.path, content: f.content(primary.reference, "changed-again") } : entry);
  const message = renderStoreCommitMessage({ ...testProvenance, verb: "archive" }, primary.reference, batch);
  const folder = await records(ended);
  const from = await f.settle();
  await plantRef(f.root, history, order === "reversed" ? await records(priorPrimary) : folder, { parents: [previous], message });
  const priorQuarter = location === "same quarter" ? (await git("git", ["rev-parse", ref])).stdout.trim() : undefined;
  await plantRef(f.root, ref, [...(location === "same quarter" ? await entriesAt(f.root, ref) : []),
    ...folder.map((entry) => ({ ...entry, path: nextRoot + entry.path }))], { parents: priorQuarter ? [priorQuarter] : [], message });
  return { primary, other, history, firstRef, firstRoot, firstEnd, metadataPath, nextQuarter, ref, nextRoot, batch, from };
}

async function entriesAt(root: string, ref: string): Promise<PlantTreeEntry[]> {
  const { stdout } = await makeGitExec(root)("git", ["ls-tree", "-r", "-z", ref]);
  return stdout.split("\0").filter(Boolean).map((row) => {
    const match = /^100644 blob ([0-9a-f]+)\t(.*)$/su.exec(row);
    if (!match?.[1] || !match[2]) throw new Error("The fixture expects regular record blobs");
    return { path: match[2], mode: "100644", oid: match[1] };
  });
}
