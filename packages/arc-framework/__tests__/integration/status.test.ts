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
import type { GitExec } from "../../src/lib/git/index.js";
import { execFileAsync, makeGitExec } from "../helpers/integration.js";

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
  const constitutionDir = join(arcDir, "reference", "constitution");
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
  category: string,
  filename: string,
  body: { branch: string; state: string; taskList?: string; nextAction?: string },
): Promise<void> {
  const dir = join(activeDir, category);
  await mkdir(dir, { recursive: true });
  const lines: string[] = [
    "# Status: fixture",
    "",
    "## Work Unit Metadata",
    "",
    `- **State:** ${body.state}`,
    `- **Branch:** ${body.branch}`,
  ];
  if (body.taskList !== undefined) lines.push(`- **Task List:** ${body.taskList}`);
  if (body.nextAction !== undefined) lines.push(`- **Next Action:** ${body.nextAction}`);
  await writeFile(join(dir, filename), lines.join("\n"));
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

function makeProbes(fixture: Fixture): StatusProbes {
  return {
    user: async (identity) => stubUserResult(identity),
    extensions: () => runExtensionsStatus({ cwd: fixture.root }),
    config: () => runConfigStatus({ cwd: fixture.root }),
    active: () => runActiveStatus({ cwd: fixture.root }),
  };
}

function makeSessionInitProbes(fixture: Fixture): SessionInitProbes {
  return {
    user: async (identity) => stubUserSessionInit(identity),
    worktree: async () => ({ state: "skipped", ahead: 0, behind: 0, branch: "main" }),
    dirty: async () => ({ state: "clean", fileCount: 0 }),
    extensions: () => runExtensionsSessionInitStatus({ cwd: fixture.root }),
    config: () => runConfigSessionInitStatus({ cwd: fixture.root }),
    active: () => runActiveSessionInitStatus({ cwd: fixture.root, exec: makeGitExec(fixture.root) }),
    domainRules: () => runDomainRulesSessionInitStatus({ cwd: fixture.root }),
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
    user: async (identity) => stubUserSessionInit(identity),
    worktree: async () => ({ state: "skipped", ahead: 0, behind: 0, branch: "main" }),
    dirty: async () => ({ state: "clean", fileCount: 0 }),
    extensions: () => runExtensionsSessionInitStatus({ cwd: fixture.root }),
    config: async () =>
      runConfigSessionInitStatus({
        cwd: fixture.root,
        resolvedSettings: await resolvedSettings(),
      }),
    active: () => runActiveSessionInitStatus({ cwd: fixture.root, exec: makeGitExec(fixture.root) }),
    domainRules: () => runDomainRulesSessionInitStatus({ cwd: fixture.root }),
    releaseRouting: async () => routingFromSettings(await resolvedSettings()),
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
    dirty: async () => ({ state: "clean", fileCount: 0 }),
    worktree: async () => ({ state: "skipped", ahead: 0, behind: 0, branch: "main" }),
    user: async (identity) => stubUserSessionInit(identity),
    syncInterlock: async () => {
      const resolved = (await resolvedSettings()).resolved.syncInterlock;
      const source = resolved.source === "yaml" ? "default" : resolved.source;
      return { value: resolved.value, source };
    },
    active: () => runActiveSessionInitStatus({ cwd: fixture.root, exec: makeGitExec(fixture.root) }),
    head: async () => ({ hash: "abc1234" }),
    pushability: async () => ({ allowed: true, conditions: [] }),
    restateCandidates: async () => ({
      commitsSinceHandoff: [],
      tasksClosedSinceHandoff: [],
      noteFileChangesSinceHandoff: [],
    }),
    releaseRouting: async () => routingFromSettings(await resolvedSettings()),
  };
}

describe("runStatus — clean state", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
    await writeConfig(fixture.configPath);
    await writeExtension(fixture.extDir, "pre-merge-review", true);
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
    await writeExtension(fixture.extDir, "pre-merge-review", true);
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

  it("carries the session-init candidate list through for disambiguation", async () => {
    const probes = makeSessionInitProbes(fixture);
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });

    expect(result.mode).toBe("session-init");
    expect(result.active.ok).toBe(true);
    if (result.active.ok) {
      expect(result.active.value.resolution).toBe("multiple");
      expect(result.active.value.candidates).toHaveLength(2);
      const filenames = result.active.value.candidates.map((c) => c.filename).sort();
      expect(filenames).toEqual(["meta-alpha.md", "meta-beta.md"]);
    }
    expect(result.extensions.ok).toBe(true);
    if (result.extensions.ok) {
      expect(result.extensions.value.active).toEqual(["pre-merge-review"]);
    }
  });
});

