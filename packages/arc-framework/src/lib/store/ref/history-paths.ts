/** Derive the complete path set of a record from owner aliases and primary roles. */
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import { expandStoredPath, type StoredRecordHome } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects } from "./batch-read.js";
import { parseRefMetadata } from "./metadata.js";

/** Include every former slug and both primary roles in one path-limited history walk. */
export async function readHistoryPaths(context: RefBackendContext, reference: RecordReference, home: StoredRecordHome, tip: string): Promise<string[]> {
  const query = `${tip}:${home.metadataPath}`;
  const objects = await readBatchObjects(context, [query, `${tip}^:${home.metadataPath}`]);
  const metadata = parseRefMetadata(objects.get(query)) ?? parseRefMetadata(objects.get(`${tip}^:${home.metadataPath}`));
  const slugs = new Set([reference.owner.name, metadata?.slug ?? reference.owner.name, ...metadata?.formerSlugs ?? []]);
  const kinds = reference.kind === "work-item/meta" || reference.kind === "work-item/record" ? ["work-item/meta", "work-item/record"] : [reference.kind];
  const paths = [...slugs].flatMap((name) => kinds.map((kind) => expandStoredPath(RecordReferenceSchema.parse({ ...reference, kind,
    owner: { ...reference.owner, name } }), { registry: context.registry }).path));
  return [...new Set([...paths, home.metadataPath])];
}
