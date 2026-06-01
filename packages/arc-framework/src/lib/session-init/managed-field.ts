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

/** Matches a managed field's backtick-delimited value: `` _Field:_ `value` ``. */
const managedValue = (field: string): RegExp => new RegExp(`_${field}:_\\s*\`([^\`]*)\``);

/**
 * Read a managed field's backtick-delimited value from an entry's raw markdown.
 *
 * @param raw - The entry's raw markdown block.
 * @param field - The managed field name (e.g. `Remind`, `Hold`, `Created`).
 * @returns The value, or `undefined` when the field is absent or not backtick-delimited.
 */
export function managedFieldValue(raw: string, field: string): string | undefined {
  return managedValue(field).exec(raw)?.[1];
}

/**
 * Whether a managed boolean flag is set to `true` on an entry.
 *
 * @param raw - The entry's raw markdown block.
 * @param field - The managed flag name (e.g. `Remind`, `Hold`).
 * @returns `true` only when the field's value is exactly `true`.
 */
export function managedFlagIsTrue(raw: string, field: string): boolean {
  return managedFieldValue(raw, field) === "true";
}
