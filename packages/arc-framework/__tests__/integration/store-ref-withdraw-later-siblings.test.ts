/** An earlier batch's withdrawal preserves later sibling lifetimes and their exact registry authority. */
import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, RecordReferenceSchema, type RecordReference } from "../../src/lib/store/index.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";

const start = { verb: "start", lifecycleAction: "activate" };
const archive = { verb: "archive", lifecycleAction: "archive" };
const ownQuarter = ArchiveQuarterSchema.parse("2027-q1");
type End = "archive" | "retirement";
type Fault = "quarter" | "end-metadata";
type Scenario = { original: End; later: End; late: boolean; fault: Fault | null; cleared: boolean };
const scenarios = (["archive", "retirement"] as const).flatMap<Scenario>(original =>
  (["archive", "retirement"] as const).map(later => ({ original, later, late: false, fault: null, cleared: false })))
  .concat([{ original: "retirement", later: "retirement", late: true, fault: null, cleared: false },
    { original: "retirement", later: "archive", late: false, fault: "quarter", cleared: false },
    { original: "retirement", later: "archive", late: false, fault: "end-metadata", cleared: false },
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
    if (fault) {
      const object = (await h.a.git(["rev-parse", fault === "quarter" ? `refs/arc/archive/${quarter}^{tree}`
        : `${laterEnd}:metadata-${h.uid}.json`])).stdout.trim();
      const type = fault === "quarter" ? "tree" : "blob", scope = h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [];
      const bytes = (await h.a.ports.rawExec([...scope, "cat-file", type, object], { objectAccess: "local-only" })).stdout;
      const affected = async () => (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)",
        h.history, h.live, `refs/arc/archive/${ownQuarter}`])).stdout;
      const before = await affected(); let damaged = false;
      const racing = createRefStore({ ...h.a.ports, lock: async (ref, wait) => {
        const release = await h.a.ports.lock(ref, wait);
        if (!damaged && ref === `refs/arc/archive/${ownQuarter}`) {
          damaged = true; await removeLooseObject(h.a.root, object, h.a.gitDir);
        }
        return release;
      } });
      try {
        const notices = success(await racing.pull()).pulls.flatMap(({ notices }) => notices);
        expect(damaged).toBe(true);
        expect(notices.some(({ kind }) => kind === "namespace-corrupt")).toBe(true);
        expect(notices.some(({ kind }) => kind === "end-withdrawn")).toBe(false);
        expect(await affected()).toBe(before);
      } finally {
        await h.a.ports.rawExec([...scope, "hash-object", "-t", type, "-w", "--stdin"], { input: bytes, objectAccess: "local-only" });
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

function ownedFormats(formats: Record<string, number>, uid: string, conflicts: readonly RecordReference[]): Record<string, number> {
  return Object.fromEntries(Object.entries(formats).filter(([key]) => {
    const coordinate = JSON.parse(key) as { ownerUid?: string; kind?: string; key?: unknown };
    return coordinate.ownerUid === uid || conflicts.some(reference => reference.kind === coordinate.kind
      && reference.key === coordinate.key);
  }));
}
