/** Refresh eligible worktree projections in bounded, command-owned rounds after landed store operations. */
import { interpretProjectionView } from "./view-settings.js";
import { needsProjectionReprojection, projectionSettings as projectedUnder } from "./settings.js";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createProjectionProtectionEvidence, type ProjectionProtectionEvidence } from "./protection-evidence.js";
import { readGitDirectories } from "../../git/directories.js";
import { createCheckoutObservation } from "../../locus/checkout-observation.js";
import { sameReference, type RecordReference, type StateVersion } from "../identity.js";
import type { ProjectionCommandInput } from "./engine.js";
import type { ProjectionEnginePorts } from "./engine-ports.js";
import { PROJECTION_STATE_FOLDER, type ProjectionLocation } from "./location.js";
import { projectionProcessState, type FanOutScope, type ProjectionRootState } from "./process-state.js";
import { readProjectionConfiguration, type ProjectionConfiguration } from "./configuration.js";
import { observeProjectionConfiguration } from "./command-configuration.js";
import { createProjectionReadMemo, type ProjectionSource } from "./record-source.js";
import { readProjectionIndex, commitProjectionIndex } from "./index-file.js";
import type { ProjectionIndex } from "./index-schema.js";
import { SIBLING_LOCK_WAIT_MS, type ProjectionLockSession } from "./lock.js";
import { withProjectionFanOutLock } from "./fan-out-lock.js";
import { reportProjectionFanOutFailure } from "./fan-out-scheduler.js";
import { bindProjectionRoot, refreshProjectionRootLayout } from "./engine-binding.js";
import { createHistoryMemo } from "./base-recovery.js";
import { resolveProjectionActor } from "./engine-actor.js";
import { loadProjectionGroups, withProjectionEntry } from "./index-memory.js";
import { refreshHeldProjectionRoot } from "./held-refresh.js";
import { readReference } from "./change-detection.js";
import { projectableRecord } from "./desired-paths.js";

interface FanOutRound {
  readonly input: ProjectionCommandInput;
  readonly ports: ProjectionEnginePorts;
  readonly configuration: ProjectionConfiguration;
  readonly source: ProjectionSource;
  readonly version: StateVersion;
  readonly ownWrites: readonly RecordReference[];
  readonly evidence: ProjectionProtectionEvidence;
}
interface FanOutTarget { readonly checkout: string; readonly location: ProjectionLocation; readonly index: ProjectionIndex }

/**
 * Visit the writer's native root and, unless the scope is its own checkout alone, registered siblings using one source
 * read memo per round.
 * @returns The writer's own writes its checkout could not mark this round, for the next round to mark.
 */
export async function runProjectionFanOut(input: ProjectionCommandInput, ownWrites: readonly RecordReference[],
  scope: FanOutScope = "all"): Promise<readonly RecordReference[]> {
  if (input.location === undefined || input.ports === undefined) return [];
  const ports = input.ports();
  const configuration = await observeProjectionConfiguration(input.checkout, () => readProjectionConfiguration(ports.exec, input.checkout));
  if (configuration.identity.status !== "identified") return [];
  // Only a record some view could lay in this checkout takes a changed mark here.
  const identity = configuration.identity.identity;
  const writes = ownWrites.filter(reference => projectableRecord(identity, reference));
  const source = createProjectionReadMemo(input.store), version = await source.version();
  if (version.status !== "ok") { reportProjectionFanOutFailure(input.checkout, version.refusal.condition); return writes; }
  const exec: typeof ports.exec = (command, args, options) => ports.exec(command, args, { cwd: input.checkout, ...options });
  const checkouts = createCheckoutObservation(exec), roster = await checkouts.scan();
  const evidence = createProjectionProtectionEvidence({ source, checkout: input.checkout, exec: ports.exec, checkouts });
  const round: FanOutRound = { input, ports, configuration, source, version: version.result, ownWrites: writes, evidence };
  const unmarked = await visitTarget(round, input.checkout, input.location);
  if (scope === "own") return unmarked;
  if (!roster.ok) { reportProjectionFanOutFailure(input.checkout, roster.message); return unmarked; }
  let ownGitDir: Promise<string> | undefined;
  for (const checkout of roster.worktrees) {
    if (!checkout.folderPresent || checkout.path === input.checkout) continue;
    try {
      // Git lists a primary whose `.git` is a `gitdir:` file at its Git directory, where no projection was laid.
      if (!await holdsGitMarker(checkout.path, ports.fs)) continue;
      const directories = await readGitDirectories(checkout.path, ports.fs);
      if (directories.gitDir === input.location.gitDir
        || await ports.fs.realpath(directories.gitDir) === await (ownGitDir ??= ports.fs.realpath(input.location.gitDir))
        || await readReference(checkout.path) === null) continue;
      const location = { ...directories, primary: directories.gitDir === directories.commonDir,
        stateDir: join(directories.gitDir, PROJECTION_STATE_FOLDER) };
      await visitTarget(round, checkout.path, location);
    } catch (cause) { reportProjectionFanOutFailure(checkout.path, cause); }
  }
  return unmarked;
}

