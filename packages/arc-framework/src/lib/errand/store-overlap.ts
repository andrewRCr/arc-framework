/** Store-aware state and code overlap composition at the Errand advisory boundary. */
import type { Store } from "../store/contract.js";
import type { GitExec } from "../git/exec.js";
import type { DerivedLocusFrame } from "../locus/derived-reader.js";
import { runDerivedLocusStateProbe } from "../../handlers/derived-locus-state-probe.js";
import { deriveStoreInFlight, type StoreInFlightEntry } from "../git/in-flight-store.js";
import { detectForeignArtifactOverlap, preferRemoteBaseRef, projectInFlightToOverlapRoster,
  type ForeignArtifactDetectionResult, type ForeignArtifactOverlap } from "../git/foreign-artifact-detection.js";
import type { InFlightWarning } from "../git/in-flight-derivation.js";
import { identifyArcFileAddress } from "../layout/index.js";
import { classifyStoreAddress, type ClassifiedStoreTarget } from "../store/target-classification.js";
import { SlugSchema } from "../kernel/index.js";
import { CheckoutClaimSchema } from "../store/lookup.js";
/** Invocation-bound overlap evidence, with optional acquisition ports for one captured frame. */
export interface StoreErrandOverlapOptions {
  store: Store; exec: GitExec; cwd: string; identity: string; teamMode: boolean; baseBranch: string; targetPaths: string[];
  projectId?: () => Promise<string>; readFrame?: () => Promise<DerivedLocusFrame>;
}
/** Check state ownership directly and code paths through the existing Git probes. */
export async function runStoreErrandOverlap(options: StoreErrandOverlapOptions): Promise<{ result: ForeignArtifactDetectionResult; warnings: InFlightWarning[]; reachable: boolean }> {
  const frame = options.readFrame === undefined ? await runDerivedLocusStateProbe(options) : await options.readFrame();
  const inFlight = await deriveStoreInFlight({ ...options, roster: frame.roster });
  const self = await callerIdentity(options.store, frame);
  const entries = inFlight.entries.filter((entry) => entryName(entry) !== self);
  const classified = options.targetPaths.map((path) => ({ path, target: classify(path) }));
  const code = classified.filter((item) => item.target === null).map((item) => item.path);
  const notes: string[] = [], state: ForeignArtifactOverlap[] = [];
  for (const item of classified) {
    if (item.target === null || item.target.entryList) continue;
    const overlap = await stateOverlap(options.store, entries, item.path, item.target, notes);
    if (overlap !== null) state.push(overlap);
  }
  const result = code.length === 0 ? { overlaps: [] } : await detectForeignArtifactOverlap({ exec: options.exec,
    roster: projectInFlightToOverlapRoster(entries, true), targetPaths: code, baseBranch: await preferRemoteBaseRef(options.exec, options.baseBranch),
    originatingWorktreePath: options.cwd, ...(self === null ? {} : { originatingWorkUnitName: self }), snapshot: inFlight.snapshot });
  return { result: { ...result, overlaps: mergeOverlaps([...result.overlaps, ...state]),
    ...(notes.length === 0 ? {} : { notes: [...(result.notes ?? []), ...notes] }) }, warnings: inFlight.warnings, reachable: true };
}
function classify(path: string): ClassifiedStoreTarget | null {
  const address = identifyArcFileAddress(path);
  return address === null ? null : classifyStoreAddress(address);
}
async function callerIdentity(store: Store, frame: DerivedLocusFrame): Promise<string | null> {
  const subject = frame.entering.kind === "selected" ? frame.entering.row.subject : null;
  if (subject === null) return null;
  const claim = CheckoutClaimSchema.parse({ kind: subject.kind, slug: subject.key,
    ...(subject.kind === "work-unit" ? {} : { claimId: subject.claimId }) });
  const lookup = await store.lookup({ kind: "claim", claim });
  if (lookup.status === "refused") return null;
  const read = await store.read({ reference: lookup.result.reference });
  return read.status === "ok" && read.result.placement?.kind === "active" ? read.result.reference.owner.name : null;
}
async function stateOverlap(store: Store, entries: readonly StoreInFlightEntry[], path: string, target: ClassifiedStoreTarget,
  notes: string[]): Promise<ForeignArtifactOverlap | null> {
  if (target.workItem === undefined) return null;
  const lookup = await store.lookup({ kind: "slug", slug: SlugSchema.parse(target.workItem) });
  if (lookup.status === "refused") {
    if (lookup.refusal.code !== "not-found") notes.push(`${lookup.refusal.condition} ${lookup.refusal.remedy.text}`);
    return null;
  }
  const entry = entries.find((item) => entryName(item) === lookup.result.reference.owner.name);
  if (entry === undefined) return null;
  return { workItem: entryName(entry), ...(entry.branch === undefined ? {} : { branch: entry.branch }),
    ...(entry.worktreePath === undefined ? {} : { worktreePath: entry.worktreePath }), remoteOnly: entry.remoteOnly, matchedPaths: [path] };
}
function entryName(entry: StoreInFlightEntry): string { return entry.kind === "work-unit" ? entry.name : entry.slug; }
function mergeOverlaps(overlaps: readonly ForeignArtifactOverlap[]): ForeignArtifactOverlap[] {
  const byWork = new Map<string, ForeignArtifactOverlap>();
  for (const overlap of overlaps) {
    const key = JSON.stringify([overlap.workItem, overlap.branch, overlap.worktreePath]);
    const previous = byWork.get(key);
    byWork.set(key, { ...overlap, matchedPaths: [...new Set([...(previous?.matchedPaths ?? []), ...overlap.matchedPaths])] });
  }
  return [...byWork.values()];
}
