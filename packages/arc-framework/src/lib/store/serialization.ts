/** Pure admission of record bytes and stored names before any storage mutation. */
import type { RecordReference } from "./identity.js";
import type { StoreRefusal } from "./refusal.js";
import { KIND_REGISTRY } from "./registry.js";
import { PROJECTED_RECORD_MAX_BYTES } from "./limits.js";
import { hasUnsafeStoredPath } from "./serialization-path.js";
import { canonicalize } from "../kernel/canonical/canonical-json.js";

/** Return the first serialization defect, retaining the caller's exact record reference. */
export function checkSerializationRules(reference: RecordReference, content: string): Extract<StoreRefusal, { code: "record-malformed" }> | undefined {
  const bytes = Buffer.from(content);
  if (bytes.subarray(0, 8_000).includes(0)) {
    return { code: "record-malformed", class: "recoverable", reference, rule: "store.text-only",
      condition: "The record contains a NUL byte in its first 8000 bytes.",
      remedy: { text: "Replace binary content with text, then retry." } };
  }
  if (KIND_REGISTRY[reference.kind].projection !== "never" && bytes.length > PROJECTED_RECORD_MAX_BYTES) {
    return { code: "record-malformed", class: "recoverable", reference, rule: "store.size-cap",
      condition: "The projected record exceeds 1048576 UTF-8 bytes.",
      remedy: { text: "Reduce the record to at most 1048576 UTF-8 bytes, then retry." } };
  }
  const basename = reference.kind === "personal/document" && typeof reference.key === "string"
    ? reference.key.split("/").at(-1) : undefined;
  const lower = basename?.toLowerCase();
  if (lower !== undefined && lower !== ".env.example" && (lower.endsWith(".env") || lower.startsWith(".env."))) {
    return { code: "record-malformed", class: "recoverable", reference, rule: "store.env-file",
      condition: "The personal document is an environment file.",
      remedy: { text: "Remove secrets and use an example document named .env.example, then retry." } };
  }
  if ((basename !== undefined && ["id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"].includes(basename))
    || /^-----BEGIN ((?:[^\r\n]+ )?PRIVATE KEY)-----\r?\n[\s\S]*?^-----END \1-----\r?$/mu.test(content)) {
    return { code: "record-malformed", class: "recoverable", reference, rule: "store.private-key",
      condition: "The record contains a private-key block or uses a private-key document name.",
      remedy: { text: "Remove the private key and use a document name that does not identify a private key, then retry." } };
  }
  if (hasUnsafeStoredPath(reference)) {
    return { code: "record-malformed", class: "recoverable", reference, rule: "store.git-path",
      condition: "A stored name exceeds the byte limit or uses a Git-special path segment.",
      remedy: { text: "Use owner names and keys of at most 2040 UTF-8 bytes and path segments of at most 4096 bytes, avoiding Git-special names, then retry." } };
  }
  if (KIND_REGISTRY[reference.kind].projection === "never") {
    try { canonicalize(JSON.parse(content)); } catch {
      return { code: "record-malformed", class: "recoverable", reference, rule: "store.json",
        condition: "The machine record is not canonicalizable JSON.",
        remedy: { text: "Supply JSON with well-formed Unicode, finite numbers, and distinct normalized keys, then retry." } };
    }
  }
  return undefined;
}
