/**
 * Handler for `arc status` — the composite probe orchestrator.
 *
 * Reads configured identity and role pointers in parallel,
 * builds the default probe bundle from real I/O, and delegates orchestration
 * to {@link runStatus} / {@link runSessionInitStatus}. Branches on scope
 * (`--session-init`) and format (`--json`); `--json` bypasses Clack and
 * writes the typed result to stdout for harness consumption.
 *
 * The handler never exits non-zero on per-probe failure — the composite
 * shape carries per-slot errors so session-init can inspect the result and
 * decide what to do.
 *
 * @module
 */

import { access, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import * as p from "@clack/prompts";
import { z } from "zod";
import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import {
  createSessionRemoteContextReader,
  sessionRemotePrerequisites,
  type SessionRemoteContext,
} from "./status-remote-context.js";

import {
  buildSessionInitStatusSummary,
  buildStatusSummary,
  runRecoverStatus,
  runSessionHandoffStatus,
  runSessionInitStatus,
  runStatus,
} from "../commands/status.js";
import type {
  CompactionSeedWriteStatus,
  SessionHandoffProbes,
  SessionInitProbes,
  StatusProbes,
} from "../commands/status.js";
import { runActiveStatus } from "../commands/active.js";
import {
  runConfigSessionInitStatus,
  runConfigStatus,
} from "../commands/config.js";
import { runDomainRulesSessionInitStatus } from "../commands/constitution.js";
import {
  runExtensionsSessionInitStatus,
  runExtensionsStatus,
} from "../commands/extensions.js";
import {
  runUserSessionInitStatus,
  runUserStatus,
} from "../commands/user.js";
import {
  filterRosterByIdentity,
  runIdentityScopedWorktreeRoster,
  runWorktreeRoster,
} from "../lib/git/index.js";
import { analyzeRecentRemoteBranchesSnapshot } from "../lib/git/recent-remote-branches.js";
import {
  analyzeInFlightSnapshot,
  renderInFlightWarning,
  type InFlightEntry,
  type InFlightResidue,
  type InFlightWarning,
} from "../lib/git/in-flight-derivation.js";
import {
  composeMaterializableDiscoveryRefreshRemedy,
  findMaterializableWorkUnits,
} from "../lib/session-init/materializable-work-units.js";
import {
  runBranchGoneRecovery,
  RECOVERY_RECENCY_DAYS,
} from "../lib/session-init/branch-gone-recovery.js";
import { runStaleWorktreeSweep } from "../lib/session-init/stale-worktree-sweep.js";
import { resolveCurrentHuskAdvisory } from "../lib/session-init/current-husk-advisory.js";
import { revalidateDecodedHuskRetirementEvidenceStrict } from "../lib/work-unit/teardown-retirement-driver.js";
import { runOrphanBranchSweep } from "../lib/session-init/orphan-branch-sweep.js";
import { runRetiredSubdirDetection } from "../lib/session-init/retired-subdir-detection.js";
import { runErrandStalenessSweep } from "../lib/session-init/errand-staleness-sweep.js";
import { runErrandState } from "../lib/session-init/errand-state.js";
import { runWorkUnitState } from "../lib/session-init/work-unit-state.js";
import { createGhWorkUnitPrSource } from "../lib/session-init/work-unit-pr-source.js";
import { runInboxState } from "../lib/session-init/inbox-state.js";
import { runPartialPushMarkerSurface } from "../lib/session-init/partial-push-marker-surface.js";
import { runNotesCompactionSessionAdvisory } from "../lib/session-init/notes-compaction-advisory.js";
import {
  runCurrentWuReconcileSessionProbe,
} from "../lib/session-init/current-wu-reconcile.js";
import { runDerivedLocusStateProbe } from "./derived-locus-state-probe.js";
import { extractReminderEntries } from "../lib/session-init/inbox-reminders.js";
import { shouldNudge, type NudgeMarkerState } from "../lib/session-init/nudge-rate-limit.js";
import { runDirtyStateStatus, type DirtyStateResult } from "../lib/git/dirty-state.js";
import { runHeadHashStatus } from "../lib/git/head-hash.js";
import { runPushabilityStatus } from "../lib/git/pushability.js";
import {
  analyzeWorktreeSnapshot,
  readConfiguredUpstreamBranch,
  runPassiveWorktreeInspection,
} from "../lib/git/worktree-sync.js";
import { analyzeBaseDistanceSnapshot } from "../lib/git/base-distance.js";
import {
  createCurrentBaseDriftAdapters,
  workUnitPathTreatmentContext,
} from "../lib/base-drift/current-adapters.js";
import { locusWorkUnitAtPath } from "../lib/session-init/locus-classification.js";
import {
  analyzeBaseBranchSnapshot,
  readLocalBaseOid,
  resolveBaseCheckoutLocus,
} from "../lib/git/base-branch-sync.js";
import { analyzeSupersessionSnapshot } from "../lib/git/supersession.js";
import { resolveWorktreeIdentity } from "../lib/git/worktree-identity.js";
import { readWorktreeMarker } from "../lib/git/worktree-marker.js";
import { deriveRestateCandidates } from "../lib/handoff/restate-candidates.js";
import { resolveSessionNotesPath } from "../lib/handoff/session-notes-path.js";
import {
  resolveAllSettings,
  type ResolvedSettingsResult,
} from "../lib/config/resolved-settings.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import type { GitExec, GitExecInput } from "../lib/git/index.js";
import { createGitExec, createRawGitExec, createUserIOContext, readGitBlobBytes } from "../lib/io-context.js";
import type { RawGitExec } from "../lib/change-facts.js";
import {
  projectTransientInFlightRead,
  readFetchedTransientInFlightIndexes,
  readTransientInFlightIndexes,
} from "../lib/errand/record.js";
import { resolveReleaseRouting } from "../lib/release/routing.js";
import type { ReleaseRoutingValue } from "../lib/release/routing.js";
import {
  emitCompactionSeed,
  parseUncommittedFiles,
  type CompactionSeedGitSnapshot,
  type EmitCompactionSeedResult,
} from "../lib/compaction-seed/emitter.js";
import { assembleStatusUserView } from "../lib/status/assemble-user-view.js";
import {
  composeProjectReadinessViewResult,
  resolveProjectReadinessRenderStamp,
  resolveProjectReadinessViewInput,
  type ProjectReadinessWarning,
} from "../lib/status/project-view.js";
import {
  renderRoadmapFromIndexViewResult,
  resolveStagedTransitionOverlays,
  ROADMAP_PATH,
} from "../lib/status/roadmap-regeneration-assert.js";
import {
  assertSessionInitProbeResult,
  assertSessionRecoverProbeResult,
} from "../commands/status/schema.js";
import { resolveUserSurfaceResolver, type UserSurfaceResolver } from "../lib/user-surfaces.js";
import {
  analyzeUserReferenceAuthority,
  projectUserReferenceSessionResult,
} from "../lib/user-reference-reconcile.js";
import { SlugSchema } from "../lib/kernel/index.js";
import { buildLifecycleIndex } from "../lib/work-unit/lifecycle-index.js";
import {
  enumerateGitTransitionRecords,
  queryGitTransitionDisposition,
} from "../lib/work-unit/git-transition-record-enumeration.js";
import { listCurrentWuArtifactPaths } from "../lib/work-unit/reference-reconcile.js";
import { resolveComposedLifecycleIndex } from "../lib/work-unit/composed-lifecycle-index.js";
import { resolveSlugQuery, type SlugStateQuery } from "../lib/work-unit/lifecycle-query.js";
import { listParkedSlugs } from "../lib/work-unit/lifecycle-resolver.js";
import { transitionOverlayCompositionInput } from "../lib/work-unit/transition-overlay.js";
import {
  parseIntegrationBoundaryLocus,
  type IntegrationBoundaryLocus,
} from "../scripts/review-gate/policy/integration-boundary-locus.js";
import { createRecoverStatusProbes } from "./recover-probes.js";
import { RepositoryGitCommonStatePublisher } from "../lib/git-common-state.js";
import { RepositoryDeliveryPlanStore, RepositoryDeliveryStateStore } from "../lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../lib/delivery/plan.js";
import { readDeliveryPositionView } from "../lib/session-init/delivery-position.js";
import { observeRepositoryDeliveryPosition } from "../lib/session-init/delivery-position-facts.js";
import { observeDeliveryEligibilityRef } from "../lib/delivery/git-eligibility.js";
import { proveGitDeliveryContribution } from "../lib/delivery/git-contribution-proof.js";
import { projectDeliveryContributionEndpoints } from "../lib/delivery/contribution-proof.js";
import { observeGitDeliveryLandingResult } from "../lib/delivery/git-landing-result.js";
import { resolveChangeRequestLifecycleConfiguration } from "../lib/errand/change-request-lifecycle.js";
import { GhDeliveryHostPort } from "../scripts/delivery/hosts/github.js";
import {
  hostedGhRunner,
  type HostedProcessRunner,
} from "../scripts/review-gate/hosted/gh-process.js";
import { readIdentityPointers } from "./identity-pointers.js";
import { requireArcProjectRoot } from "./shared.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import type { CleanupBaseEvidence } from "../lib/session-init/cleanup-remote-evidence.js";
import { readLocalInFlightRefSnapshot } from "../lib/git/remote-ref-reader.js";
import { resolveWorktreePathsByBranchResult } from "../lib/git/worktree-roster.js";

const SESSION_DELIVERY_OBSERVATION_TIMEOUT_MS = 10_000;

/**
 * Bind all host calls in one session delivery observation to one aggregate deadline.
 *
 * @param runner - Underlying hosted-process runner.
 * @param timeoutMs - Aggregate observation deadline in milliseconds.
 * @returns A delivery host whose calls share one abort signal.
 */
export function createSessionDeliveryObservationHost(
  runner: HostedProcessRunner,
  timeoutMs = SESSION_DELIVERY_OBSERVATION_TIMEOUT_MS,
): GhDeliveryHostPort {
  const signal = AbortSignal.timeout(timeoutMs);
  return new GhDeliveryHostPort({ run: (args) => runner.run(args, { signal }) });
}

function requireGitExecInput(execInput: GitExecInput | undefined): GitExecInput {
  if (execInput === undefined) {
    throw new Error("Status recovery requires stdin-capable Git I/O.");
  }
  return execInput;
}

export interface StatusCliOptions {
  sessionInit?: boolean;
  sessionHandoff?: boolean;
  recover?: boolean;
  user?: boolean;
  project?: boolean;
  /** `--local`: render explicit user/project views from local refs without a network read. */
  local?: boolean;
  /** `--staged`: render the `--project` view's tree inputs from the git index (the pre-commit regen source). */
  staged?: boolean;
  /** `--write`: with `--project --staged`, write the rendered view to the tracked ROADMAP atomically. */
  write?: boolean;
  /** `true` opts a slug query into live membership; `false` skips network reads for live-default views. */
  fetch?: boolean;
  json?: boolean;
  /** With --session-init: write the machine-local compaction seed sidecar. */
  writeCompactionSeed?: boolean;
}

/** Validated composite status mode and optional subject. */
export const StatusCommandInputSchema = z.object({
  slug: SlugSchema.optional(),
  sessionInit: z.boolean().optional(),
  sessionHandoff: z.boolean().optional(),
  recover: z.boolean().optional(),
  user: z.boolean().optional(),
  project: z.boolean().optional(),
  local: z.boolean().optional(),
  staged: z.boolean().optional(),
  write: z.boolean().optional(),
  fetch: z.boolean().optional(),
  json: z.boolean().optional(),
  writeCompactionSeed: z.boolean().optional(),
}).strict().superRefine((value, refinement) => {
  const modes = [value.slug !== undefined, value.sessionInit, value.sessionHandoff, value.recover, value.user, value.project]
    .filter(Boolean).length;
  if (modes > 1) {
    refinement.addIssue({
      code: "custom",
      message: "A status <slug> query, --session-init, --session-handoff, --recover, --user, and --project are mutually exclusive.",
    });
  }
  if (value.writeCompactionSeed === true && value.sessionInit !== true) {
    refinement.addIssue({ code: "custom", path: ["writeCompactionSeed"], message: "Requires --session-init." });
  }
  if (value.staged === true && value.project !== true) {
    refinement.addIssue({ code: "custom", path: ["staged"], message: "Requires --project." });
  }
  if (value.write === true && (value.staged !== true || value.json === true)) {
    refinement.addIssue({ code: "custom", path: ["write"], message: "Requires --project --staged without --json." });
  }
});

/** Registry contribution owned by composite status. */
export const statusCommandInputRegistration = {
  commandPath: "status",
  schema: StatusCommandInputSchema,
  schemaFields: {
    "operand.slug": "slug",
    "option.session-init": "sessionInit",
    "option.session-handoff": "sessionHandoff",
    "option.recover": "recover",
    "option.user": "user",
    "option.project": "project",
    "option.local": "local",
    "option.no-fetch": "fetch",
    "option.staged": "staged",
    "option.write": "write",
    "option.fetch": "fetch",
    "option.json": "json",
    "option.write-compaction-seed": "writeCompactionSeed",
  },
} satisfies CommandInputRegistration;

/** Machine-output policies owned by the status adapter. */
export const statusCommandInputPolicyDeclarations = [{
  commandPath: "status",
  aliases: [],
  sites: ([
    ["json", "json"], ["recover", "recover"], ["session-handoff", "sessionHandoff"],
    ["session-init", "sessionInit"],
  ] as const).map(([option, schemaField]) => declareCliOptionSite(option, {
    acquisition: "machine-mode", schemaOwnership: "owned", schemaField,
    cancellation: "not-applicable", automation: { noInput: "same", flags: [`--${option}`], acceptedSyntax: [] },
    mutationBoundary: "output selection", subprocess: "none",
  })).concat({
    id: "semantic.interaction-context",
    source: { file: "handlers/status.ts", symbol: "handleStatus" },
    origin: "declaration",
    acquisition: "derived",
    schemaOwnership: "none",
    derivationSource: "shared InteractionContext",
    cancellation: "not-applicable",
    automation: { noInput: "same", flags: ["--no-input", "--json"], acceptedSyntax: [] },
    mutationBoundary: "status probe orchestration",
    subprocess: "terminal-prompts",
  }),
}] satisfies readonly CommandInputDeclaration[];

function writeProjectReadinessWarnings(warnings: readonly ProjectReadinessWarning[]): void {
  for (const warning of warnings) process.stderr.write(`warning: ${warning.rendered}\n`);
}

function releaseRoutingFromSettings(settings: ResolvedSettingsResult): ReleaseRoutingValue {
  return resolveReleaseRouting({
    releaseOptedIn: settings.resolved.releaseOptedIn.value === "true",
    commitInterlock: settings.resolved.commitInterlock.value,
    pushInterlock: settings.resolved.pushInterlock.value,
  });
}

const ERRAND_NUDGE_MARKER_RELATIVE = ".internal/errand-reminder-last-nudge.txt";

/**
 * Marker for the work-unit staleness nudge — a separate per-user file from the
 * errand reminder so the two batch independently (the errand reminder clears at
 * housekeep; WU staleness clears when the WU merges / archives).
 */
const WORK_UNIT_STALE_NUDGE_MARKER_RELATIVE = ".internal/work-unit-stale-last-nudge.txt";
const NOTES_COMPACTION_NUDGE_MARKER_RELATIVE = ".internal/notes-compaction-last-nudge.txt";

// The executor carries no root, so every reader composing one request's evidence names
// its own; otherwise a read resolves against the process directory instead.
async function readSessionBranch(exec: GitExec, cwd: string): Promise<string | null> {
  const branch = (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd })).stdout.trim();
  return branch === "" || branch === "HEAD" ? null : branch;
}

