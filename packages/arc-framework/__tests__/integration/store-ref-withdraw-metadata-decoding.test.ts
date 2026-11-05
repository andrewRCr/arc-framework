/** Malformed withdrawal metadata holds its original snapshot without replacing immutable evidence. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, createKindRegistry, RecordReferenceSchema, type RecordReference } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { refSyncFixture, type RefSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const ownQuarter = ArchiveQuarterSchema.parse("2027-q1"), remoteQuarter = ArchiveQuarterSchema.parse("2026-q4");
const provenance = { verb: "archive", lifecycleAction: "archive" };
const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
const badBytes = "{not metadata";
type Source = "ancestor" | "before" | "after" | "current" | "published";
type Consumer = "structural" | "entry" | "record";

async function start(h: RefSyncFixture, name: string) {
  return success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name }, kind: "work-item/meta" }),
    content: makeMetaFixture(name), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
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
    return path === home.metadataPath && options.content !== undefined ? { path, content: options.content } : { path, oid, mode };
  });
  const parents = options.parents ?? (options.external ? [tip] : (await side.git(["show", "-s", "--format=%P", tip])).stdout.trim().split(" ").filter(Boolean));
  const message = options.external ? `External metadata repair or capture\n\nArc-Actor: ${side.carry().actor}\n`
    : (await side.git(["show", "-s", "--format=%B", tip])).stdout;
  return plantRef(side.root, home.ref, entries, { parents, message, gitDir: side.gitDir });
}

function document(text: string): string {
  return `# Entries\n\n## Errand\n\n### **Concern**\n\n- _Id:_ \`11111111\`\n\n${text}\n`;
}

async function basis(layout: "default" | "separate", source: Source, consumer: Consumer) {
  const h = await refSyncFixture(layout);
  success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } }),
    content: '{"projectId":"34567890-1234-4234-8234-123456789abc"}', provenance: { verb: "save", lifecycleAction: "save" } }));
  const made = await start(h, "metadata-end"), neighbor = await start(h, "metadata-neighbor");
  const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" },
    ...consumer === "entry" ? { kind: "personal/inbox" } : { kind: "personal/document", key: consumer === "record" ? "aaa-main.md" : "zzz-main.md" } });
  const content = (text: string) => consumer === "entry" ? document(text) : `${text}\n`;
  const home = expandStoredPath(reference, { registry }), common = content("Common."), before = content("Before end.");
  const after = content("End contribution."), published = content("Published.");
  success(await h.a.store.write({ action: "put", reference, expected: null, content: common, provenance }));
  const commonTip = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
  success(await h.a.store.push()); success(await h.b.store.pull());
  const prior = success(await h.a.store.read({ reference }));
  success(await h.a.store.write({ action: "put", reference, expected: prior.version, content: before, provenance: { verb: "capture", lifecycleAction: "capture" } }));
  const beforeTip = (await h.a.git(["rev-parse", home.ref])).stdout.trim(), primary = success(await h.a.store.read({ reference: made.reference }));
  success(await h.a.store.batch({ writes: [
    { action: "put", reference: primary.reference, expected: primary.version, content: primary.content, placement: { kind: "completed", quarter: ownQuarter } },
    { action: "put", reference, expected: success(await h.a.store.read({ reference })).version, content: after },
    { action: "put", reference: RecordReferenceSchema.parse({ owner: reference.owner, kind: "personal/document", key: "zzz-end-extra.md" }), expected: null, content: "End-only format coordinate.\n" },
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
    const end = await rewrite(h.a, reference, { tip: b.afterTip, parents: [before.tip] });
    await h.b.git(["fetch", "--no-write-fetch-head", h.a.gitDir ?? h.a.root, ancestor.tip]);
    const common = await rewrite(h.b, reference, { tip: b.publishedTip, parents: [ancestor.tip, b.publishedTip], external: true });
    await rewrite(h.b, reference, { tip: b.publishedTip, parents: [common.tip] });
    await h.a.git(["fetch", "--no-write-fetch-head", h.b.gitDir ?? h.b.root, common.tip]);
    await rewrite(h.a, reference, { tip: end.tip, parents: [end.tip, common.tip], external: true });
    return { bad: ancestor, tip: ancestor.tip };
  }
  if (source === "before") {
    const before = await rewrite(h.a, reference, { tip: b.beforeTip, content: badBytes });
    await rewrite(h.a, reference, { tip: b.afterTip, parents: [before.tip] });
    return { bad: before, tip: before.tip };
  }
  const side = source === "published" ? h.b : h.a;
  const changed = await rewrite(side, reference, { content: badBytes, external: source === "current" || source === "published" });
  if (source === "after") await rewrite(h.a, reference, { content: (await h.a.git(["show", `${b.afterTip}:${b.home.metadataPath}`])).stdout, external: true });
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
    await rewrite(source === "current" ? h.a : h.b, reference, { content: (await (source === "current" ? h.a : h.b).git(["show", `${source === "current" ? b.afterTip : b.publishedTip}:${home.metadataPath}`])).stdout, external: true });
    success(await h.b.store.push());
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
  const common = await rewrite(h.a, reference, { tip: b.commonTip, content: (await h.a.git(["show", `${b.commonTip}:${home.metadataPath}`])).stdout, parents: [damagedTip], external: true });
  await h.b.git(["fetch", "--no-write-fetch-head", h.a.gitDir ?? h.a.root, common.tip]);
  const remote = (await h.b.git(["rev-parse", home.ref])).stdout.trim();
  await rewrite(h.b, reference, { tip: b.publishedTip, content: (await h.b.git(["show", `${b.publishedTip}:${home.metadataPath}`])).stdout, parents: [remote, common.tip], external: true });
  success(await h.b.store.push());
  const before = await rewrite(h.a, reference, { tip: b.beforeTip, parents: [common.tip] });
  await rewrite(h.a, reference, { tip: b.afterTip, parents: [before.tip] });
}

describe.each((["default", "separate"] as const).flatMap(layout =>
  (["structural", "entry", "record"] as const).map(consumer => ({ layout, consumer }))))("withdrawal $consumer metadata decoding in $layout", ({ layout, consumer }) => {
  it.each(consumer === "record" ? ["current", "published"] as const : ["ancestor", "before", "after", "current", "published"] as const)("holds malformed %s metadata atomically and retries from readable evidence", async source => {
    const b = await basis(layout, source, consumer), { h, home } = b;
    const beforeMetadata = (await h.a.git(["rev-parse", `${b.beforeTip}:${home.metadataPath}`])).stdout.trim();
    const afterMetadata = (await h.a.git(["rev-parse", `${b.afterTip}:${home.metadataPath}`])).stdout.trim();
    expect(beforeMetadata).not.toBe(afterMetadata);
    expect(success(await h.b.store.push()).publishes.every(outcome => outcome.status !== "failed")).toBe(true);
    const damaged = await damage(b, source), badOid = damaged.bad.blobs.get(home.metadataPath);
    if (!badOid) throw new Error("Expected malformed metadata");
    if (source === "published" || source === "ancestor") await h.b.git(["push", h.remoteName, `${home.ref}:${home.ref}`]);
    const observing = observeWithdrawal(b), history = (await h.a.git(["rev-parse", observing.history])).stdout;
    expect((await h.remote("git", ["rev-parse", observing.history])).stdout).not.toBe(history);
    const historical = source !== "current" && source !== "published";
    const assertHeld = (notices: import("../../src/lib/store/sync.js").PullNotice[]) => {
      expect(notices).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: home.ref,
        condition: `The metadata object for ${home.ref} cannot be parsed.`,
        remedy: { text: expect.stringMatching(historical ? /ancestor|historical|immutable/iu : /^Repair .* forward:/iu) } }));
      for (const notice of notices) if (notice.kind === "namespace-corrupt" && notice.ref === home.ref) {
        expect(notice.remedy.text).toMatch(historical ? /ancestor|historical|immutable/iu : /^Repair .* forward:/iu);
      }
      expect(notices).not.toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
    };
    const notices = success(await observing.store.pull()).pulls.flatMap(outcome => outcome.notices);
    assertHeld(notices);
    expect((await h.a.git(["rev-parse", observing.history])).stdout).toBe(history);
    expect(success(await h.a.store.read({ reference: b.neighbor.reference })).placement).toMatchObject({ kind: "backlog", commitment: "planned" });
    expect(observing.snapshots.length, JSON.stringify(notices)).toBeGreaterThan(0);
    for (const snapshot of observing.snapshots) {
      expect(snapshot.afterRefs).toBe(snapshot.refs);
      expect(snapshot.afterObjects).toBe(snapshot.objects);
    }
    if (historical) {
      await rewrite(h.a, b.reference, { content: (await h.a.git(["show", `${b.afterTip}:${home.metadataPath}`])).stdout, external: true });
      assertHeld(success(await h.a.store.pull()).pulls.flatMap(outcome => outcome.notices));
    }
    await continueReadableHistory(b, source, damaged.tip);
    expect(success(await h.a.store.pull()).pulls.flatMap(outcome => outcome.notices))
      .toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: b.made.reference.owner }));
    expect(success(await h.a.store.read({ reference: b.made.reference })).placement).toMatchObject({ kind: "completed", quarter: remoteQuarter });
    const scope = h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [];
    expect(Buffer.from((await h.a.ports.rawExec([...scope, "cat-file", "blob", badOid])).stdout).toString()).toBe(badBytes);
    expect(success(await h.a.store.read({ reference: b.reference })).content).toBeTruthy();
  }, 90_000);
});

it.each(["default", "separate"] as const)("holds malformed original metadata before restoring a metadata-free contribution in %s", async layout => {
  const b = await basis(layout, "before", "structural"), { h, home } = b;
  expect(success(await h.b.store.push()).publishes.every(outcome => outcome.status !== "failed")).toBe(true);
  await h.remote("git", ["update-ref", "-d", home.ref, b.publishedTip]);
  const bad = await rewrite(h.a, b.reference, { tip: b.beforeTip, content: badBytes });
  const message = (await h.a.git(["show", "-s", "--format=%B", b.afterTip])).stdout;
  const end = await plantRef(h.a.root, home.ref, [], { parents: [bad.tip], message, gitDir: h.a.gitDir });
  expect((await h.a.git(["ls-tree", "-r", end.tip])).stdout).toBe("");
  const observing = observeWithdrawal(b), history = (await h.a.git(["rev-parse", observing.history])).stdout;
  const notices = success(await observing.store.pull()).pulls.flatMap(outcome => outcome.notices);
  expect(notices).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: home.ref,
    condition: `The metadata object for ${home.ref} cannot be parsed.`,
    remedy: { text: expect.stringMatching(/ancestor|historical|immutable/iu) } }));
  expect(notices).not.toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
  expect((await h.a.git(["rev-parse", home.ref])).stdout.trim()).toBe(end.tip);
  expect((await h.a.git(["rev-parse", observing.history])).stdout).toBe(history);
  expect(observing.snapshots.length).toBeGreaterThan(0);
  for (const snapshot of observing.snapshots) {
    expect(snapshot.afterRefs).toBe(snapshot.refs);
    expect(snapshot.afterObjects).toBe(snapshot.objects);
  }
  // Reconstruct only the unpublished contribution over its actual readable saved parent.
  await plantRef(h.a.root, home.ref, [], { parents: [b.beforeTip], message, gitDir: h.a.gitDir });
  expect(success(await h.a.store.pull()).pulls.flatMap(outcome => outcome.notices))
    .toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: b.made.reference.owner }));
  expect(success(await h.a.store.read({ reference: b.reference })).content).toBe(b.before);
  const scope = h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [];
  const oid = bad.blobs.get(home.metadataPath);
  if (!oid) throw new Error("Expected retained malformed original metadata");
  expect(Buffer.from((await h.a.ports.rawExec([...scope, "cat-file", "blob", oid])).stdout).toString()).toBe(badBytes);
}, 90_000);
