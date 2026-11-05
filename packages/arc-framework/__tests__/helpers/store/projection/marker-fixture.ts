/** Project real stored text conflicts into a file with their indexed marker origins. */
import { join } from "node:path";
import { createWriteBackFixture, refreshWriteBackFixture } from "./write-back-fixture.js";
import { TextConflictRecordSchema } from "../../../../src/lib/store/conflict.js";
import { createMarkerRenderer } from "../../../../src/lib/store/projection/marker-render.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { readStat } from "../../../../src/lib/store/projection/change-detection.js";
import { commitProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import type { KindId } from "../../../../src/lib/store/catalog.js";

/** Create accepted conflicting writes and render their unique current-side spans into the projection. */
export async function createMarkerFixture(input: { kind?: KindId; path?: string; base?: string; current?: string; incoming?: string } = {}) {
  const source = await createWriteBackFixture({ kind: input.kind, path: input.path, content: input.base ?? "base\n" });
  const reference = source.entry.reference;
  const put = (content: string) => source.store.write({ action: "put", reference, content,
    expected: source.entry.base.version, provenance: { verb: "edit", lifecycleAction: "edit" } });
  const current = await put(input.current ?? "stored side\n");
  if (current.status !== "ok") throw new Error(`Current seed refused: ${current.refusal.condition}`);
  const incoming = await put(input.incoming ?? "incoming side\n");
  if (incoming.status !== "ok") throw new Error(`Incoming seed refused: ${incoming.refusal.condition}`);
  const read = await source.store.read({ reference });
  if (read.status !== "ok") throw new Error("Conflicted record not readable");
  const conflicts = await Promise.all(read.result.conflicts.map(async conflict => {
    const data = await source.store.read({ reference: conflict });
    if (data.status !== "ok") throw new Error("Conflict seed not readable");
    return { reference: conflict, data: TextConflictRecordSchema.parse(JSON.parse(data.result.content)) };
  }));
  if (conflicts.length === 0) throw new Error("Fixture writes produced no text conflict");
  const refreshed = await refreshWriteBackFixture(source, source.index);
  const previous = refreshed.entries[source.path];
  if (previous?.kind !== "record") throw new Error("Refreshed entry missing");
  const renderer = createMarkerRenderer([read.result.content,
    ...conflicts.flatMap(conflict => [conflict.data.current.content, conflict.data.incoming.content])]);
  const replacements = conflicts.map(conflict => {
    const content = conflict.data.current.content;
    const start = read.result.content.indexOf(content);
    if (content === "" || start < 0 || read.result.content.indexOf(content, start + content.length) !== -1) {
      throw new Error("Fixture sides must be unique nonempty spans of the stored content");
    }
    return { start, end: start + content.length,
      text: renderer.render(conflict.data, { shows: "stored", conflict: conflict.reference }).slice(0, -1) };
  }).sort((left, right) => right.start - left.start);
  let content = read.result.content;
  for (const replacement of replacements) content = content.slice(0, replacement.start) + replacement.text + content.slice(replacement.end);
  await source.edit(content, previous.base.blob);
  const rendered = renderStampedFile({ content, stamp: previous.base.blob });
  const index = await commitProjectionIndex({ location: source.location, checkout: source.checkout, index: {
    ...refreshed, entries: { ...refreshed.entries, [source.path]: { ...previous,
      markers: { length: renderer.length, sets: conflicts.map(conflict => ({ shows: "stored" as const, conflict: conflict.reference })) },
      unshown: [],
      stat: await readStat(join(source.checkout, source.path)), written: gitBlobId(rendered, "sha1"),
    } },
  } });
  const entry = index.entries[source.path];
  if (entry?.kind !== "record") throw new Error("Rendered entry missing");
  return { ...source, entry, index, content, conflicts, record: read.result, renderer,
    request: { ...source.request, entry, base: { kind: "stamp" as const, stamp: entry.base.blob } },
    edit: (next: string, stamp = entry.base.blob) => source.edit(next, stamp),
  };
}
