/** Malformed stored UTF-8 holds the withdrawal without replacing immutable evidence. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, createKindRegistry, RecordReferenceSchema, type RecordReference } from "../../src/lib/store/index.js";
import { ConflictRecordSchema } from "../../src/lib/store/conflict.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { refSyncFixture, type RefSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const ownQuarter = ArchiveQuarterSchema.parse("2027-q1"), remoteQuarter = ArchiveQuarterSchema.parse("2026-q4");
const provenance = { verb: "archive", lifecycleAction: "archive" };
const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
const badBytes = Uint8Array.from([0xc3, 0x28]);
type Source = "ancestor" | "before" | "after" | "current" | "published";

async function start(h: RefSyncFixture, name: string) {
  return success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name }, kind: "work-item/meta" }),
    content: makeMetaFixture(name), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
}

function document(memory: boolean, text: string): string {
  const header = memory ? "## Memories\n\n**Concern:**\n_Remove when:_ `resolved`" : "## Errand\n\n### **Concern**";
  return `# Entries\n\n${header}\n\n- _Id:_ \`11111111\`\n\n${text}\n`;
}

/** Clone a genuine tree/receipt, optionally changing one blob or its explicit ancestry. */
async function rewrite(side: RefSyncFixture["a"], reference: RecordReference, options: {
  tip?: string; content?: string | Uint8Array; parents?: string[]; external?: boolean;
} = {}) {
  const home = expandStoredPath(reference, { registry }), tip = options.tip ?? (await side.git(["rev-parse", home.ref])).stdout.trim();
  const rows = (await side.git(["ls-tree", "-r", "-z", tip])).stdout.split("\0").filter(Boolean);
  const entries: PlantTreeEntry[] = rows.map(row => {
    const [header = "", path = ""] = row.split("\t"), [mode, , oid = ""] = header.split(" ");
    if (mode !== "100644" && mode !== "100755" && mode !== "120000" && mode !== "160000") throw new Error(`Unexpected fixture mode ${mode}`);
    return path === home.path && options.content !== undefined ? { path, content: options.content } : { path, oid, mode };
  });
  const parents = options.parents ?? (options.external ? [tip] : (await side.git(["show", "-s", "--format=%P", tip])).stdout.trim().split(" ").filter(Boolean));
  const message = options.external ? `External UTF-8 repair or capture\n\nArc-Actor: ${side.carry().actor}\n`
    : (await side.git(["show", "-s", "--format=%B", tip])).stdout;
  return plantRef(side.root, home.ref, entries, { parents, message, gitDir: side.gitDir });
}

async function basis(layout: "default" | "separate", source: Source) {
  const h = await refSyncFixture(layout), made = await start(h, "encoding-end"), neighbor = await start(h, "encoding-neighbor");
  const memory = source === "after" || source === "published";
  const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: memory ? "personal/working-memory" : "personal/inbox" });
  const home = expandStoredPath(reference, { registry }), common = document(memory, "Common."), before = document(memory, "Before end.");
  const after = document(memory, "End contribution."), published = document(memory, "Published.");
  success(await h.a.store.write({ action: "put", reference, expected: null, content: common, provenance }));
  const commonTip = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
  success(await h.a.store.push()); success(await h.b.store.pull());
  const prior = success(await h.a.store.read({ reference }));
  success(await h.a.store.write({ action: "put", reference, expected: prior.version, content: before, provenance: { verb: "capture", lifecycleAction: "capture" } }));
  const beforeTip = (await h.a.git(["rev-parse", home.ref])).stdout.trim(), primary = success(await h.a.store.read({ reference: made.reference }));
  success(await h.a.store.batch({ writes: [
    { action: "put", reference: primary.reference, expected: primary.version, content: primary.content, placement: { kind: "completed", quarter: ownQuarter } },
    { action: "put", reference, expected: success(await h.a.store.read({ reference })).version, content: after },
  ], provenance }));
  const afterTip = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
  const remote = success(await h.b.store.read({ reference: made.reference })), remoteEntry = success(await h.b.store.read({ reference }));
  success(await h.b.store.batch({ writes: [
    { action: "put", reference: remote.reference, expected: remote.version, content: remote.content, placement: { kind: "completed", quarter: remoteQuarter } },
    { action: "put", reference, expected: remoteEntry.version, content: source === "current" ? common : published },
  ], provenance }));
  const publishedTip = (await h.b.git(["rev-parse", home.ref])).stdout.trim();
  const other = success(await h.b.store.read({ reference: neighbor.reference }));
  success(await h.b.store.write({ action: "put", reference: other.reference, expected: other.version, content: other.content,
    placement: { kind: "backlog", commitment: "planned" }, provenance: { verb: "backlog", lifecycleAction: "backlog" } }));
  return { h, made, neighbor, reference, home, common, before, after, published, commonTip, beforeTip, afterTip, publishedTip };
}

