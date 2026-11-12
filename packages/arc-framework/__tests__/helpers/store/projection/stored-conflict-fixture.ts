/** Accepted reference-store writes that retain their actual stored text conflicts. */
import { createWriteBackFixture } from "./write-back-fixture.js";
import { TextConflictRecordSchema } from "../../../../src/lib/store/conflict.js";
import type { KindId } from "../../../../src/lib/store/catalog.js";

/** File a clash without drawing it, retaining its base history and side counts. */
export async function createStoredConflictFixture(input: { kind?: KindId; path?: string; base: string; current: string; incoming: string }) {
  const source = await createWriteBackFixture({ kind: input.kind, path: input.path, content: input.base });
  for (const content of [input.current, input.incoming]) {
    const put = await source.store.write({ action: "put", reference: source.entry.reference,
      expected: source.entry.base.version, content, provenance: { verb: "edit", lifecycleAction: "edit" } });
    if (put.status !== "ok") throw new Error(`Conflict seed refused: ${put.refusal.condition}`);
  }
  const read = await source.store.read({ reference: source.entry.reference });
  if (read.status !== "ok") throw new Error("Conflicted record missing");
  const conflicts = await Promise.all(read.result.conflicts.map(async reference => {
    const read = await source.store.read({ reference });
    if (read.status !== "ok") throw new Error("Conflict record missing");
    return { reference, data: TextConflictRecordSchema.parse(JSON.parse(read.result.content)) };
  }));
  if (conflicts.length === 0) throw new Error("Writes produced no conflict");
  return { ...source, record: read.result, conflicts };
}
