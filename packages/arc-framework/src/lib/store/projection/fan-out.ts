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
import { projectionProcessState, type ProjectionRootState } from "./process-state.js";
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
import { readReference } from "./change-detection.js";
import { checkIgnores } from "./ignore-check.js";
import { recordProjectionIgnoreCheck } from "./ignore-record.js";
import { guardedProjectionRoots } from "./ignore-guard.js";
import { writableUnder } from "./sweep.js";
import { loadProjectionGroups, withProjectionEntry } from "./index-memory.js";

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

/** Visit the writer's native root and registered siblings using one source read memo per round. */
export async function runProjectionFanOut(input: ProjectionCommandInput, ownWrites: readonly RecordReference[]): Promise<void> {
  if (input.location === undefined || input.ports === undefined) return;
  const ports = input.ports();
  const configuration = await observeProjectionConfiguration(input.checkout, () => readProjectionConfiguration(ports.exec, input.checkout));
  if (configuration.identity.status !== "identified") return;
  const source = createProjectionReadMemo(input.store), version = await source.version();
  if (version.status !== "ok") { reportProjectionFanOutFailure(input.checkout, version.refusal.condition); return; }
  const exec: typeof ports.exec = (command, args, options) => ports.exec(command, args, { cwd: input.checkout, ...options });
  const checkouts = createCheckoutObservation(exec), roster = await checkouts.scan();
  const evidence = createProjectionProtectionEvidence({ source, checkout: input.checkout, exec: ports.exec, checkouts });
  const round: FanOutRound = { input, ports, configuration, source, version: version.result, ownWrites, evidence };
  await visitTarget(round, input.checkout, input.location);
  if (!roster.ok) { reportProjectionFanOutFailure(input.checkout, roster.message); return; }
  for (const checkout of roster.worktrees) {
    if (!checkout.folderPresent || checkout.path === input.checkout) continue;
    try {
      const directories = await readGitDirectories(checkout.path, ports.fs);
      if (directories.gitDir === input.location.gitDir || await readReference(checkout.path) === null) continue;
      const location = { ...directories, primary: directories.gitDir === directories.commonDir,
        stateDir: join(directories.gitDir, PROJECTION_STATE_FOLDER) };
      await visitTarget(round, checkout.path, location);
    } catch (cause) { reportProjectionFanOutFailure(checkout.path, cause); }
  }
}

async function visitTarget(round: FanOutRound, checkout: string, location: ProjectionLocation): Promise<void> {
  try {
    const disk = await readProjectionIndex(location, false, { retry: true });
    if (disk.kind !== "index") return;
    const target: FanOutTarget = { checkout, location, index: disk.index };
    const result = await withProjectionFanOutLock(location, session => refreshTarget(round, target, session),
      { maxWaitMs: SIBLING_LOCK_WAIT_MS }, round.ports.lock);
    if (result.status !== "done") reportProjectionFanOutFailure(checkout,
      `Projection lease ${result.status}${result.status === "lost" || result.status === "mismatch" ? `: ${result.report}` : ""}`);
  } catch (cause) { reportProjectionFanOutFailure(checkout, cause); }
}

async function refreshTarget(round: FanOutRound, target: FanOutTarget, session: ProjectionLockSession): Promise<void> {
  await session.step();
  const disk = await readProjectionIndex(target.location, true);
  if (disk.kind !== "index" || disk.index.state !== target.index.state) return;
  const root = await targetRoot(round, target, session);
  try {
    let index = disk.index;
    const own = target.checkout === round.input.checkout;
    if (!eligibleTarget(round, root, index, own)) return;
    const needsReprojection = needsProjectionReprojection(root, index);
    if (index.state === round.version && !needsReprojection && (!own || round.ownWrites.length === 0)) return;
    if (index.state !== null && index.state !== round.version) {
      const changes = await round.source.changes({ from: index.state, to: round.version });
      if (changes.status !== "ok") return;
    }
    const ignores = await checkIgnores({ guard: { root: root.checkout, identity: root.identity,
      exec: root.ports.execInput, fs: root.ports.fs }, records: index.ignoreFiles, reference: await readReference(root.checkout),
      format: root.context.format, ignoreRules: round.configuration.ignoreRules, recordedGuard: index.ignoreGuard,
      readIgnoreRules: async () => (await readProjectionConfiguration(root.ports.exec, root.checkout)).ignoreRules });
    index = recordProjectionIgnoreCheck(index, ignores);
    root.writable = writableUnder(ignores, guardedProjectionRoots(root.identity).map(root => root.path));
    if (ignores.kind === "refused") reportProjectionFanOutFailure(root.checkout, `Projection ignore guard refused: ${ignores.reason}. ${ignores.remedy}`);
    if (!root.ready) root.unsent.clear();
    loadProjectionGroups(index, "walked");
    if (needsReprojection) index = await root.reproject?.({ source: round.source, version: round.version, index, evidence: round.evidence }) ?? index;
    index = await root.refresh?.({ source: round.source, version: round.version, index, evidence: round.evidence, publication: "caller" }) ?? index;
    if (own) index = markOwnWrites(index, round.ownWrites);
    await commitProjectionIndex({ location: root.location, checkout: root.checkout, index, checkpoint: session.step });
    await session.step();
    root.ready = true;
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

function markOwnWrites(index: ProjectionIndex, references: readonly RecordReference[]): ProjectionIndex {
  if (references.length === 0) return index;
  loadProjectionGroups(index, "walked");
  for (const [path, entry] of Object.entries(index.entries)) {
    if (entry.kind === "record" && !entry.changed && references.some(reference => sameReference(reference, entry.reference))) {
      index = withProjectionEntry(index, path, { ...entry, changed: true });
    }
  }
  return index;
}
