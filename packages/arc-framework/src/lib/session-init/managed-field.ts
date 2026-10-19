/**
 * Managed-field readers for USER-INBOX entries.
 *
 * A managed field renders as an italic key with a backtick-delimited value —
 * `` _Field:_ `value` `` — where the backticks are the machine signal that the
 * value is data the probe reads, not prose (a bare `_Field:_ value` is ignored).
 * These helpers read such a field off an entry's raw markdown block; both the
 * inbox-state probe and the reminder sweep consume them, so the grammar lives
 * here once rather than in each.
 *
 * @module
 */

import { managedFieldValue } from "../store/kinds/entry-fields.js";
export { managedFieldValue } from "../store/kinds/entry-fields.js";

/** Read whether a legacy managed flag is exactly true.
 * @param raw - Entry text.
 * @param field - Literal field name.
 * @returns Whether the flag is set.
 */
export function managedFlagIsTrue(raw: string, field: string): boolean {
  return managedFieldValue(raw, field) === "true";
}