async function holdsGitMarker(path: string, fs: ProjectionEnginePorts["fs"]): Promise<boolean> {
  try {
    await fs.lstat(join(path, ".git"));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Visit one checkout, answering the writer's own writes it left unmarked there; a sibling answers none. */
async function visitTarget(round: FanOutRound, checkout: string, location: ProjectionLocation): Promise<readonly RecordReference[]> {
  const state = projectionProcessState(), own = checkout === round.input.checkout;
  const unmarked = own ? round.ownWrites : [];
  // A faulted writer still records its marks under the lease; only its refresh waits for the repair.
  if (state.retiring.has(checkout) || state.faulted.has(checkout) && !own) return [];
  try {
    await round.ports.beforeFanOutTarget?.(checkout);
    const disk = await readProjectionIndex(location, false, { retry: true });
    // A checkout that holds no projection has no marks to record.
    if (disk.kind === "no-projection") return [];
    if (disk.kind !== "index") return unmarked;
    const target: FanOutTarget = { checkout, location, index: disk.index };
    const result = await withProjectionFanOutLock(location, session => refreshTarget(round, target, session),
      { maxWaitMs: SIBLING_LOCK_WAIT_MS }, round.ports.lock);
    if (result.status === "done") return result.value;
    reportProjectionFanOutFailure(checkout,
      `Projection lease ${result.status}${result.status === "lost" || result.status === "mismatch" ? `: ${result.report}` : ""}`);
  } catch (cause) { reportProjectionFanOutFailure(checkout, cause); }
  return unmarked;
}

/** Another refresh reached the worktree first, or its unset state waits for its own next command's rebuild. */
function leftToOwnCommand(held: ProjectionIndex, observed: ProjectionIndex, own: boolean): boolean {
  return held.state !== observed.state || (held.state === null && !own);
}

async function refreshTarget(round: FanOutRound, target: FanOutTarget, session: ProjectionLockSession): Promise<readonly RecordReference[]> {
  await session.step();
  const own = target.checkout === round.input.checkout;
  const disk = await readProjectionIndex(target.location, true);
  if (disk.kind !== "index") return own ? round.ownWrites : [];
  // The writer's own marks never wait on its refresh: a fenced, faulted or unreadable round still records them under this lease.
  const marked = own ? markOwnWrites(disk.index, round) : { index: disk.index, unmarked: [] };
  const keepMarks = async (): Promise<readonly RecordReference[]> => {
    if (marked.index !== disk.index) await commitProjectionIndex({ location: target.location, checkout: target.checkout, index: marked.index, checkpoint: session.step });
    return marked.unmarked;
  };
  if (projectionProcessState().faulted.has(target.checkout) || leftToOwnCommand(disk.index, target.index, own)) return keepMarks();
  const root = await targetRoot(round, target, session);
  try {
    const held = marked.index;
    if (!eligibleTarget(round, root, held, own)) return [];
    const needsReprojection = needsProjectionReprojection(root, held);
    if (held.state === round.version && !needsReprojection && (!own || round.ownWrites.length === 0)) return [];
    if (held.state !== null && held.state !== round.version) {
      const changes = await round.source.changes({ from: held.state, to: round.version });
      if (changes.status !== "ok") return await keepMarks();
    }
    if (!root.ready) root.unsent.clear();
    const refreshed = await refreshHeldProjectionRoot({ root, source: round.source, version: round.version, index: held,
      configuration: round.configuration, evidence: round.evidence,
      refused: (reason, remedy) => { reportProjectionFanOutFailure(root.checkout, `Projection ignore guard refused: ${reason}. ${remedy}`); } });
    const { index, unmarked } = own ? markOwnWrites(refreshed, round) : { index: refreshed, unmarked: [] };
    await commitProjectionIndex({ location: root.location, checkout: root.checkout, index, checkpoint: session.step });
    await session.step();
    root.ready = true;
    // A refresh that reached the round's version laid every record projected here, so a write it laid nowhere is not one.
    return index.state === round.version ? [] : unmarked;
  } finally { root.checkpoint = null; }
}

async function targetRoot(round: FanOutRound, target: FanOutTarget, session: ProjectionLockSession): Promise<ProjectionRootState> {
  const state = projectionProcessState(), previous = state.roots.get(target.checkout);
  if (previous !== undefined) {
    await refreshProjectionRootLayout(previous);
    previous.checkpoint = session.step;
    return previous;
  }
  const identity = round.configuration.identity;
  if (identity.status !== "identified") throw new Error("A fan-out requires the command's identity");
  state.history ??= createHistoryMemo(round.input.store);
  return bindProjectionRoot({ ...round.input, checkout: target.checkout, location: target.location, ports: round.ports,
    configuration: round.configuration, actor: await resolveProjectionActor(round.ports, target.location, identity.identity),
    history: state.history, session, register: true });
}

function eligibleTarget(round: FanOutRound, root: ProjectionRootState, index: ProjectionIndex, own: boolean): boolean {
  if (own) return true;
  if (index.reprojectionPending === true && !root.spawned) return false;
  const expected = projectedUnder(root), previous = index.projectedUnder;
  const identity = round.configuration.identity;
  if (identity.status !== "identified" || expected.identity !== identity.identity
    || !isDeepStrictEqual(expected.view, interpretProjectionView(round.configuration.view).view)) return false;
  if (previous.identity !== expected.identity || !isDeepStrictEqual(previous.view, expected.view)) return false;
  if (!root.spawned && !isDeepStrictEqual(previous, expected)) return false;
  const rules = round.configuration.ignoreRules;
  return rules.kind === "path" && index.ignoreGuard !== null && isDeepStrictEqual(index.ignoreGuard.configuration,
    { path: rules.path, values: [...rules.values], ignoreCase: [...rules.ignoreCase] });
}

interface OwnMarks { readonly index: ProjectionIndex; readonly unmarked: readonly RecordReference[] }

/** Mark the entries holding the writer's own writes, answering the writes no entry holds. */
function markOwnWrites(index: ProjectionIndex, round: FanOutRound): OwnMarks {
  const references = round.ownWrites;
  if (references.length === 0) return { index, unmarked: [] };
  loadProjectionGroups(index, "walked");
  // A pending identity change leaves the header's identity behind; the verb wrote the live identity's own records.
  const identity = round.configuration.identity;
  if (identity.status === "identified") loadProjectionGroups(index, [`.arc/user/${identity.identity}`]);
  const held = new Set<RecordReference>();
  for (const [path, entry] of Object.entries(index.entries)) {
    if (entry.kind !== "record") continue;
    const written = references.filter(reference => sameReference(reference, entry.reference)
      || entry.handoff !== undefined && sameReference(reference, entry.handoff.reference));
    for (const reference of written) held.add(reference);
    if (written.length > 0 && !entry.changed) index = withProjectionEntry(index, path, { ...entry, changed: true });
  }
  return { index, unmarked: references.filter(reference => !held.has(reference)) };
}
