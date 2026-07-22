/**
 * Handler for the `arc plan` subcommands.
 *
 * `check` is the mechanical preflight `arc-plan` runs before `draft-design`: it
 * resolves the live planning-entry context — the branch-vs-base write context,
 * protection mode, the active work unit's phase/branch, and whether a draft
 * already exists — and classifies the two-layer route so the workflow routes a
 * draft mechanically rather than by prose. `--json` emits the route shape the
 * skill consumes; the human path words the verdict and exits non-zero on a
 * redirect so the guard reads as a guard.
 *
 * Layer 1 (committable → proceed) is resolved here; the layer-2 leg choice
 * (start / stub / errand by WU-worthiness) stays the workflow's judgment — this
 * handler carries the facts, never fabricates the choice.
 *
 * `arc plan` is a noun with no default action, mirroring `arc errand` /
 * `arc housekeep` — keeping the read (`check`, a query) distinct and the CLI
 * surface unmistakable next to the `arc-plan` skill.
 *
 * @module
 */

import { randomBytes } from "node:crypto";
import { access, lstat, readFile, realpath, stat } from "node:fs/promises";
import { join } from "node:path";

import { parseMetaFile } from "../lib/active/meta-reader.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import {
  classifyPlanningEntry,
  resolveWriteContext,
  type PlanningEntryRoute,
  type ProtectionMode,
} from "../lib/git/write-context.js";
import { gitExec } from "../lib/io-context.js";
import { createUserIOContext } from "../lib/io-context.js";
import { SlugSchema } from "../lib/kernel/index.js";
import { materializeArcPath, resolveArcPath } from "../lib/layout/index.js";
import { resolveActiveWu } from "../lib/release/wu-resolution.js";
import { resolveBacklogStub, resolveGroomStubSet } from "../lib/work-unit/backlog-stub.js";
import { requireArcProjectRoot, resolveIdentityWithPrompt } from "./shared.js";
import { mintClaimId, projectLocusIdentity, TransientIdentityRecordV3Schema } from "../lib/errand/identity-record.js";
import {
  groomClaimTransform,
  groomResumeTransform,
  pinGroomOpenedBaseHead,
  rollbackIdentityClaim,
  rollbackGroomResumeTransform,
  type GroomIdentityRecord,
} from "../lib/errand/identity-claims.js";
import { transactTransientIdentities } from "../lib/errand/identity-transaction.js";
import {
  createGhChangeRequestLifecyclePort,
  evaluateChangeRequestReentry,
  resolveChangeRequestLifecycleConfiguration,
} from "../lib/errand/change-request-lifecycle.js";
import { prepareMaterializedBranch } from "../lib/errand/materialize-branch.js";
import { acquireSessionAnchor } from "../lib/locus/process-inspector.js";
import { appendDirectedCommandAdvisory } from "../lib/locus/entry-boundary.js";
import { createPlatformProcessAncestryInspector, createPlatformProcessInspector } from "../lib/locus/platform-inspectors.js";
import { createLocusEvidenceIO } from "../lib/locus/evidence.js";
import { readLocusState } from "../lib/locus/reader.js";
import { readPrimarySafety } from "../lib/locus/primary-safety.js";
import { planLocusAllocation } from "../lib/locus/allocator.js";
import { provisionTransientLocus } from "../lib/locus/provisioning.js";
import { createNodeProvisioningDependencies } from "../lib/locus/provisioning-runtime.js";
import { createLocusMutationResult } from "../lib/locus/mutation.js";
import type { LocusRefusalReason } from "../lib/locus/schema/index.js";
import { formatErrandOpenResult } from "./errand.js";
import { resolvePrimaryWorktreePath } from "../lib/git/worktree-roster.js";
import { resolveUserSurfaceResolver } from "../lib/user-surfaces.js";
import { runExtensionsSessionInitStatus } from "../commands/extensions.js";
import { closeGroomAtRuntime } from "../lib/groom/close-runtime.js";
import { settleGroomAtRuntime } from "../lib/groom/tail-runtime.js";

import * as p from "@clack/prompts";

/** Meta `**State:**` phases for which a work unit occupies its worktree. */
const OCCUPYING_PHASES: ReadonlySet<string> = new Set(["Planning", "Active", "Integrating"]);

export interface PlanCheckOptions {
  /** The design's WU-name slug — gates the draft-presence check (`draft-<name>.md`). */
  name?: string;
  /** Emit the planning-entry route as JSON (for skill consumption). */
  json?: boolean;
}

