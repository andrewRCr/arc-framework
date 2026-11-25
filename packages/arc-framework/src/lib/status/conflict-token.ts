/** Stable human conflict addresses omit generation UIDs and retain complete record keys. */
import { familyOf } from "../store/catalog.js";
import { RecordReferenceSchema, type RecordReference } from "../store/identity.js";
/** Format one conflict record's public address. */
export function formatConflictToken(reference: RecordReference): string {
  if (typeof reference.key !== "string") throw new TypeError("A conflict token requires a string record key.");
  return `${familyOf(reference.kind)}/${reference.owner.type}/${reference.owner.name}/${reference.key}`;
}
/** Parse a public address into generation-independent conflict coordinates. */
export function parseConflictToken(token: string): RecordReference | null {
  const segments = token.split("/");
  const [family, type, name] = segments;
  const key = segments.slice(3).join("/");
  const result = RecordReferenceSchema.safeParse({ kind: `${family}/conflict-record`, owner: { type, name }, key });
  return result.success ? result.data : null;
}
