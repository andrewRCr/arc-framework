/** Completed role changes reconcile folder coordinates with their merged history and retained conflicts. */
import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { refSyncFixture, type RefSyncFixture } from "../helpers/store/ref-sync.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { HistoryRefSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { renderStoreCommitMessage } from "../../src/lib/store/commit-provenance.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), provenance = { verb: "save", lifecycleAction: "save" };
type Role = "work-item/meta" | "work-item/record";
const content = (role: Role, label: string): string => role === "work-item/meta"
  ? `${makeMetaFixture("role-sync")}\n${label}\n` : JSON.stringify({ body: label });

it.each((["default", "separate"] as const).flatMap(layout => (["work-item/record", "work-item/meta"] as const)
  .flatMap(previous => (["one", "two quarters"] as const).flatMap(ends => [false, true].map(competing => ({ layout, previous, ends, competing,
    next: previous === "work-item/record" ? "work-item/meta" as const : "work-item/record" as const }))))))(
  "reconciles $previous with published $next in $layout across $ends end (competing=$competing)", async ({ layout, previous, next, ends, competing }) => {
  const h = await refSyncFixture(layout);
  const made = success(await h.a.store.write({ action: "put", expected: null, provenance: { verb: "start", lifecycleAction: "activate" }, placement: { kind: "active" },
    reference: RecordReferenceSchema.parse({ kind: previous, owner: { type: "work-item", name: "role-sync" } }), content: content(previous, "Original body.") }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const current = success(await h.a.store.read({ reference: made.reference }));
  success(await h.a.store.write({ action: "put", reference: current.reference, expected: current.version, provenance,
    placement: { kind: "completed", quarter }, content: current.content }));
  const later = ArchiveQuarterSchema.parse("2027-q1"), quarters = ends === "one" ? [quarter] : [quarter, later];
  if (!("uid" in made.reference.owner) || !made.reference.owner.uid) throw new Error("The completed item has no UID");
  const history = HistoryRefSchema.parse(`refs/arc/history/work/${made.reference.owner.uid}`);
  if (ends === "two quarters") await retainAnotherEnd(h, made.reference, history, later);
  success(await h.a.store.push()); success(await h.b.store.pull());
  success(await h.a.store.pull({ history: [history] }));
  success(await h.b.store.pull({ history: [history] }));
  const left = success(await h.a.store.read({ reference: made.reference })), right = success(await h.b.store.read({ reference: made.reference }));
  if (left.placement?.kind !== "completed" || right.placement?.kind !== "completed") throw new Error("The competing writes need a completed item");
  const localContent = content(previous, "Unpublished local edit."), remoteContent = content(next, "Published replacement.");
  if (competing) success(await h.a.store.write({ action: "put", reference: left.reference, expected: left.version, provenance,
    placement: { kind: "completed", quarter: left.placement.quarter }, content: localContent }));
  const reference = RecordReferenceSchema.parse({ ...right.reference, kind: next });
  success(await h.b.store.write({ action: "put", reference, expected: right.version,
    provenance: { verb: "import", lifecycleAction: "import" }, placement: { kind: "completed", quarter: right.placement.quarter }, content: remoteContent }));
  const published = success(await h.b.store.read({ reference }));
  if (published.placement?.kind !== "completed") throw new Error("The replacement needs completed placement");
  // A later numbered publication makes reallocation differ from the already published primary's sequence.
  const peer = success(await h.b.store.write({ action: "put", expected: null, provenance: { verb: "start", lifecycleAction: "activate" }, placement: { kind: "active" },
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "numbered-peer" } }),
    content: makeMetaFixture("numbered-peer") }));
  const activePeer = success(await h.b.store.read({ reference: peer.reference }));
  success(await h.b.store.write({ action: "put", reference: activePeer.reference, expected: activePeer.version, provenance,
    content: activePeer.content, placement: { kind: "completed", quarter: published.placement.quarter } }));
  success(await h.b.store.push());
  if (!("uid" in reference.owner) || !reference.owner.uid) throw new Error("The completed item has no UID");
  const metadata = `metadata-${reference.owner.uid}.json`, archives = quarters.map(value => `refs/arc/archive/${value}`);
  const root = async (git: typeof h.a.git): Promise<string[]> => {
    const rows = await Promise.all(archives.map(archive => git(["ls-tree", "-r", "--name-only", archive])));
    return rows.flatMap(({ stdout }, i) => stdout.split("\n").filter(path => path.endsWith("/" + metadata))
      .map(path => `${archives[i]}:${path.slice(0, -metadata.length)}`)).sort();
  };
  const publishedRoots = await root(h.b.git);
  expect(publishedRoots).toHaveLength(quarters.length);
  const retainedEnds = async (git: typeof h.a.git): Promise<unknown[]> => Promise.all(publishedRoots.map(async coordinate => {
    const stored = JSON.parse((await git(["show", coordinate + metadata])).stdout) as { endBatch?: string };
    return stored.endBatch;
  }));
  const publishedEnds = await retainedEnds(h.b.git);
  expect(new Set(publishedEnds).size).toBe(quarters.length);
  // An unchanged local folder needs an explicit history pull; ordinary pulls acquire histories lazily.
  const pulled = success(await h.a.store.pull(competing ? undefined : { history: [history] }));
  expect(pulled.pulls.flatMap(pull => pull.notices).filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
  const reconciled = success(await h.a.store.read({ reference }));
  expect(reconciled).toMatchObject({ content: remoteContent, placement: published.placement });
  expect(await root(h.a.git)).toEqual(publishedRoots);
  expect(await retainedEnds(h.a.git)).toEqual(publishedEnds);
  expect(reconciled.conflicts).toHaveLength(competing ? 1 : 0);
  if (competing) expect(success(await h.a.store.read({ reference: reconciled.conflicts[0]! })).content).toContain("Unpublished local edit.");
  const listing = success(await h.a.store.list({ family: "work-item", kind: next }));
  expect(listing).toMatchObject({ status: "complete", diagnostics: [], records: expect.arrayContaining([expect.objectContaining({ reference })]) });
  expect(success(await h.a.store.history({ reference }))[0]).toMatchObject({ reference, content: remoteContent, version: reconciled.version });
  const before = (await h.a.git(["rev-parse", history, ...archives])).stdout;
  success(await h.a.store.pull());
  expect((await h.a.git(["rev-parse", history, ...archives])).stdout).toBe(before);
  const update = content(next, "Published replacement. A readable later write.");
  if (reconciled.placement?.kind !== "completed") throw new Error("The merged item must remain completed");
  success(await h.a.store.write({ action: "put", reference, expected: reconciled.version, provenance,
    placement: { kind: "completed", quarter: reconciled.placement.quarter }, content: update }));
  expect(success(await h.a.store.read({ reference })).content).toBe(update);
  success(await h.a.store.push()); success(await h.b.store.pull({ history: [history] }));
  const settled = success(await h.b.store.read({ reference }));
  expect(settled).toMatchObject({ content: update, placement: published.placement });
  expect(await root(h.b.git)).toEqual(publishedRoots);
  expect(await retainedEnds(h.b.git)).toEqual(publishedEnds);
}, 30_000);