export interface PlanOpenOptions {
  include?: string[];
  json?: boolean;
}

export interface PlanCloseOptions { json?: boolean }
export interface PlanAbandonOptions { json?: boolean }

/** Close one exact grooming generation after path and preservation checks. */
export async function handlePlanClose(anchorSlug: string, opts: PlanCloseOptions): Promise<void> {
  if (opts.json !== true) p.intro("arc plan close");
  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const { settings } = await readConfigSettings(cwd);
  const identity = await resolveIdentityWithPrompt(false);
  if (!identity) { emitPlanErrorFor("plan-close", "identity", "No identity resolved.", opts.json === true); return; }
  const io = createUserIOContext();
  if (!io.execInput) {
    emitPlanErrorFor("plan-close", "identity", "The stdin Git boundary is unavailable.", opts.json === true); return;
  }
  let result: Parameters<typeof emitPlanResult>[0];
  try {
    const runtimeOptions = {
      anchorStub: anchorSlug, base: settings["branch.base"], identity,
      postCreateScript: settings["worktree.post_create"],
      registeredHarnessDirs: settings["worktree.harness_dirs"],
      exec: io.exec, execInput: io.execInput, cwd,
    };
    result = await closeGroomAtRuntime(runtimeOptions);
    if ((result.outcome === "applied" || result.outcome === "idempotent")
      && result.identity?.kind === "groom" && result.identity.state === "awaiting-merge") {
      const settled = await settleGroomAtRuntime({ ...runtimeOptions, action: "finalize" });
      if (settled.outcome !== "refused" || !settled.recommendedPromptText.includes("not 'merged'")) {
        result = createLocusMutationResult({ ...settled, operation: "plan-close" });
      }
    }
  } catch (error) {
    result = createLocusMutationResult({
      outcome: "error", operation: "plan-close",
      error: { code: "locus.plan-close.handler", message: error instanceof Error ? error.message : String(error) },
      recommendedPromptText: "Inspect the retained grooming identity and session locus before retrying.",
    });
  }
  emitPlanResult(result, opts.json === true);
}

/** Abandon one exact open or closed-unmerged grooming generation. */
export async function handlePlanAbandon(anchorSlug: string, opts: PlanAbandonOptions): Promise<void> {
  if (opts.json !== true) p.intro("arc plan abandon");
  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const { settings } = await readConfigSettings(cwd);
  const identity = await resolveIdentityWithPrompt(false);
  if (!identity) { emitPlanErrorFor("plan-abandon", "identity", "No identity resolved.", opts.json === true); return; }
  const io = createUserIOContext();
  if (!io.execInput) {
    emitPlanErrorFor("plan-abandon", "identity", "The stdin Git boundary is unavailable.", opts.json === true); return;
  }
  let result: Parameters<typeof emitPlanResult>[0];
  try {
    result = await settleGroomAtRuntime({
      anchorStub: anchorSlug, action: "abandon", base: settings["branch.base"], identity,
      postCreateScript: settings["worktree.post_create"], registeredHarnessDirs: settings["worktree.harness_dirs"],
      exec: io.exec, execInput: io.execInput, cwd,
    });
  } catch (error) {
    result = createLocusMutationResult({
      outcome: "error", operation: "plan-abandon",
      error: { code: "locus.plan-abandon.handler", message: error instanceof Error ? error.message : String(error) },
      recommendedPromptText: "Inspect the retained grooming identity and session locus before retrying.",
    });
  }
  emitPlanResult(result, opts.json === true);
}

