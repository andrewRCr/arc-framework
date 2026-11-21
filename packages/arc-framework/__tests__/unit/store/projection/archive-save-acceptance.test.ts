/** An archive save's receipt resolves to one stored version, or holds the entry until the store's history does. */
import { expect, it } from "vitest";
import { findArchiveSaveAcceptance, recoverArchiveSave } from "../../../../src/lib/store/projection/archive-save-recording.js";
import type { RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import type { WriteBackContext } from "../../../../src/lib/store/projection/write-back.js";
import type { HistoryEntry } from "../../../../src/lib/store/contract.js";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";

const reference = RecordReferenceSchema.parse({ kind: "work-item/notes", owner: { type: "work-item", name: "alpha" } });
const id = "0f8b8f0e-5b8c-4b3f-9a1f-2f2a4f5e6d7c";
const accepted = (digit: string): HistoryEntry => ({ reference, version: `sha256:${digit.repeat(64)}`, content: "# Notes\n",
  provenance: { verb: "save", lifecycleAction: "edit", archiveSaveId: id } } as HistoryEntry);
const context = (entries: HistoryEntry[]) => ({ verb: "save",
  store: { history: async () => ({ status: "ok", result: entries }) } }) as unknown as WriteBackContext;

it("holds a receipt that names two stored versions, and records one that names a single version", async () => {
  const held = { kind: "held", mark: { reason: "The archive save's acceptance does not identify a single stored version.",
    remedy: { text: "Keep the file and the retained input, repair the store history, then retry arc save." } } };
  expect(await findArchiveSaveAcceptance(context([accepted("a"), accepted("b")]), reference, id)).toMatchObject(held);
  expect(await findArchiveSaveAcceptance(context([accepted("a")]), reference, id))
    .toEqual({ kind: "accepted", reference, version: `sha256:${"a".repeat(64)}` });
  const entry = { kind: "record", reference, archiveSubmission: { id } } as unknown as RecordEntry;
  expect(await recoverArchiveSave(context([accepted("a"), accepted("b")]), entry)).toEqual({ entry, mark: held.mark });
});