function sessionCleanupBaseEvidence(context: SessionRemoteContext): CleanupBaseEvidence {
  const prerequisites = sessionRemotePrerequisites(context);
  if (prerequisites.kind === "supplied") {
    return {
      remoteSyncEnabled: true,
      snapshot: prerequisites.snapshot,
      objectAvailability: prerequisites.objectAvailability,
      history: prerequisites.history,
    };
  }
  return {
    remoteSyncEnabled: false,
    snapshot: { kind: "unreachable", failureReason: "error" },
    objectAvailability: { kind: "unavailable", reason: "execution" },
    history: { kind: "unavailable", reason: "execution" },
  };
}

/**
 * Resolve the advertised base OID when — and only when — exact evidence establishes
 * it is present locally.
 *
 * `null` means the evidence is genuinely absent: remote sync is off, the remote is
 * unreachable, the base is not advertised, its object is still pending fetch, or the
 * local history is shallow. Each is a fact a caller may act on.
 *
 * An uninspectable prerequisite is not such a fact. A local availability batch or
 * history read that failed says nothing about the base, so it raises rather than
 * resolving to `null`, and the caller's `safeProbe` boundary reports the typed probe
 * error. This matches the sibling comparators — `analyzeBehindBaseSnapshot` and
 * `runStaleWorktreeSweep` — which raise on the same gaps.
 *
 * @param evidence - Advertised-base prerequisites for this request.
 * @param baseBranch - Integration base branch short-name.
 * @returns The base OID under exact local presence, or `null` on evidence absence.
 */
