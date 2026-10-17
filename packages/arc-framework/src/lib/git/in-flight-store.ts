/** In-flight membership from active placement; Git contributes location hints and residue only. */
import type { Store } from "../store/contract.js";
import { listLifecycleIndex } from "../store/lifecycle-index.js";
import { createProjectIdentityReader, resolveProjectIdentity } from "../store/project-identity.js";
import { selectWorkBranchLink, workBranchName } from "../store/lifecycle-branch.js";
import type { StoreRecord } from "../store/read.js";
import { acquireStoreErrands, acquireStoreClaims, type StoreIdentityAcquisition } from "../errand/store-discovery.js";
import type { DerivedCheckoutRow } from "../locus/derived-roster.js";
import type { GitExec } from "./exec.js";
import { readLocalInFlightRefSnapshot } from "./remote-ref-reader.js";
import type { InFlightWorkUnit, InFlightErrand, DeriveInFlightResult, InFlightWarning, InFlightEntryMark } from "./in-flight-derivation.js";

/** Store work units can be planning without a code branch and paused while remaining in flight. */
export type StoreInFlightWorkUnit = Omit<InFlightWorkUnit, "branch" | "scheduling"> & { branch?: string; scheduling?: "paused" };
/** Project-scoped Errands retain their explicit owner. */
export type StoreInFlightErrand = Omit<InFlightErrand, "branch"> & { branch?: string; owner?: string };
/** Store-only type keeps the retiring branch classifier's public contract narrow. */
export type StoreInFlightEntry = StoreInFlightWorkUnit | StoreInFlightErrand;
/** The oracle's existing evidence shape with store-derived entries. */
export type StoreInFlightResult = Omit<DeriveInFlightResult, "entries"> & { entries: StoreInFlightEntry[] };
/** Optional lookup binds work-unit location to the locus owner's authoritative marker scan. */
export interface DeriveStoreInFlightOptions {
  store: Store; exec: GitExec; identity: string | null; teamMode: boolean;
  projectId?: () => Promise<string>; remote?: string; cwd?: string;
  roster?: readonly DerivedCheckoutRow[];
  findHoldingCheckout?: (name: string) => Promise<string | null>;
}
/** Derive membership without fetching and retain incomplete evidence as warnings.
 * @param options - Operational store, local Git boundary and identity filter.
 * @returns Active work and claims, branch tips and advisory residue.
 */
