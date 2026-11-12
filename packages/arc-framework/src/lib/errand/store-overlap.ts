/** Store-aware state and code overlap composition at the Errand advisory boundary. */
import type { Store } from "../store/contract.js";
import type { GitExec } from "../git/exec.js";
import type { DerivedLocusFrame } from "../locus/derived-reader.js";
import { runDerivedLocusStateProbe } from "../../handlers/derived-locus-state-probe.js";
import { deriveStoreInFlight, type StoreInFlightEntry } from "../git/in-flight-store.js";
import { detectForeignArtifactOverlap, preferRemoteBaseRef, projectInFlightToOverlapRoster,
  type ForeignArtifactDetectionResult, type ForeignArtifactOverlap } from "../git/foreign-artifact-detection.js";
import type { InFlightWarning } from "../git/in-flight-derivation.js";
import { resolveCheckoutLayoutContext } from "../store/checkout-layout.js";
import { SlugSchema } from "../kernel/index.js";
import { CheckoutClaimSchema } from "../store/lookup.js";
import { workUnitCheckoutClaim } from "../store/work-unit-claim.js";
import type { ProjectionIndexRead } from "../store/projection/index-file.js";
import { readOverlapIndex } from "./overlap-index.js";
import { resolveOverlapTargets, type OverlapStateTarget } from "./overlap-targets.js";
/** Invocation-bound overlap evidence, with optional acquisition ports for one captured frame. */
export interface StoreErrandOverlapOptions {
  store: Store; exec: GitExec; cwd: string; identity: string; teamMode: boolean; baseBranch: string; targetPaths: string[];
  projectId?: () => Promise<string>; readFrame?: () => Promise<DerivedLocusFrame>;
  readIndex?: () => Promise<ProjectionIndexRead>;
}
/** Check state ownership directly and code paths through the existing Git probes. */
export async function runStoreErrandOverlap(options: StoreErrandOverlapOptions): Promise<{ result: ForeignArtifactDetectionResult; warnings: InFlightWarning[]; reachable: boolean }> {
  const frame = options.readFrame === undefined ? await runDerivedLocusStateProbe(options) : await options.readFrame();
  const inFlight = await deriveStoreInFlight({ ...options, roster: frame.roster });
  const self = await callerIdentity(options.store, frame);
  const entries = inFlight.entries.filter((entry) => !entryIsCaller(entry, self));
  const active = await resolveCheckoutLayoutContext(options.cwd);
  const index = options.readIndex === undefined ? await readOverlapIndex(options.cwd) : await options.readIndex();
  const classified = await resolveOverlapTargets(options, active, index);
  const code = classified.code, notes = classified.notes, state: ForeignArtifactOverlap[] = [];
  for (const item of classified.state) {
    if (item.target.entryList) continue;
    const overlap = await stateOverlap(options.store, entries, item.path, item.target, notes);
    if (overlap !== null) state.push(overlap);
  }
  const result = code.length === 0 ? { overlaps: [] } : await detectForeignArtifactOverlap({ exec: options.exec,
    roster: projectInFlightToOverlapRoster(entries, true), targetPaths: code, baseBranch: await preferRemoteBaseRef(options.exec, options.baseBranch),
    originatingWorktreePath: options.cwd, ...(self?.kind !== "other" ? {} : { originatingWorkUnitName: self.name }), snapshot: inFlight.snapshot });
  return { result: { ...result, overlaps: mergeOverlaps([...result.overlaps, ...state]),
    ...(notes.length === 0 ? {} : { notes: [...(result.notes ?? []), ...notes] }) }, warnings: inFlight.warnings, reachable: true };
}
type CallerIdentity = { kind: "work-unit"; name: string; uid: string } | { kind: "other"; name: string };
function entryIsCaller(entry: StoreInFlightEntry, self: CallerIdentity | null): boolean {
  if (self === null) return false;
  return self.kind === "work-unit" ? entry.kind === "work-unit" && entry.uid === self.uid : entryName(entry) === self.name;
}
async function callerIdentity(store: Store, frame: DerivedLocusFrame): Promise<CallerIdentity | null> {
  const subject = frame.entering.kind === "selected" ? frame.entering.row.subject : null;
  if (subject === null) return null;
  const claim = subject.kind === "work-unit" ? workUnitCheckoutClaim(store, subject.key, subject.uid)
    : CheckoutClaimSchema.parse({ kind: subject.kind, slug: subject.key, claimId: subject.claimId });
  const lookup = await store.lookup({ kind: "claim", claim });
  if (lookup.status === "refused") return null;
  const read = await store.read({ reference: lookup.result.reference });
  if (read.status !== "ok" || read.result.placement?.kind !== "active") return null;
  const owner = read.result.reference.owner;
  if (subject.kind !== "work-unit") return { kind: "other", name: owner.name };
  return owner.type === "work-item" && owner.uid !== undefined ? { kind: "work-unit", name: owner.name, uid: owner.uid } : null;
}
async function stateOverlap(store: Store, entries: readonly StoreInFlightEntry[], path: string, target: OverlapStateTarget,
  notes: string[]): Promise<ForeignArtifactOverlap | null> {
  if (target.workItem === undefined) return null;
  let reference = target.reference;
  if (reference === undefined) {
    const lookup = await store.lookup({ kind: "slug", slug: SlugSchema.parse(target.workItem) });
    if (lookup.status === "refused") {
      if (lookup.refusal.code !== "not-found") notes.push(`${lookup.refusal.condition} ${lookup.refusal.remedy.text}`);
      return null;
    }
    reference = lookup.result.reference;
  }
  const owner = reference.owner;
  const entry = entries.find((item) => item.kind === "work-unit" && owner.type === "work-item" && owner.uid !== undefined
    ? item.uid === owner.uid : entryName(item) === owner.name);
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