export function exactSessionBaseOid(evidence: CleanupBaseEvidence, baseBranch: string): string | null {
  if (!evidence.remoteSyncEnabled || evidence.snapshot.kind === "unreachable") return null;
  const baseOid = evidence.snapshot.tips[baseBranch];
  if (baseOid === undefined) return null;
  if (evidence.objectAvailability.kind !== "complete") {
    throw new Error("Advertised base commit availability could not be inspected.");
  }
  const baseCommitIsLocal = evidence.objectAvailability.commits[baseOid];
  if (baseCommitIsLocal === false) return null;
  if (baseCommitIsLocal === undefined) {
    throw new Error("The advertised base commit has no local availability fact.");
  }
  if (evidence.history.kind === "shallow") return null;
  if (evidence.history.kind !== "complete") {
    throw new Error("Local history completeness could not be inspected.");
  }
  return baseOid;
}

/**
 * Resolve the work unit at the derived frame's canonical entering checkout.
 *
 * @param frame - Derived roster and canonical entering-checkout selection.
 * @returns The retained work-unit identity, or `null` when the entering row owns none.
 */
export function sessionPathTreatmentWorkUnit(
  frame: Pick<Awaited<ReturnType<typeof runDerivedLocusStateProbe>>, "roster" | "entering">,
): { name: string } | null {
  const row = frame.entering.kind === "selected" ? frame.entering.row : null;
  return row === null ? null : locusWorkUnitAtPath(frame.roster, row.checkout.path);
}

