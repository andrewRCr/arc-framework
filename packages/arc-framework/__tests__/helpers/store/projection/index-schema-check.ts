/** Hold a projection index header or partition a write publishes against its schema. */
import { basename, dirname } from "node:path";
import { ProjectionIndexHeaderSchema, ProjectionIndexPartitionSchema } from "../../../../src/lib/store/projection/index-schema.js";
import { PROJECTION_STATE_FOLDER } from "../../../../src/lib/store/projection/location.js";

/** The schema's refusal of one atomic write, or null for a valid file or one that is no index header or partition. */
export function projectionIndexIssues(path: string, content: string | Uint8Array): string | null {
  if (basename(dirname(path)) !== PROJECTION_STATE_FOLDER) return null;
  const name = basename(path);
  // The header's file name, kept literal so this check never imports the writer whose file seam it wraps.
  const schema = name === "index" ? ProjectionIndexHeaderSchema
    : /^index-[a-f0-9]{40}$/u.test(name) ? ProjectionIndexPartitionSchema : null;
  if (schema === null) return null;
  // The schema reads the encoded form, whose stats are decimal strings.
  const checked = schema.safeParse(JSON.parse(typeof content === "string" ? content : Buffer.from(content).toString("utf8")));
  return checked.success ? null : checked.error.message;
}
