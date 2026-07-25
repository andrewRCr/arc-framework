/** Shared normalization for identities acquired at command boundaries. */

import { SlugSchema, type Slug } from "../kernel/index.js";

/** Normalize a display identity to the canonical filesystem-safe slug form. */
export function normalizeCommandIdentity(value: string): Slug | null {
  const normalized = value
    .toLowerCase()
    .replace(/[\s.]+/gu, "-")
    .replace(/[^a-z0-9-]/gu, "")
    .replace(/-{2,}/gu, "-")
    .replace(/^-|-$/gu, "");
  const parsed = SlugSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}
