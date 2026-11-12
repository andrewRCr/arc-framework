/** An earlier batch's withdrawal preserves later sibling lifetimes and their exact registry authority. */
import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, RecordReferenceSchema, type RecordReference } from "../../src/lib/store/index.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { plantRef, removeLooseObject, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { success } from "../helpers/store/suite-tools.js";

const start = { verb: "start", lifecycleAction: "activate" };
const archive = { verb: "archive", lifecycleAction: "archive" };
const ownQuarter = ArchiveQuarterSchema.parse("2027-q1");
type End = "archive" | "retirement";
type Fault = "quarter" | "end-metadata" | "end-metadata-published";
type Scenario = { original: End; later: End; late: boolean; fault: Fault | null; cleared: boolean };
const scenarios = (["archive", "retirement"] as const).flatMap<Scenario>(original =>
  (["archive", "retirement"] as const).map(later => ({ original, later, late: false, fault: null, cleared: false })))
  .concat([{ original: "retirement", later: "retirement", late: true, fault: null, cleared: false },
    { original: "retirement", later: "archive", late: false, fault: "quarter", cleared: false },
    { original: "retirement", later: "archive", late: false, fault: "end-metadata", cleared: false },
    { original: "retirement", later: "archive", late: false, fault: "end-metadata-published", cleared: false },
    { original: "archive", later: "archive", late: false, fault: null, cleared: true }]);

