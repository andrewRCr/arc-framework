import { expect, it } from "vitest";
import { RecordReferenceSchema, HistoryRefSchema } from "../../src/lib/store/index.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
const provenance = { verb: "edit", lifecycleAction: "save" };
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
it.each((["default", "separate"] as const).flatMap(layout => [false, true].map(withHistory => ({ layout, withHistory }))))("counter changes history=$withHistory in $layout", async ({ layout, withHistory }) => {
  const h = await refSyncFixture(layout), made = await make(h.a, "old-origin");
  success(await h.a.store.push());
  await abandon(h.a, made.reference); success(await h.a.store.push());
  success(await h.b.store.pull());
  expect((await h.b.git(["for-each-ref", "--format=%(refname)", "refs/arc/history/"])).stdout).toBe("");
  if (withHistory) success(await h.b.store.pull({ history: [HistoryRefSchema.parse(made.live.replace("refs/arc/", "refs/arc/history/"))] }));
  const from = success(await h.b.store.version());
  const counter = RecordReferenceSchema.parse({ kind: "project-registry/counter", key: "triage", owner: { type: "project", name: "project" } });
  success(await h.b.store.write({ action: "put", reference: counter, expected: null, content: "{\"next\":1}", provenance }));
  const result = await h.b.store.changes({ from, to: success(await h.b.store.version()) });
  expect(result, JSON.stringify(result)).toMatchObject({ status: "ok" });
  expect(success(result).map(entry => entry.reference.kind)).toEqual(["project-registry/counter"]);
}, 90000);