/** Claim and provision one immutable single- or multi-stub grooming set. */
export async function handlePlanOpen(anchorSlug: string, opts: PlanOpenOptions): Promise<void> {
  if (opts.json !== true) p.intro("arc plan open");
  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const resolved = await resolveGroomStubSet(cwd, anchorSlug, opts.include ?? []);
  if (resolved.kind === "refused") { emitPlanFailure("stub-ambiguous", resolved.reason, opts.json === true); return; }
  const { settings } = await readConfigSettings(cwd);
  const protection = settings["branch.protection"] === "full" ? "full" : "partial";
  const base = settings["branch.base"];
  const identity = await resolveIdentityWithPrompt(false);
  if (!identity) { emitPlanError("identity", "No identity resolved.", opts.json === true); return; }
  const io = createUserIOContext();
  if (!io.execInput) { emitPlanError("identity", "The stdin Git boundary is unavailable.", opts.json === true); return; }
  const execInput = io.execInput;
  const pinned = await pinGroomOpenedBaseHead(io.exec, { remote: "origin", baseRef: base });
  if (pinned.kind !== "pinned") {
    const message = pinned.kind === "refused" ? pinned.reason : pinned.message;
    emitPlanError("base", message, opts.json === true); return;
  }
  const now = new Date().toISOString();
  const slug = `groom-${resolved.anchor.slug}`;
  const parsed = TransientIdentityRecordV3Schema.safeParse({
    version: 3, kind: "groom", slug, claimId: mintClaimId(),
    createdAt: now, updatedAt: now, anchorStub: resolved.anchor.slug,
    members: resolved.members.map((member) => member.slug), openedBaseHead: pinned.head,
    protection, branch: protection === "full" ? `chore/${slug}` : null,
    state: "open", changeRequest: null,
  });
  if (!parsed.success || parsed.data.kind !== "groom") {
    emitPlanError("claim", "The grooming claim is invalid.", opts.json === true); return;
  }
  const claimed = await transactTransientIdentities({ exec: io.exec, execInput: io.execInput, identity }, {
    remote: "origin", message: `arc: open groom ${resolved.anchor.slug}`,
    transform: groomClaimTransform(parsed.data),
  });
  if (claimed.kind !== "applied" && claimed.kind !== "idempotent") {
    const message = claimed.kind === "error" ? claimed.message : claimed.reason;
    emitPlanFailure("identity-conflict", message, opts.json === true); return;
  }
  let record = claimed.value.record;
  let mutationKind = claimed.kind;
  let resumedTail: {
    previous: GroomIdentityRecord;
    resumed: GroomIdentityRecord;
    expectedHead: string;
    applied: boolean;
  } | null = null;
  let preparedBranch: { localRef: string; expectedHead: string; created: boolean } | null = null;
  let resumeAdvisory: string | null = null;
  const rollbackOpen = async (): Promise<void> => {
    if (preparedBranch?.created === true) {
      await io.exec("git", ["update-ref", "-d", preparedBranch.localRef, preparedBranch.expectedHead])
        .catch(() => undefined);
    }
    if (resumedTail !== null) {
      if (resumedTail.applied) {
        await rollbackGroomResume(io.exec, execInput, identity, resumedTail.previous, resumedTail.resumed);
      }
    } else if (claimed.kind === "applied") {
      await rollbackGroomClaim(io.exec, execInput, identity, resolved.anchor.slug, record);
    }
  };

  if (claimed.value.kind === "wait") {
    if (record.state !== "awaiting-merge") {
      emitPlanFailure("identity-conflict", "Grooming resume has no awaiting-merge tail.", opts.json === true);
      return;
    }
    const configured = await resolveChangeRequestLifecycleConfiguration(io.exec, base);
    if (configured === null) {
      emitPlanFailure("change-request-unverifiable", "Configured change-request coordinates are unavailable.", opts.json === true);
      return;
    }
    const lifecycle = await createGhChangeRequestLifecyclePort(io.exec).read(configured, record.changeRequest);
    const reentry = evaluateChangeRequestReentry(lifecycle, record.changeRequest);
    if (reentry.kind === "refused") {
      emitPlanFailure("change-request-unverifiable", reentry.reason, opts.json === true);
      return;
    }
    const previous = record;
    const resumed = await transactTransientIdentities({ exec: io.exec, execInput, identity }, {
      remote: "origin",
      message: `arc: resume groom ${resolved.anchor.slug}`,
      transform: groomResumeTransform({ previous, lifecycle, updatedAt: now }),
    });
    if (resumed.kind !== "applied" && resumed.kind !== "idempotent") {
      const message = resumed.kind === "error" ? resumed.message : resumed.reason;
      emitPlanFailure("identity-conflict", message, opts.json === true);
      return;
    }
    record = resumed.value;
    mutationKind = resumed.kind;
    resumedTail = {
      previous,
      resumed: record,
      expectedHead: previous.changeRequest.headSha,
      applied: resumed.kind === "applied",
    };
    resumeAdvisory = reentry.advisory ?? null;
    const prepared = await prepareMaterializedBranch({
      exec: io.exec,
      remote: "origin",
      branch: previous.branch,
      expectedHead: previous.changeRequest.headSha,
      existingLocal: "accept-exact",
    });
    if (prepared.kind !== "prepared") {
      await rollbackOpen();
      const message = prepared.kind === "error" ? prepared.message : prepared.reason;
      emitPlanFailure("preservation-unproven", message, opts.json === true);
      return;
    }
    preparedBranch = {
      localRef: prepared.localRef,
      expectedHead: prepared.expectedHead,
      created: prepared.created,
    };
    if (prepared.advisory !== undefined) {
      resumeAdvisory = [resumeAdvisory, prepared.advisory].filter((value) => value !== null).join(" ");
    }
  }
  const inspector = createPlatformProcessInspector();
  const anchor = await acquireSessionAnchor(process.pid, createPlatformProcessAncestryInspector());
  const primaryPath = await resolvePrimaryWorktreePath(io.exec);
  if (primaryPath === null) {
    await rollbackOpen();
    emitPlanError("topology", "Primary checkout unavailable.", opts.json === true); return;
  }
  const activeExtensions = await runExtensionsSessionInitStatus({ cwd });
  const identityGlobalUserDir = (await resolveUserSurfaceResolver({
    cwd, identity: SlugSchema.parse(identity), exec: io.exec,
  })).identityGlobalRoot;
  const state = await readLocusState({
    identity, pathFlavor: process.platform === "win32" ? "windows" : "posix",
    evidenceIO: createLocusEvidenceIO({ exec: io.exec, identity, inspector }),
    subjectMetaIO: {
      readFile: (path) => readFile(path, "utf8"),
      pathExists: async (path) => access(path).then(() => true, () => false), realpath, lstat,
    },
    identityGlobalUserDir, activeExtensions: activeExtensions.active, enteringAnchor: anchor,
    readPrimarySafety: (path) => readPrimarySafety({ primaryPath: path, baseBranch: base, exec: io.exec }),
  });
  const existingRows = state.roster.rows.filter((row) => row.role?.subject.kind === "groom"
    && row.role.subject.key === record.slug && row.role.subject.claimId === record.claimId);
  if (existingRows.length > 1) {
    await rollbackOpen();
    emitPlanFailure("duplicate-locus", "Exact grooming occupancy is ambiguous.", opts.json === true); return;
  }
  const existing = existingRows[0];
  if (existing !== undefined) {
    if (existing.checkoutPath === null || existing.recordId === null || existing.lease === null) {
      await rollbackOpen();
      emitPlanFailure("record-malformed", "Exact grooming occupancy is incomplete.", opts.json === true); return;
    }
    emitPlanResult(appendDirectedCommandAdvisory(createLocusMutationResult({
      outcome: "idempotent", operation: "plan-open",
      allocation: { kind: existing.primary === true ? "primary" : "spawned", checkoutPath: existing.checkoutPath },
      recordId: existing.recordId, leaseId: existing.lease.leaseId,
      activeLocusPath: existing.checkoutPath, sessionHomePath: existing.lease.sessionHomePath,
      identity: projectLocusIdentity(record), originEntry: null,
      restoredParent: null, nextOffer: null,
      recommendedPromptText: `Grooming set is already open at ${existing.checkoutPath}.`
        + (resumeAdvisory === null ? "" : ` ${resumeAdvisory}`),
    })), opts.json === true);
    return;
  }
  const proposal = planLocusAllocation({
    state, protection, isolation: "prefer-primary",
    subject: { kind: "groom", key: slug, claimId: record.claimId },
  });
  const activeRecordId = state.current.kind === "resolved" ? state.current.activeRecordId : null;
  const parentCheckoutPath = activeRecordId === null
    ? null
    : state.roster.rows.find((row) => row.recordId === activeRecordId)?.checkoutPath ?? null;
  const sessionHomePath = parentCheckoutPath ?? primaryPath;
  if (proposal.kind === "refused") {
    await rollbackOpen();
    emitPlanFailure(proposal.reason, `Groom allocation refused: ${proposal.reason}.`, opts.json === true); return;
  }
  const expectedBranchHead = resumedTail?.expectedHead
    ?? (protection === "partial" ? pinned.head : null);
  const provisioned = await provisionTransientLocus({
    proposal, protection, identity: projectLocusIdentity(record), branch: record.branch,
    expectedBranchHead,
    base: expectedBranchHead ?? pinned.head, locationTemplate: settings["worktree.location_template"],
    repo: primaryPath.split(/[\\/]/u).at(-1) ?? "repo", spawningIdentity: identity,
    parentCheckoutPath, sessionHomePath, establishedAt: now, anchor,
    leaseId: randomBytes(16).toString("hex"),
    dependencies: createNodeProvisioningDependencies({
      exec: io.exec, identity, anchor, inspector,
      pathFlavor: process.platform === "win32" ? "windows" : "posix", base,
      branch: record.branch, postCreateScript: settings["worktree.post_create"],
      registeredHarnessDirs: settings["worktree.harness_dirs"],
    }),
  });
  if (provisioned.kind !== "provisioned") {
    await rollbackOpen();
    const message = provisioned.kind === "error" ? provisioned.error.message : provisioned.reason;
    emitPlanError("provision", message, opts.json === true); return;
  }
  emitPlanResult(appendDirectedCommandAdvisory(createLocusMutationResult({
    outcome: mutationKind === "idempotent" ? "idempotent" : "applied", operation: "plan-open",
    allocation: { kind: provisioned.receipt.allocation, checkoutPath: provisioned.receipt.checkoutPath },
    recordId: provisioned.receipt.record.recordId, leaseId: provisioned.receipt.leaseToken,
    activeLocusPath: provisioned.receipt.checkoutPath, sessionHomePath,
    identity: projectLocusIdentity(record), originEntry: null,
    restoredParent: null, nextOffer: null,
    recommendedPromptText: `Grooming set opened at ${provisioned.receipt.checkoutPath}.`
      + (resumeAdvisory === null ? "" : ` ${resumeAdvisory}`),
  })), opts.json === true);
}