async function siblingFixture(layout: "default" | "separate", original: End, cleared: boolean) {
  const h = await refSyncFixture(layout);
  const branches = [{ repository: "origin", ref: "refs/heads/sibling-work", linkedAs: "created" as const, excluded: [] }];
  for (const checkout of [h.a, h.b]) await checkout.exec("git", ["branch", "sibling-work", "HEAD"]);
  success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } }),
    content: '{"projectId":"34567890-1234-4234-8234-123456789abc"}', provenance: start }));
  const make = async (name: string) => success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
    content: makeMetaFixture(name, { owner: "andrew", ...name === "former-sibling" ? { branch: "sibling-work" } : {} }),
    ...name === "former-sibling" ? { links: { branches } } : {}, placement: { kind: "active" }, provenance: start }));
  const a = await make("subject"), before = await make("former-sibling"), c = await make("ordinary-sibling");
  const renameSource = success(await h.a.store.read({ reference: before.reference }));
  const renamed = RecordReferenceSchema.parse({ ...before.reference, owner: { ...before.reference.owner, name: "current-sibling" } });
  success(await h.a.store.write({ action: "put", reference: renamed, expected: renameSource.version,
    content: makeMetaFixture("current-sibling", { owner: "andrew", branch: "sibling-work" }), placement: { kind: "active" },
    provenance: { verb: "rename", lifecycleAction: "rename" } }));
  const b = success(await h.a.store.read({ reference: renamed }));
  const owner = b.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected sibling generation");
  const live = `refs/arc/work/${owner.uid}`, history = `refs/arc/history/work/${owner.uid}`;
  const lineage = RecordReferenceSchema.parse({ owner, kind: "lineage/transition" });
  const content = JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2,
    origin: { name: owner.name, uid: owner.uid }, kind: "abandon", successors: [], incoming: [], retiredBranches: branches }));
  const cOwner = c.reference.owner;
  if (cOwner.type !== "work-item" || !cOwner.uid) throw new Error("Expected ordinary sibling generation");
  const cLineage = RecordReferenceSchema.parse({ owner: cOwner, kind: "lineage/transition" });
  const cContent = JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2,
    origin: { name: cOwner.name, uid: cOwner.uid }, kind: "abandon", successors: [], incoming: [] }));
  if (cleared) success(await h.a.store.write({ action: "put", reference: lineage, expected: null, content,
    provenance: { verb: "save", lifecycleAction: "save" } }));
  const priorLineage = cleared ? success(await h.a.store.read({ reference: lineage })) : null;
  success(await h.a.store.push()); success(await h.b.store.pull());
  const tree = (await h.a.git(["rev-parse", `${live}^{tree}`])).stdout.trim();
  const currentA = success(await h.a.store.read({ reference: a.reference }));
  const currentC = success(await h.a.store.read({ reference: c.reference }));
  success(await h.a.store.batch({ writes: [
    { action: "put", reference: currentA.reference, expected: currentA.version, content: currentA.content,
      placement: { kind: "completed", quarter: ownQuarter } },
    ...original === "archive" ? [{ action: "put" as const, reference: b.reference, expected: b.version,
      content: b.content, placement: { kind: "completed" as const, quarter: ownQuarter } }]
      : [{ action: "put" as const, reference: lineage, expected: null, content },
        { action: "remove" as const, reference: b.reference, expected: b.version }],
    ...priorLineage ? [{ action: "remove" as const, reference: lineage, expected: priorLineage.version }] : [],
    { action: "put", reference: cLineage, expected: null, content: cContent },
    { action: "remove", reference: currentC.reference, expected: currentC.version },
  ], provenance: archive }));
  if (original === "archive") {
    const closed = success(await h.a.store.read({ reference: b.reference }));
    success(await h.a.store.write({ action: "put", reference: closed.reference, expected: closed.version,
      content: closed.content, placement: { kind: "active" }, provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
  } else {
    const parent = (await h.a.git(["rev-parse", history])).stdout.trim();
    const restored = (await h.a.git(["-c", "user.name=Repair", "-c", "user.email=repair@example.test", "commit-tree", tree,
      "-p", parent, "-m", "Restore authentic sibling tree"])).stdout.trim();
    await h.a.ports.exec("git", [...h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [], "update-ref", "--stdin"],
      { input: `start\ncreate ${live} ${restored}\ndelete ${history} ${parent}\nprepare\ncommit\n` });
  }
  return { ...h, subject: a, sibling: b, ordinary: c, owner, uid: owner.uid, lineage, content, cLineage, live, history };
}

it.each((["default", "separate"] as const).flatMap(layout => scenarios.map(scenario => ({ layout, ...scenario }))))(
  "keeps a later $later after original $original withdrawal in $layout (late: $late, fault: $fault, cleared: $cleared)",
  async ({ layout, original, later, late, fault, cleared }) => {
    const h = await siblingFixture(layout, original, cleared);
    const current = success(await h.a.store.read({ reference: h.sibling.reference }));
    const quarter = original === "archive" ? ownQuarter : ArchiveQuarterSchema.parse("2028-q2");
    if (later === "archive") {
      success(await h.a.store.write({ action: "put", reference: current.reference, expected: current.version,
        content: current.content, placement: { kind: "completed", quarter }, provenance: archive }));
    } else {
      success(await h.a.store.batch({ writes: [
        ...original === "archive" ? [{ action: "put" as const, reference: h.lineage, expected: null, content: h.content }] : [],
        { action: "remove", reference: current.reference, expected: current.version },
      ], provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
    }
    const laterEnd = (await h.a.git(["rev-parse", h.history])).stdout.trim();
    if (later === "archive") success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ owner: h.owner, kind: "work-item/companion", key: "after-end" }),
      content: "Written after the end.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
    if (late) {
      const remote = success(await h.b.store.read({ reference: h.sibling.reference }));
      const peerLineage = JSON.parse(h.content) as Record<string, unknown>;
      delete peerLineage.retiredBranches;
      const competing = JSON.stringify(LineageRecordSchema.parse(peerLineage));
      success(await h.b.store.batch({ writes: [
        { action: "put", reference: h.lineage, expected: null, content: competing },
        { action: "put", reference: remote.reference, expected: remote.version, content: `${remote.content}\nLate edit.\n`, placement: { kind: "active" } },
        { action: "put", reference: RecordReferenceSchema.parse({ owner: h.owner, kind: "work-item/companion", key: "late-only" }),
          expected: null, content: "Retained late bytes.\n" },
      ], provenance: { verb: "save", lifecycleAction: "save" } }));
      success(await h.b.store.push()); success(await h.a.store.pull());
    }
    const registry = "refs/arc/project/registry";
    const metadata = async () => JSON.parse((await h.a.git(["show", `${registry}:metadata-registry.json`])).stdout) as {
      formats: Record<string, number>; lineage?: Record<string, string>; lineageFormerSlugs?: Record<string, string[]> };
    const beforeMetadata = await metadata(), beforeLineage = await h.a.store.read({ reference: h.lineage });
    const conflictReferences = beforeLineage.status === "ok" ? beforeLineage.result.conflicts : [];
    const beforeFormats = ownedFormats(beforeMetadata.formats, h.uid, conflictReferences);
    expect(Object.keys(beforeFormats)).toHaveLength((beforeLineage.status === "ok" ? 1 : 0) + conflictReferences.length);
    const conflictBytes = new Map<string, string>();
    if (beforeLineage.status === "ok") for (const reference of beforeLineage.result.conflicts) {
      conflictBytes.set(JSON.stringify(reference), success(await h.a.store.read({ reference })).content);
    }
    if (late) {
      expect(conflictBytes.size).toBeGreaterThan(0);
      expect((await h.a.git(["ls-tree", "-r", "--name-only", h.history])).stdout).toContain("conflicts/");
    }
    const tree = (await h.a.git(["rev-parse", `${h.history}^{tree}`])).stdout;
    const peerA = success(await h.b.store.read({ reference: h.subject.reference }));
    success(await h.b.store.write({ action: "put", reference: peerA.reference, expected: peerA.version,
      content: peerA.content, placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: archive }));
    success(await h.b.store.push());
    if (fault === "end-metadata-published") await publishSiblingEnd(h, laterEnd);
    if (fault) {
      const object = (await h.a.git(["rev-parse", fault === "quarter" ? `refs/arc/archive/${quarter}^{tree}`
        : `${laterEnd}:metadata-${h.uid}.json`])).stdout.trim();
      const type = fault === "quarter" ? "tree" : "blob", scope = h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [];
      const bytes = (await h.a.ports.rawExec([...scope, "cat-file", type, object], { objectAccess: "local-only" })).stdout;
      const affected = async () => (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)",
        h.history, h.live, `refs/arc/archive/${ownQuarter}`,
        ...fault === "end-metadata-published" ? [expandStoredPath(h.subject.reference).ref,
          expandStoredPath(h.subject.reference, { history: true }).ref, registry, `refs/arc/archive/${quarter}`] : []])).stdout;
      let before = await affected(), damaged = false;
      const racing = createRefStore({ ...h.a.ports, lock: async (ref, wait) => {
        const release = await h.a.ports.lock(ref, wait);
        if (!damaged && ref === `refs/arc/archive/${ownQuarter}`) {
          if (fault === "end-metadata-published") before = await affected();
          damaged = true; await removeLooseObject(h.a.root, object, h.a.gitDir);
        }
        return release;
      } });
      try {
        const notices = success(await racing.pull()).pulls.flatMap(({ notices }) => notices);
        expect(damaged).toBe(true);
        if (fault === "end-metadata-published") {
          expect(notices).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: h.history,
            condition: expect.stringContaining(laterEnd), remedy: { text: expect.stringMatching(/restore|fetch/iu) } }));
          for (const notice of notices) if (notice.kind === "namespace-corrupt") expect(notice.remedy.text).not.toMatch(/forward/iu);
        }
        expect(notices.some(({ kind }) => kind === "namespace-corrupt")).toBe(true);
        expect(notices.some(({ kind }) => kind === "end-withdrawn")).toBe(false);
        expect(await affected()).toBe(before);
      } finally {
        const restored = await h.a.ports.rawExec([...scope, "hash-object", "-t", type, "-w", "--stdin"], { input: bytes, objectAccess: "local-only" });
        expect(Buffer.from(restored.stdout).toString().trim()).toBe(object);
      }
    }
    const pulled = success(await h.a.store.pull());
    expect(pulled.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: h.subject.reference.owner }));
    expect((await h.a.git(["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe("");
    expect((await h.a.git(["rev-parse", `${h.history}^{tree}`])).stdout).toBe(tree);
    const afterLineage = await h.a.store.read({ reference: h.lineage });
    expect(afterLineage).toEqual(beforeLineage);
    const afterMetadata = await metadata();
    expect(afterMetadata.lineage?.[h.uid]).toBe(beforeMetadata.lineage?.[h.uid]);
    expect(afterMetadata.lineageFormerSlugs?.[h.uid]).toEqual(beforeMetadata.lineageFormerSlugs?.[h.uid]);
    expect(ownedFormats(afterMetadata.formats, h.uid, conflictReferences)).toEqual(beforeFormats);
    for (const [key, content] of conflictBytes) {
      const reference = RecordReferenceSchema.parse(JSON.parse(key));
      expect(success(await h.a.store.read({ reference })).content).toBe(content);
    }
    expect(success(await h.a.store.read({ reference: h.ordinary.reference })).placement).toMatchObject({ kind: "active" });
    expect(await h.a.store.read({ reference: h.cLineage })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    if (later === "archive") expect(success(await h.a.store.read({ reference: h.sibling.reference })).placement).toMatchObject({ kind: "completed", quarter });
    else expect(await h.a.store.read({ reference: h.sibling.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const pushed = success(await h.a.store.push());
    expect(pushed.publishes.every(({ status }) => ["pushed", "noop", "reconciled"].includes(status)), JSON.stringify(pushed)).toBe(true);
    success(await h.b.store.pull());
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe("");
    expect((await h.b.git(["rev-parse", `${h.history}^{tree}`])).stdout).toBe(tree);
    const peerLineage = await h.b.store.read({ reference: h.lineage });
    if (beforeLineage.status === "ok") expect(success(peerLineage).content).toBe(beforeLineage.result.content);
    else expect(peerLineage).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }, 60_000);

it.each(["default", "separate"] as const)("holds an undecodable later lineage conflict and retries its repair in %s", async layout => {
  const h = await siblingFixture(layout, "retirement", false);
  const current = success(await h.a.store.read({ reference: h.sibling.reference }));
  success(await h.a.store.write({ action: "remove", reference: current.reference, expected: current.version,
    provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
  const remote = success(await h.b.store.read({ reference: h.sibling.reference }));
  const competing = JSON.parse(h.content) as Record<string, unknown>;
  delete competing.retiredBranches;
  success(await h.b.store.batch({ writes: [
    { action: "put", reference: h.lineage, expected: null, content: JSON.stringify(LineageRecordSchema.parse(competing)) },
    { action: "put", reference: remote.reference, expected: remote.version, content: `${remote.content}\nLate edit.\n`, placement: { kind: "active" } },
  ], provenance: { verb: "save", lifecycleAction: "save" } }));
  success(await h.b.store.push()); success(await h.a.store.pull());
  const lineage = success(await h.a.store.read({ reference: h.lineage })), conflict = lineage.conflicts[0];
  if (!conflict) throw new Error("Expected a natively generated lineage conflict");
  const healthy = success(await h.a.store.read({ reference: conflict })).content, home = expandStoredPath(conflict);
  const healthyOid = (await h.a.git(["rev-parse", `${home.ref}:${home.path}`])).stdout.trim();
  const subject = success(await h.b.store.read({ reference: h.subject.reference }));
  success(await h.b.store.write({ action: "put", reference: subject.reference, expected: subject.version, content: subject.content,
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: archive }));
  success(await h.b.store.push());
  const parent = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
  await plantRef(h.a.root, home.ref, (await capturedEntries(h.a, home.ref)).map(entry => entry.path === home.path
    ? { path: entry.path, content: new Uint8Array([0xc3, 0x28]) } : entry), { parents: [parent], gitDir: h.a.gitDir });
  const before = (await h.a.git(["rev-parse", `${h.history}^{tree}`])).stdout.trim();
  const held = success(await h.a.store.pull()).pulls.flatMap(outcome => outcome.notices);
  expect(held).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: home.ref,
    condition: expect.stringContaining("lineage conflict"), remedy: { text: expect.stringMatching(/repair.*forward|new commit/iu) } }));
  expect(held).not.toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: h.subject.reference.owner }));
  expect((await h.a.git(["rev-parse", `${h.history}^{tree}`])).stdout.trim()).toBe(before);
  const retained = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
  await plantRef(h.a.root, home.ref, (await capturedEntries(h.a, home.ref)).map(entry => entry.path === home.path
    ? { path: entry.path, oid: healthyOid, mode: "100644" as const } : entry), { parents: [retained], gitDir: h.a.gitDir });
  const repaired = success(await h.a.store.pull());
  expect(repaired.pulls.flatMap(outcome => outcome.notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: h.subject.reference.owner }));
  expect(success(await h.a.store.read({ reference: conflict })).content).toBe(healthy);
  expect((await h.a.git(["rev-parse", `${h.history}^{tree}`])).stdout.trim()).toBe(before);
}, 60_000);

it.each(["default", "separate"] as const)("keeps a decoded origin disagreement's original restore remedy in %s", async layout => {
  const h = await siblingFixture(layout, "archive", false);
  const current = success(await h.a.store.read({ reference: h.sibling.reference }));
  success(await h.a.store.batch({ writes: [
    { action: "put", reference: h.lineage, expected: null, content: h.content },
    { action: "remove", reference: current.reference, expected: current.version },
  ], provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
  const home = expandStoredPath(h.lineage), original = success(await h.a.store.read({ reference: h.lineage })).content;
  const healthyOid = (await h.a.git(["rev-parse", `${home.ref}:${home.path}`])).stdout.trim();
  const foreign = "00000000-0000-4000-8000-000000000999";
  expect(foreign).not.toBe(h.uid);
  const wrong = JSON.stringify(LineageRecordSchema.parse({ ...JSON.parse(original) as object,
    origin: { name: h.owner.name, uid: foreign } }));
  const subject = success(await h.b.store.read({ reference: h.subject.reference }));
  success(await h.b.store.write({ action: "put", reference: subject.reference, expected: subject.version, content: subject.content,
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: archive }));
  success(await h.b.store.push());
  const parent = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
  await plantRef(h.a.root, home.ref, (await capturedEntries(h.a, home.ref)).map(entry => entry.path === home.path
    ? { path: entry.path, content: wrong } : entry), { parents: [parent], gitDir: h.a.gitDir });
  const held = success(await h.a.store.pull()).pulls.flatMap(outcome => outcome.notices);
  expect(held).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: home.ref,
    condition: "The terminal owner's retained lineage cannot be decoded.", remedy: { text: expect.stringMatching(/restore|fetch/iu) } }));
  for (const notice of held) if (notice.kind === "namespace-corrupt") expect(notice.remedy.text).not.toMatch(/forward/iu);
  expect(held).not.toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: h.subject.reference.owner }));
  const retained = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
  await plantRef(h.a.root, home.ref, (await capturedEntries(h.a, home.ref)).map(entry => entry.path === home.path
    ? { path: entry.path, oid: healthyOid, mode: "100644" as const } : entry), { parents: [retained], gitDir: h.a.gitDir });
  expect(success(await h.a.store.pull()).pulls.flatMap(outcome => outcome.notices))
    .toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: h.subject.reference.owner }));
  expect(success(await h.a.store.read({ reference: h.lineage })).content).toBe(original);
}, 60_000);

