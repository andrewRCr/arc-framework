/** Real sync-produced conflicts on lineage-ended work items. */
import { refSyncFixture } from "./ref-sync.js";
import { success } from "./suite-tools.js";
import { makeMetaFixture } from "../meta-fixture.js";
import { RecordReferenceSchema } from "../../../src/lib/store/index.js";
import { writeLineageRecord } from "../../../src/lib/store/kinds/lineage/index.js";

const provenance = { verb: "save", lifecycleAction: "save" };

export async function retainedConflictFixture(layout: "default" | "separate", kind: "abandon" | "decompose") {
  const h = await refSyncFixture(layout);
  const primary = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("retained"),
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "retained" } }),
    placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
  if (!primary.version) throw new Error("The primary write needs its nonnull version");
  const owner = primary.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected a minted work item");
  const companion = RecordReferenceSchema.parse({ owner, kind: "work-item/companion", key: "extra" });
  const review = RecordReferenceSchema.parse({ owner, kind: "review/evidence", key: "proof" });
  success(await h.a.store.batch({ writes: [
    { action: "put", reference: companion, expected: null, content: "Before retirement.\n" },
    { action: "put", reference: review, expected: null, content: '{"revision":1}' },
  ], provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const changed = await Promise.all([primary.reference, companion, review].map(async (reference) => {
    const before = success(await h.a.store.read({ reference }));
    return { action: "put" as const, reference, expected: before.version,
      content: reference.kind === "review/evidence" ? '{"revision":2}' : `${before.content}\nLate alternative.\n`,
      ...(reference.kind === "work-item/meta" ? { placement: { kind: "active" as const } } : {}) };
  }));
  success(await h.a.store.batch({ writes: changed, provenance }));
  const lineage = RecordReferenceSchema.parse({ owner, kind: "lineage/transition" });
  const child = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "successor" } });
  const content = writeLineageRecord({ schemaVersion: 2, origin: { name: owner.name, uid: owner.uid }, kind,
    successors: kind === "decompose" ? [{ name: child.owner.name }] : [], incoming: [], ...(kind === "decompose" ? { outgoing: [] } : {}) });
  success(await h.b.store.batch({ writes: [
    { action: "remove", reference: primary.reference, expected: primary.version },
    { action: "put", reference: lineage, expected: null, content },
    ...(kind === "decompose" ? [{ action: "put" as const, reference: child, expected: null,
      content: makeMetaFixture("successor"), placement: { kind: "backlog" as const, commitment: "provisional" as const } }] : []),
  ], provenance: { verb: kind, lifecycleAction: kind } }));
  success(await h.b.store.push());
  const pulled = success(await h.a.store.pull());
  const history = `refs/arc/history/work/${owner.uid}`;
  const paths = (await h.a.git(["ls-tree", "-r", "--name-only", history])).stdout.split("\n");
  const conflicts = paths.flatMap((path) => {
    const matched = /^(review\/)?conflicts\/([^/]+)\.json$/u.exec(path);
    return matched ? [RecordReferenceSchema.parse({ owner, kind: matched[1] ? "review/conflict-record" : "work-item/conflict-record", key: matched[2] })] : [];
  });
  return { ...h, primary: primary.reference, companion, review, lineage, child, history, conflicts, pulled, lineageContent: content };
}