async function retainAnotherEnd(h: RefSyncFixture, reference: ReturnType<typeof RecordReferenceSchema.parse>, history: string,
  later: ReturnType<typeof ArchiveQuarterSchema.parse>): Promise<void> {
  if (!("uid" in reference.owner) || !reference.owner.uid) throw new Error("The retained item has no UID");
  const metadataPath = `metadata-${reference.owner.uid}.json`, before = (await h.a.git(["rev-parse", history])).stdout.trim();
  const metadata = JSON.parse((await h.a.git(["show", `${history}:${metadataPath}`])).stdout) as Record<string, unknown>;
  const primary = metadata.primary;
  if (!primary || typeof primary !== "object" || Array.isArray(primary)) throw new Error("The retained primary is absent");
  const batch = randomUUID(), next = { ...metadata, batch, endBatch: batch, primary: { ...primary, placement: { kind: "completed", quarter: later } } };
  const tree = (await h.a.git(["ls-tree", "-r", "-z", history])).stdout.split("\0").filter(Boolean).map((row): PlantTreeEntry => {
    const match = /^100644 blob ([0-9a-f]+)\t(.*)$/su.exec(row);
    if (!match?.[1] || !match[2]) throw new Error("A retained end needs regular record blobs");
    return match[2] === metadataPath ? { path: match[2], content: canonicalize(next) } : { path: match[2], mode: "100644", oid: match[1] };
  });
  const root = reference.kind === "work-item/meta" ? "06_role-sync/" : `role-sync-${reference.owner.uid.slice(0, 8)}/`;
  const message = renderStoreCommitMessage({ verb: "archive", lifecycleAction: "archive" }, reference, batch);
  await plantRef(h.a.root, history, tree, { parents: [before], message, gitDir: h.a.gitDir });
  await plantRef(h.a.root, `refs/arc/archive/${later}`, tree.map(entry => ({ ...entry, path: root + entry.path })), { message, gitDir: h.a.gitDir });
  expect(success(await h.a.store.list({ family: "work-item", kind: reference.kind }))).toMatchObject({ status: "complete", diagnostics: [] });
  expect(success(await h.a.store.read({ reference })).placement).toMatchObject({ kind: "completed", quarter: later });
}
