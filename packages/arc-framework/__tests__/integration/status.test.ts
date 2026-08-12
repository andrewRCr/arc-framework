/**
 * Integration tests for the composite `arc status` probe.
 *
 * Builds synthetic `.arc/` fixture trees (config, extensions, active) in a
 * temp directory, wires the orchestrator to the real probe helpers, and
 * exercises the composite end-to-end. Covers:
 *
 * - Clean state — all four probes succeed; identity pointers carried through.
 * - Multi-WU state — active probe returns resolution=multiple; session-init
 *   shape preserves the candidate list.
 * - Mixed state — one probe errors (missing extensions dir); other probes
 *   unaffected, composite exits without throwing.
 * - Identity-missing — user probe short-circuits without invoking the
 *   session-init runner.
 *
 * The user probe uses a stub `UserIOContext` because the real one needs
 * git exec against a real repo; user-probe behavior is covered
 * exhaustively by its own test suite. Here we verify the composite wires
 * the probes together, not the probes themselves.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, mkdtemp, readFile as nodeReadFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  runActiveSessionInitStatus,
  runActiveStatus,
} from "../../src/commands/active.js";
import {
  runConfigSessionInitStatus,
  runConfigStatus,
} from "../../src/commands/config.js";
import { runDomainRulesSessionInitStatus } from "../../src/commands/constitution.js";
import {
  runExtensionsSessionInitStatus,
  runExtensionsStatus,
} from "../../src/commands/extensions.js";
import {
  runSessionHandoffStatus,
  runSessionInitStatus,
  runStatus,
} from "../../src/commands/status.js";
import type {
  SessionHandoffProbes,
  SessionInitProbes,
  StatusProbes,
} from "../../src/commands/status.js";
import type {
  UserSessionInitStatusResult,
  UserStatusResult,
} from "../../src/commands/user/types.js";
import { runWorktreeSyncStatus } from "../../src/lib/git/worktree-sync.js";
import {
  resolveAllSettings,
  type ResolvedSettingsResult,
} from "../../src/lib/config/resolved-settings.js";
import { resolveReleaseRouting } from "../../src/lib/release/routing.js";
import { runInboxState } from "../../src/lib/session-init/inbox-state.js";
import { extractReminderEntries } from "../../src/lib/session-init/inbox-reminders.js";
import { runErrandStalenessSweep } from "../../src/lib/session-init/errand-staleness-sweep.js";
import type { ErrandStateResult } from "../../src/lib/session-init/errand-state.js";
import type { GitExec } from "../../src/lib/git/index.js";
import type { DerivedLocusFrame } from "../../src/lib/locus/derived-reader.js";
import { resolveLoadSetManifest } from "../../src/lib/load-set/projection.js";
import { execFileAsync, makeGitExec, removeGitBackedDir } from "../helpers/integration.js";
import { worktreeStateEvidence } from "../helpers/worktree-evidence.js";
import { createSessionRemoteContextReader } from "../../src/handlers/status-remote-context.js";
import { DeliveryPositionViewSchema } from "../../src/lib/session-init/delivery-position.js";

interface Fixture {
  root: string;
  arcDir: string;
  configPath: string;
  extDir: string;
  wfDir: string;
  activeDir: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "arc-status-composite-"));
  const arcDir = join(root, ".arc");
  const configDir = join(arcDir, "system");
  const extDir = join(configDir, "extensions");
  const wfDir = join(configDir, "workflows");
  const activeDir = join(arcDir, "active");
  const constitutionDir = join(arcDir, "system", "rules");
  await mkdir(extDir, { recursive: true });
  await mkdir(wfDir, { recursive: true });
  await mkdir(activeDir, { recursive: true });
  await mkdir(constitutionDir, { recursive: true });
  return {
    root,
    arcDir,
    configPath: join(configDir, "arc-config.yml"),
    extDir,
    wfDir,
    activeDir,
  };
}

async function writeConfig(path: string): Promise<void> {
  await writeFile(
    path,
    [
      "pm.mode: arc-in-git",
      "branch.protection: partial",
      "commit.format: conventional",
      "commit.context_footer: required",
      "session.remote_sync: enabled",
    ].join("\n"),
  );
}

async function writeExtension(
  extDir: string,
  name: string,
  active: boolean,
): Promise<void> {
  await writeFile(
    join(extDir, `${name}.md`),
    [
      "---",
      `name: ${name}`,
      "description: fixture",
      `active: ${active ? "true" : "false"}`,
      "---",
      "",
      `# Extension: ${name}`,
      "",
    ].join("\n"),
  );
}

async function writeStatusFile(
  activeDir: string,
  _category: string,
  filename: string,
  body: { branch: string; state: string; taskList?: string; nextAction?: string },
): Promise<void> {
  void _category;
  const lines: string[] = [
    "# Metadata: fixture",
    "",
    `- **State:** ${body.state}`,
    `- **Branch:** ${body.branch}`,
  ];
  if (body.taskList !== undefined) lines.push(`- **Task List:** ${body.taskList}`);
  if (body.nextAction !== undefined) lines.push(`- **Next Action:** ${body.nextAction}`);
  await writeFile(join(activeDir, filename), lines.join("\n"));
}

// Stub user result — the probe is exercised in its own suite; here we just
// confirm the composite carries it through.
function stubUserResult(identity: string): UserStatusResult {
  return {
    identity,
    spineState: "clean",
    headline: "git note up to date",
    remoteStatus: "in sync",
    diskStatus: "current",
    summary: `${identity}: git note up to date`,
    actionHint: null,
    detailLines: [],
    remoteChecked: true,
    refState: "same",
    diskState: "same",
    savedCommit: null,
    savedFromAncestor: false,
    ancestorDistance: 0,
    savedAtRelative: null,
    unsavedDirection: null,
    backupFiles: [],
    remoteIdentities: [],
  };
}

function stubUserSessionInit(
  identity: string,
  state: UserSessionInitStatusResult["state"] = "clean",
): UserSessionInitStatusResult {
  return {
    identity,
    state,
    summary: `${identity}: session-init remote state ${state}`,
    detailLines:
      state === "disabled" ? [] : ["Remote notes match local notes."],
    actionHint: null,
    shouldPromptToPull: false,
  };
}

function freePrimaryDerivedFrame(): DerivedLocusFrame {
  const row = {
    kind: "free-primary" as const,
    checkout: {
      path: "/repo",
      head: "a".repeat(40),
      branch: "main",
      detached: false,
      primary: true,
    },
    subject: null,
    markerGeneration: null,
    parentCheckoutPath: null,
    origin: null,
    identity: null,
    context: null,
    lifecycleLocation: null,
    diagnostics: [],
  };
  return {
    roster: [row],
    entering: { kind: "selected", row },
    primaryAvailability: { kind: "free", checkoutPath: "/repo" },
    identityDiscovery: { kind: "absent" },
    active: null,
  };
}

function derivedFrameFromActive(
  active: Awaited<ReturnType<typeof runActiveSessionInitStatus>>,
  identity: string,
  activeExtensions: readonly string[],
): DerivedLocusFrame {
  if (active.resolution === "single" && active.path !== null) {
    const key = /meta-(.+)\.md$/u.exec(active.path)?.[1] ?? "fixture";
    const subject = { kind: "work-unit" as const, key };
    const context = {
      kind: "resolved" as const,
      metaPath: active.path,
      owner: null,
      branch: null,
      sessionType: active.sessionType,
      workflow: active.sessionType === "execution"
        ? "process-task-loop"
        : active.sessionType === "integration"
          ? "integrate-work-unit"
          : active.sessionType === "planning"
            ? "planning"
            : null,
      stage: active.planningStage,
      taskListPath: active.taskListPath ?? null,
      taskCursor: null,
      cohortDocPath: null,
      loadSet: resolveLoadSetManifest({
        identity,
        workingMemoryPath: null,
        activeWorkUnit: key,
        metaPath: active.path,
        sessionType: active.sessionType,
        planningStage: active.planningStage,
        taskListPath: active.taskListPath ?? null,
        activeExtensions,
        cohortDocPath: null,
      }),
    };
    const row = {
      ...freePrimaryDerivedFrame().roster[0]!,
      kind: "work-unit" as const,
      subject,
      context,
      lifecycleLocation: "active" as const,
    };
    return {
      roster: [row],
      entering: { kind: "selected", row },
      primaryAvailability: { kind: "occupied", checkoutPath: "/repo", subject },
      identityDiscovery: { kind: "absent" },
      active: { checkoutPath: "/repo", subject, context },
    };
  }
  if (active.resolution === "multiple") {
    const row = {
      ...freePrimaryDerivedFrame().roster[0]!,
      kind: "unresolved-checkout" as const,
      diagnostics: [{ code: "subject-unresolved", message: "Multiple active subjects occupy this checkout" }],
    };
    return {
      roster: [row],
      entering: { kind: "selected", row },
      primaryAvailability: {
        kind: "unsafe",
        checkoutPath: "/repo",
        reasons: ["subject-unresolved"],
      },
      identityDiscovery: { kind: "absent" },
      active: null,
    };
  }
  return freePrimaryDerivedFrame();
}

function makeProbes(fixture: Fixture): StatusProbes {
  return {
    user: async (identity) => stubUserResult(identity),
    extensions: () => runExtensionsStatus({ cwd: fixture.root }),
    config: () => runConfigStatus({ cwd: fixture.root }),
    active: () => runActiveStatus({ cwd: fixture.root }),
  };
}

const cleanCurrentWuReconcile: SessionInitProbes["currentWuReconcile"] = async ({ slug }) => ({
  status: "clean",
  slug,
  dependency: {
    before: [],
    after: [],
    replacements: [],
    drops: [],
    discharged: [],
    live: [],
    conflicts: [],
  },
  trackedReferences: { edits: [] },
  advisories: [],
  recommendedAction: "skip",
  recommendedCommand: null,
  recommendedPromptText: "",
});

const cleanUserReferenceReconcile: SessionInitProbes["userReferenceReconcile"] = async () => ({
  status: "clean",
  authority: { status: "ready", ref: "main", transitions: [], remoteEvidence: "not-applicable" },
  plan: { status: "clean", edits: [], advisories: [] },
  recommendedAction: "skip",
  recommendedCommand: null,
  recommendedPromptText: "",
});

function makeSessionInitProbes(fixture: Fixture): SessionInitProbes {
  return {
    derivedLocusState: async (identity, activeExtensions) => derivedFrameFromActive(
      await runActiveSessionInitStatus({ cwd: fixture.root, exec: makeGitExec(fixture.root) }),
      identity,
      activeExtensions,
    ),
    remoteContext: async () => ({ kind: "not-needed", reason: "remote-sync-disabled" }),
    user: async (identity) => stubUserSessionInit(identity),
    worktree: async () => ({
      state: "skipped", ahead: 0, behind: 0, branch: "main", remoteEvidence: "not-applicable",
    }),
    worktreeIdentity: async () => ({ kind: "primary" }),
    currentHusk: async () => null,
    baseDistance: async () => ({
      mode: "advisory", verdict: "skipped", state: "skipped", ahead: 0, behind: 0,
      base: "main", baseOid: null, integrationEvidence: null, overlap: null, register: null,
      remoteEvidence: "not-applicable",
    }),
    baseBranchSync: async () => ({
      state: "skipped",
      ahead: 0,
      behind: 0,
      base: "main",
      checkout: { kind: "not-checked-out" as const },
      refreshRemedy: null,
      guidance: null,
      remoteEvidence: "not-applicable",
    }),
    supersession: async () => ({ superseded: false, supersededCommits: [], novelCommits: [] }),
    dirty: async () => ({ state: "clean", fileCount: 0 }),
    extensions: () => runExtensionsSessionInitStatus({ cwd: fixture.root }),
    config: () => runConfigSessionInitStatus({ cwd: fixture.root }),
    domainRules: () => runDomainRulesSessionInitStatus({ cwd: fixture.root }),
    currentWuReconcile: cleanCurrentWuReconcile,
    userReferenceReconcile: cleanUserReferenceReconcile,
    roster: async () => ({ entries: [], warnings: [] }),
    recovery: async () => ({ kind: "main-fallback" as const, remoteEvidence: "exact" as const, baseBranch: "main" }),
    sweep: async () => ({ remoteEvidence: "not-applicable", worktrees: [], renameMoves: [], retirements: [], warnings: [] }),
    orphanBranchSweep: async () => ({ remoteEvidence: "not-applicable", orphans: [] }),
    retiredSubdirs: async () => ({ candidates: [] }),
    errandSweep: async () => ({ stale: [] }),
    errandState: async () => stubErrandState(),
    materializableWorkUnits: async () => ({
      candidates: [], remoteEvidence: "not-applicable", pendingBranchCount: 0, refreshRemedy: null,
    }),
    workUnitState: async () => ({
      inFlight: { workUnits: [] },
      nudge: { shouldNudge: false, markerPath: null, today: "2026-01-01" },
      warnings: [],
    }),
    inboxState: async () => ({ routableCount: 0, executeBoundCount: 0, housekeepNeeded: false }),
    partialPushMarker: async () => ({ markers: [] }),
    releaseRouting: async () =>
      resolveReleaseRouting({
        releaseOptedIn: false,
        commitInterlock: "manual",
        pushInterlock: "manual",
      }),
  };
}

function routingFromSettings(settings: ResolvedSettingsResult): ReturnType<typeof resolveReleaseRouting> {
  return resolveReleaseRouting({
    releaseOptedIn: settings.resolved.releaseOptedIn.value === "true",
    commitInterlock: settings.resolved.commitInterlock.value,
    pushInterlock: settings.resolved.pushInterlock.value,
  });
}

function makeResolvedReleaseModeSessionInitProbes(
  fixture: Fixture,
  exec: GitExec = makeGitExec(fixture.root),
): SessionInitProbes {
  let resolvedPromise: Promise<ResolvedSettingsResult> | null = null;
  const resolvedSettings = (): Promise<ResolvedSettingsResult> => {
    resolvedPromise ??= resolveAllSettings({
      cwd: fixture.root,
      exec,
      readFile: (path) => nodeReadFile(path, "utf-8"),
    });
    return resolvedPromise;
  };

  return {
    derivedLocusState: async (identity, activeExtensions) => derivedFrameFromActive(
      await runActiveSessionInitStatus({ cwd: fixture.root, exec: makeGitExec(fixture.root) }),
      identity,
      activeExtensions,
    ),
    remoteContext: async () => ({ kind: "not-needed", reason: "remote-sync-disabled" }),
    user: async (identity) => stubUserSessionInit(identity),
    worktree: async () => ({
      state: "skipped", ahead: 0, behind: 0, branch: "main", remoteEvidence: "not-applicable",
    }),
    worktreeIdentity: async () => ({ kind: "primary" }),
    currentHusk: async () => null,
    baseDistance: async () => ({
      mode: "advisory", verdict: "skipped", state: "skipped", ahead: 0, behind: 0,
      base: "main", baseOid: null, integrationEvidence: null, overlap: null, register: null,
      remoteEvidence: "not-applicable",
    }),
    baseBranchSync: async () => ({
      state: "skipped",
      ahead: 0,
      behind: 0,
      base: "main",
      checkout: { kind: "not-checked-out" as const },
      refreshRemedy: null,
      guidance: null,
      remoteEvidence: "not-applicable",
    }),
    supersession: async () => ({ superseded: false, supersededCommits: [], novelCommits: [] }),
    dirty: async () => ({ state: "clean", fileCount: 0 }),
    extensions: () => runExtensionsSessionInitStatus({ cwd: fixture.root }),
    config: async () =>
      runConfigSessionInitStatus({
        cwd: fixture.root,
        resolvedSettings: await resolvedSettings(),
      }),
    domainRules: () => runDomainRulesSessionInitStatus({ cwd: fixture.root }),
    currentWuReconcile: cleanCurrentWuReconcile,
    userReferenceReconcile: cleanUserReferenceReconcile,
    roster: async () => ({ entries: [], warnings: [] }),
    recovery: async () => ({ kind: "main-fallback" as const, remoteEvidence: "exact" as const, baseBranch: "main" }),
    sweep: async () => ({ remoteEvidence: "not-applicable", worktrees: [], renameMoves: [], retirements: [], warnings: [] }),
    orphanBranchSweep: async () => ({ remoteEvidence: "not-applicable", orphans: [] }),
    retiredSubdirs: async () => ({ candidates: [] }),
    errandSweep: async () => ({ stale: [] }),
    errandState: async () => stubErrandState(),
    materializableWorkUnits: async () => ({
      candidates: [], remoteEvidence: "not-applicable", pendingBranchCount: 0, refreshRemedy: null,
    }),
    workUnitState: async () => ({
      inFlight: { workUnits: [] },
      nudge: { shouldNudge: false, markerPath: null, today: "2026-01-01" },
      warnings: [],
    }),
    inboxState: async () => ({ routableCount: 0, executeBoundCount: 0, housekeepNeeded: false }),
    partialPushMarker: async () => ({ markers: [] }),
    releaseRouting: async () => routingFromSettings(await resolvedSettings()),
  };
}

function stubErrandState(): ErrandStateResult {
  return {
    remoteEvidence: "not-applicable",
    resume: { resumable: false, slug: null },
    inFlight: { errands: [] },
    materializable: { candidates: [] },
    residue: [],
    nudge: { shouldNudge: false, markerPath: null, today: "2026-06-01" },
    warnings: [],
  };
}

function makeResolvedReleaseModeSessionHandoffProbes(
  fixture: Fixture,
  exec: GitExec = makeGitExec(fixture.root),
): SessionHandoffProbes {
  let resolvedPromise: Promise<ResolvedSettingsResult> | null = null;
  const resolvedSettings = (): Promise<ResolvedSettingsResult> => {
    resolvedPromise ??= resolveAllSettings({
      cwd: fixture.root,
      exec,
      readFile: (path) => nodeReadFile(path, "utf-8"),
    });
    return resolvedPromise;
  };

  return {
    derivedLocusState: async (identity, activeExtensions) => derivedFrameFromActive(
      await runActiveSessionInitStatus({ cwd: fixture.root, exec: makeGitExec(fixture.root) }),
      identity,
      activeExtensions,
    ),
    extensions: () => runExtensionsSessionInitStatus({ cwd: fixture.root }),
    dirty: async () => ({ state: "clean", fileCount: 0 }),
    worktree: async () => ({
      state: "skipped", ahead: 0, behind: 0, branch: "main", remoteEvidence: "not-applicable",
    }),
    user: async (identity) => stubUserSessionInit(identity),
    syncInterlock: async () => {
      const resolved = (await resolvedSettings()).resolved.syncInterlock;
      const source = resolved.source === "yaml" ? "default" : resolved.source;
      return { value: resolved.value, source };
    },
    head: async () => ({ hash: "abc1234" }),
    pushability: async () => ({ allowed: true, conditions: [] }),
    restateCandidates: async () => ({
      commitsSinceHandoff: [],
      tasksClosedSinceHandoff: [],
      noteFileChangesSinceHandoff: [],
    }),
    releaseRouting: async () => routingFromSettings(await resolvedSettings()),
    inboxState: async () => ({ routableCount: 0, executeBoundCount: 0, housekeepNeeded: false }),
  };
}

describe("runStatus — clean state", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
    await writeConfig(fixture.configPath);
    await writeExtension(fixture.extDir, "pre-merge", true);
    await writeExtension(fixture.extDir, "post-task-quality", false);
    await writeStatusFile(fixture.activeDir, "technical", "meta-alpha.md", {
      branch: "technical/alpha",
      state: "Active",
    });
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("returns ok=true for every slot with identity pointers carried through", async () => {
    const probes = makeProbes(fixture);
    const result = await runStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });

    expect(result.mode).toBe("full");
    expect(result.identity).toEqual({ identity: "andrew", role: "maintainer" });

    expect(result.user.ok).toBe(true);
    expect(result.extensions.ok).toBe(true);
    expect(result.config.ok).toBe(true);
    expect(result.active.ok).toBe(true);

    if (result.extensions.ok) {
      expect(result.extensions.value.activeCount).toBe(1);
      expect(result.extensions.value.inactiveCount).toBe(1);
    }
    if (result.config.ok) {
      expect(result.config.value.settings["pm.mode"]).toBe("arc-in-git");
    }
    if (result.active.ok) {
      expect(result.active.value.candidates).toHaveLength(1);
      expect(result.active.value.candidates[0]?.branch).toBe("technical/alpha");
    }
  });
});

describe("runSessionInitStatus — multi-WU state", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
    await writeConfig(fixture.configPath);
    await writeExtension(fixture.extDir, "pre-merge", true);
    await writeStatusFile(fixture.activeDir, "feature", "meta-alpha.md", {
      branch: "feature/alpha",
      state: "Active",
    });
    await writeStatusFile(fixture.activeDir, "technical", "meta-beta.md", {
      branch: "technical/beta",
      state: "Integrating",
    });
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("fails the entering checkout closed instead of exposing repository-wide candidates", async () => {
    const probes = makeSessionInitProbes(fixture);
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });

    expect(result.mode).toBe("session-init");
    expect(result.active.ok).toBe(true);
    if (result.active.ok) {
      expect(result.active.value.resolution).toBe("none");
      expect(result.active.value.candidates).toEqual([]);
    }
    expect(result.derivedLocusState).toMatchObject({
      ok: true,
      value: { entering: { kind: "selected", row: { kind: "unresolved-checkout" } } },
    });
    expect(result.locusGuidance.kind).toBe("unavailable");
    expect(result.extensions.ok).toBe(true);
    if (result.extensions.ok) {
      expect(result.extensions.value.active).toEqual(["pre-merge"]);
    }
  });
});

describe("runSessionInitStatus — companion-file resolution carry-through", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
    await writeConfig(fixture.configPath);
    await writeExtension(fixture.extDir, "pre-merge", true);
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      [
        "# Metadata: fixture",
        "",
        "- **State:** Active",
        "- **Branch:** technical/foo",
        "- **Task List:** `.arc/active/tasks-foo.md`",
      ].join("\n"),
    );
    await writeFile(
      join(fixture.activeDir, "tasks-foo.md"),
      [
        "# Task List: Foo",
        "",
        "<!-- arc:delivery-plan:start -->",
        "## Delivery Plan",
        "",
        "- **Plan Revision:** `1`",
        `- **Plan Digest:** \`sha256:${"a".repeat(64)}\``,
        "- **Projection:** `stack-to-main`",
        "<!-- arc:delivery-plan:end -->",
        "",
        "## **Phase 1:** Fixture",
        "",
        "### `[ ]` **1.1 Exercise the envelope**",
        "",
      ].join("\n"),
    );
    await writeFile(join(fixture.activeDir, "notes-foo.md"), "# notes\n");
    await writeFile(join(fixture.activeDir, "atomic-foo.md"), "# atomic\n");
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("derives the active WU without a second companion-file projection", async () => {
    const probes = makeSessionInitProbes(fixture);
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });

    expect(result.active.ok).toBe(true);
    if (result.active.ok) {
      expect(result.active.value.resolution).toBe("single");
      expect(result.active.value.companions).toBeUndefined();
    }
  });

  it("isolates delivery orientation from every sibling session projection", async () => {
    const baseline = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes: makeSessionInitProbes(fixture),
    });
    const coherent = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes: {
        ...makeSessionInitProbes(fixture),
        deliveryPosition: async () => DeliveryPositionViewSchema.parse({
          planId: "123e4567-e89b-42d3-a456-426614174000",
          workUnitId: "foo",
          landedCount: 1,
          totalCount: 2,
          activeOperation: null,
          line: "Delivery position: 1/2 landed; active operation: none.",
        }),
      },
    });
    const degraded = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes: {
        ...makeSessionInitProbes(fixture),
        deliveryPosition: async () => {
          throw new Error("delivery observation unavailable");
        },
      },
    });

    expect(coherent.deliveryPosition).toMatchObject({ ok: true, value: { landedCount: 1, totalCount: 2 } });
    expect(degraded.deliveryPosition).toMatchObject({ ok: false });
    for (const result of [coherent, degraded]) {
      expect(result.taskCursor).toEqual(baseline.taskCursor);
      expect(result.derivedLocusState).toEqual(baseline.derivedLocusState);
      expect(result.loadSet).toEqual(baseline.loadSet);
      expect(result.active).toEqual(baseline.active);
      if (result.active.ok && baseline.active.ok) {
        expect(result.active.value.sessionType).toBe(baseline.active.value.sessionType);
        expect(result.active.value.currentWorkflow).toBe(baseline.active.value.currentWorkflow);
      }
      expect(result.recommendedCombinedPrompt).toEqual(baseline.recommendedCombinedPrompt);
    }
  });
});

describe("runSessionInitStatus — contributor role-aware active resolution", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
    await writeConfig(fixture.configPath);
    await writeExtension(fixture.extDir, "pre-merge", true);
    const userActiveDir = join(fixture.root, ".arc", "user", "alice", "active");
    await mkdir(userActiveDir, { recursive: true });
    await writeFile(
      join(userActiveDir, "meta-foo.md"),
      [
        "# Metadata: fixture",
        "",
        "- **State:** Active",
        "- **Branch:** user/alice/foo",
        "- **Task List:** `.arc/user/alice/active/tasks-foo.md`",
      ].join("\n"),
    );
    await writeFile(join(userActiveDir, "tasks-foo.md"), "# tasks\n");
    await writeFile(join(userActiveDir, "notes-foo.md"), "# notes\n");
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("resolves the contributor WU from its entering-checkout context", async () => {
    const probes: SessionInitProbes = {
      derivedLocusState: async (identity, activeExtensions) => derivedFrameFromActive(
        await runActiveSessionInitStatus({
          cwd: fixture.root,
          identity,
          role: "contributor",
          exec: makeGitExec(fixture.root),
        }),
        identity,
        activeExtensions,
      ),
      remoteContext: async () => ({ kind: "not-needed", reason: "remote-sync-disabled" }),
      user: async (id) => stubUserSessionInit(id),
      worktree: async () => ({
        state: "skipped", ahead: 0, behind: 0, branch: "main", remoteEvidence: "not-applicable",
      }),
      worktreeIdentity: async () => ({ kind: "primary" }),
      currentHusk: async () => null,
      baseDistance: async () => ({
        mode: "advisory", verdict: "skipped", state: "skipped", ahead: 0, behind: 0,
        base: "main", baseOid: null, integrationEvidence: null, overlap: null, register: null,
        remoteEvidence: "not-applicable",
      }),
      baseBranchSync: async () => ({
      state: "skipped",
      ahead: 0,
      behind: 0,
      base: "main",
      checkout: { kind: "not-checked-out" as const },
      refreshRemedy: null,
      guidance: null,
      remoteEvidence: "not-applicable",
    }),
      supersession: async () => ({ superseded: false, supersededCommits: [], novelCommits: [] }),
      dirty: async () => ({ state: "clean", fileCount: 0 }),
      extensions: () => runExtensionsSessionInitStatus({ cwd: fixture.root }),
      config: () => runConfigSessionInitStatus({ cwd: fixture.root }),
      domainRules: () => runDomainRulesSessionInitStatus({ cwd: fixture.root }),
      currentWuReconcile: cleanCurrentWuReconcile,
      userReferenceReconcile: cleanUserReferenceReconcile,
      roster: async () => ({ entries: [], warnings: [] }),
      recovery: async () => ({ kind: "main-fallback" as const, remoteEvidence: "exact" as const, baseBranch: "main" }),
      sweep: async () => ({ remoteEvidence: "not-applicable", worktrees: [], renameMoves: [], retirements: [], warnings: [] }),
      orphanBranchSweep: async () => ({ remoteEvidence: "not-applicable", orphans: [] }),
      retiredSubdirs: async () => ({ candidates: [] }),
      errandSweep: async () => ({ stale: [] }),
      errandState: async () => stubErrandState(),
      materializableWorkUnits: async () => ({
        candidates: [], remoteEvidence: "not-applicable", pendingBranchCount: 0, refreshRemedy: null,
      }),
      workUnitState: async () => ({
      inFlight: { workUnits: [] },
      nudge: { shouldNudge: false, markerPath: null, today: "2026-01-01" },
      warnings: [],
    }),
      inboxState: async () => ({ routableCount: 0, executeBoundCount: 0, housekeepNeeded: false }),
      partialPushMarker: async () => ({ markers: [] }),
      releaseRouting: async () =>
        resolveReleaseRouting({
          releaseOptedIn: false,
          commitInterlock: "manual",
          pushInterlock: "manual",
        }),
    };
    const result = await runSessionInitStatus({
      identity: "alice",
      role: "contributor",
      probes,
    });
    expect(result.active.ok).toBe(true);
    if (result.active.ok) {
      expect(result.active.value.resolution).toBe("single");
      expect(result.active.value.path).toBe(".arc/user/alice/active/meta-foo.md");
      expect(result.active.value.companions).toBeUndefined();
    }
  });
});

describe("runStatus — mixed (one probe errors, others succeed)", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
    await writeConfig(fixture.configPath);
    // Intentionally remove the extensions dir to force the extensions probe
    // to throw (readdir on ENOENT).
    await rm(fixture.extDir, { recursive: true, force: true });
    await writeStatusFile(fixture.activeDir, "technical", "meta-alpha.md", {
      branch: "technical/alpha",
      state: "Active",
    });
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("isolates the extensions failure; other slots succeed; no throw", async () => {
    const probes = makeProbes(fixture);
    const result = await runStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });

    expect(result.extensions.ok).toBe(false);
    if (!result.extensions.ok) {
      expect(result.extensions.error.kind).toBe("runtime");
    }

    // Other probes succeed
    expect(result.user.ok).toBe(true);
    expect(result.config.ok).toBe(true);
    expect(result.active.ok).toBe(true);
  });
});

describe("runStatus — identity missing", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
    await writeConfig(fixture.configPath);
    await writeExtension(fixture.extDir, "pre-merge", true);
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("short-circuits the user slot without invoking the user probe", async () => {
    let userInvoked = false;
    const probes: StatusProbes = {
      user: async (id) => {
        userInvoked = true;
        return stubUserResult(id);
      },
      extensions: () => runExtensionsStatus({ cwd: fixture.root }),
      config: () => runConfigStatus({ cwd: fixture.root }),
      active: () => runActiveStatus({ cwd: fixture.root }),
    };
    const result = await runStatus({ identity: null, role: null, probes });

    expect(userInvoked).toBe(false);
    expect(result.identity).toEqual({ identity: null, role: null });
    expect(result.user.ok).toBe(false);
    if (!result.user.ok) expect(result.user.error.kind).toBe("identity-missing");
    expect(result.extensions.ok).toBe(true);
    expect(result.config.ok).toBe(true);
    expect(result.active.ok).toBe(true);
  });
});

// --- Real worktree probe (replaces the stub above) ---
//
// These exercise `runSessionInitStatus` with the real `runWorktreeSyncStatus`
// driving `gitExec` against fixture repos. The per-state classifier matrix is
// already covered exhaustively at unit tier
// (`__tests__/unit/git/worktree-sync.test.ts` + `unit/status/run.test.ts`);
// here we verify the wiring from the composite orchestrator down to a real
// `gitExec` and back, plus the cross-channel qualifier attachment when
// `worktree=remote-ahead` and `user=clean`.
//
// Batching rationale (per process-task-loop "batching judgment"): tightly
// coupled — single orchestrator over a fixture-builder pattern, no
// independent discovery value across slices. Configured-state setup
// dominates per-test time; one-at-a-time would just multiply scaffolding.

async function gitInit(root: string): Promise<void> {
  await execFileAsync("git", ["init", root]);
  await execFileAsync("git", ["config", "gc.auto", "0"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "test@test.com"], {
    cwd: root,
  });
  await execFileAsync("git", ["config", "user.name", "Test User"], {
    cwd: root,
  });
  await execFileAsync(
    "git",
    ["-c", "core.hooksPath=/dev/null", "commit", "--allow-empty", "-m", "initial"],
    { cwd: root },
  );
}

async function pushToBareRemote(root: string): Promise<string> {
  const remoteDir = await mkdtemp(join(tmpdir(), "arc-status-remote-"));
  await execFileAsync("git", ["init", "--bare", remoteDir]);
  await execFileAsync("git", ["config", "gc.auto", "0"], { cwd: remoteDir });
  await execFileAsync("git", ["remote", "add", "origin", remoteDir], {
    cwd: root,
  });
  await execFileAsync("git", ["push", "-u", "origin", "HEAD"], { cwd: root });
  return remoteDir;
}

function makeRealWorktreeProbes(
  fixture: Fixture,
  opts: {
    remoteSyncEnabled?: boolean;
    userState?: UserSessionInitStatusResult["state"];
  } = {},
): SessionInitProbes {
  const remoteSyncEnabled = opts.remoteSyncEnabled ?? true;
  const userState = opts.userState ?? "clean";
  return {
    derivedLocusState: async (identity, activeExtensions) => derivedFrameFromActive(
      await runActiveSessionInitStatus({ cwd: fixture.root, exec: makeGitExec(fixture.root) }),
      identity,
      activeExtensions,
    ),
    // Derived from the same fixture and the same flag the worktree probe below reads
    // with. A hardcoded `remote-sync-disabled` context contradicted a probe reading
    // with sync enabled, so the stub set modelled a world that cannot occur.
    remoteContext: createSessionRemoteContextReader({
      cwd: fixture.root,
      exec: makeGitExec(fixture.root),
      remoteSyncEnabled: async () => remoteSyncEnabled,
    }),
    user: async (identity) => stubUserSessionInit(identity, userState),
    worktree: async () => {
      const result = await runWorktreeSyncStatus({
        exec: makeGitExec(fixture.root),
        remoteSyncEnabled,
      });
      if (result.state === "remote-unavailable") {
        return { ...result, remoteEvidence: "unreachable" as const, failureReason: result.failureReason ?? "error" };
      }
      const remoteEvidence = worktreeStateEvidence(result.state);
      const { failureReason, ...value } = result;
      void failureReason;
      return { ...value, remoteEvidence };
    },
    worktreeIdentity: async () => ({ kind: "primary" }),
    currentHusk: async () => null,
    baseDistance: async () => ({
      mode: "advisory", verdict: "skipped", state: "skipped", ahead: 0, behind: 0,
      base: "main", baseOid: null, integrationEvidence: null, overlap: null, register: null,
      remoteEvidence: "not-applicable",
    }),
    baseBranchSync: async () => ({
      state: "skipped",
      ahead: 0,
      behind: 0,
      base: "main",
      checkout: { kind: "not-checked-out" as const },
      refreshRemedy: null,
      guidance: null,
      remoteEvidence: "not-applicable",
    }),
    supersession: async () => ({ superseded: false, supersededCommits: [], novelCommits: [] }),
    dirty: async () => ({ state: "clean", fileCount: 0 }),
    extensions: () => runExtensionsSessionInitStatus({ cwd: fixture.root }),
    config: () => runConfigSessionInitStatus({ cwd: fixture.root }),
    domainRules: () => runDomainRulesSessionInitStatus({ cwd: fixture.root }),
    currentWuReconcile: cleanCurrentWuReconcile,
    userReferenceReconcile: cleanUserReferenceReconcile,
    roster: async () => ({ entries: [], warnings: [] }),
    recovery: async () => ({ kind: "main-fallback" as const, remoteEvidence: "exact" as const, baseBranch: "main" }),
    sweep: async () => ({ remoteEvidence: "not-applicable", worktrees: [], renameMoves: [], retirements: [], warnings: [] }),
    orphanBranchSweep: async () => ({ remoteEvidence: "not-applicable", orphans: [] }),
    retiredSubdirs: async () => ({ candidates: [] }),
    errandSweep: async () => ({ stale: [] }),
    errandState: async () => stubErrandState(),
    materializableWorkUnits: async () => ({
      candidates: [], remoteEvidence: "not-applicable", pendingBranchCount: 0, refreshRemedy: null,
    }),
    workUnitState: async () => ({
      inFlight: { workUnits: [] },
      nudge: { shouldNudge: false, markerPath: null, today: "2026-01-01" },
      warnings: [],
    }),
    inboxState: async () => ({ routableCount: 0, executeBoundCount: 0, housekeepNeeded: false }),
    partialPushMarker: async () => ({ markers: [] }),
    releaseRouting: async () =>
      resolveReleaseRouting({
        releaseOptedIn: false,
        commitInterlock: "manual",
        pushInterlock: "manual",
      }),
  };
}

describe("runSessionInitStatus — real worktree probe", () => {
  let fixture: Fixture;
  let remoteDir: string | undefined;

  beforeEach(async () => {
    fixture = await createFixture();
    await writeConfig(fixture.configPath);
    await writeExtension(fixture.extDir, "pre-merge", true);
    await gitInit(fixture.root);
    remoteDir = undefined;
  });

  afterEach(async () => {
    await removeGitBackedDir(fixture.root);
    if (remoteDir) await removeGitBackedDir(remoteDir);
  });

  it("reports worktree=clean when local matches a freshly pushed bare remote", async () => {
    remoteDir = await pushToBareRemote(fixture.root);

    const probes = makeRealWorktreeProbes(fixture);
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });

    expect(result.worktree.ok).toBe(true);
    if (result.worktree.ok) {
      expect(result.worktree.value.state).toBe("clean");
      expect(result.worktree.value.ahead).toBe(0);
      expect(result.worktree.value.behind).toBe(0);
    }
    expect(result.user.ok).toBe(true);
    if (result.user.ok) {
      expect(result.user.value.state).toBe("clean");
      expect("qualifier" in result.user.value).toBe(false);
    }
  });

  it("reports worktree=remote-ahead and attaches clean-at-current-head qualifier when user=clean", async () => {
    // Advance the working tree, push, then reset local back one commit so the
    // bare remote is one commit ahead of local.
    await execFileAsync(
      "git",
      ["-c", "core.hooksPath=/dev/null", "commit", "--allow-empty", "-m", "future"],
      { cwd: fixture.root },
    );
    remoteDir = await pushToBareRemote(fixture.root);
    await execFileAsync("git", ["reset", "--hard", "HEAD~1"], {
      cwd: fixture.root,
    });

    const probes = makeRealWorktreeProbes(fixture);
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });

    expect(result.worktree.ok).toBe(true);
    if (result.worktree.ok) {
      expect(result.worktree.value.state).toBe("remote-ahead");
      expect(result.worktree.value.ahead).toBe(0);
      expect(result.worktree.value.behind).toBe(1);
    }
    expect(result.user.ok).toBe(true);
    if (result.user.ok) {
      expect(result.user.value.qualifier).toBe("clean-at-current-head");
    }
  });

  it("reports worktree=no-remote when the fixture has no origin configured", async () => {
    const probes = makeRealWorktreeProbes(fixture);
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });

    expect(result.worktree.ok).toBe(true);
    if (result.worktree.ok) {
      expect(result.worktree.value.state).toBe("no-remote");
      expect(result.worktree.value.ahead).toBe(0);
      expect(result.worktree.value.behind).toBe(0);
    }
    expect(result.user.ok).toBe(true);
    if (result.user.ok) {
      // User channel resolves independently — qualifier reserved for
      // remote-ahead worktree only.
      expect(result.user.value.qualifier).toBeUndefined();
    }
  });

  it("propagates session.remote_sync=disabled to worktree=skipped while user channel reports state=disabled (distinct vocabularies)", async () => {
    const probes = makeRealWorktreeProbes(fixture, {
      remoteSyncEnabled: false,
      userState: "disabled",
    });
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });

    expect(result.worktree.ok).toBe(true);
    if (result.worktree.ok) {
      expect(result.worktree.value.state).toBe("skipped");
    }
    expect(result.user.ok).toBe(true);
    if (result.user.ok) {
      expect(result.user.value.state).toBe("disabled");
      expect(result.user.value.qualifier).toBeUndefined();
    }
  });
});

describe("runSessionInitStatus — sessionType envelope coverage", () => {
  // Verifies that sessionType travels through the composite probe envelope
  // unchanged. Per-shape inference behavior is exhaustively covered at the
  // active-probe layer in active.test.ts; here we confirm the composite
  // doesn't drop the field across the wrapping layer.
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
    await writeConfig(fixture.configPath);
    await writeExtension(fixture.extDir, "pre-merge", true);
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("carries sessionType=execution through the composite for a single-WU + Start-Task fixture", async () => {
    await writeStatusFile(fixture.activeDir, "technical", "meta-foo.md", {
      branch: "technical/foo",
      state: "Active",
      taskList: "`.arc/active/tasks-foo.md`",
      nextAction: "Start Task 4.2 — write unit tests",
    });

    const probes = makeSessionInitProbes(fixture);
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });

    expect(result.active.ok).toBe(true);
    if (result.active.ok) {
      expect(result.active.value.resolution).toBe("single");
      expect(result.active.value.sessionType).toBe("execution");
    }
  });

  it("carries sessionType=integration through the composite when Next Action begins with integrate-work-unit", async () => {
    await writeStatusFile(fixture.activeDir, "technical", "meta-foo.md", {
      branch: "technical/foo",
      state: "Active",
      taskList: "`.arc/active/tasks-foo.md`",
      nextAction: "integrate-work-unit Step 7 — push and create PR",
    });

    const probes = makeSessionInitProbes(fixture);
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });

    expect(result.active.ok).toBe(true);
    if (result.active.ok) {
      expect(result.active.value.resolution).toBe("single");
      expect(result.active.value.sessionType).toBe("integration");
    }
  });

  it("projects no active WU when the entering checkout has multiple subject metas", async () => {
    await writeStatusFile(fixture.activeDir, "feature", "meta-alpha.md", {
      branch: "feature/alpha",
      state: "Active",
      taskList: "`.arc/active/tasks-alpha.md`",
      nextAction: "Start Task 1.1 — kick off",
    });
    await writeStatusFile(fixture.activeDir, "technical", "meta-beta.md", {
      branch: "technical/beta",
      state: "Active",
      taskList: "`.arc/active/tasks-beta.md`",
      nextAction: "integrate-work-unit Step 1 — verify completion",
    });

    const probes = makeSessionInitProbes(fixture);
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });

    expect(result.active.ok).toBe(true);
    if (result.active.ok) {
      expect(result.active.value.resolution).toBe("none");
      expect(result.active.value.sessionType).toBeNull();
    }
  });
});

describe("runSessionInitStatus — release-mode key resolution at envelope path", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
    await writeFile(
      fixture.configPath,
      [
        "pm.mode: arc-in-git",
        "branch.protection: full",
        "commit.format: conventional",
        "commit.context_footer: required",
        "session.remote_sync: enabled",
        "user.notes_push: on-sync",
      ].join("\n"),
    );
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it(
    "orchestrated envelope surfaces resolved per-developer values at releaseRouting.rationale.* "
    + "and dual-scope notesPush at config.value.settings.user.notes_push",
    async () => {
      const overrides: Record<string, string> = {
        "arc.commitInterlock": "on-task-approval",
        "arc.pushInterlock": "on-sync",
        "arc.syncInterlock": "on-handoff",
        "arc.notesPush": "prompt",
        "arc.releaseOptedIn": "true",
      };
      const exec = vi.fn().mockImplementation((cmd: string, args: string[]) => {
        if (cmd === "git" && args[0] === "config" && args[1] === "--get") {
          const key = args[2];
          const value = key === undefined ? undefined : overrides[key];
          if (value === undefined) return Promise.reject(new Error("exit 1"));
          return Promise.resolve({ stdout: `${value}\n` });
        }
        return Promise.reject(new Error(`unexpected exec call: ${cmd} ${(args ?? []).join(" ")}`));
      });
      const probes = makeResolvedReleaseModeSessionInitProbes(fixture, exec);
      const result = await runSessionInitStatus({
        identity: "andrew",
        role: "maintainer",
        probes,
      });
      expect(result.config.ok).toBe(true);
      if (result.config.ok) {
        expect(result.config.value.settings["user.notes_push"]).toBe("prompt");
      }
      expect(result.releaseRouting.ok).toBe(true);
      if (result.releaseRouting.ok) {
        expect(result.releaseRouting.value).toEqual({
          taskCommit: "wrapper",
          workflowCommit: "raw",
          workflowPush: "raw",
          rationale: {
            releaseOptedIn: true,
            commitInterlock: "on-task-approval",
            pushInterlock: "on-sync",
          },
        });
      }
    },
  );

  it("session-init releaseRouting defaults all classes to raw when release wrappers are disabled", async () => {
    const probes = makeResolvedReleaseModeSessionInitProbes(fixture);
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });

    expect(result.releaseRouting.ok).toBe(true);
    if (result.releaseRouting.ok) {
      expect(result.releaseRouting.value).toEqual({
        taskCommit: "raw",
        workflowCommit: "raw",
        workflowPush: "raw",
        rationale: {
          releaseOptedIn: false,
          commitInterlock: "manual",
          pushInterlock: "manual",
        },
      });
    }
  });

  it("session-init releaseRouting routes all classes through wrappers for full workflow opt-in", async () => {
    const overrides: Record<string, string> = {
      "arc.commitInterlock": "on-workflow",
      "arc.pushInterlock": "on-workflow",
      "arc.releaseOptedIn": "true",
    };
    const exec = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "config" && args[1] === "--get") {
        const key = args[2];
        const value = key === undefined ? undefined : overrides[key];
        if (value === undefined) return Promise.reject(new Error("exit 1"));
        return Promise.resolve({ stdout: `${value}\n` });
      }
      return Promise.reject(new Error(`unexpected exec call: ${cmd} ${(args ?? []).join(" ")}`));
    });

    const probes = makeResolvedReleaseModeSessionInitProbes(fixture, exec);
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });

    expect(result.releaseRouting.ok).toBe(true);
    if (result.releaseRouting.ok) {
      expect(result.releaseRouting.value).toEqual({
        taskCommit: "wrapper",
        workflowCommit: "wrapper",
        workflowPush: "wrapper",
        rationale: {
          releaseOptedIn: true,
          commitInterlock: "on-workflow",
          pushInterlock: "on-workflow",
        },
      });
    }
  });
});

describe("runSessionHandoffStatus — releaseRouting envelope path", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
    await writeFile(
      fixture.configPath,
      [
        "pm.mode: arc-in-git",
        "branch.protection: full",
        "commit.format: conventional",
        "commit.context_footer: required",
        "session.remote_sync: enabled",
        "user.notes_push: on-sync",
      ].join("\n"),
    );
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("defaults all releaseRouting classes to raw when release wrappers are disabled", async () => {
    const probes = makeResolvedReleaseModeSessionHandoffProbes(fixture);
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
      resolveHandoffSurfaces: async () => ({
        workingMemoryPath: join(fixture.root, ".arc", "user", "andrew", "WORKING-MEMORY.md"),
        sessionNotesPath: (workUnitName) =>
          join(fixture.root, ".arc", "user", "andrew", workUnitName, "SESSION-NOTES.md"),
      }),
    });

    expect(result.releaseRouting.ok).toBe(true);
    if (result.releaseRouting.ok) {
      expect(result.releaseRouting.value).toEqual({
        taskCommit: "raw",
        workflowCommit: "raw",
        workflowPush: "raw",
        rationale: {
          releaseOptedIn: false,
          commitInterlock: "manual",
          pushInterlock: "manual",
        },
      });
    }
  });

  it("routes all releaseRouting classes through wrappers for full workflow opt-in", async () => {
    const overrides: Record<string, string> = {
      "arc.commitInterlock": "on-workflow",
      "arc.pushInterlock": "on-workflow",
      "arc.releaseOptedIn": "true",
    };
    const exec = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "config" && args[1] === "--get") {
        const key = args[2];
        const value = key === undefined ? undefined : overrides[key];
        if (value === undefined) return Promise.reject(new Error("exit 1"));
        return Promise.resolve({ stdout: `${value}\n` });
      }
      return Promise.reject(new Error(`unexpected exec call: ${cmd} ${(args ?? []).join(" ")}`));
    });

    const probes = makeResolvedReleaseModeSessionHandoffProbes(fixture, exec);
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
      resolveHandoffSurfaces: async () => ({
        workingMemoryPath: join(fixture.root, ".arc", "user", "andrew", "WORKING-MEMORY.md"),
        sessionNotesPath: (workUnitName) =>
          join(fixture.root, ".arc", "user", "andrew", workUnitName, "SESSION-NOTES.md"),
      }),
    });

    expect(result.releaseRouting.ok).toBe(true);
    if (result.releaseRouting.ok) {
      expect(result.releaseRouting.value).toEqual({
        taskCommit: "wrapper",
        workflowCommit: "wrapper",
        workflowPush: "wrapper",
        rationale: {
          releaseOptedIn: true,
          commitInterlock: "on-workflow",
          pushInterlock: "on-workflow",
        },
      });
    }
  });
});

// Exercises the handoff path's real read + parse + count wiring: the
// `inboxState` slot is what the between-WUs branch uses to offer housekeep.
describe("runSessionHandoffStatus — inbox-state envelope path", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
    await writeConfig(fixture.configPath);
  });

  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  function realHandoffInboxStateProbes(f: Fixture): SessionHandoffProbes {
    return {
      ...makeResolvedReleaseModeSessionHandoffProbes(f),
      inboxState: async (id) => {
        const content = await nodeReadFile(
          join(f.root, ".arc", "user", id, "USER-INBOX.md"),
          "utf-8",
        ).catch(() => "");
        return runInboxState({ content });
      },
    };
  }

  it("counts routable USER-INBOX entries into the handoff envelope slot (present)", async () => {
    const userDir = join(fixture.root, ".arc", "user", "andrew");
    await mkdir(userDir, { recursive: true });
    await writeFile(
      join(userDir, "USER-INBOX.md"),
      [
        "# User Inbox",
        "",
        "## Errand",
        "",
        "### `[ ]` **first capture**",
        "",
        "- A routable atomic entry.",
        "",
        "## Work Unit",
        "",
        "### `[ ]` **second capture**",
        "",
        "- A routable multi-step entry.",
        "",
      ].join("\n"),
    );

    const resolveHandoffSurfaces = async () => ({
      workingMemoryPath: join(fixture.root, ".arc", "user", "andrew", "WORKING-MEMORY.md"),
      sessionNotesPath: (workUnitName: string) =>
        join(fixture.root, ".arc", "user", "andrew", workUnitName, "SESSION-NOTES.md"),
    });
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes: realHandoffInboxStateProbes(fixture),
      resolveHandoffSurfaces,
    });

    expect(result.inboxState?.ok).toBe(true);
    if (result.inboxState?.ok) {
      expect(result.inboxState.value).toEqual({ routableCount: 2, executeBoundCount: 0, housekeepNeeded: true });
    }
  });

  it("reports a missing inbox as zero count with housekeepNeeded false (empty)", async () => {
    const result = await runSessionHandoffStatus({
      identity: "andrew",
      role: "maintainer",
      probes: realHandoffInboxStateProbes(fixture),
      resolveHandoffSurfaces: async () => ({
        workingMemoryPath: join(fixture.root, ".arc", "user", "andrew", "WORKING-MEMORY.md"),
        sessionNotesPath: (workUnitName) =>
          join(fixture.root, ".arc", "user", "andrew", workUnitName, "SESSION-NOTES.md"),
      }),
    });

    expect(result.inboxState?.ok).toBe(true);
    if (result.inboxState?.ok) {
      expect(result.inboxState.value).toEqual({ routableCount: 0, executeBoundCount: 0, housekeepNeeded: false });
    }
  });

  it("omits the inbox-state slot when identity is absent (identity-absent)", async () => {
    const result = await runSessionHandoffStatus({
      identity: null,
      role: null,
      probes: realHandoffInboxStateProbes(fixture),
    });

    expect("inboxState" in result).toBe(false);
  });
});

// Exercises the real read + parse + count + envelope path: a handler-equivalent
// `inboxState` probe reads `.arc/user/{identity}/USER-INBOX.md` off the fixture
// filesystem, so the slot reflects the parser and orchestrator end to end.
describe("runSessionInitStatus — inbox-state envelope path", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
    await writeConfig(fixture.configPath);
  });

  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  function realInboxStateProbes(f: Fixture): SessionInitProbes {
    return {
      ...makeSessionInitProbes(f),
      inboxState: async (id) => {
        const content = await nodeReadFile(
          join(f.root, ".arc", "user", id, "USER-INBOX.md"),
          "utf-8",
        ).catch(() => "");
        return runInboxState({ content });
      },
    };
  }

  it("counts routable USER-INBOX entries into the envelope slot (present)", async () => {
    const userDir = join(fixture.root, ".arc", "user", "andrew");
    await mkdir(userDir, { recursive: true });
    await writeFile(
      join(userDir, "USER-INBOX.md"),
      [
        "# User Inbox",
        "",
        "## Errand",
        "",
        "### `[ ]` **first capture**",
        "",
        "- A routable atomic entry.",
        "",
        "## Work Unit",
        "",
        "### `[ ]` **second capture**",
        "",
        "- A routable backlog entry.",
        "",
        "### `[ ]` **queued capture**",
        "",
        "- _Disposition:_ `execute-bound`",
        "- Already routed for execution.",
        "",
      ].join("\n"),
    );

    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes: realInboxStateProbes(fixture),
    });

    expect(result.inboxState?.ok).toBe(true);
    if (result.inboxState?.ok) {
      expect(result.inboxState.value).toEqual({ routableCount: 2, executeBoundCount: 1, housekeepNeeded: true });
    }
  });

  it("reports a missing inbox as zero count with housekeepNeeded false (empty)", async () => {
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes: realInboxStateProbes(fixture),
    });

    expect(result.inboxState?.ok).toBe(true);
    if (result.inboxState?.ok) {
      expect(result.inboxState.value).toEqual({ routableCount: 0, executeBoundCount: 0, housekeepNeeded: false });
    }
  });

  it("omits the inbox-state slot when identity is absent (identity-absent)", async () => {
    const result = await runSessionInitStatus({
      identity: null,
      role: null,
      probes: realInboxStateProbes(fixture),
    });

    expect("inboxState" in result).toBe(false);
  });
});

// Exercises the repointed staleness sweep end to end: a handler-equivalent
// errandSweep probe reads the fixture's USER-INBOX, extracts the reminder-
// flagged Errand entries, and ages them — confirming the sweep now sources the
// inbox instead of the retired ERRANDS.md queue.
describe("runSessionInitStatus — reminder-sweep envelope path", () => {
  const NOW = "2026-05-31T12:00:00.000Z";
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
    await writeConfig(fixture.configPath);
  });

  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  function realReminderSweepProbes(f: Fixture): SessionInitProbes {
    return {
      ...makeSessionInitProbes(f),
      errandSweep: async (id) => {
        const content = await nodeReadFile(
          join(f.root, ".arc", "user", id, "USER-INBOX.md"),
          "utf-8",
        ).catch(() => "");
        return runErrandStalenessSweep({
          entries: extractReminderEntries({ content }).entries,
          thresholdDays: 1,
          now: NOW,
        });
      },
    };
  }

  it("ages a reminder-flagged Errand entry past the threshold into the sweep (present)", async () => {
    const userDir = join(fixture.root, ".arc", "user", "andrew");
    await mkdir(userDir, { recursive: true });
    await writeFile(
      join(userDir, "USER-INBOX.md"),
      [
        "# User Inbox",
        "",
        "## Errand",
        "",
        "### `[ ]` **drain the backlog**",
        "",
        "- _Remind:_ `true`",
        "- _Created:_ `2026-05-28`",
        "",
        "## Work Unit",
        "",
      ].join("\n"),
    );

    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes: realReminderSweepProbes(fixture),
    });

    expect(result.errandSweep?.ok).toBe(true);
    if (result.errandSweep?.ok) {
      expect(result.errandSweep.value.stale).toEqual([
        { slug: "drain the backlog", created: "2026-05-28", ageDays: 3 },
      ]);
    }
  });

  it("surfaces nothing when there are no flagged captures (empty)", async () => {
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes: realReminderSweepProbes(fixture),
    });

    expect(result.errandSweep?.ok).toBe(true);
    if (result.errandSweep?.ok) {
      expect(result.errandSweep.value.stale).toEqual([]);
    }
  });

  it("omits the sweep slot when identity is absent (identity-absent)", async () => {
    const result = await runSessionInitStatus({
      identity: null,
      role: null,
      probes: realReminderSweepProbes(fixture),
    });

    expect("errandSweep" in result).toBe(false);
  });
});
