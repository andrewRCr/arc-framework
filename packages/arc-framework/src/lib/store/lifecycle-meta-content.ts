/** Parse proposed lifecycle metadata through the store kind's semantic boundary. */
import { META_REGISTRATION } from "./kinds/meta/registration.js";
import { ParsedMetaRecordSchema, type ParsedMetaRecord } from "../active/meta-schema.js";

/** Parsed proposed metadata or a source-grounded failure, without granting write admission. */
export type LifecycleMetaContent = { success: true; data: ParsedMetaRecord } | { success: false; error: string };

/** Recover typed fields for a prepared metadata write using the registered kind parser. */
export function parseLifecycleMetaContent(content: string): LifecycleMetaContent {
  const parsed = META_REGISTRATION.parser?.(content);
  if (parsed === undefined) return { success: false, error: "The lifecycle metadata parser is unavailable." };
  if (!parsed.success) return parsed;
  const fields = ParsedMetaRecordSchema.safeParse(parsed.data);
  return fields.success ? { success: true, data: fields.data } : { success: false, error: fields.error.message };
}