async function publishSiblingEnd(h: Awaited<ReturnType<typeof siblingFixture>>, end: string) {
  const archived = success(await h.a.store.read({ reference: h.sibling.reference }));
  if (archived.placement?.kind !== "completed") throw new Error("Expected the later archived sibling");
  const home = expandStoredPath(archived.reference, { placement: archived.placement });
  const entries = await capturedEntries(h.a, home.ref);
  expect(entries.length).toBeGreaterThan(0);
  expect(entries.every(entry => entry.path.startsWith(home.root))).toBe(true);
  const endMetadata = (await h.a.git(["rev-parse", `${end}:metadata-${h.uid}.json`])).stdout.trim();
  expect((await h.a.git(["rev-parse", `${h.history}:metadata-${h.uid}.json`])).stdout.trim()).not.toBe(endMetadata);
  expect((await h.a.git(["rev-parse", `${home.ref}:${home.metadataPath}`])).stdout.trim()).not.toBe(endMetadata);
  const endBatch = /^Arc-Batch: (.+)$/mu.exec((await h.a.git(["show", "-s", "--format=%B", end])).stdout)?.[1];
  expect(endBatch).toBeDefined();
  expect(JSON.parse((await h.a.git(["show", `${home.ref}:${home.metadataPath}`])).stdout)).toMatchObject({ endBatch });
  const subjectHistory = expandStoredPath(h.subject.reference, { history: true }).ref;
  const originalBatch = /^Arc-Batch: (.+)$/mu.exec((await h.a.git(["show", "-s", "--format=%B", subjectHistory])).stdout)?.[1];
  if (!originalBatch) throw new Error("Expected original subject end batch");
  expect((await h.remote("git", ["log", "--format=%B", subjectHistory])).stdout).not.toContain(`Arc-Batch: ${originalBatch}`);
  await h.a.git(["push", "--atomic", h.remoteName, `${home.ref}:${home.ref}`, `${h.history}:${h.history}`, `:${h.live}`]);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe("");
  expect((await h.remote("git", ["show", `${home.ref}:${home.metadataPath}`])).stdout)
    .toBe((await h.a.git(["show", `${home.ref}:${home.metadataPath}`])).stdout);
  return home;
}

