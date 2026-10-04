/** Per-record versions and commit provenance from the transient identity ref. */
import { readTransientIdentitySnapshot, readTransientIdentitySnapshotAtRef, type IdentitySnapshotIO } from "../../errand/identity-snapshot.js";
import { RecordVersionSchema, type RecordReference } from "../identity.js";
import type { HistoryEntry } from "../contract.js";
import type { InRepoContext } from "./context.js";
import { admitTransient, transientIO, transientKey, transientKind } from "./transient-common.js";
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
  if (snapshot.kind === "error") throw new Error(snapshot.message,{cause:snapshot.error});
  if (snapshot.kind === "absent") return notFound(input.reference);
  const key = transientKey(input.reference);
  const { stdout } = await io.exec("git", ["log", "--full-history", "--topo-order", "--format=%H", snapshot.tip, "--", `:(literal)${key}`]);
  const entries: HistoryEntry[] = [];
  for (const commit of stdout.trim().split("\n").filter(Boolean)) {
    const value = await historicalValue(io,commit,key,input.reference.kind);
    if (!value.matches && !await precedingRole(io,commit,key,input.reference.kind)) continue;
    const oid = value.matches ? value.oid : undefined;
    const content = oid === undefined ? null : await io.execInput(["cat-file","blob",oid],"");
    const object = await io.execInput(["cat-file", "commit", commit], "");
    const separator = object.indexOf("\n\n");
    if (separator === -1) throw new Error("Git returned a commit without a header boundary");
    entries.push({ reference: input.reference, content, version: oid === undefined ? null : RecordVersionSchema.parse(oid), provenance: { message: object.slice(separator + 2) } });
  }
  if (entries.length === 0) return notFound(input.reference);
  return entries;
}

async function historicalValue(io:IdentitySnapshotIO,commit:string,key:string,kind:RecordReference["kind"]): Promise<{matches:boolean;oid:string|undefined}> {
  const at = await readTransientIdentitySnapshotAtRef(io,commit);
  if (at.kind === "error") throw new Error(at.message,{cause:at.error});
  if (at.kind === "absent") throw new Error("History commit is absent");
  const unreadable = at.diagnostics.find((item)=>item.key === key && item.kind === "unreadable");
  if (unreadable?.kind === "unreadable") throw new Error(unreadable.message,{cause:unreadable.error});
  const oid = at.objects.get(key);
  const record = at.records.get(key);
  return {oid,matches:oid !== undefined && (record === undefined || transientKind(record) === kind)};
}

async function precedingRole(io:IdentitySnapshotIO,commit:string,key:string,kind:RecordReference["kind"]): Promise<boolean> {
  const parents = (await io.exec("git",["rev-list","--parents","-n","1",commit])).stdout.trim().split(" ").slice(1);
  for (const parent of parents) if ((await historicalValue(io,parent,key,kind)).matches) return true;
  return false;
}