type Basis = Awaited<ReturnType<typeof basis>>;
async function damage(b: Basis, source: Source) {
  const { h, reference } = b;
  if (source === "ancestor") {
    const ancestor = await rewrite(h.a, reference, { tip: b.commonTip, content: badBytes });
    const before = await rewrite(h.a, reference, { tip: b.beforeTip, parents: [ancestor.tip] });
    await rewrite(h.a, reference, { tip: b.afterTip, parents: [before.tip] });
    await h.b.git(["fetch", "--no-write-fetch-head", h.a.gitDir ?? h.a.root, ancestor.tip]);
    await rewrite(h.b, reference, { tip: b.publishedTip, parents: [ancestor.tip] });
    return { bad: ancestor, tip: ancestor.tip };
  }
  if (source === "before") {
    const before = await rewrite(h.a, reference, { tip: b.beforeTip, content: badBytes });
    await rewrite(h.a, reference, { tip: b.afterTip, parents: [before.tip] });
    return { bad: before, tip: before.tip };
  }
  const side = source === "published" ? h.b : h.a;
  const changed = await rewrite(side, reference, { content: badBytes, external: source === "current" || source === "published" });
  if (source === "after") await rewrite(h.a, reference, { content: b.after, external: true });
  return { bad: changed, tip: changed.tip };
}