describe("runSessionInitStatus — companion-file resolution carry-through", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
    await writeConfig(fixture.configPath);
    await writeExtension(fixture.extDir, "pre-merge-review", true);
    const sub = join(fixture.activeDir, "technical");
    await mkdir(sub, { recursive: true });
    await writeFile(
      join(sub, "meta-foo.md"),
      [
        "# Status: fixture",
        "",
        "## Work Unit Metadata",
        "",
        "- **State:** Active",
        "- **Branch:** technical/foo",
        "- **Task List:** `.arc/active/technical/tasks-foo.md`",
      ].join("\n"),
    );
    await writeFile(join(sub, "tasks-foo.md"), "# tasks\n");
    await writeFile(join(sub, "notes-foo.md"), "# notes\n");
    await writeFile(join(sub, "atomic-foo.md"), "# atomic\n");
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("propagates active.value.companions through the composite envelope unchanged", async () => {
    const probes = makeSessionInitProbes(fixture);
    const result = await runSessionInitStatus({
      identity: "andrew",
      role: "maintainer",
      probes,
    });

    expect(result.active.ok).toBe(true);
    if (result.active.ok) {
      expect(result.active.value.resolution).toBe("single");
      expect(result.active.value.companions).toEqual({
        notes: ".arc/active/technical/notes-foo.md",
        atomic: ".arc/active/technical/atomic-foo.md",
      });
    }
  });
});

describe("runSessionInitStatus — contributor role-aware active resolution", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
    await writeConfig(fixture.configPath);
    await writeExtension(fixture.extDir, "pre-merge-review", true);
    const userActiveDir = join(fixture.root, ".arc", "user", "alice", "active");
    await mkdir(userActiveDir, { recursive: true });
    await writeFile(
      join(userActiveDir, "meta-foo.md"),
      [
        "# Status: fixture",
        "",
        "## Work Unit Metadata",
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

  it("resolves active under .arc/user/{identity}/active/ when role=contributor and surfaces companions", async () => {
    const probes: SessionInitProbes = {
      user: async (id) => stubUserSessionInit(id),
      worktree: async () => ({ state: "skipped", ahead: 0, behind: 0, branch: "main" }),
      dirty: async () => ({ state: "clean", fileCount: 0 }),
      extensions: () => runExtensionsSessionInitStatus({ cwd: fixture.root }),
      config: () => runConfigSessionInitStatus({ cwd: fixture.root }),
      active: (identity, role) =>
        runActiveSessionInitStatus({ cwd: fixture.root, identity, role, exec: makeGitExec(fixture.root) }),
      domainRules: () => runDomainRulesSessionInitStatus({ cwd: fixture.root }),
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
      expect(result.active.value.companions).toEqual({
        notes: ".arc/user/alice/active/notes-foo.md",
        atomic: null,
      });
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
    await writeExtension(fixture.extDir, "pre-merge-review", true);
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
    user: async (identity) => stubUserSessionInit(identity, userState),
    worktree: () =>
      runWorktreeSyncStatus({
        exec: makeGitExec(fixture.root),
        remoteSyncEnabled,
      }),
    dirty: async () => ({ state: "clean", fileCount: 0 }),
    extensions: () => runExtensionsSessionInitStatus({ cwd: fixture.root }),
    config: () => runConfigSessionInitStatus({ cwd: fixture.root }),
    active: () => runActiveSessionInitStatus({ cwd: fixture.root, exec: makeGitExec(fixture.root) }),
    domainRules: () => runDomainRulesSessionInitStatus({ cwd: fixture.root }),
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
    await writeExtension(fixture.extDir, "pre-merge-review", true);
    await gitInit(fixture.root);
    remoteDir = undefined;
  });

  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
    if (remoteDir) await rm(remoteDir, { recursive: true, force: true });
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
    await writeExtension(fixture.extDir, "pre-merge-review", true);
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("carries sessionType=execution through the composite for a single-WU + Start-Task fixture", async () => {
    await writeStatusFile(fixture.activeDir, "technical", "meta-foo.md", {
      branch: "technical/foo",
      state: "Active",
      taskList: "`.arc/active/technical/tasks-foo.md`",
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
      taskList: "`.arc/active/technical/tasks-foo.md`",
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

  it("carries sessionType=null through the composite when resolution is multiple (defer until disambiguation)", async () => {
    await writeStatusFile(fixture.activeDir, "feature", "meta-alpha.md", {
      branch: "feature/alpha",
      state: "Active",
      taskList: "`.arc/active/feature/tasks-alpha.md`",
      nextAction: "Start Task 1.1 — kick off",
    });
    await writeStatusFile(fixture.activeDir, "technical", "meta-beta.md", {
      branch: "technical/beta",
      state: "Active",
      taskList: "`.arc/active/technical/tasks-beta.md`",
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
      expect(result.active.value.resolution).toBe("multiple");
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