async function cloneSiblingHistory(h: Awaited<ReturnType<typeof siblingFixture>>, tip: string,
  entries: readonly PlantTreeEntry[], parents?: readonly string[]) {
  const message = (await h.a.git(["show", "-s", "--format=%B", tip])).stdout;
  const originalParents = parents ?? (await h.a.git(["show", "-s", "--format=%P", tip])).stdout.trim().split(" ").filter(Boolean);
  return plantRef(h.a.root, h.history, entries, { parents: originalParents, message, gitDir: h.a.gitDir });
}

it.each((["default", "separate"] as const).flatMap(layout => (["unparseable", "no-metadata", "slugless"] as const)
  .flatMap(fault => [false, true].map(descendant => ({ layout, fault, descendant })))))(
"holds $fault sibling end metadata with historical repair in $layout (descendant: $descendant)", async ({ layout, fault, descendant }) => {
  const h = await siblingFixture(layout, "retirement", false);
  const sibling = success(await h.a.store.read({ reference: h.sibling.reference }));
  const quarter = ArchiveQuarterSchema.parse("2028-q2");
  success(await h.a.store.write({ action: "put", reference: sibling.reference, expected: sibling.version, content: sibling.content,
    placement: { kind: "completed", quarter }, provenance: archive }));
  const end = (await h.a.git(["rev-parse", h.history])).stdout.trim(), path = `metadata-${h.uid}.json`;
  if (descendant) success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ owner: h.owner, kind: "work-item/companion", key: "after-end" }),
    content: "Healthy current tip after the original end.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  const healthy = (await h.a.git(["rev-parse", h.history])).stdout.trim();
  const healthyEntries = await capturedEntries(h.a, healthy), endEntries = await capturedEntries(h.a, end);
  const originalMetadata = JSON.parse((await h.a.git(["show", `${end}:${path}`])).stdout) as { slug?: string };
  delete originalMetadata.slug;
  const invalid = fault === "slugless" ? Buffer.from(JSON.stringify(originalMetadata)) : Buffer.from([0xc3, 0x28]);
  const broken = await cloneSiblingHistory(h, end, fault === "no-metadata" ? endEntries.filter(entry => entry.path !== path)
    : endEntries.map(entry => entry.path === path ? { path, content: invalid } : entry));
  if (descendant) await cloneSiblingHistory(h, healthy, healthyEntries, [broken.tip]);
  const heldTip = (await h.a.git(["rev-parse", h.history])).stdout.trim();
  const subject = success(await h.b.store.read({ reference: h.subject.reference }));
  success(await h.b.store.write({ action: "put", reference: subject.reference, expected: subject.version, content: subject.content,
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: archive }));
  expect(success(await h.b.store.push()).publishes.every(outcome => outcome.status !== "failed")).toBe(true);
  const subjectHistory = expandStoredPath(h.subject.reference, { history: true }).ref;
  const subjectTip = (await h.a.git(["rev-parse", subjectHistory])).stdout.trim();
  const assertHeld = (notices: import("../../src/lib/store/sync.js").PullNotice[]) => {
    expect(notices).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: h.history,
      condition: expect.stringMatching(/metadata/iu), remedy: { text: expect.stringMatching(/^Restore original missing historical objects/iu) } }));
    expect(notices).not.toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
    for (const notice of notices) if (notice.kind === "namespace-corrupt" && notice.ref === h.history) {
      expect(notice.remedy.text).toMatch(/^Restore original missing historical objects/iu);
    }
  };
  assertHeld(success(await h.a.store.pull()).pulls.flatMap(outcome => outcome.notices));
  expect((await h.a.git(["rev-parse", h.history])).stdout.trim()).toBe(heldTip);
  expect((await h.a.git(["rev-parse", subjectHistory])).stdout.trim()).toBe(subjectTip);
  const forward = await plantRef(h.a.root, h.history, healthyEntries, { parents: [heldTip],
    message: "Repair current metadata without replacing the original end", gitDir: h.a.gitDir });
  assertHeld(success(await h.a.store.pull()).pulls.flatMap(outcome => outcome.notices));
  expect((await h.a.git(["rev-parse", subjectHistory])).stdout.trim()).toBe(subjectTip);
  // Replace only this unpublished contribution with its actual readable saved history.
  await h.a.git(["update-ref", h.history, healthy, forward.tip]);
  expect(success(await h.a.store.pull()).pulls.flatMap(outcome => outcome.notices))
    .toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: h.subject.reference.owner }));
  expect((await h.a.git(["rev-parse", `${h.history}^{tree}`])).stdout.trim())
    .toBe((await h.a.git(["rev-parse", `${healthy}^{tree}`])).stdout.trim());
  expect(success(await h.a.store.read({ reference: h.sibling.reference })).placement).toMatchObject({ kind: "completed", quarter });
  const retained = await capturedEntries(h.a, broken.tip);
  if (fault === "no-metadata") expect(retained.some(entry => entry.path === path)).toBe(false);
  else {
    const oid = broken.blobs.get(path);
    if (!oid) throw new Error("Expected the original malformed metadata blob");
    const scope = h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [];
    expect(Buffer.from((await h.a.ports.rawExec([...scope, "cat-file", "blob", oid])).stdout)).toEqual(invalid);
  }
}, 90_000);

