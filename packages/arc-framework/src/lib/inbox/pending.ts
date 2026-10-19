/** Date-based figures shared by inbound listings and session back-pressure. */
/** Summarize the entries waiting in one inbound list.
 * @param entries - Parsed list rows.
 * @param now - The caller's clock.
 * @returns Count and oldest usable creation date, without guessing missing dates.
 */
export function inboundPendingFigures(entries: readonly { fields: Readonly<Record<string, string>> }[], now: Date): { count: number; oldestDate: string | null; oldestAgeDays: number | null } {
  const dates = entries.map((entry) => entry.fields.Created).filter((value): value is string => value !== undefined && /^\d{4}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(Date.parse(value)));
  const oldestDate = dates.sort()[0] ?? null;
  return { count: entries.length, oldestDate, oldestAgeDays: oldestDate === null ? null : Math.max(0, Math.floor((Date.parse(now.toISOString().slice(0, 10)) - Date.parse(oldestDate)) / 86_400_000)) };
}
