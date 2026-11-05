/** Two native clones sharing one completed item and its retained history. */

import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { HistoryRefSchema, RecordReferenceSchema } from "../../../src/lib/store/index.js";
import { makeMetaFixture } from "../meta-fixture.js";
import { refSyncFixture } from "./ref-sync.js";
import { success } from "./suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4");

/** Publish one real completion to both clones, retaining each clone's ordinary synchronization state. */
export async function completedSyncFixture(layout: "default" | "separate") {
  const h = await refSyncFixture(layout);
  const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("completed-sync"),
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "completed-sync" } }),
    placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const before = success(await h.a.store.read({ reference: made.reference }));
  success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version,
    content: before.content, placement: { kind: "completed", quarter }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  if (!("uid" in made.reference.owner)) throw new Error("The item needs a UID");
  const history = HistoryRefSchema.parse(`refs/arc/history/work/${made.reference.owner.uid}`), archive = `refs/arc/archive/${quarter}`;
  const metadataPath = `metadata-${made.reference.owner.uid}.json`, folder = "01_completed-sync/";
  return { ...h, reference: made.reference, history, archive, metadataPath, folder };
}