async function rollbackGroomClaim(
  exec: ReturnType<typeof createUserIOContext>["exec"],
  execInput: NonNullable<ReturnType<typeof createUserIOContext>["execInput"]>,
  identity: string,
  anchorSlug: string,
  record: Parameters<typeof projectLocusIdentity>[0],
): Promise<void> {
  await rollbackIdentityClaim({ exec, execInput, identity }, {
    remote: "origin", message: `arc: roll back groom ${anchorSlug}`, expected: record,
  });
}

async function rollbackGroomResume(
  exec: ReturnType<typeof createUserIOContext>["exec"],
  execInput: NonNullable<ReturnType<typeof createUserIOContext>["execInput"]>,
  identity: string,
  previous: GroomIdentityRecord,
  resumed: GroomIdentityRecord,
): Promise<void> {
  await transactTransientIdentities({ exec, execInput, identity }, {
    remote: "origin",
    message: `arc: roll back groom resume ${previous.anchorStub}`,
    transform: rollbackGroomResumeTransform(previous, resumed),
  });
}

function emitPlanResult(result: Parameters<typeof formatErrandOpenResult>[0], json: boolean): void {
  const formatted = formatErrandOpenResult(result, json);
  if (json) process.stdout.write(formatted.text);
  else if (formatted.stream === "stderr") p.log.error(formatted.text);
  else { p.log.success(formatted.text); p.outro("Done."); }
  process.exitCode = formatted.exitCode;
}