async function reconstructSiblingDescendants(h: Awaited<ReturnType<typeof siblingFixture>>, tip: string, original: string, replacement: string) {
  const descendants = (await h.a.git(["rev-list", "--first-parent", `${original}..${tip}`])).stdout.trim().split("\n").filter(Boolean).reverse();
  let prior = original, current = replacement;
  for (const descendant of descendants) {
    const parents = (await h.a.git(["show", "-s", "--format=%P", descendant])).stdout.trim().split(" ").filter(Boolean);
    expect(parents[0]).toBe(prior);
    parents[0] = current;
    current = (await cloneSiblingHistory(h, descendant, await capturedEntries(h.a, descendant), parents)).tip;
    prior = descendant;
  }
  return current;
}

it.each((["default", "separate"] as const).flatMap(layout => (["archive", "retirement"] as const).map(later => ({ layout, later }))))(
  "ignores another batch's malformed metadata while preserving a later $later in $layout", async ({ layout, later }) => {
    const h = await siblingFixture(layout, "retirement", false);
    const sibling = success(await h.a.store.read({ reference: h.sibling.reference })), quarter = ArchiveQuarterSchema.parse("2028-q2");
    if (later === "archive") success(await h.a.store.write({ action: "put", reference: sibling.reference, expected: sibling.version,
      content: sibling.content, placement: { kind: "completed", quarter }, provenance: archive }));
    const reference = RecordReferenceSchema.parse({ owner: h.owner, kind: "work-item/companion", key: "intermediate" });
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "First surrounding write.\n",
      provenance: { verb: "save", lifecycleAction: "save" } }));
    const intermediateRef = later === "archive" ? h.history : h.live;
    const intermediate = (await h.a.git(["rev-parse", intermediateRef])).stdout.trim();
    if (later === "archive") success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ owner: h.owner, kind: "work-item/companion", key: "after-intermediate" }),
      content: "Healthy later tip.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
    else success(await h.a.store.write({ action: "remove", reference: sibling.reference, expected: sibling.version,
      provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
    const healthy = (await h.a.git(["rev-parse", h.history])).stdout.trim();
    const tree = (await h.a.git(["rev-parse", `${healthy}^{tree}`])).stdout.trim(), path = `metadata-${h.uid}.json`;
    const intermediateBatch = /^Arc-Batch: (.+)$/mu.exec((await h.a.git(["show", "-s", "--format=%B", intermediate])).stdout)?.[1];
    const endBatch = later === "archive"
      ? (JSON.parse((await h.a.git(["show", `${healthy}:${path}`])).stdout) as { endBatch: string }).endBatch
      : /^Arc-Batch: (.+)$/mu.exec((await h.a.git(["show", "-s", "--format=%B", healthy])).stdout)?.[1];
    expect(intermediateBatch).toBeDefined(); expect(endBatch).toBeDefined(); expect(intermediateBatch).not.toBe(endBatch);
    const broken = await cloneSiblingHistory(h, intermediate, (await capturedEntries(h.a, intermediate)).map(entry =>
      entry.path === path ? { path, content: new Uint8Array([0xc3, 0x28]) } : entry));
    await reconstructSiblingDescendants(h, healthy, intermediate, broken.tip);
    const subject = success(await h.b.store.read({ reference: h.subject.reference }));
    success(await h.b.store.write({ action: "put", reference: subject.reference, expected: subject.version, content: subject.content,
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: archive }));
    expect(success(await h.b.store.push()).publishes.every(outcome => outcome.status !== "failed")).toBe(true);
    const notices = success(await h.a.store.pull()).pulls.flatMap(outcome => outcome.notices);
    expect(notices).toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: h.subject.reference.owner }));
    expect(notices).not.toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: h.history }));
    expect((await h.a.git(["rev-parse", `${h.history}^{tree}`])).stdout.trim()).toBe(tree);
    if (later === "archive") expect(success(await h.a.store.read({ reference: h.sibling.reference })).placement)
      .toMatchObject({ kind: "completed", quarter });
    else expect(await h.a.store.read({ reference: h.sibling.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }, 90_000);

it.each(["default", "separate"] as const)("keeps a misplaced sibling folder's placement remedy through withdrawal in %s", async layout => {
  const h = await siblingFixture(layout, "retirement", false), quarter = ArchiveQuarterSchema.parse("2028-q2");
  const sibling = success(await h.a.store.read({ reference: h.sibling.reference }));
  success(await h.a.store.write({ action: "put", reference: sibling.reference, expected: sibling.version, content: sibling.content,
    placement: { kind: "completed", quarter }, provenance: archive }));
  const end = (await h.a.git(["rev-parse", h.history])).stdout.trim();
  success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ owner: h.owner, kind: "work-item/companion", key: "after-end" }),
    content: "Current placement is independent of the original end metadata.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  const subject = success(await h.b.store.read({ reference: h.subject.reference }));
  success(await h.b.store.write({ action: "put", reference: subject.reference, expected: subject.version, content: subject.content,
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: archive }));
  expect(success(await h.b.store.push()).publishes.every(outcome => outcome.status !== "failed")).toBe(true);
  const home = await publishSiblingEnd(h, end), original = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
  const entries = await capturedEntries(h.a, home.ref);
  const metadata = JSON.parse((await h.a.git(["show", `${home.ref}:${home.metadataPath}`])).stdout) as { primary: { placement: unknown } };
  metadata.primary.placement = { kind: "active" };
  const broken = await plantRef(h.a.root, home.ref, entries.map(entry => entry.path === home.metadataPath
    ? { path: entry.path, content: JSON.stringify(metadata) } : entry), { parents: [original], gitDir: h.a.gitDir,
    message: `External placement defect\n\nArc-Actor: ${h.a.carry().actor}\n` });
  const subjectHistory = expandStoredPath(h.subject.reference, { history: true }).ref;
  const beforeSubject = (await h.a.git(["rev-parse", subjectHistory])).stdout.trim();
  const beforeSibling = (await h.a.git(["rev-parse", h.history])).stdout.trim();
  const notices = success(await h.a.store.pull()).pulls.flatMap(outcome => outcome.notices);
  expect(notices).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: subjectHistory,
    condition: expect.stringMatching(/^The archive folder .* placement is active, not completed\.$/u),
    remedy: { text: expect.stringMatching(/^Record the folder's completed placement.*new commit/iu) } }));
  expect(notices).not.toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
  for (const notice of notices) if (notice.kind === "namespace-corrupt" && notice.condition.includes("placement is active, not completed")) {
    expect(notice.remedy.text).toMatch(/^Record the folder's completed placement.*new commit/iu);
  }
  expect((await h.a.git(["rev-parse", subjectHistory])).stdout.trim()).toBe(beforeSubject);
  expect((await h.a.git(["rev-parse", h.history])).stdout.trim()).toBe(beforeSibling);
  const current = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
  expect(current).toBe(broken.tip);
  await plantRef(h.a.root, home.ref, entries, { parents: [current], gitDir: h.a.gitDir, message: "Repair the current sibling placement" });
  expect(success(await h.a.store.pull()).pulls.flatMap(outcome => outcome.notices))
    .toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: h.subject.reference.owner }));
  expect(success(await h.a.store.read({ reference: h.sibling.reference })).placement).toMatchObject({ kind: "completed", quarter });
}, 90_000);

