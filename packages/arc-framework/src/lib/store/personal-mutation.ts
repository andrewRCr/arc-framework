/** Bounded compare-and-write personal mutations over the public Store contract. */
import type { Store } from "./contract.js";
import type { RecordReference } from "./identity.js";
import type { StoreRecord } from "./read.js";
import type { StoreResult } from "./refusal.js";
const PERSONAL_WRITE_ATTEMPTS = 3;
/** Preparation may retain a legacy read/replan lock; it ends before the provider's write lock. */
export interface PersonalMutationInput<T> {
  store: Store; reference: RecordReference; verb: string;
  withPreparationLock?: <R>(operation: () => Promise<R>) => Promise<R>;
  mutate: (record: StoreRecord | null) => { result: T; replacement?: string }
    | Promise<{ result: T; replacement?: string }>;
}
/** Re-read and recompute after a stale whole-file write; the backend owns its write lock. */
export async function mutatePersonalRecord<T>(input: PersonalMutationInput<T>): Promise<StoreResult<{ result: T; record: StoreRecord | null }>> {
  for (let attempt = 0; ; attempt += 1) {
    const prepare = () => prepareMutation(input);
    const prepared = await (input.withPreparationLock?.(prepare) ?? prepare());
    if (prepared.status === "refused") return prepared;
    const { record, mutation } = prepared.result;
    if (mutation.replacement === undefined) return { status: "ok", result: { result: mutation.result, record } };
    const write = await input.store.write({ action: "put", reference: input.reference, expected: record?.version ?? null,
      content: mutation.replacement, provenance: { verb: input.verb, lifecycleAction: "update" } });
    if (write.status === "refused") {
      if (write.refusal.code === "version-conflict" && attempt + 1 < PERSONAL_WRITE_ATTEMPTS) continue;
      return write;
    }
    const landed = await input.store.read({ reference: write.result.reference });
    return landed.status === "refused" ? landed : { status: "ok", result: { result: mutation.result, record: landed.result } };
  }
}
async function prepareMutation<T>(input: PersonalMutationInput<T>) {
  const read = await input.store.read({ reference: input.reference });
  if (read.status === "refused" && read.refusal.code !== "not-found") return read;
  const record = read.status === "ok" ? read.result : null;
  return { status: "ok" as const, result: { record, mutation: await input.mutate(record) } };
}