export async function deriveStoreInFlight(options: DeriveStoreInFlightOptions): Promise<StoreInFlightResult> {
  const remote = options.remote ?? "origin";
  const refs = await readLocalInFlightRefSnapshot(options.exec, remote, options.cwd);
  const context = new InFlightProjection(options, refs);
  const project = await resolveProjectIdentity(options.projectId ?? createProjectIdentityReader(options.store));
  if (project.status === "ready") context.repository = project.id;
  else context.warn(`${project.reason} ${project.remedy.text}`);
  await addWorkUnits(context);
  context.addAcquisition(await acquireStoreErrands(options.store), true);
  if (options.identity !== null) context.addAcquisition(await acquireStoreClaims(options.store, options.identity), false);
  context.addResidue();
  const entries = context.entries.filter((entry) => keepOwner(entry, options));
  return { entries, warnings: context.warnings, residue: context.residue, snapshot: context.snapshot, liveRefs: {}, reachable: false,
    ...(context.degraded ? { marks: ["degraded"] } : {}) };
}
class InFlightProjection {
  readonly entries: StoreInFlightEntry[] = [];
  readonly warnings: InFlightWarning[] = [];
  readonly residue: StoreInFlightResult["residue"] = [];
  readonly snapshot: StoreInFlightResult["snapshot"] = { refs: {}, worktrees: {} };
  readonly linked = new Set<string>();
  repository?: string;
  degraded: boolean;
  constructor(readonly options: DeriveStoreInFlightOptions, readonly refs: Awaited<ReturnType<typeof readLocalInFlightRefSnapshot>>) {
    this.degraded = !refs.ok;
  }
  warn(message: string, code: InFlightWarning["code"] = "meta-read-failed"): void {
    this.warnings.push({ code, rendered: message }); this.degraded = true;
  }
  branchFor(record: Pick<StoreRecord, "links">, currentBranch?: string | null): string | undefined {
    if (this.repository === undefined) return undefined;
    for (const link of record.links?.branches ?? []) {
      if (link.repository === this.repository) this.linked.add(workBranchName(link.ref));
    }
    const selection = selectWorkBranchLink(record, { repository: this.repository,
      ...(currentBranch === undefined ? {} : { currentBranch }) });
    if (selection.kind === "ambiguous") this.warn(selection.reason);
    return selection.kind === "linked" ? selection.link.ref : undefined;
  }
  locate(branch: string | undefined, path: string | null | undefined) {
    const short = branch === undefined ? undefined : workBranchName(branch);
    if (short !== undefined) this.capture(short, path);
    return { ...(short === undefined ? {} : { branch: short }), ...(path == null ? {} : { worktreePath: path }),
      remoteOnly: short !== undefined && path == null && this.refs.refs.localHeads[short] === undefined };
  }
  private capture(branch: string, path: string | null | undefined): void {
    this.linked.add(branch);
    const local = this.refs.refs.localHeads[branch], tracking = this.refs.refs.remoteTracking[branch];
    if (local !== undefined) this.snapshot.refs[branch] = local;
    if (tracking !== undefined) this.snapshot.refs[`${this.options.remote ?? "origin"}/${branch}`] = tracking;
    if (path != null) this.snapshot.worktrees[branch] = path;
  }
  addAcquisition(acquisition: StoreIdentityAcquisition, errandsOnly: boolean): void {
    if (acquisition.kind === "error") { this.warn(acquisition.message, "errand-record-read-failed"); return; }
    if (acquisition.kind !== "complete") return;
    if (acquisition.missed) this.warn("Transient record inventory is incomplete. Repair its diagnostics, then retry.", "errand-record-read-failed");
    for (const diagnostic of acquisition.diagnostics) this.warn(`${diagnostic.condition} ${diagnostic.remedy.text}`, "errand-record-read-failed");
    for (const saved of acquisition.records) this.addTransient(saved, acquisition, errandsOnly);
  }
  private addTransient(saved: import("../store/read.js").StoreRecord, acquisition: Extract<StoreIdentityAcquisition, { kind: "complete" }>, errandsOnly: boolean): void {
    const slug = errandsOnly ? saved.reference.owner.name : typeof saved.reference.key === "string" ? saved.reference.key : "";
    const record = acquisition.decoded.get(slug);
    if (record === undefined || record.branch === null) return;
    const branch = errandsOnly ? this.branchFor(saved, record.branch) : record.branch;
    const row = this.options.roster?.find((candidate) => matchesTransient(candidate, slug, record.claimId));
    const owner = record.kind === "errand" && record.purpose === "errand" ? record.owner : this.options.identity;
    this.entries.push({ kind: "errand", slug, ...this.locate(branch, row?.checkout.path), ...optionalField("owner", owner) });
    if (branch !== undefined) this.addMissingBranch(workBranchName(branch), slug);
  }
  private addMissingBranch(branch: string, slug: string): void {
    if (this.refs.refs.localHeads[branch] !== undefined || this.refs.refs.remoteTracking[branch] !== undefined) return;
    this.residue.push({ branch, slug, reason: "errand-record-without-branch" });
    this.warnings.push({ code: "errand-record-branch-missing", branch, rendered: `Errand record ${slug} names missing branch ${branch}; inspect its branch link and retained history.` });
  }
  addResidue(): void {
    for (const branch of new Set([...Object.keys(this.refs.refs.localHeads), ...Object.keys(this.refs.refs.remoteTracking)])) {
      if (!/^(?:feat|fix|chore|plan|refactor|docs|test|perf|build|ci)\//u.test(branch) || this.linked.has(branch)) continue;
      this.residue.push({ branch, slug: branch.slice(branch.indexOf("/") + 1), reason: "no-record-or-meta" });
      this.warnings.push({ code: "branch-residue", branch, rendered: `Branch ${branch} has no active work item or claim; inspect it before cleanup.` });
    }
  }
}
async function addWorkUnits(context: InFlightProjection): Promise<void> {
  const lifecycle = await listLifecycleIndex(context.options.store, { locations: ["active"] });
  if (lifecycle.status === "refused") { context.warn(`${lifecycle.refusal.condition} ${lifecycle.refusal.remedy.text}`); return; }
  const result = lifecycle.result;
  if (result.status === "unreadable") { context.warn(`${result.condition} ${result.remedy.text}`); return; }
  if (result.status !== "complete") return;
  if (result.missed) context.warn("Active work-unit inventory is incomplete. Repair the reported metadata, then retry.");
  for (const diagnostic of result.diagnostics) context.warn(`${diagnostic.condition} ${diagnostic.remedy.text}`, "meta-malformed");
  for (const item of result.index.entries()) await addWorkUnit(context, item);
}
async function addWorkUnit(context: InFlightProjection, item: import("../store/lifecycle-index.js").LifecycleEntry): Promise<void> {
  const name = item.reference.owner.name, fields = item.fields;
  const { path, holder, marks } = await workUnitLocation(context, name);
  context.entries.push({ kind: "work-unit", name, state: item.phase, ...context.locate(context.branchFor(item, holder?.checkout.branch), path), dependsOn: fields.dependsOn,
    ...optionalField("owner", fields.owner), ...optionalField("cohort", fields.cohort), ...optionalField("class", fields.workClass),
    ...optionalField("priority", fields.priority), ...(fields.pause === null ? {} : { scheduling: "paused" }),
    ...(marks === undefined ? {} : { marks }),
    ...(fields.design.length === 0 ? {} : { design: fields.design.join(", ") }) });
}
async function workUnitLocation(context: InFlightProjection, name: string): Promise<{
  path?: string; holder?: DerivedCheckoutRow; marks?: readonly InFlightEntryMark[];
}> {
  const rows = context.options.roster?.filter((candidate) => candidate.subject?.kind === "work-unit" && candidate.subject.key === name) ?? [];
  if (rows.length > 1 || rows.some(row => row.kind !== "work-unit" || row.diagnostics.length > 0)) {
    const details = rows.flatMap(row => row.diagnostics.map(diagnostic => diagnostic.message)).join(" ");
    const repair = rows.length > 1 ? "Inspect and release the stray checkout's claim, then retry." : "Repair the reported checkout evidence, then retry.";
    context.warn(`Work unit '${name}' has unresolved checkout evidence at ${rows.map(row => row.checkout.path).join(", ")}. ${details} ${repair}`);
    return { marks: ["degraded", rows.length > 1 ? "location-ambiguous" : "indeterminate"] };
  }
  const holder = rows[0];
  if (context.options.findHoldingCheckout === undefined) return { path: holder?.checkout.path, holder };
  try {
    const path = await context.options.findHoldingCheckout(name) ?? undefined;
    return { path, holder: rows.find(row => row.checkout.path === path) };
  } catch (error) {
    context.warn(`Holder lookup failed for work unit '${name}': ${error instanceof Error ? error.message : String(error)} Repair its checkout evidence, then retry.`);
    return { marks: ["degraded", "indeterminate"] };
  }
}
function optionalField<Key extends string>(key: Key, value: string | null | undefined): Partial<Record<Key, string>> {
  return value == null ? {} : { [key]: value } as Record<Key, string>;
}
function matchesTransient(row: DerivedCheckoutRow, slug: string, claimId: string): boolean {
  const subject = row.subject;
  return subject !== null && subject.kind !== "work-unit" && subject.kind !== "partial-errand" && subject.key === slug && subject.claimId === claimId;
}
function keepOwner(entry: StoreInFlightEntry, options: DeriveStoreInFlightOptions): boolean {
  return !options.teamMode || options.identity === null || entry.owner === undefined || entry.owner === options.identity;
}