function emitPlanFailure(reason: LocusRefusalReason, message: string, json: boolean): void {
  emitPlanResult(createLocusMutationResult({ outcome: "refused", operation: "plan-open", reason, recommendedPromptText: message }), json);
}

function emitPlanError(suffix: string, message: string, json: boolean): void {
  emitPlanResult(createLocusMutationResult({
    outcome: "error", operation: "plan-open", error: { code: `locus.plan-open.${suffix}`, message },
    recommendedPromptText: "Inspect the retained grooming identity before retrying.",
  }), json);
}

function emitPlanErrorFor(
  operation: "plan-close" | "plan-abandon",
  suffix: string,
  message: string,
  json: boolean,
): void {
  emitPlanResult(createLocusMutationResult({
    outcome: "error", operation, error: { code: `locus.${operation}.${suffix}`, message },
    recommendedPromptText: "Inspect the retained grooming state before retrying.",
  }), json);
}

export async function handlePlanCheck(opts: PlanCheckOptions): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const { settings } = await readConfigSettings(cwd);
  const baseBranch = settings["branch.base"];
  // Unknown / unset `branch.protection` degrades to `partial` — the fail-safe floor.
  const protection: ProtectionMode = settings["branch.protection"] === "full" ? "full" : "partial";

  const writeContext = await resolveWriteContext({ exec: gitExec, baseBranch });
  const { onPlanningBranch, activeWorkUnit } = await resolveActiveWorkUnitFacts(
    cwd,
    writeContext.currentBranch,
  );
  const draftPresent = await resolveDraftPresent(cwd, opts.name);

  const route = classifyPlanningEntry({
    writeContext,
    protection,
    onPlanningBranch,
    draftPresent,
    activeWorkUnit,
  });

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(route)}\n`);
    return;
  }
  renderHuman(route);
}

/**
 * Resolve the active work unit in this worktree and project the two facts the
 * classifier needs: whether HEAD sits on an active `Planning` WU's branch (the
 * full-mode committability signal) and whether any occupying WU is present.
 */
async function resolveActiveWorkUnitFacts(
  cwd: string,
  currentBranch: string | null,
): Promise<{ onPlanningBranch: boolean; activeWorkUnit: boolean }> {
  const active = await resolveActiveWu({ cwd });
  if (active.status !== "resolved") {
    return { onPlanningBranch: false, activeWorkUnit: false };
  }

  let fields;
  try {
    fields = parseMetaFile(await readFile(join(cwd, active.path), "utf8"));
  } catch {
    // An unreadable / malformed active meta resolves to no committable signal —
    // the gate redirects rather than trusting a half-resolved state.
    return { onPlanningBranch: false, activeWorkUnit: false };
  }

  const activeWorkUnit = fields.state !== null && OCCUPYING_PHASES.has(fields.state);
  const onPlanningBranch =
    fields.state === "Planning" && currentBranch !== null && fields.branch === currentBranch;
  return { onPlanningBranch, activeWorkUnit };
}

/**
 * Whether a `draft-<name>.md` already exists for this slug — `false` when
 * unnamed. Checks the flat `active/` draft (a WU mid-draft in place) first, then
 * falls back to a backlog stub's draft (a `--plan` grooming target nested under
 * `backlog/planned` or `backlog/provisional`), via the backlog-stub resolver.
 */
export async function resolveDraftPresent(cwd: string, name: string | undefined): Promise<boolean> {
  const slug = name?.trim();
  if (!slug) return false;
  const validatedSlug = SlugSchema.safeParse(slug);
  if (!validatedSlug.success) return false;
  const activeDraftPath = materializeArcPath(cwd, resolveArcPath({
    kind: "work-unit-artifact",
    placement: { kind: "active", scope: { kind: "project" } },
    slug: validatedSlug.data,
    artifact: "draft",
  }));
  try {
    if ((await stat(activeDraftPath)).isFile()) return true;
  } catch (err) {
    // Only an absent draft falls through to the backlog-stub lookup; real errors
    // (EACCES, etc.) must fail fast rather than silently mis-routing `--plan`.
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: unknown }).code)
        : undefined;
    if (code !== "ENOENT") throw err;
  }
  const stub = await resolveBacklogStub(cwd, slug);
  return stub?.draftPath != null;
}

/** Word the planning-entry route for a human, exiting non-zero on a redirect. */
function renderHuman(route: PlanningEntryRoute): void {
  p.intro("arc plan check");
  if (route.route === "proceed") {
    p.note(
      `Committable drafting context (\`${route.currentBranch}\`, ${route.protection}) — proceed with the draft.`,
      "Planning entry",
    );
    p.outro("Done.");
    return;
  }

  const reasonLine = redirectReasonLine(route);
  p.note(
    `${reasonLine} Route via start / stub / errand by WU-worthiness`
    + `${route.draftPresent ? " (a draft is present — the stub leg folds it in)" : ""}.`,
    "Planning entry — redirect",
  );
  process.exitCode = 1;
  p.outro("Done.");
}

/** Human wording for each redirect reason. */
function redirectReasonLine(route: Extract<PlanningEntryRoute, { route: "redirect" }>): string {
  switch (route.reason) {
    case "protected-base":
      return `On the protected base branch \`${route.currentBranch}\` under full protection — a draft can't commit here.`;
    case "work-unit-branch":
      return `On work-unit branch \`${route.currentBranch}\` — drafting here would tangle its PR.`;
    case "detached-head":
      return "Detached HEAD — no branch to draft from.";
    case "no-base":
      return "No base branch resolved (`branch.base` unset) — cannot determine a safe drafting context.";
  }
}
