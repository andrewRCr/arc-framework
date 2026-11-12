/** Produce native abandonment records and branch evidence for remote-copy lifecycle cases. */
import { writeLineageRecord } from "../../../src/lib/store/kinds/lineage/index.js";
import { RecordReferenceSchema, type Store, type RecordReference } from "../../../src/lib/store/index.js";
import { switchFixture, provenance } from "./remote-move.js";
import { success } from "./suite-tools.js";

type MoveFixture = Awaited<ReturnType<typeof switchFixture>>;

export async function abandonRemoteWork(h: MoveFixture, store: Store, reference: RecordReference, side: MoveFixture["a"], branch: string) {
  const owner = reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("No minted work item");
  await side.exec("git", ["branch", branch, "HEAD"]);
  const branches = [{ repository: h.origin, ref: `refs/heads/${branch}`, linkedAs: "created" as const, excluded: [] }];
  const primary = success(await store.read({ reference }));
  success(await store.write({ action: "put", reference, expected: primary.version, content: primary.content, placement: { kind: "active" },
    links: { ...primary.links, branches }, provenance }));
  const content = writeLineageRecord({ schemaVersion: 2, origin: { name: owner.name, uid: owner.uid }, kind: "abandon", successors: [], incoming: [], retiredBranches: branches });
  const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner });
  success(await store.batch({ writes: [
    { action: "remove", reference, expected: success(await store.read({ reference })).version },
    { action: "put", reference: lineage, expected: null, content },
  ], provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
  return content;
}
