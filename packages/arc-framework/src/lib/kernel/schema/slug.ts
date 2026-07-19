/**
 * Schema-backed path-safe identity shared by work units and cohorts.
 */

import { z } from "zod";

/** Lowercase alphanumeric segments joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Runtime authority for path-safe slugs. */
export const SlugSchema = z.string().regex(SLUG_PATTERN).brand<"Slug">();

/** A schema-validated path-safe slug. */
export type Slug = z.infer<typeof SlugSchema>;

/**
 * Check and narrow a string to the branded slug type.
 *
 * @param value - Candidate path identity.
 * @returns Whether the candidate satisfies {@link SlugSchema}.
 */
export function isSlugSafe(value: string): value is Slug {
  return SlugSchema.safeParse(value).success;
}
