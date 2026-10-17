/** Shared readers and canonical writers for managed Markdown entry fields. */
import { createHash } from "node:crypto";
import { entryContentEnd, maskComments } from "../concurrency/entries.js";
export { drawId as drawEntryId } from "../concurrency/stamp.js";

/** Fields owned by the shared entry grammar, including compatibility-only disposition. */
export const ENTRY_FIELDS = ["Id", "Created", "Remind", "Hold", "WU_Target", "Shapes", "Cites", "Disposition", "Inbox", "Rank"] as const;
/** Personal captures retain these fields when moved into an Errand description. */
export const PERSONAL_FIELDS = ["Created", "Remind", "Hold", "WU_Target", "Shapes"] as const;
/** The capture gates' exact top-level target spellings. */
export const TARGET_LINE = /^- (?:`WU_Target:\s*([^`]+)`|_WU_Target:_\s*`([^`]+)`|WU_Target:\s*(.+))/u;
const TARGET_VALUE = /^([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s+\((?:planned|provisional)\))?\s*$/u;

/** Read the legacy managed spelling anywhere in an entry, preserving probe semantics.
 * @param raw - Raw entry block.
 * @param field - Literal field label.
 * @returns The backticked value, when present.
 */
export function managedFieldValue(raw: string, field: string): string | undefined {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`_${escaped}:_\\s*\`([^\`]*)\``).exec(raw)?.[1];
}
/** Read a field, admitting the capture grammar's legacy prose spellings.
 * @param raw - Entry body.
 * @param field - Field label.
 * @returns Its value if present.
 */
export function readEntryField(raw: string, field: string): string | undefined {
  if (field === "WU_Target") {
    for (const line of raw.split("\n")) {
      const match = TARGET_LINE.exec(line.trimEnd());
      const value = match?.[1] ?? match?.[2] ?? match?.[3];
      if (value !== undefined) return value.trim();
    }
  }
  const managed = managedFieldValue(raw, field);
  if (managed !== undefined) return managed;
  return field === "Shapes" ? /^- _Shapes:_\s*(.+)$/mu.exec(raw)?.[1]?.trim() : undefined;
}
/** Return the slug named by a top-level target line, excluding TBD and prose.
 * @param line - One unindented capture line.
 * @returns A valid target slug or undefined.
 */
export function targetNamedByLine(line: string): string | undefined {
  const match = TARGET_LINE.exec(line.trimEnd());
  return TARGET_VALUE.exec((match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim())?.[1];
}
/** Extract an inbox heading's human title, with its optional checkbox.
 * @param line - Entry heading.
 * @returns Its bold title or null.
 */
export function matchInboxEntryTitle(line: string): string | null {
  return /^###\s+(?:`?\[[ xX]\]`?\s+)?\*\*(.+?)\*\*/u.exec(line)?.[1]?.trim() ?? null;
}
/** Read the full italic removal trigger, ending at its closing delimiter.
 * @param raw - Field-header entry.
 * @returns Trigger text, including a terminal period if present.
 */
export function readRemovalTrigger(raw: string): string | undefined {
  const legacy = /^\s*[_*]Remove when:[_*]\s*(.+)$/mu.exec(raw)?.[1];
  if (legacy !== undefined) return legacy.trim();
  return /^\s*([_*])Remove when:\s*([\s\S]*?)\1(?=\s*(?:\r?\n|$))/mu.exec(raw)?.[2]?.trim();
}
/** Format the required trigger in the canonical underscore spelling.
 * @param trigger - Removal condition.
 * @returns An italic trigger line.
 */
export function writeRemovalTrigger(trigger: string): string { return `_Remove when: ${trigger.replace(/\.$/u, "")}._`; }
/** Write supplied fields in a leading group, retaining all other prose and fields.
 * @param raw - Heading entry bytes, excluding surrounding document comments.
 * @param fields - Fields to replace or remove (undefined).
 * @returns Entry with canonical managed bullets before its prose.
 */
export function writeEntryFields(raw: string, changes: Readonly<Record<string, string | undefined>>): string {
  const newline = raw.includes("\r\n") ? "\r\n" : "\n";
  const initial = entryFieldHeader(raw);
  const fields = { ...fieldsOnLines(maskComments(raw).split("\n").slice(1)), ...changes };
  for (const [field, value] of Object.entries(fields)) {
    if (value !== undefined && !validEntryFieldValue(field, value)) throw new Error(`Invalid ${field} entry value: ${value}`);
  }
  const kept = attachTrailingEntryComments(initial.header, withoutVisibleLines(initial.body, (line) => fieldOnLine(line) !== undefined), newline);
  const body = kept.body.split("\n");
  while (body[0]?.trim() === "") body.shift();
  const bodyText = body.join("\n");
  const openComment = bodyText.lastIndexOf("<!--") > bodyText.lastIndexOf("-->");
  while (!openComment && body.at(-1)?.trim() === "") body.pop();
  const disposition = fields.Disposition === undefined ? [] : ["", `- _Disposition:_ \`${fields.Disposition}\``, ""];
  const managed = Object.entries(fields).filter(([field, value]) => field !== "Disposition" && value !== undefined)
    .sort(([a], [b]) => Number(a === "Id") - Number(b === "Id"))
    .map(([field, value]) => `- _${field}:_ \`${value}\``);
  return [kept.header, ...disposition, ...managed].join(newline) + (body.length ? `${newline}${newline}${body.join("\n")}` : "");
}

function attachTrailingEntryComments(header: string, body: string, newline: string): { header: string; body: string } {
  const commentAt = entryContentEnd(body);
  if (commentAt === body.length) return { header, body };
  return { header: `${header}${newline}${body.slice(commentAt).trimEnd()}`, body: body.slice(0, commentAt) };
}

function entryFieldHeader(raw: string): { header: string; body: string } {
  const firstBreak = raw.indexOf("\n"), bodyAt = firstBreak < 0 ? raw.length : firstBreak + 1;
  const heading = raw.slice(0, firstBreak < 0 ? raw.length : firstBreak).replace(/\r$/u, "");
  const comments = [...raw.matchAll(/<!--[\s\S]*?(?:-->|$)/gu)];
  const spanning = comments.find(comment => comment.index < heading.length
    && (comment.index + comment[0].length > heading.length || !comment[0].endsWith("-->")));
  if (spanning === undefined) return { header: heading, body: raw.slice(bodyAt) };
  let end = bodyAt;
  for (const comment of comments) {
    if (comment.index >= end) break;
    if (!comment[0].endsWith("-->")) return { header: heading.slice(0, spanning.index), body: raw.slice(spanning.index) };
    const nextBreak = raw.indexOf("\n", comment.index + comment[0].length);
    end = nextBreak < 0 ? raw.length : nextBreak + 1;
  }
  return { header: raw.slice(0, end).replace(/\r?\n$/u, ""), body: raw.slice(end) };
}

function withoutVisibleLines(raw: string, omit: (line: string) => boolean): string {
  const visible = maskComments(raw).split("\n");
  return raw.split("\n").flatMap((line, index) => {
    if (!omit(visible[index] ?? "")) return [line];
    const comment = line.indexOf("<!--");
    return comment < 0 ? [] : [line.slice(comment)];
  }).join("\n");
}

function fieldOnLine(line: string): string | undefined {
  if (TARGET_LINE.test(line)) return "WU_Target";
  const field = /^- _(.+?):_/u.exec(line)?.[1];
  return field !== undefined && (ENTRY_FIELDS as readonly string[]).includes(field) && readEntryField(line, field) !== undefined ? field : undefined;
}

function fieldsOnLines(lines: readonly string[]): Record<string, string | undefined> {
  const fields: Record<string, string | undefined> = {};
  for (const line of lines) {
    const field = fieldOnLine(line);
    if (field !== undefined) fields[field] = readEntryField(line, field);
  }
  return fields;
}
/** Replace or remove the routing prose by label; only a move writes an origin.
 * @param raw - Entry with a managed identity.
 * @param origin - List and section left, or undefined to drop the line.
 * @returns Entry with its origin directly after the identity.
 */
export function writeRoutedFrom(raw: string, origin?: string): string {
  const rewritten = withoutVisibleLines(raw, (line) => /^- _Routed from:_/u.test(line));
  if (origin === undefined) return rewritten;
  const identity = /^- _Id:_[^\r\n]*(?:\r?\n|$)/mu.exec(maskComments(rewritten));
  if (identity === null) throw new Error("A routed entry must have an identity");
  const newline = raw.includes("\r\n") ? "\r\n" : "\n";
  const position = identity.index + identity[0].length;
  const originLine = `- _Routed from:_ ${origin}`;
  return identity[0].endsWith("\n")
    ? `${rewritten.slice(0, position)}${originLine}${newline}${rewritten.slice(position)}`
    : `${rewritten}${newline}${originLine}`;
}
/** Digest exactly the identity-bearing section and bytes compared by entry merge.
 * @param entry - Losslessly split entry.
 * @returns Version one, truncated SHA-256 digest.
 */
export function entryVersion(entry: { section: string; bytes: string }): string {
  return `v1:${createHash("sha256").update(entry.section).update("\0").update(entry.bytes).digest("hex").slice(0, 16)}`;
}

/** Validate the value shape owned by one managed field.
 * @param field - Field label.
 * @param value - Decoded value.
 * @returns Whether the shared grammar admits it.
 */
export function validEntryFieldValue(field: string, value: string): boolean {
  if (["Id", "Cites"].includes(field)) return /^[0-9a-f]{8}$/u.test(value);
  if (field === "Created") return /^\d{4}-\d{2}-\d{2}$/u.test(value);
  if (["Hold", "Remind"].includes(field)) return value === "true";
  if (field === "WU_Target") return value === "TBD" || TARGET_VALUE.test(value);
  if (field === "Inbox") return value === "personal" || value === "project";
  return value.trim().length > 0;
}