async function stateRefs(side: RefSyncFixture["a"]): Promise<string> {
  return (await side.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout
    .split("\n").filter(row => !row.startsWith("refs/arc/tmp/")).join("\n");
}

function observeWithdrawal(b: Basis) {
  const owner = b.made.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected a minted owner");
  const live = `refs/arc/work/${owner.uid}`, history = live.replace("refs/arc/", "refs/arc/history/");
  const required = [live, history, `refs/arc/archive/${ownQuarter}`, "refs/arc/project/registry", b.home.ref], locked = new Set<string>();
  const snapshots: { refs: string; objects: string; afterRefs: string; afterObjects: string }[] = [];
  const store = createRefStore({ ...b.h.a.ports, lock: async (ref, wait) => {
    const release = await b.h.a.ports.lock(ref, wait);
    locked.add(ref);
    const complete = required.every(candidate => locked.has(candidate));
    const refs = complete ? await stateRefs(b.h.a) : "", objects = complete ? (await b.h.a.git(["count-objects", "-v"])).stdout : "";
    return async () => {
      if (complete) snapshots.push({ refs, objects, afterRefs: await stateRefs(b.h.a), afterObjects: (await b.h.a.git(["count-objects", "-v"])).stdout });
      locked.delete(ref); await release();
    };
  } });
  return { store, snapshots, history };
}

async function continueReadableHistory(b: Basis, source: Source, damagedTip: string) {
  const { h, reference, home } = b;
  if (source === "current" || source === "published") {
    await rewrite(source === "current" ? h.a : h.b, reference, { content: source === "current" ? b.before : b.published, external: true });
    if (source === "published") success(await h.b.store.push());
    return;
  }
  if (source !== "ancestor") {
    // Explicit operator replacement of only an unpublished contribution, using the authentic saved batch.
    const held = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
    await h.a.git(["update-ref", home.ref, b.afterTip, held]);
    return;
  }
  // A forward edit alone cannot change a bad merge base. Establish a real readable common basis,
  // then explicitly reconstruct the unpublished contribution on it, preserving the genuine end receipt.
  const common = await rewrite(h.a, reference, { tip: b.commonTip, content: b.common, parents: [damagedTip], external: true });
  await h.b.git(["fetch", "--no-write-fetch-head", h.a.gitDir ?? h.a.root, common.tip]);
  const remote = (await h.b.git(["rev-parse", home.ref])).stdout.trim();
  await rewrite(h.b, reference, { tip: b.publishedTip, content: b.published, parents: [remote, common.tip], external: true });
  success(await h.b.store.push());
  const before = await rewrite(h.a, reference, { tip: b.beforeTip, parents: [common.tip] });
  await rewrite(h.a, reference, { tip: b.afterTip, parents: [before.tip] });
}

describe.each(["default", "separate"] as const)("withdrawal UTF-8 admission in %s", layout => {
  it.each(["ancestor", "before", "after", "current", "published"] as const)("holds malformed %s evidence atomically and continues from a genuinely readable basis", async source => {
    const b = await basis(layout, source), { h, reference, home } = b;
    const damaged = await damage(b, source), badOid = damaged.bad.blobs.get(home.path);
    if (!badOid) throw new Error("Expected the raw invalid UTF-8 blob");
    success(await h.b.store.push());
    const observing = observeWithdrawal(b), history = (await h.a.git(["rev-parse", observing.history])).stdout;
    const notices = success(await observing.store.pull()).pulls.flatMap(({ notices }) => notices);
    expect(notices).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: home.ref,
      condition: expect.stringMatching(new RegExp(`${source}.*UTF-8|UTF-8.*${source}`, "u")),
      remedy: { text: expect.stringMatching(source === "current" || source === "published" ? /forward/iu : /immutable|saved.*cannot/iu) } }));
    expect(notices).not.toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
    expect((await h.a.git(["rev-parse", observing.history])).stdout).toBe(history);
    expect(success(await h.a.store.read({ reference: b.neighbor.reference })).placement).toMatchObject({ kind: "backlog", commitment: "planned" });
    expect(observing.snapshots.length).toBeGreaterThan(0);
    for (const snapshot of observing.snapshots) {
      expect(snapshot.afterRefs).toBe(snapshot.refs);
      expect(snapshot.afterObjects).toBe(snapshot.objects);
    }
    if (source === "before" || source === "after" || source === "ancestor") {
      await rewrite(h.a, reference, { content: b.after, external: true });
      const heldAgain = success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices);
      expect(heldAgain).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: home.ref,
        remedy: { text: expect.stringMatching(/immutable|saved.*cannot/iu) } }));
      expect(heldAgain).not.toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
      expect((await h.a.git(["rev-parse", observing.history])).stdout).toBe(history);
    }
    await continueReadableHistory(b, source, damaged.tip);
    expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
    expect(success(await h.a.store.read({ reference: b.made.reference })).placement).toMatchObject({ kind: "completed", quarter: remoteQuarter });
    const record = success(await h.a.store.read({ reference }));
    expect(record.content).not.toContain("\ufffd");
    const conflicts = await Promise.all(record.conflicts.map(async reference => ConflictRecordSchema.parse(JSON.parse(success(await h.a.store.read({ reference })).content))));
    expect(JSON.stringify(conflicts)).not.toContain("\ufffd");
    const scope = h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [];
    expect((await h.a.ports.rawExec([...scope, "cat-file", "blob", badOid], { cwd: h.a.root, objectAccess: "local-only" })).stdout).toEqual(badBytes);
    success(await h.a.store.write({ action: "put", reference, expected: record.version, content: b.published, resolves: record.conflicts,
      provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
    expect(success(await h.a.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference })).content).toBe(b.published);
  });
});
