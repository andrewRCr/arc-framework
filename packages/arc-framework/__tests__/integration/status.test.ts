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

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
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
import {
  runExtensionsSessionInitStatus,
  runExtensionsStatus,
} from "../../src/commands/extensions.js";
import {
  runSessionInitStatus,
  runStatus,
} from "../../src/commands/status.js";
import type {
  SessionInitProbes,
  StatusProbes,
} from "../../src/commands/status.js";
import type {
  UserSessionInitStatusResult,
  UserStatusResult,
} from "../../src/commands/user/types.js";

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
  await mkdir(extDir, { recursive: true });
  await mkdir(wfDir, { recursive: true });
  await mkdir(activeDir, { recursive: true });
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
  body: { branch: string; state: string },
): Promise<void> {
  const dir = join(activeDir, category);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, filename),
    [
      "# Status: fixture",
      "",
      "## Active Work",
      "",
      `- **State:** ${body.state}`,
      `- **Branch:** ${body.branch}`,
    ].join("\n"),
  );
}

// Stub user result — the probe is exercised in its own suite; here we just
// confirm the composite carries it through.
function stubUserResult(identity: string): UserStatusResult {
  return {
    identity,
    headline: "up to date",
    remoteStatus: "in sync",
    diskStatus: "current",
    summary: `${identity}: up to date`,
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

function stubUserSessionInit(identity: string): UserSessionInitStatusResult {
  return {
    identity,
    state: "clean",
    summary: `${identity}: session-init remote state clean`,
    detailLines: ["Remote notes match local notes."],
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
    extensions: () => runExtensionsSessionInitStatus({ cwd: fixture.root }),
    config: () => runConfigSessionInitStatus({ cwd: fixture.root }),
    active: () => runActiveSessionInitStatus({ cwd: fixture.root }),
  };
}

describe("runStatus — clean state", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
    await writeConfig(fixture.configPath);
    await writeExtension(fixture.extDir, "pre-merge-review", true);
    await writeExtension(fixture.extDir, "post-task-quality", false);
    await writeStatusFile(fixture.activeDir, "technical", "status-alpha.md", {
      branch: "technical/alpha",
      state: "In Progress",
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
    await writeStatusFile(fixture.activeDir, "feature", "status-alpha.md", {
      branch: "feature/alpha",
      state: "In Progress",
    });
    await writeStatusFile(fixture.activeDir, "technical", "status-beta.md", {
      branch: "technical/beta",
      state: "Paused",
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
      expect(filenames).toEqual(["status-alpha.md", "status-beta.md"]);
    }
    expect(result.extensions.ok).toBe(true);
    if (result.extensions.ok) {
      expect(result.extensions.value.active).toEqual(["pre-merge-review"]);
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
    await writeStatusFile(fixture.activeDir, "technical", "status-alpha.md", {
      branch: "technical/alpha",
      state: "In Progress",
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
