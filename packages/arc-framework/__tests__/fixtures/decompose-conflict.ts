/** Checked conflict creation and explicit subject resolution for decomposition inputs. */
import type { Store } from "../../src/lib/store/contract.js";
import type { StoreRecord } from "../../src/lib/store/read.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { familyOf } from "../../src/lib/store/catalog.js";
import { KIND_REGISTRY } from "../../src/lib/store/registry.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";

/** File a real native conflict while retaining the current side's bytes. */
export async function fileDecomposeConflict(store: Store, subject: StoreRecord) {
  const reference = RecordReferenceSchema.parse({ kind: `${familyOf(subject.reference.kind)}/conflict-record`,
    owner: subject.reference.owner, key: "abcdef12" });
  const label = { actor: "competing-writer", time: "2026-10-19T00:00:00.000Z" };
  lifecycleSuccess(await store.write({ action: "put", reference, expected: null,
    content: JSON.stringify({ record: subject.reference, location: { kind: "hunk", start: 0, end: 1 },
      base: subject.content, current: { content: subject.content, label }, incoming: { content: "Competing content.\n", label } }),
    provenance: { verb: "sync", lifecycleAction: "merge" } }));
  return { subject: lifecycleSuccess(await store.read({ reference: subject.reference })),
    conflict: lifecycleSuccess(await store.read({ reference })) };
}

/** Explicitly keep the selected bytes and close their named conflict. */
export async function resolveDecomposeConflict(store: Store, subject: StoreRecord) {
  const current = lifecycleSuccess(await store.read({ reference: subject.reference }));
  if (["write-once", "create-only"].includes(KIND_REGISTRY[current.reference.kind].writerRule)) {
    for (const reference of current.conflicts) {
      const conflict = lifecycleSuccess(await store.read({ reference }));
      lifecycleSuccess(await store.write({ action: "remove", reference, expected: conflict.version, resolves: [reference],
        provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
    }
    return;
  }
  lifecycleSuccess(await store.write({ ...recordPut(current), resolves: current.conflicts,
    provenance: { verb: "write-back", lifecycleAction: "resolve" } }));
}
