/** User-reference authority from complete primary alias projections and terminal lineage. */
import { SlugSchema } from "../kernel/index.js";
import { LineageRecordSchema } from "./kinds/lineage/index.js";
import { sameReference } from "./identity.js";
import type { Store } from "./contract.js";
import type { ListingOutcome, StoreRecord } from "./read.js";
import type { StoreResult, StoreRefusal } from "./refusal.js";
import type { ReachableReferenceTransition } from "../work-unit/reference-reconcile.js";
import { readTerminalReferenceAliases } from "../work-unit/terminal-reference-aliases.js";
/** Versioned source records required to revalidate a prepared reference write. */
export interface StoreUserReferenceAuthority {
  transitions: readonly ReachableReferenceTransition[];
  records: readonly StoreRecord[];
}
/** Preserve the transition-only consumer API over the complete authority acquisition. */
export async function readStoreUserReferenceTransitions(store: Store): Promise<StoreResult<readonly ReachableReferenceTransition[]>> {
  const acquired = await acquireStoreUserReferenceAuthority(store);
  return acquired.status === "refused" ? acquired : { status: "ok", result: acquired.result.transitions };
}
/** Enumerate former names while retaining each actual record as a prepared-write guard. */
export async function acquireStoreUserReferenceAuthority(store: Store): Promise<StoreResult<StoreUserReferenceAuthority>> {
  const basis = await store.version();
  if (basis.status === "refused") return basis;
  const [primary, lineage] = await Promise.all([
    store.list({ family: "work-item", kind: "work-item/meta", asOf: basis.result }),
    store.list({ family: "lineage", kind: "lineage/transition", asOf: basis.result }),
  ]);
  const workItems = completeRecords(primary, "work-item"), terminals = completeRecords(lineage, "lineage");
  if (workItems.status === "refused") return workItems;
  if (terminals.status === "refused") return terminals;
  const aliases = await resolveAliases(store, workItems.result);
  if (aliases.status === "refused") return aliases;
  const transitions = [...aliases.result];
  const terminalRecords: StoreRecord[] = [];
  for (const record of terminals.result) {
    const decoded = LineageRecordSchema.safeParse(record.fields);
    if (!decoded.success || record.reference.owner.type !== "work-item" || decoded.data.origin.name !== record.reference.owner.name
      || (decoded.data.origin.uid !== undefined && decoded.data.origin.uid !== record.reference.owner.uid)) return malformed(record, "lineage", "Terminal lineage does not match its owner and origin.");
    if (decoded.data.kind === "rename") continue;
    terminalRecords.push(record);
    transitions.push({ subject: decoded.data.origin.name, outcome: decoded.data.kind === "abandon" ? { kind: "removed" }
      : { kind: "decompose", successors: decoded.data.successors.map(({ name }) => name) } });
  }
  const formerNames = await resolveTerminalAliases(store, terminalRecords);
  if (formerNames.status === "refused") return formerNames;
  transitions.push(...formerNames.result);
  return { status: "ok", result: { transitions, records: [...workItems.result, ...terminals.result] } };
}
async function resolveTerminalAliases(store: Store, records: readonly StoreRecord[]): Promise<StoreResult<ReachableReferenceTransition[]>> {
  const aliases = await readTerminalReferenceAliases(store, records);
  if (aliases.status === "refused") return aliases;
  const transitions: ReachableReferenceTransition[] = [];
  for (const [name, targets] of aliases.result) {
    const found = await store.lookup({ kind: "slug", slug: SlugSchema.parse(name) });
    if (found.status === "ok") continue;
    if (found.refusal.code !== "not-found") return found;
    const target = targets[0];
    if (targets.length !== 1 || target === undefined) return { status: "refused", refusal: unavailable("lineage",
      `Terminal former-name authority for ${name} is ambiguous. Inspect its terminal history and repair the selected generation before retrying reconciliation.`) };
    transitions.push({ subject: name, outcome: { kind: "rename", targetSlug: target } });
  }
  return { status: "ok", result: transitions };
}
function completeRecords(result: StoreResult<ListingOutcome>, family: string): StoreResult<readonly StoreRecord[]> {
  if (result.status === "refused") return result;
  if (result.result.status === "absent") return { status: "ok", result: [] };
  if (result.result.status === "unreadable") return { status: "refused", refusal: { ...unavailable(family, result.result.condition), remedy: result.result.remedy } };
  if (result.result.missed || result.result.diagnostics.length > 0) return { status: "refused", refusal: unavailable(family,
    `Reference authority inventory is incomplete. ${result.result.diagnostics.map(item => `${item.condition} ${item.remedy.text}`).join(" ")}`) };
  const conflicted = result.result.records.find(record => record.conflicts.length > 0);
  if (conflicted !== undefined) return malformed(conflicted, "authority.conflicts",
    `Reference authority ${conflicted.reference.kind} for '${conflicted.reference.owner.name}' has unresolved conflicts.`);
  return { status: "ok", result: result.result.records };
}
async function resolveAliases(store: Store, records: readonly StoreRecord[]): Promise<StoreResult<ReachableReferenceTransition[]>> {
  const names = new Set<string>();
  for (const record of records) {
    if (record.aliases === undefined) return malformed(record, "aliases", "Primary alias evidence is missing; restore the complete aliases projection before reconciliation.");
    for (const alias of record.aliases) names.add(alias);
  }
  const transitions: ReachableReferenceTransition[] = [];
  for (const name of [...names].sort()) {
    const slug = SlugSchema.parse(name);
    const found = await store.lookup({ kind: "slug", slug });
    if (found.status === "refused") return found;
    if (found.result.reference.kind !== "work-item/meta") return { status: "refused", refusal: unavailable("work-item", `Former work-unit name ${name} resolves to another record kind; repair its alias authority.`) };
    const target = found.result.reference.owner.name;
    const sources = records.filter(record => record.aliases?.includes(slug));
    const source = sources[0];
    if (sources.length !== 1 || source === undefined || !sameReference(source.reference, found.result.reference) || source.reference.owner.name !== target) {
      return { status: "refused", refusal: { code: "version-conflict", class: "recoverable", records: sources.map(record => record.reference),
        condition: `The lookup for ${name} no longer matches its captured reference authority.`,
        remedy: { text: "Read reference authority again and retry reconciliation." } } };
    }
    if (target !== name) transitions.push({ subject: name, outcome: { kind: "rename", targetSlug: target } });
  }
  return { status: "ok", result: transitions };
}
function malformed(record: StoreRecord, rule: string, condition: string): StoreResult<never> {
  return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: record.reference, rule, condition,
    remedy: { text: "Repair the selected reference authority record, then retry reconciliation." } } };
}
function unavailable(namespace: string, condition: string): StoreRefusal {
  return { code: "namespace-corrupt", class: "terminal", namespace, condition, remedy: { text: "Repair the selected state source, then retry reconciliation." } };
}
