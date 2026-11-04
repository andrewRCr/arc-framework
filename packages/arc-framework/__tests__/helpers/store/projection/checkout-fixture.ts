/** Produce retained take-in bases through accepted writes and production projection replacement. */
import { createWriteBackFixture } from "./write-back-fixture.js";
import { writeBackFile } from "../../../../src/lib/store/projection/read-back.js";
import type { KindId } from "../../../../src/lib/store/catalog.js";
import { runSecondCheck } from "../../../../src/lib/store/projection/second-check.js";
import { createWriteBackPort } from "../../../../src/lib/store/projection/write-back.js";

/** Land separated edits so the stored merge differs from the input kept beside its old stamp. */
export async function createCheckoutFixture(input: { kind?: KindId; path?: string; base?: string; current?: string; incoming?: string } = {}) {
  const source = await createWriteBackFixture({ kind: input.kind, path: input.path, content: input.base });
  const remote = await source.store.write({ action: "put", reference: source.entry.reference, expected: source.entry.base.version,
    content: input.current ?? "opening\nbase\nclosing\nremote note\n", provenance: { verb: "edit", lifecycleAction: "edit" } });
  if (remote.status !== "ok") { await source.dispose(); throw new Error(`Remote seed refused: ${remote.refusal.condition}`); }
  const incoming = input.incoming ?? "opening\nfirst edit\nclosing\n";
  await source.edit(incoming);
  const first = await writeBackFile(source.context, source.index, source.request);
  if (first.result.answer !== "taken-in" || first.result.entry.persisted?.takenIn.kind !== "copy") {
    await source.dispose(); throw new Error("Fixture seeds must produce a retained take-in copy");
  }
  const finished = await runSecondCheck({ ...source.context, checkout: source.checkout, index: first.index,
    copies: first.result.entry.copies.map(copy => ({ path: source.path, copy: copy.name })), takeIn: createWriteBackPort(source.context) });
  const entry = finished.index.entries[source.path];
  if (entry?.kind !== "record") { await source.dispose(); throw new Error("Retained entry missing"); }
  const current = await source.store.read({ reference: source.entry.reference });
  if (current.status !== "ok") { await source.dispose(); throw new Error("Retained landing unreadable"); }
  return { ...source, initialEntry: source.entry, entry, index: finished.index, incoming, record: current.result,
    request: { ...source.request, entry } };
}