const lineageAuthorityCases = [
  { ended: "terminal", fault: "unparseable" }, { ended: "archived", fault: "unparseable" },
  { ended: "archived", fault: "origin-mismatch" },
] as const;

it.each((["default", "separate"] as const).flatMap(layout => lineageAuthorityCases.map(scenario => ({ layout, ...scenario }))))(
  "holds $fault current lineage in $layout ($ended sibling) and retries its repair", async ({ layout, ended, fault }) => {
    const h = await siblingFixture(layout, "retirement", false), sibling = success(await h.a.store.read({ reference: h.sibling.reference }));
    if (ended === "terminal") success(await h.a.store.write({ action: "remove", reference: sibling.reference, expected: sibling.version,
      provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
    else success(await h.a.store.write({ action: "put", reference: sibling.reference, expected: sibling.version, content: sibling.content,
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2028-q2") }, provenance: archive }));
    const healthy = success(await h.a.store.read({ reference: h.lineage })).content, home = expandStoredPath(h.lineage);
    const oid = (await h.a.git(["rev-parse", `${home.ref}:${home.path}`])).stdout.trim();
    const tree = (await h.a.git(["rev-parse", `${h.history}^{tree}`])).stdout.trim();
    const subject = success(await h.b.store.read({ reference: h.subject.reference }));
    success(await h.b.store.write({ action: "put", reference: subject.reference, expected: subject.version, content: subject.content,
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: archive }));
    expect(success(await h.b.store.push()).publishes.every(outcome => outcome.status !== "failed")).toBe(true);
    const foreign = "00000000-0000-4000-8000-000000000999";
    expect(foreign).not.toBe(h.uid);
    const invalid = fault === "unparseable" ? Buffer.from([0xc3, 0x28]) : Buffer.from(JSON.stringify(LineageRecordSchema.parse({
      ...JSON.parse(healthy) as object, origin: { name: h.owner.name, uid: foreign },
    })));
    const parent = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
    const broken = await plantRef(h.a.root, home.ref, (await capturedEntries(h.a, home.ref)).map(entry => entry.path === home.path
      ? { path: entry.path, content: invalid } : entry), { parents: [parent], gitDir: h.a.gitDir });
    const condition = ended === "terminal" ? "The terminal owner's retained lineage cannot be decoded."
      : "The protected sibling's current lineage cannot be decoded.";
    const remedy = fault === "unparseable" ? /^Repair .*new commit/iu : /^Restore or fetch/iu;
    const notices = success(await h.a.store.pull()).pulls.flatMap(outcome => outcome.notices);
    expect(notices).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: home.ref, condition,
      remedy: { text: expect.stringMatching(remedy) } }));
    for (const notice of notices) if (notice.kind === "namespace-corrupt" && notice.condition === condition) {
      expect(notice.remedy.text).toMatch(remedy);
    }
    expect(notices).not.toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: h.subject.reference.owner }));
    expect((await h.a.git(["rev-parse", `${h.history}^{tree}`])).stdout.trim()).toBe(tree);
    const retained = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
    await plantRef(h.a.root, home.ref, (await capturedEntries(h.a, home.ref)).map(entry => entry.path === home.path
      ? { path: entry.path, oid, mode: "100644" as const } : entry), { parents: [retained], gitDir: h.a.gitDir });
    expect(success(await h.a.store.pull()).pulls.flatMap(outcome => outcome.notices))
      .toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: h.subject.reference.owner }));
    expect(success(await h.a.store.read({ reference: h.lineage })).content).toBe(healthy);
    expect((await h.a.git(["rev-parse", `${h.history}^{tree}`])).stdout.trim()).toBe(tree);
    const damaged = broken.blobs.get(home.path);
    if (!damaged) throw new Error("Expected the original damaged lineage payload");
    const scope = h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [];
    expect(Buffer.from((await h.a.ports.rawExec([...scope, "cat-file", "blob", damaged])).stdout)).toEqual(invalid);
  }, 90_000);

function ownedFormats(formats: Record<string, number>, uid: string, conflicts: readonly RecordReference[]): Record<string, number> {
  return Object.fromEntries(Object.entries(formats).filter(([key]) => {
    const coordinate = JSON.parse(key) as { ownerUid?: string; kind?: string; key?: unknown };
    return coordinate.ownerUid === uid || conflicts.some(reference => reference.kind === coordinate.kind
      && reference.key === coordinate.key);
  }));
}