function parsePositiveInteger(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Resolve once-per-calendar-day marker state for a batched session-init nudge
 * from its per-user marker file. Shared across the rate-limited surfaces (errand
 * reminder / stale-errand, work-unit staleness) — each passes its own
 * `markerRelative` so the surfaces batch independently.
 */
async function resolveNudgeState(
  cwd: string,
  io: ReturnType<typeof createUserIOContext>,
  identity: string | null,
  markerRelative: string,
  resolveSurfaces?: (identity: string) => Promise<UserSurfaceResolver>,
): Promise<NudgeMarkerState> {
  const today = new Date().toISOString().slice(0, 10);
  if (identity === null) {
    return { shouldNudge: false, markerPath: null, today };
  }
  const surfaces = resolveSurfaces !== undefined
    ? await resolveSurfaces(identity)
    : await resolveUserSurfaceResolver({ cwd, identity: SlugSchema.parse(identity), exec: io.exec });
  const markerPath = surfaces.identityGlobalDisplayPath(markerRelative);
  const absoluteMarkerPath = surfaces.identityGlobalPath(markerRelative);
  const lastNudge = await io.readFile(absoluteMarkerPath).then(
    (content) => content.trim(),
    () => null,
  );
  return {
    shouldNudge: shouldNudge({ lastNudge, today }),
    markerPath,
    today,
  };
}

export async function handleStatus(
  slug: string | undefined,
  opts: StatusCliOptions,
  interaction?: InteractionContext,
): Promise<void> {
  const exec = createGitExec(interaction?.subprocess);
  const parsed = StatusCommandInputSchema.safeParse({ slug, ...opts });
  if (!parsed.success) {
    process.stderr.write(`${z.prettifyError(parsed.error)}\n`);
    process.exitCode = 1;
    return;
  }
  slug = parsed.data.slug;
  opts = parsed.data;
  const modeCount = [
    slug !== undefined,
    opts.sessionInit,
    opts.sessionHandoff,
    opts.recover,
    opts.user,
    opts.project,
  ].filter(Boolean).length;
  if (modeCount > 1) {
    process.stderr.write(
      "Error: a status <slug> query, --session-init, --session-handoff, --recover, --user, and --project are mutually exclusive.\n",
    );
    process.exitCode = 1;
    return;
  }
  if (opts.writeCompactionSeed && !opts.sessionInit) {
    process.stderr.write("Error: --write-compaction-seed requires --session-init.\n");
    process.exitCode = 1;
    return;
  }

  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const json = Boolean(opts.json);
  const transitionExec = createRawGitExec(cwd);
  const localOnlyTransitionExec: RawGitExec = (args, options) => transitionExec(args, {
    ...options,
    objectAccess: "local-only",
  });

  if (slug !== undefined) {
    // Slug→state query: a subject-keyed read over the lifecycle-complete index.
    // The index walk binds real I/O; the resolution stays a pure lib projection.
    // Transient identities still feed the oracle so recorded Errand
    // branches are not mis-emitted as `no-record-or-meta` residue.
    const { settings } = await readConfigSettings(cwd);
    const { identity } = await readIdentityPointers(exec);
    const transient = projectTransientInFlightRead(
      await readTransientInFlightIndexes({ exec, identity }),
    );
    const composed = await resolveComposedLifecycleIndex({
      cwd,
      fs: {
        readdir: (path) => readdir(path, { withFileTypes: true }),
        readFile: (path) => readFile(path, "utf8"),
      },
      oracle: {
        exec,
        acquisitionPolicy: opts.fetch === true ? "passive-live" : "local",
        baseBranch: settings["branch.base"],
        errandSlugByBranch: transient.indexes.slugByBranch,
        errandRecordsComplete: transient.complete,
      },
    });
    const query = resolveSlugQuery(composed.index, slug);
    const worktreePath = composed.worktreePathBySlug.get(slug);
    const operationalReadPath = worktreePath
      ?? (composed.recordsBySlug.get(slug)?.writablePath === undefined ? undefined : cwd);
    const operational = await resolveSlugOperationalBoundary({
      slug,
      state: query.state,
      worktreePath: operationalReadPath,
      exec,
    });
    const warnings = [
      ...composed.qualityFacts.warnings.map(renderInFlightWarning),
      ...(opts.fetch === true && composed.qualityFacts.unreachable === true
        ? ["Remote unreachable; query derived from local refs only."]
        : []),
      ...operational.warnings,
    ];
    const output = {
      ...query,
      integrationBoundary: operational.integrationBoundary,
      ...(worktreePath !== undefined ? { worktreePath } : {}),
      ...(warnings.length > 0 ? { warnings: [...new Set(warnings)] } : {}),
    };
    if (json) {
      process.stdout.write(`${JSON.stringify(output)}\n`);
      return;
    }
    p.intro("arc status");
    p.note(formatSlugStateQuery(query, {
      integrationBoundary: output.integrationBoundary,
      worktreePath,
      warnings: output.warnings ?? [],
    }), "Lifecycle state");
    p.outro("Done.");
    return;
  }

  const lifecycleFs = {
    readdir: (path: string) => readdir(path, { withFileTypes: true }),
    readFile: (path: string) => readFile(path, "utf8"),
  };
  const io = createUserIOContext(interaction?.subprocess);
  const { identity, role } = await readIdentityPointers(exec);
  const userSurfaceResolvers = new Map<string, ReturnType<typeof resolveUserSurfaceResolver>>();
  const userSurfacesFor = (id: string): Promise<UserSurfaceResolver> => {
    let resolver = userSurfaceResolvers.get(id);
    if (resolver === undefined) {
      resolver = resolveUserSurfaceResolver({ cwd, identity: SlugSchema.parse(id), exec });
      userSurfaceResolvers.set(id, resolver);
    }
    return resolver;
  };
  // Both the inbox-state and reminder-sweep probes read the same personal
  // `USER-INBOX.md`; a missing file reads as empty (no captures).
  const readUserInbox = (id: string): Promise<string> =>
    userSurfacesFor(id)
      .then((surfaces) => io.readFile(surfaces.identityGlobalPath("USER-INBOX.md")))
      .catch(() => "");

  if (opts.sessionHandoff) {
    if (!json) {
      process.stderr.write(
        "Error: --session-handoff currently requires --json (interactive rendering not yet implemented).\n",
      );
      process.exitCode = 1;
      return;
    }
    // Cache the resolution promise instead of awaiting eagerly: a thrown
    // settings-resolution error now surfaces through the orchestrator's typed
    // per-probe Result channel rather than aborting the whole
    // command and breaking the composite-result contract. The mode-validation
    // early-return above runs first to avoid leaving an unawaited rejection on
    // the non-JSON exit path.
    const resolvedSettingsP = resolveAllSettings({ cwd, exec, readFile: io.readFile });
    const probes: SessionHandoffProbes = {
      derivedLocusState: async (id, activeExtensions) => {
        const resolved = await resolvedSettingsP;
        return runDerivedLocusStateProbe({
          cwd,
          identity: id,
          baseBranch: resolved.settings["branch.base"],
          activeExtensions,
          exec,
        });
      },
      extensions: () => runExtensionsSessionInitStatus({ cwd }),
      dirty: () => runDirtyStateStatus({ exec }),
      worktree: async () => {
        const resolved = await resolvedSettingsP;
        const remoteSyncEnabled = resolved.settings["session.remote_sync"] === "enabled";
        if (io.execInput === undefined) {
          throw new Error("Handoff worktree inspection requires stdin-capable Git I/O.");
        }
        return runPassiveWorktreeInspection({
          exec,
          execInput: io.execInput,
          remoteSyncEnabled,
          cwd,
        });
      },
      user: async (id) => {
        const resolved = await resolvedSettingsP;
        const remoteSyncEnabled = resolved.settings["session.remote_sync"] === "enabled";
        return runUserSessionInitStatus({ cwd, io, identity: id, remoteSyncEnabled });
      },
      syncInterlock: async () => {
        // syncInterlock is per-developer-only; the generic resolver type
        // still permits a "yaml" source, but no runtime path produces it
        // for this key. Coerce defensively to keep HandoffSyncInterlock's
        // narrower source union honest.
        const resolved = (await resolvedSettingsP).resolved.syncInterlock;
        const source = resolved.source === "yaml" ? "default" : resolved.source;
        return { value: resolved.value, source };
      },
      head: () => runHeadHashStatus({ exec }),
      pushability: () => runPushabilityStatus({
        exec,
        access,
        target: "worktree",
      }),
      restateCandidates: async () => {
        let sessionNotes: string | null = null;
        if (identity !== null) {
          const path = await resolveSessionNotesPath(cwd, identity, io);
          if (path !== null) {
            sessionNotes = await io.readFile(path).catch(() => null);
          }
        }
        return deriveRestateCandidates({ exec, sessionNotes });
      },
      releaseRouting: async () => releaseRoutingFromSettings(await resolvedSettingsP),
      inboxState: async (id) => runInboxState({ content: await readUserInbox(id) }),
    };
    // Do not await userSurfacesFor here: a rejection would abort the composite
    // before safeProbe handling. Resolution runs inside runSessionHandoffStatus
    // under safeProbe("pathSet", …) so failures stay slot-wise in the envelope.
    // Discriminated options: resolver required iff identity is non-null.
    const result = identity === null
      ? await runSessionHandoffStatus({ identity: null, role, probes })
      : await runSessionHandoffStatus({
        identity,
        role,
        probes,
        resolveHandoffSurfaces: async () => {
          const surfaces = await userSurfacesFor(identity);
          return {
            workingMemoryPath: surfaces.workingMemoryPath,
            sessionNotesPath: (workUnitName: string) =>
              surfaces.sessionNotesPath(SlugSchema.parse(workUnitName)),
          };
        },
      });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  if (opts.recover) {
    if (!json) {
      process.stderr.write(
        "Error: --recover currently requires --json (interactive rendering not implemented).\n",
      );
      process.exitCode = 1;
      return;
    }
    const result = await runRecoverStatus({
      identity,
      role,
      probes: createRecoverStatusProbes({
        cwd,
        dirty: () => runDirtyStateStatus({ exec }),
        exec,
        execInput: requireGitExecInput(io.execInput),
        readFile: io.readFile,
      }),
      workingMemoryPath: identity === null ? null : (await userSurfacesFor(identity)).workingMemoryPath,
    });
    assertSessionRecoverProbeResult(result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  if (opts.sessionInit) {
    // A missing stdin-capable executor degrades object availability inside the remote
    // context rather than aborting here: throwing before any probe runs would deny the
    // caller the whole composite envelope over one unrelated capability.
    // See sessionHandoff branch above for the rationale on caching the
    // resolution promise rather than awaiting eagerly.
    const resolvedSettingsP = resolveAllSettings({ cwd, exec, readFile: io.readFile });
    const deliveryPublisher = new RepositoryGitCommonStatePublisher(exec, cwd);
    const deliveryPlans = new RepositoryDeliveryPlanStore(deliveryPublisher, DeliveryPlanV1Codec);
    const deliveryStates = new RepositoryDeliveryStateStore(deliveryPublisher);
    const getRemoteContext = createSessionRemoteContextReader({
      cwd,
      exec,
      execInput: io.execInput,
      remoteSyncEnabled: async () =>
        (await resolvedSettingsP).settings["session.remote_sync"] === "enabled",
    });
    const derivedLocusStatePromises = new Map<string, ReturnType<typeof runDerivedLocusStateProbe>>();
    const getDerivedLocusState = (
      id: string,
      activeExtensions: readonly string[] = [],
    ): ReturnType<typeof runDerivedLocusStateProbe> => {
      const key = `${id}:${JSON.stringify(activeExtensions)}`;
      let pending = derivedLocusStatePromises.get(key);
      if (pending === undefined) {
        pending = (async () => {
          const resolved = await resolvedSettingsP;
          return runDerivedLocusStateProbe({
            cwd,
            identity: id,
            baseBranch: resolved.settings["branch.base"],
            activeExtensions,
            exec,
          });
        })();
        derivedLocusStatePromises.set(key, pending);
      }
      return pending;
    };
    const getOptionalDerivedFrame = async () => {
      if (identity === null) return null;
      try {
        return await getDerivedLocusState(identity);
      } catch {
        return null;
      }
    };
    const getOptionalDerivedRoster = async () => (await getOptionalDerivedFrame())?.roster ?? null;
    const compactionSeedGitSnapshotP = opts.writeCompactionSeed
      ? readCompactionSeedGitSnapshot(cwd, exec)
      : null;
    // Shared in-flight oracle slice over the request's immutable remote context.
    // Errand state and materializable-WU discovery share one local classification
    // pass; the separately typed transient-identity read remains outside the code
    // repository snapshot.
    let oraclePromise: Promise<{
      entries: InFlightEntry[];
      residue: InFlightResidue[];
      warnings: InFlightWarning[];
      reachable: boolean;
      remoteEvidence: "exact" | "pending-fetch" | "unreachable" | "not-applicable";
      failureReason?: "network" | "auth" | "timeout" | "error";
      pendingBranchCount: number;
      locallyPresentBranches: ReadonlySet<string>;
    }> | undefined;
    let oracleContext: SessionRemoteContext | undefined;
    let transientIndexesPromise: ReturnType<typeof readTransientInFlightIndexes> | undefined;
    let discoveryTransientIndexesPromise: ReturnType<typeof readFetchedTransientInFlightIndexes> | undefined;
    const getTransientIndexes = () => {
      transientIndexesPromise ??= readTransientInFlightIndexes({ exec, identity });
      return transientIndexesPromise;
    };
    const getDiscoveryTransientIndexes = () => {
      discoveryTransientIndexesPromise ??= readFetchedTransientInFlightIndexes({
        exec,
        identity,
        remote: "origin",
      });
      return discoveryTransientIndexesPromise;
    };
    const getOracle = (context: SessionRemoteContext): Promise<{
      entries: InFlightEntry[];
      residue: InFlightResidue[];
      warnings: InFlightWarning[];
      reachable: boolean;
      remoteEvidence: "exact" | "pending-fetch" | "unreachable" | "not-applicable";
      failureReason?: "network" | "auth" | "timeout" | "error";
      pendingBranchCount: number;
      locallyPresentBranches: ReadonlySet<string>;
    }> => {
      if (oracleContext !== undefined && oracleContext !== context) {
        return Promise.reject(new Error("In-flight oracle received a different session remote context."));
      }
      oracleContext = context;
      oraclePromise ??= (async () => {
        const prerequisites = sessionRemotePrerequisites(context);
        if (prerequisites.kind === "not-needed") {
          return {
            entries: [],
            residue: [],
            warnings: [],
            reachable: false,
            remoteEvidence: "not-applicable" as const,
            pendingBranchCount: 0,
            locallyPresentBranches: new Set<string>(),
          };
        }
        if (prerequisites.snapshot.kind === "unreachable") {
          return {
            entries: [],
            residue: [],
            warnings: [],
            reachable: false,
            remoteEvidence: "unreachable" as const,
            failureReason: prerequisites.snapshot.failureReason,
            pendingBranchCount: 0,
            locallyPresentBranches: new Set<string>(),
          };
        }
        const resolved = await resolvedSettingsP;
        const teamMode = resolved.settings["team.mode"] === "true";
        const [transientRead, parkedSlugs, derivedRoster, localRefs, worktrees] = await Promise.all([
          getDiscoveryTransientIndexes(),
          buildLifecycleIndex({ cwd, fs: lifecycleFs }).then(listParkedSlugs),
          getOptionalDerivedRoster(),
          // Default remote, request root: these local reads join the snapshot and
          // availability facts this request context already carries.
          readLocalInFlightRefSnapshot(exec, undefined, cwd),
          resolveWorktreePathsByBranchResult(exec, cwd),
        ]);
        const transient = projectTransientInFlightRead(transientRead);
        const transientIndexes = transient.indexes;
        const result = await analyzeInFlightSnapshot({
          exec,
          snapshot: prerequisites.snapshot,
          objectAvailability: prerequisites.objectAvailability,
          history: prerequisites.history,
          localRefs,
          worktrees,
          baseBranch: resolved.settings["branch.base"],
          identity,
          teamMode,
          errandSlugByBranch: transientIndexes.slugByBranch,
          expectedTransientByBranch: transientIndexes.expectedByBranch,
          errandRecordsComplete: transient.complete,
          parkedSlugs,
          derivedRoster,
        });
        return {
          entries: result.entries,
          residue: result.residue,
          warnings: result.warnings,
          reachable: true,
          remoteEvidence: result.pendingBranchCount > 0 ? "pending-fetch" as const : "exact" as const,
          pendingBranchCount: result.pendingBranchCount,
          locallyPresentBranches: new Set([
            ...Object.keys(localRefs.refs.localHeads),
            ...worktrees.paths.keys(),
          ]),
        };
      })();
      return oraclePromise;
    };
    const probes: SessionInitProbes = {
      derivedLocusState: async (id, activeExtensions) => {
        return getDerivedLocusState(id, activeExtensions);
      },
      remoteContext: getRemoteContext,
      user: async (id) => {
        const resolved = await resolvedSettingsP;
        const remoteSyncEnabled = resolved.settings["session.remote_sync"] === "enabled";
        return runUserSessionInitStatus({ cwd, io, identity: id, remoteSyncEnabled });
      },
      worktree: async (context) => {
        const resolved = await resolvedSettingsP;
        const remoteSyncEnabled = resolved.settings["session.remote_sync"] === "enabled";
        const branch = await readSessionBranch(exec, cwd);
        const prerequisites = sessionRemotePrerequisites(context);
        const upstreamBranch = branch === null || !remoteSyncEnabled || context.kind === "not-needed"
          ? null
          : await readConfiguredUpstreamBranch(exec, branch, cwd);
        const supplied = prerequisites.kind === "supplied"
          ? prerequisites
          : {
              snapshot: { kind: "unreachable" as const, failureReason: "error" as const },
              objectAvailability: { kind: "unavailable" as const, reason: "execution" as const },
              history: { kind: "unavailable" as const, reason: "execution" as const },
            };
        return analyzeWorktreeSnapshot({
          exec,
          remoteSyncEnabled,
          originConfigured: !(context.kind === "not-needed" && context.reason === "no-remote"),
          branch,
          upstreamBranch,
          ...supplied,
        });
      },
      worktreeIdentity: () => resolveWorktreeIdentity(exec),
      currentHusk: async (context, worktreePath) => {
        const [marker, headResult, resolved] = await Promise.all([
          readWorktreeMarker(worktreePath),
          exec("git", ["rev-parse", "HEAD"], { cwd: worktreePath }),
          resolvedSettingsP,
        ]);
        return await resolveCurrentHuskAdvisory({
          worktreePath,
          branch: null,
          head: headResult.stdout,
          marker,
        }, async (stamp, decoded) => {
          const baseBranch = resolved.settings["branch.base"];
          const baseOid = exactSessionBaseOid(sessionCleanupBaseEvidence(context), baseBranch);
          return baseOid !== null && await revalidateDecodedHuskRetirementEvidenceStrict(
            exec,
            stamp,
            decoded,
            baseOid,
            (ref, path) => readGitBlobBytes(cwd, ref, path, { objectAccess: "local-only" }),
          );
        });
      },
      baseDistance: async (context) => {
        const resolved = await resolvedSettingsP;
        const baseBranch = resolved.settings["branch.base"];
        const prerequisites = sessionRemotePrerequisites(context);
        // Detachment outranks the remote shortcuts, as it does inside the analyzer:
        // returning early on a disabled or absent remote would drop the detached-HEAD
        // reason whenever both conditions hold.
        if (await readSessionBranch(exec, cwd) === null) {
          return {
            mode: "advisory" as const,
            verdict: "unavailable" as const,
            state: "detached-head" as const,
            ahead: 0,
            behind: 0,
            base: null,
            baseOid: null,
            unavailableReason: "detached-head" as const,
            integrationEvidence: null,
            overlap: null,
            register: null,
            // Detachment resolves before any snapshot evidence is consulted, so this
            // arm carries the explicit not-applicable qualifier rather than omitting it.
            remoteEvidence: "not-applicable" as const,
          };
        }
        if (prerequisites.kind === "not-needed") {
          return prerequisites.reason === "remote-sync-disabled"
            ? {
                mode: "advisory" as const,
                verdict: "skipped" as const,
                state: "skipped" as const,
                ahead: 0,
                behind: 0,
                base: baseBranch,
                baseOid: null,
                integrationEvidence: null,
                overlap: null,
                register: null,
                remoteEvidence: "not-applicable" as const,
              }
            : {
                mode: "advisory" as const,
                verdict: "unavailable" as const,
                state: "no-remote" as const,
                ahead: 0,
                behind: 0,
                base: baseBranch,
                baseOid: null,
                unavailableReason: "no-remote" as const,
                integrationEvidence: null,
                overlap: null,
                register: null,
                remoteEvidence: "not-applicable" as const,
              };
        }
        const localOnlyExec: GitExec = (command, args, options) => exec(command, args, {
          ...options,
          objectAccess: "local-only",
        });
        const frame = await getOptionalDerivedFrame();
        const workUnit = frame === null ? null : sessionPathTreatmentWorkUnit(frame);
        return analyzeBaseDistanceSnapshot({
          exec,
          baseBranch,
          mode: "advisory",
          snapshot: prerequisites.snapshot,
          objectAvailability: prerequisites.objectAvailability,
          history: prerequisites.history,
          ...createCurrentBaseDriftAdapters(
            localOnlyExec,
            workUnit === null ? {} : workUnitPathTreatmentContext(workUnit.name),
          ),
        });
      },
      baseBranchSync: async (context) => {
        const resolved = await resolvedSettingsP;
        const baseBranch = resolved.settings["branch.base"];
        const [checkout, localBaseOid] = await Promise.all([
          resolveBaseCheckoutLocus(exec, baseBranch),
          readLocalBaseOid(exec, baseBranch, cwd),
        ]);
        const prerequisites = sessionRemotePrerequisites(context);
        if (prerequisites.kind === "not-needed") {
          return {
            state: prerequisites.reason === "remote-sync-disabled" ? "skipped" as const : "no-remote" as const,
            ahead: 0,
            behind: 0,
            base: baseBranch,
            checkout,
            refreshRemedy: null,
            guidance: null,
            remoteEvidence: "not-applicable" as const,
          };
        }
        return analyzeBaseBranchSnapshot({
          exec,
          baseBranch,
          localBaseOid,
          checkout,
          snapshot: prerequisites.snapshot,
          objectAvailability: prerequisites.objectAvailability,
          history: prerequisites.history,
        });
      },
      supersession: (context, branch) => {
        const prerequisites = sessionRemotePrerequisites(context);
        if (prerequisites.kind === "not-needed") {
          return Promise.resolve({ superseded: false, supersededCommits: [], novelCommits: [] });
        }
        return analyzeSupersessionSnapshot({ exec, branch, ...prerequisites });
      },
      dirty: () => resolveSessionInitDirtyState({
        compactionSeedGitSnapshotP,
        fallback: () => runDirtyStateStatus({ exec }),
      }),
      extensions: () => runExtensionsSessionInitStatus({ cwd }),
      config: async () => runConfigSessionInitStatus({ cwd, resolvedSettings: await resolvedSettingsP }),
      domainRules: () => runDomainRulesSessionInitStatus({ cwd }),
      releaseRouting: async () => releaseRoutingFromSettings(await resolvedSettingsP),
      currentWuReconcile: async ({ slug, metaPath }) =>
        runCurrentWuReconcileSessionProbe(
          {
            index: await buildLifecycleIndex({ cwd, fs: lifecycleFs }),
            queryDisposition: (input) =>
              queryGitTransitionDisposition(transitionExec, "HEAD", input),
            enumerateTransitionRecords: () => enumerateGitTransitionRecords(transitionExec, "HEAD"),
            listArtifactPaths: (slug, ownedMetaPath) =>
              listCurrentWuArtifactPaths(slug, ownedMetaPath, (path) => readdir(resolve(cwd, path))),
            readFile: (path) => io.readFile(resolve(cwd, path)),
          },
          { slug, metaPath },
        ),
      deliveryPosition: async (context, { workUnitId }) => {
        const result = await readDeliveryPositionView(workUnitId, {
          plans: {
            enumerateCurrentReadOnly: () => deliveryPlans.enumerateCurrentReadOnly(),
          },
          states: deliveryStates,
          observe: async (plan, state, revision) => {
            const prerequisites = sessionRemotePrerequisites(context);
            const objectAvailability = prerequisites.kind === "supplied"
              ? prerequisites.objectAvailability
              : null;
            if (prerequisites.kind === "not-needed"
              || prerequisites.snapshot.kind !== "available"
              || objectAvailability?.kind !== "complete") {
              return { status: "refused" };
            }
            const resolved = await resolvedSettingsP;
            const configuration = await resolveChangeRequestLifecycleConfiguration(
              exec,
              `refs/heads/${resolved.settings["branch.base"]}`,
            );
            const deliveryHost = createSessionDeliveryObservationHost(hostedGhRunner);
            return configuration === null
              ? { status: "refused" }
              : observeRepositoryDeliveryPosition(plan, state, revision, {
                exec,
                cwd,
                host: deliveryHost,
                repository: configuration.repositoryRef,
                remoteHeads: prerequisites.snapshot.tips,
                localCommits: objectAvailability.commits,
                materializeTarget: async (coordinates) => {
                  if (objectAvailability.commits[coordinates.head] !== true) return false;
                  const localOnlyExec: GitExec = (command, args, options) => exec(command, args, {
                    ...options,
                    cwd,
                    objectAccess: "local-only",
                  });
                  const local = await observeDeliveryEligibilityRef(localOnlyExec, coordinates.head);
                  return local?.head === coordinates.head && local.tree === coordinates.tree;
                },
                observeLandedResult: ({ mergeCommitSha, strategy, beforeMember }) => (
                  observeGitDeliveryLandingResult({
                    exec, cwd, remote: "origin", resultHead: mergeCommitSha, strategy, beforeMember,
                  })
                ),
                proveContribution: (endpoints) => proveGitDeliveryContribution({
                  exec: createRawGitExec(cwd),
                  ...projectDeliveryContributionEndpoints(endpoints),
                }),
              });
          },
        });
        if (result.status === "refused") {
          throw new Error(`Delivery position is unavailable: ${result.reason}.`);
        }
        return result.value;
      },
      userReferenceReconcile: async (context, { slug }) => {
        if (identity === null) throw new Error("User-reference probe requires an identity.");
        const resolved = await resolvedSettingsP;
        const surfaces = await userSurfacesFor(identity);
        const protection = resolved.settings["branch.protection"] === "full" ? "full" : "partial";
        const baseBranch = resolved.settings["branch.base"];
        const prerequisites = sessionRemotePrerequisites(context);
        const authority = prerequisites.kind === "supplied" || protection === "partial"
          ? await analyzeUserReferenceAuthority({
            protection,
            baseBranch,
            // The unsupplied arms are reachable only under `partial` protection, which
            // returns before either is read. They are placeholders for an unused
            // parameter rather than evidence, and never reach a result.
            snapshot: prerequisites.kind === "supplied"
              ? prerequisites.snapshot
              : { kind: "unreachable", failureReason: "error" },
            objectAvailability: prerequisites.kind === "supplied"
              ? prerequisites.objectAvailability
              : { kind: "unavailable", reason: "execution" },
            enumerateAt: (ref) => enumerateGitTransitionRecords(localOnlyTransitionExec, ref),
          })
          : {
              // `not-needed` means remote sync is off or no remote is configured. That is
              // a deliberate configuration, not a failed read, so this reports the
              // not-applicable qualifier as the sibling probes do rather than fabricating
              // an unreachable reading the operator would read as a network fault.
              status: "unavailable" as const,
              ref: `origin/${baseBranch}`,
              reason: "remote-not-required" as const,
              remoteEvidence: "not-applicable" as const,
            };
        const sessionNotesPath = surfaces.sessionNotesPath(SlugSchema.parse(slug));
        return projectUserReferenceSessionResult(authority, {
          userInbox: {
            path: surfaces.identityGlobalDisplayPath("USER-INBOX.md"),
            content: await readUserInbox(identity),
          },
          workingMemory: {
            path: surfaces.workingMemoryDisplayPath,
            content: await io.readFile(surfaces.workingMemoryPath).catch(() => ""),
          },
          sessionNotes: {
            path: sessionNotesPath,
            content: await io.readFile(sessionNotesPath).catch(() => ""),
          },
        });
      },
      roster: async () => {
        const resolved = await resolvedSettingsP;
        const teamMode = resolved.settings["team.mode"] === "true";
        const roster = await runWorktreeRoster({
          exec,
          fs: {
            readdir: (path) => readdir(path),
            readFile: (path) => readFile(path, "utf8"),
          },
        });
        return filterRosterByIdentity(roster, { identity, teamMode });
      },
      cleanupRoster: async () => {
        const resolved = await resolvedSettingsP;
        const teamMode = resolved.settings["team.mode"] === "true";
        return runIdentityScopedWorktreeRoster({
          exec,
          fs: {
            readdir: (path) => readdir(path),
            readFile: (path) => readFile(path, "utf8"),
          },
          identity,
          teamMode,
        });
      },
      recovery: async (context, roster, currentBranch) => {
        const resolved = await resolvedSettingsP;
        const baseBranch = resolved.settings["branch.base"];
        const baseEvidence = sessionCleanupBaseEvidence(context);
        const recent = baseEvidence.remoteSyncEnabled && baseEvidence.snapshot.kind === "available"
          ? await analyzeRecentRemoteBranchesSnapshot({
              exec,
              tips: baseEvidence.snapshot.tips,
              objectAvailability: baseEvidence.objectAvailability,
              history: baseEvidence.history,
              excludeBranches: new Set([baseBranch, ...(currentBranch === null ? [] : [currentBranch])]),
              withinDays: RECOVERY_RECENCY_DAYS,
            })
          : { branches: [], pendingBranchCount: 0 };
        return runBranchGoneRecovery({
          roster,
          currentBranch,
          baseBranch,
          recentBranches: recent.branches,
          recentPendingBranchCount: recent.pendingBranchCount,
          baseEvidence,
          exec,
        });
      },
      sweep: async (context, roster, worktreeIdentity) => {
        const [resolved, derivedRoster] = await Promise.all([
          resolvedSettingsP,
          getOptionalDerivedRoster(),
        ]);
        return runStaleWorktreeSweep({
          roster,
          worktreeIdentity,
          baseBranch: resolved.settings["branch.base"],
          baseEvidence: sessionCleanupBaseEvidence(context),
          exec,
          identity,
          teamMode: resolved.settings["team.mode"] === "true",
          protection: resolved.settings["branch.protection"] === "full" ? "full" : "partial",
          excludeWorktreePath: worktreeIdentity.kind === "linked" ? worktreeIdentity.path : undefined,
          readBlob: (ref, path) => readGitBlobBytes(cwd, ref, path, { objectAccess: "local-only" }),
          derivedRoster,
        });
      },
      orphanBranchSweep: async (context, worktreeIdentity) => {
        const [resolved, derivedRoster] = await Promise.all([
          resolvedSettingsP,
          getOptionalDerivedRoster(),
        ]);
        // Identity-carrying transient branches are excluded because their own
        // lifecycle surfaces own cleanup. An incomplete identity basis declines
        // the sweep rather than offering deletes that could orphan a claim.
        const transient = identity === null
          ? null
          : projectTransientInFlightRead(await getTransientIndexes());
        return runOrphanBranchSweep({
          worktreeIdentity,
          baseBranch: resolved.settings["branch.base"],
          baseEvidence: sessionCleanupBaseEvidence(context),
          errandBranches:
            transient === null || !transient.complete
              ? null
              : new Set(transient.indexes.slugByBranch.keys()),
          exec,
          derivedRoster,
        });
      },
      retiredSubdirs: async (context, id) => {
        const resolved = await resolvedSettingsP;
        return runRetiredSubdirDetection({
          cwd,
          identity: id,
          baseBranch: resolved.settings["branch.base"],
          baseEvidence: sessionCleanupBaseEvidence(context),
          exec,
          readDir: io.readDir,
          readFile: io.readFile,
        });
      },
      errandSweep: async (id) => {
        const resolved = await resolvedSettingsP;
        const thresholdDays = parsePositiveInteger(resolved.settings["inbox.remind_after_days"], 1);
        const { entries } = extractReminderEntries({ content: await readUserInbox(id) });
        return runErrandStalenessSweep({ entries, thresholdDays });
      },
      errandState: async (context, input) => {
        const resolved = await resolvedSettingsP;
        const thresholdDays = parsePositiveInteger(resolved.settings["inbox.remind_after_days"], 1);
        const transientRead = await (input.includeDiscovery
          ? getDiscoveryTransientIndexes()
          : getTransientIndexes());
        const transientState = projectTransientInFlightRead(transientRead);
        const transientIndexes = transientState.indexes;
        let entries: InFlightEntry[] | null = null;
        let residue: InFlightResidue[] = [];
        const baseEvidence = sessionCleanupBaseEvidence(context);
        const remoteTips = new Map(
          baseEvidence.remoteSyncEnabled && baseEvidence.snapshot.kind === "available"
            ? Object.entries(baseEvidence.snapshot.tips)
            : [],
        );
        let oracleWarnings: string[] = transientState.degraded === null ? [] : [transientState.degraded];
        let locallyPresentBranches: ReadonlySet<string> = new Set();
        if (input.includeDiscovery) {
          const oracle = await getOracle(context);
          entries = oracle.reachable ? oracle.entries : null;
          residue = oracle.residue;
          locallyPresentBranches = oracle.locallyPresentBranches;
          oracleWarnings = [...oracleWarnings, ...oracle.warnings.map(renderInFlightWarning)];
        }
        return runErrandState({
          exec,
          currentBranch: input.currentBranch,
          hasBackingMeta: input.hasBackingMeta,
          includeDiscovery: input.includeDiscovery,
          entries,
          residue,
          oracleWarnings,
          records: transientIndexes.records,
          recordsComplete: transientState.complete,
          remoteTips,
          locallyPresentBranches,
          baseEvidence,
          baseBranch: resolved.settings["branch.base"],
          staleThresholdDays: thresholdDays,
          nudge: await resolveNudgeState(cwd, io, identity, ERRAND_NUDGE_MARKER_RELATIVE, userSurfacesFor),
        });
      },
      materializableWorkUnits: async (context) => {
        const {
          entries,
          warnings,
          reachable,
          remoteEvidence,
          failureReason,
          pendingBranchCount,
        } = await getOracle(context);
        const renderedWarnings = warnings.map(renderInFlightWarning);
        if (!reachable) {
          return remoteEvidence === "unreachable"
            ? {
                candidates: [],
                warnings: renderedWarnings,
                remoteEvidence,
                failureReason: failureReason ?? "error",
                pendingBranchCount: 0 as const,
                refreshRemedy: null,
              }
            : {
                candidates: [],
                warnings: renderedWarnings,
                remoteEvidence: "not-applicable" as const,
                pendingBranchCount: 0 as const,
                refreshRemedy: null,
              };
        }
        const materializable = findMaterializableWorkUnits({ entries, identity });
        return pendingBranchCount > 0
          ? {
              ...materializable,
              warnings: renderedWarnings,
              remoteEvidence: "pending-fetch" as const,
              pendingBranchCount,
              refreshRemedy: composeMaterializableDiscoveryRefreshRemedy(),
            }
          : {
              ...materializable,
              warnings: renderedWarnings,
              remoteEvidence: "exact" as const,
              pendingBranchCount: 0 as const,
              refreshRemedy: null,
            };
      },
      workUnitState: async (context, input) => {
        const resolved = await resolvedSettingsP;
        const staleThresholdDays = parsePositiveInteger(
          resolved.settings["integration.stale_after_days"],
          2,
        );
        return runWorkUnitState({
          exec,
          roster: input.roster.entries,
          identity,
          baseBranch: resolved.settings["branch.base"],
          baseEvidence: sessionCleanupBaseEvidence(context),
          staleThresholdDays,
          nudge: await resolveNudgeState(
            cwd,
            io,
            identity,
            WORK_UNIT_STALE_NUDGE_MARKER_RELATIVE,
            userSurfacesFor,
          ),
          prSource: input.includeSharpening ? createGhWorkUnitPrSource(exec) : undefined,
        });
      },
      inboxState: async (id) => runInboxState({ content: await readUserInbox(id) }),
      partialPushMarker: (id) => runPartialPushMarkerSurface({
        exec,
        identity: id,
        now: new Date().toISOString(),
      }),
      compactionAdvisory: async (id) => runNotesCompactionSessionAdvisory({
        exec,
        identity: id,
        nudge: await resolveNudgeState(
          cwd,
          io,
          id,
          NOTES_COMPACTION_NUDGE_MARKER_RELATIVE,
          userSurfacesFor,
        ),
      }),
    };
    const workingMemoryPath = identity === null
      ? null
      : (await userSurfacesFor(identity)).workingMemoryPath;
    const result = await runSessionInitStatus({ identity, role, probes, workingMemoryPath });
    if (opts.writeCompactionSeed && compactionSeedGitSnapshotP !== null) {
      try {
        const gitSnapshot = await compactionSeedGitSnapshotP;
        result.compactionSeedWrite = summarizeCompactionSeedWrite(await emitCompactionSeed({
          cwd,
          envelope: result,
          gitSnapshot,
        }));
        surfaceCompactionSeedWrite(result.compactionSeedWrite);
      } catch (err) {
        result.compactionSeedWrite = {
          status: "failed",
          reason: "git-failed",
          message: errorMessage(err),
        };
        surfaceCompactionSeedWrite(result.compactionSeedWrite);
      }
    }
    assertSessionInitProbeResult(result);
    if (json) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    p.intro("arc status");
    p.note(buildSessionInitStatusSummary(result), "Session Init");
    p.outro("Done.");
    return;
  }

  if (opts.user) {
    const resolved = await resolveAllSettings({ cwd, exec, readFile: io.readFile });
    const teamMode = resolved.settings["team.mode"] === "true";
    const localOnly = Boolean(opts.local) || opts.fetch === false;
    const parkedSlugs = listParkedSlugs(await buildLifecycleIndex({ cwd, fs: lifecycleFs }));
    const view = await assembleStatusUserView({
      cwd,
      exec,
      identity,
      teamMode,
      localOnly,
      baseBranch: resolved.settings["branch.base"],
      parkedSlugs,
      readFile: io.readFile,
      writeFile: io.writeFile,
      mkdir: (path, options) => io.mkdir(path, options).then(() => undefined),
    });
    if (json) {
      process.stdout.write(`${JSON.stringify(view)}\n`);
      return;
    }
    process.stdout.write(`${view.output}\n`);
    return;
  }

  if (opts.project) {
    const resolved = await resolveAllSettings({ cwd, exec, readFile: io.readFile });
    if (opts.staged) {
      // Render the project view from the git index — the same source the
      // pre-commit ROADMAP regen check validates against, so this render
      // produces exactly what the hook expects (staged sweep or clean tree).
      const transitionOverlays = await resolveStagedTransitionOverlays({ cwd, exec });
      const { result } = await renderRoadmapFromIndexViewResult({
        cwd,
        exec,
        baseBranch: resolved.settings["branch.base"],
        ...(transitionOverlays.length === 0
          ? {}
          : { transitionOverlays: transitionOverlays.map(transitionOverlayCompositionInput) }),
      });
      if (json) {
        process.stdout.write(`${JSON.stringify(result)}\n`);
        return;
      }
      writeProjectReadinessWarnings(result.warnings);
      if (opts.write === true) {
        // The write happens only after a successful render, via temp-then-rename in the target's
        // own directory — a failed render or interrupted write never truncates the tracked view,
        // which a shell redirect of this command's output did.
        const roadmapPath = resolve(cwd, ROADMAP_PATH);
        const temporaryPath = `${roadmapPath}.render-${process.pid}.tmp`;
        await writeFile(temporaryPath, `${result.markdown}\n`, { flag: "wx" });
        try {
          await rename(temporaryPath, roadmapPath);
        } catch (error) {
          await rm(temporaryPath, { force: true }).catch(() => undefined);
          throw error;
        }
        process.stdout.write(`Wrote ${ROADMAP_PATH}\n`);
        return;
      }
      process.stdout.write(`${result.markdown}\n`);
      return;
    }
    const localOnly = Boolean(opts.local) || opts.fetch === false;
    const [parkedSlugs, transientRead] = await Promise.all([
      buildLifecycleIndex({ cwd, fs: lifecycleFs }).then(listParkedSlugs),
      readTransientInFlightIndexes({ exec, identity }),
    ]);
    const transient = projectTransientInFlightRead(transientRead);
    const input = await resolveProjectReadinessViewInput({
      cwd,
      fs: lifecycleFs,
      oracle: {
        exec,
        acquisitionPolicy: localOnly ? "local" : "passive-live",
        baseBranch: resolved.settings["branch.base"],
        parkedSlugs,
        errandSlugByBranch: transient.indexes.slugByBranch,
        errandRecordsComplete: transient.complete,
      },
    });
    const result = composeProjectReadinessViewResult({
      ...input,
      renderedRef: await resolveProjectReadinessRenderStamp({
        exec,
        cwd,
        scope: localOnly ? "tree + local refs" : "tree + live refs",
        liveView: "arc status --project",
      }),
    });
    if (json) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    writeProjectReadinessWarnings(result.warnings);
    process.stdout.write(`${result.markdown}\n`);
    return;
  }

  const probes: StatusProbes = {
    user: (id) => runUserStatus({ cwd, io, identity: id }),
    extensions: () => runExtensionsStatus({ cwd }),
    config: () => runConfigStatus({ cwd }),
    active: () => runActiveStatus({ cwd, exec }),
  };
  const result = await runStatus({ identity, role, probes });

  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  p.intro("arc status");
  p.note(buildStatusSummary(result), "Status");
  p.outro("Done.");
}

async function readCompactionSeedGitSnapshot(cwd: string, exec: GitExec): Promise<CompactionSeedGitSnapshot> {
  const [branchResult, headResult, statusResult] = await Promise.all([
    exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd }),
    exec("git", ["rev-parse", "HEAD"], { cwd }),
    exec("git", ["status", "--porcelain=v1", "-z"], { cwd }),
  ]);
  return {
    branch: branchResult.stdout.trim(),
    head: headResult.stdout.trim(),
    uncommittedFiles: parseUncommittedFiles(statusResult.stdout),
  };
}

function dirtyStateFromCompactionSeedSnapshot(snapshot: CompactionSeedGitSnapshot) {
  const fileCount = snapshot.uncommittedFiles.length;
  return {
    state: fileCount === 0 ? "clean" as const : "dirty" as const,
    fileCount,
  };
}

export async function resolveSessionInitDirtyState(options: {
  compactionSeedGitSnapshotP: Promise<CompactionSeedGitSnapshot> | null;
  fallback: () => Promise<DirtyStateResult>;
}): Promise<DirtyStateResult> {
  if (options.compactionSeedGitSnapshotP === null) {
    return options.fallback();
  }
  try {
    return dirtyStateFromCompactionSeedSnapshot(await options.compactionSeedGitSnapshotP);
  } catch {
    return options.fallback();
  }
}

function summarizeCompactionSeedWrite(result: EmitCompactionSeedResult): CompactionSeedWriteStatus {
  if (result.status === "written") {
    return { status: "written", path: result.path };
  }
  return result;
}

function surfaceCompactionSeedWrite(result: CompactionSeedWriteStatus): void {
  if (result.status === "failed") {
    process.stderr.write(`warn: compaction seed not written (${result.reason}): ${result.message}\n`);
  }
  if (result.status === "skipped" && result.reason === "identity-missing") {
    process.stderr.write("warn: compaction seed not written: identity not configured\n");
  }
  if (result.status === "skipped" && result.reason === "load-set-unresolved") {
    process.stderr.write("warn: compaction seed not written: load-set unresolved\n");
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Compact human render of a slug→state query for the non-`--json` path. */
function formatSlugStateQuery(
  query: SlugStateQuery,
  enrichment: {
    integrationBoundary?: IntegrationBoundaryLocus | null;
    worktreePath?: string;
    warnings?: readonly string[];
  } = {},
): string {
  const position =
    query.position === null
      ? "—"
      : `${query.position.phase} · ${query.position.location}`;
  const lines = [
    `${query.slug} → ${query.state}`,
    `position: ${position}`,
    `occupied: ${query.occupied} · shipped: ${query.shipped}`,
  ];
  if (enrichment.worktreePath !== undefined) lines.push(`worktree: ${enrichment.worktreePath}`);
  if (enrichment.integrationBoundary !== null && enrichment.integrationBoundary !== undefined) {
    lines.push(`boundary: ${enrichment.integrationBoundary.locus}`);
    lines.push(`next: ${enrichment.integrationBoundary.nextAction.command}`);
  }
  if (query.dependsOn.length > 0) {
    lines.push("depends on:");
    for (const dep of query.dependsOn) {
      lines.push(`  - ${dep.slug} — ${dep.landed ? "landed" : "not landed"}`);
    }
  }
  for (const warning of enrichment.warnings ?? []) lines.push(`warning: ${warning}`);
  return lines.join("\n");
}

async function resolveSlugOperationalBoundary(options: {
  slug: string;
  state: SlugStateQuery["state"];
  worktreePath: string | undefined;
  exec: GitExec;
}): Promise<{
  integrationBoundary: IntegrationBoundaryLocus | null;
  warnings: string[];
}> {
  if (options.state !== "active" && options.state !== "integrating") {
    return { integrationBoundary: null, warnings: [] };
  }
  if (options.worktreePath === undefined) {
    return {
      integrationBoundary: null,
      warnings: [
        `Operational boundary for ${options.slug} is unavailable without a materialized worktree. `
        + `Run \`arc materialize ${options.slug}\` for remote-only work (or check out its local branch), `
        + `then rerun \`arc status ${options.slug} --json\`.`,
      ],
    };
  }
  const active = await runActiveStatus({ cwd: options.worktreePath, exec: options.exec });
  const expectedFilename = `meta-${options.slug}.md`;
  const matches = active.candidates.filter((candidate) => candidate.filename === expectedFilename);
  const candidate = matches.length === 1 ? matches[0] : undefined;
  if (candidate === undefined) {
    return {
      integrationBoundary: null,
      warnings: [
        ...active.warnings,
        `Operational boundary for ${options.slug} is unavailable: expected one ${expectedFilename}; found ${matches.length}.`,
      ],
    };
  }
  const integrationBoundary = candidate.integrationBoundary ?? null;
  const publicationRecovery = options.state === "integrating"
    && candidate.currentWorkflow === "prepare-work-unit"
    && integrationBoundary?.locus === "publication-pending"
      ? parseIntegrationBoundaryLocus({
          ...integrationBoundary,
          nextAction: {
            kind: "continue-publication",
            command: `arc publish ${options.slug} --json`,
            interactionText: "Finish interrupted publication finalization before pushing.",
          },
        })
      : integrationBoundary;
  return { integrationBoundary: publicationRecovery, warnings: active.warnings };
}
