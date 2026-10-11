/** Parsed field versions used by metadata rules without importing the metadata reader. */
import { ParsedMetaRecordSchema, type ParsedMetaRecord } from "../../../active/meta-schema.js";
import type { WriteCheckInput } from "../../write-check.js";

/** Parsed sides of a write, retaining a stored version's missing field evidence. */
export interface MetaFieldVersions {
  readonly priorExists: boolean;
  readonly prior: ParsedMetaRecord | undefined;
  readonly next: ParsedMetaRecord | undefined;
}
/** Narrow both sides through the kind's tolerant field schema.
 * @param input - Proposed write with parser-produced fields.
 * @returns Parsed field evidence, distinguishing creation from an unreadable prior.
 */
export function metaFieldVersions(input: WriteCheckInput): MetaFieldVersions {
  const prior = ParsedMetaRecordSchema.safeParse(input.prior?.fields);
  const next = ParsedMetaRecordSchema.safeParse(input.next?.fields);
  return { priorExists: input.prior !== undefined, prior: prior.success ? prior.data : undefined,
    next: next.success ? next.data : undefined };
}
/** Judge only a new or changed field when its prior value is readable.
 * @param versions - Narrowed field evidence.
 * @param key - Field being judged.
 * @returns True on creation or a proved field difference; false without prior comparison authority.
 */
export function metaFieldChanged(versions: MetaFieldVersions, key: keyof ParsedMetaRecord): boolean {
  if (versions.next === undefined) return false;
  if (!versions.priorExists) return true;
  return versions.prior !== undefined && JSON.stringify(versions.prior[key]) !== JSON.stringify(versions.next[key]);
}
