/** Content-preserving tracked reads, with parsed fields supplied independently. */
import { digestBytes } from "../../kernel/canonical/canonical-json.js";
import { RecordVersionSchema, RecordReferenceSchema, OwnerIdentitySchema, type RecordReference } from "../identity.js";
import type { ReadInput, StoreRecord } from "../read.js";
import type { InRepoContext } from "./context.js";
import { selectMeta, type MetaSource } from "./meta.js";
import { notFound, refuse, unsupported } from "./refusals.js";
import { recordPath } from "./paths.js";
import { readFileAt } from "./files.js";
import { decodeTrackedContent } from "./read-codec.js";

/** Read one logical tracked record.
 * @param context - Backend dependencies.
 * @param input - Exact reference and optional saved-state anchor.
 * @returns Bytes, digest, format, and fields from the selected record.
 */
export async function readTracked(context: InRepoContext, input: ReadInput): Promise<StoreRecord> {
  const unit = input.reference.kind.startsWith("work-item/");
  const source = unit ? await requiredMeta(context, input) : undefined;
  const path = await recordPath(context, input.reference, source, input.asOf);
  const revision = input.asOf ?? source?.revision;
  const content = await readFileAt(context, path, revision);
  if (content === null) return missingTracked(context,input);
  const placement = source?.placement ?? (input.reference.kind.startsWith("review/")
    ? (await selectMeta(context,input.reference.owner.name,input.asOf))?.placement ?? { kind: "active" as const }
    : undefined);
  if (unit && placement === undefined) return refuse({ code: "record-malformed", class: "recoverable", reference: input.reference,
    rule: "placement", condition: `The layout cannot place ${path}`, remedy: { text: `Move ${path} to a valid lifecycle surface, then retry.` } });
  const decoded = await decodeTrackedContent(input.reference.kind, content);
  checkStoredKey(input.reference, decoded.key);
  return { reference: input.reference, content,
    version: RecordVersionSchema.parse(digestBytes(Buffer.from(content))),
    formatVersion: 1, conflicts: [], ...(placement === undefined ? {} : { placement }),
    ...(decoded.fields === undefined ? {} : { fields: decoded.fields }) };
}
async function requiredMeta(context: InRepoContext, input: ReadInput): Promise<MetaSource> {
  const source = await selectMeta(context, input.reference.owner.name, input.asOf);
  if (source !== undefined) return source;
  return missingTracked(context,input);
}
async function missingTracked(context:InRepoContext,input:ReadInput): Promise<never> {
  const live = input.asOf !== undefined && input.reference.kind.startsWith("work-item/")
    ? await selectMeta(context,input.reference.owner.name) : undefined;
  if (live !== undefined && await readFileAt(context,await recordPath(context,input.reference,live),live.revision) !== null) {
    return unsupported("uncovered-state-version", "The requested saved tree does not cover this live record",
      "Read the record using its own per-record version instead.");
  }
  return notFound(input.reference, "Create the work unit's meta with its companions in one batch, then retry.");
}
function checkStoredKey(reference: RecordReference, key: string | undefined): void {
  if (key === undefined || key === reference.owner.name) return;
  const actual = RecordReferenceSchema.parse({ ...reference,
    owner: OwnerIdentitySchema.parse({ type: reference.owner.type, name: key }) });
  refuse({ code: "identity-mismatch", class: "recoverable", expected: reference, actual,
    condition: `Stored ${reference.kind} names ${key}, while its file names ${reference.owner.name}`,
    remedy: { text: "Repair the stored record's own key to match its filename, then read it again." } });
}
