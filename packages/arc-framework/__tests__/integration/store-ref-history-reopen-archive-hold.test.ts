import { expect, it } from "vitest";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
const provenance = { verb: "edit", lifecycleAction: "save" };
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
const independent = RecordReferenceSchema.parse({ kind: "project-inbox/inbox", owner: { type: "project", name: "project" } });
type Side = Awaited<ReturnType<typeof refSyncFixture>>["a"];
async function make(side: Side, name: string) {
  const made = success(await side.store.write({ action: "put", expected: null, content: makeMetaFixture(name),
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
    placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
  if (!("uid" in made.reference.owner) || !made.reference.owner.uid) throw Error("Missing UID");
  return { reference: made.reference, live: `refs/arc/work/${made.reference.owner.uid}` };
}
async function abandon(side: Side, reference: ReturnType<typeof RecordReferenceSchema.parse>) {
  if (!("uid" in reference.owner)) throw Error("Missing UID");
  const current = success(await side.store.read({ reference }));
  success(await side.store.batch({ writes: [
    { action: "put", expected: null, reference: RecordReferenceSchema.parse({ kind: "lineage/transition", owner: reference.owner }),
      content: JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: reference.owner.name, uid: reference.owner.uid }, kind: "abandon", successors: [], incoming: [] })) },
    { action: "remove", reference, expected: current.version },
  ], provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
}
it.each((["default", "separate"] as const).flatMap(layout => [false, true].map(damaged => ({ layout, damaged }))))("history-only archive damaged=$damaged in $layout", async ({ layout, damaged }) => {
  const h = await refSyncFixture(layout), made = await make(h.a, "held-history");
  success(await h.a.store.push());
  let read = success(await h.a.store.read({ reference: made.reference }));
  const archive = "refs/arc/archive/2026-q4";
  success(await h.a.store.write({ action: "put", reference: read.reference, expected: read.version, content: read.content,
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
  const rows = (await h.a.git(["ls-tree", "-r", "--format=%(objectname) %(path)", archive])).stdout.trim().split("\n");
  const entries: PlantTreeEntry[] = rows.map(row => { const at = row.indexOf(" "); return { oid: row.slice(0,at), path: row.slice(at+1), mode: "100644" }; });
  read = success(await h.a.store.read({ reference: made.reference }));
  success(await h.a.store.write({ action: "put", reference: read.reference, expected: read.version, content: read.content,
    placement: { kind: "active" }, provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const original = (await h.a.git(["rev-parse", made.live])).stdout.trim();
  await abandon(h.a, made.reference); success(await h.a.store.push()); success(await h.b.store.pull());
  const history = made.live.replace("refs/arc/", "refs/arc/history/");
  const kept = (await h.b.git(["rev-parse", history])).stdout.trim();
  expect((await h.b.git(["for-each-ref", "--format=%(refname)", made.live])).stdout).toBe("");
  success(await h.a.store.write({ action: "put", reference: independent, expected: null, content: "Independent\n", provenance }));
  success(await h.a.store.push());
  const parent = (await h.a.git(["rev-parse", archive])).stdout.trim();
  await plantRef(h.a.root, archive, entries.map(entry => damaged && entry.path.includes("metadata-") ? { path: entry.path, content: "{ broken" } : entry), { parents: [parent], gitDir: h.a.gitDir });
  await h.a.git(["push", "--atomic", h.remoteName, `${archive}:${archive}`, `${original}:${made.live}`]);
  const pulled = success(await h.b.store.pull());
  expect(success(await h.b.store.read({ reference: independent })).content).toBe("Independent\n");
  const coordinates = (await h.b.git(["for-each-ref", "--format=%(refname) %(objectname)", made.live, history])).stdout;
  if (damaged) expect(pulled.pulls.flatMap(row => row.notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: made.live }));
  expect(coordinates).not.toContain(made.live);
  expect(coordinates).toContain(damaged ? `${history} ${kept}` : history);
  if (damaged) {
    const damagedTip = (await h.a.git(["rev-parse", archive])).stdout.trim();
    await plantRef(h.a.root, archive, entries, { parents: [damagedTip], gitDir: h.a.gitDir });
    await h.a.git(["push", h.remoteName, `${archive}:${archive}`]);
    const repaired = success(await h.b.store.pull());
    expect(repaired.pulls.flatMap(row => row.notices).filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", made.live])).stdout).toBe("");
    await h.b.git(["merge-base", "--is-ancestor", kept, history]);
    expect(success(await h.b.store.read({ reference: independent })).content).toBe("Independent\n");
  }
}, 90000);
