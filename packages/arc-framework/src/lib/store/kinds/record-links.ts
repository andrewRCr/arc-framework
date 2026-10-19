/** Checkout-independent link rules for projected Markdown records. */
import { posix } from "node:path";
import { SlugSchema } from "../../kernel/index.js";
import { isProjectedPath, resolveArcPath } from "../../layout/index.js";
import type { RecordReference } from "../identity.js";
import type { BrokenRule, WriteCheckInput } from "../write-check.js";
import { KIND_SHAPES, familyOf, type KindId } from "../catalog.js";
import { readMarkdownLinks, type MarkdownLinkOccurrence } from "./markdown-links.js";

/** Stable shape rules for links carried by a stored record. */
export type RecordLinkRule = "links.relative-in-movable" | "links.into-projection" | "links.undefined-reference";

/** One occurrence, with the identity used to compare historical violation counts. */
export interface RecordLinkViolation extends MarkdownLinkOccurrence {
  rule: RecordLinkRule;
  key: string;
}

function usesNameKey(kind: KindId): boolean {
  return KIND_SHAPES[kind].key === "name";
}

function isMarkdownRecord(reference: RecordReference): boolean {
  if (reference.kind === "personal/document") return typeof reference.key === "string" && reference.key.endsWith(".md");
  if (reference.kind !== "work-item/companion") return true;
  return typeof reference.key === "string"
    && ((usesNameKey(reference.kind) && SlugSchema.safeParse(reference.key).success) || reference.key.endsWith(".md"));
}

function fixedRecordPath(reference: RecordReference): string | undefined {
  if (reference.kind === "project-inbox/inbox") return resolveArcPath({ kind: "inbox", scope: { kind: "project" } });
  if (reference.owner.type !== "person") return undefined;
  const identity = reference.owner.name;
  if (reference.kind === "personal/inbox") return resolveArcPath({ kind: "inbox", scope: { kind: "identity", identity } });
  if (reference.kind === "personal/session-context") {
    return resolveArcPath({ kind: "user-document", identity, document: { kind: "session-notes", workUnit: SlugSchema.parse(reference.key) } });
  }
  const memory = resolveArcPath({ kind: "user-document", identity, document: { kind: "working-memory" } });
  return reference.kind === "personal/document" && typeof reference.key === "string"
    ? posix.join(posix.dirname(memory), reference.key) : memory;
}

function linkPath(url: string): string | undefined {
  if (url.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(url)) return undefined;
  const path = url.split(/[?#]/, 1)[0] ?? "";
  if (path === "") return undefined;
  try { return decodeURIComponent(path); } catch { return path; }
}

function linkViolations(reference: RecordReference, link: MarkdownLinkOccurrence): RecordLinkViolation[] {
  const path = linkPath(link.value);
  if (path === undefined) return [];
  const family = familyOf(reference.kind);
  const movable = family === "work-item" || family === "cohort";
  if (movable && !path.startsWith("/")) return [{ ...link, rule: "links.relative-in-movable", key: link.value }];
  const source = fixedRecordPath(reference);
  const target = path.startsWith("/") ? posix.normalize(path.replace(/^\/+/, ""))
    : source === undefined ? undefined : posix.normalize(posix.join(posix.dirname(source), path));
  if (target === undefined || !isProjectedPath(target)) return [];
  return [{ ...link, rule: "links.into-projection", key: target.replace(/\/$/, "") }];
}

/** Read link violations using semantic record identity rather than checkout placement. */
export function readRecordLinkViolations(reference: RecordReference, content: string): RecordLinkViolation[] {
  if (!isMarkdownRecord(reference)) return [];
  const parsed = readMarkdownLinks(content);
  return [
    ...parsed.links.flatMap(link => linkViolations(reference, link)),
    ...parsed.undefinedReferences.map((reference): RecordLinkViolation => ({
      ...reference, rule: "links.undefined-reference", key: reference.value,
    })),
  ];
}

/** Refuse only the link-rule violations introduced by a proposed record write. */
export function checkRecordLinks(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  if (input.next === undefined) return Promise.resolve([]);
  const violations = readRecordLinkViolations(input.reference, input.next.content);
  const priorCounts = violationCounts(input.prior === undefined ? [] : readRecordLinkViolations(input.reference, input.prior.content));
  const nextCounts = violationCounts(violations);
  const groups = new Map<RecordLinkRule, RecordLinkViolation[]>();
  for (const violation of violations) {
    const key = JSON.stringify([violation.rule, violation.key]);
    if ((nextCounts.get(key) ?? 0) <= (priorCounts.get(key) ?? 0)) continue;
    const group = groups.get(violation.rule) ?? [];
    group.push(violation);
    groups.set(violation.rule, group);
  }
  return Promise.resolve([...groups].map(([rule, occurrences]) => ({
    rule,
    condition: `Introduced link violations: ${occurrences.map(item => `${JSON.stringify(item.value)} at line ${item.line}, column ${item.column}`).join("; ")}.`,
    remedy: { text: LINK_REMEDIES[rule] },
  })));
}

function violationCounts(violations: readonly RecordLinkViolation[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const violation of violations) {
    const key = JSON.stringify([violation.rule, violation.key]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

const LINK_REMEDIES: Readonly<Record<RecordLinkRule, string>> = {
  "links.relative-in-movable": "Name the target by its backticked filename, or link a tracked file from the repository root (`/path`), then save again.",
  "links.into-projection": "Name the record by its backticked filename instead of linking it, then save again.",
  "links.undefined-reference": "Define each reference in this file, or remove it, then save again.",
};
