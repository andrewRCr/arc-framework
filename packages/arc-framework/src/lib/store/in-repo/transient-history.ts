/** Per-record versions and commit provenance from the transient identity ref. */
import { readTransientIdentitySnapshot, readTransientIdentitySnapshotAtRef } from "../../errand/identity-snapshot.js";
import { RecordVersionSchema, type RecordReference } from "../identity.js";
import type { HistoryEntry } from "../contract.js";
import type { InRepoContext } from "./context.js";
import { admitTransient, transientIO, transientKey } from "./transient-common.js";
import { notFound } from "./refusals.js";

/** Read newest-first mutations, preserving the existing ref's commit messages.
 * @param context - Backend dependencies.
 * @param input - Requested identity-ref record.
 * @returns Every commit that changed this entry, including removals.
 */
export async function transientHistory(context: InRepoContext, input: { reference: RecordReference }): Promise<HistoryEntry[]> {
  const io = await transientIO(context);
  admitTransient(input.reference, io?.identity ?? null);
  if (io === null) throw new Error("Missing admitted identity");
  const snapshot = await readTransientIdentitySnapshot(io);
  if (snapshot.kind === "error") throw new Error(snapshot.message);
  if (snapshot.kind === "absent") return notFound(input.reference);
  const key = transientKey(input.reference);
  const { stdout } = await io.exec("git", ["log", "--full-history", "--format=%H", snapshot.tip, "--", `:(literal)${key}`]);
  const entries: HistoryEntry[] = [];
  for (const commit of stdout.trim().split("\n").filter(Boolean)) {
    const at = await readTransientIdentitySnapshotAtRef(io, commit);
    if (at.kind !== "complete") throw new Error(at.kind === "error" ? at.message : "History commit is absent");
    const oid = at.objects.get(key);
    const object = await io.execInput(["cat-file", "commit", commit], "");
    const separator = object.indexOf("\n\n");
    if (separator === -1) throw new Error("Git returned a commit without a header boundary");
    entries.push({ reference: input.reference, version: oid === undefined ? null : RecordVersionSchema.parse(oid), provenance: { message: object.slice(separator + 2) } });
  }
  if (entries.length === 0) return notFound(input.reference);
  return entries;
}
