/**
 * Integration tests for the active-status probe.
 *
 * Builds synthetic `.arc/active/` fixture trees — zero-file, one-file, and
 * many-file under Full layout plus single-file under Lite layout — and
 * exercises the real `runActiveStatus` / `runActiveSessionInitStatus`
 * against them. Covers layout detection, per-WU field parsing, and
 * session-init resolution shaping (none/single/multiple).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  runActiveSessionInitStatus,
  runActiveStatus,
} from "../../src/commands/active.js";
import { stubGitExec } from "../helpers/integration.js";

/** Shared default — non-planning branch keeps existing assertions stable. */
const defaultExec = stubGitExec("main");

interface Fixture {
  root: string;
  activeDir: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "arc-active-probe-"));
  const activeDir = join(root, ".arc", "active");
  await mkdir(activeDir, { recursive: true });
  return { root, activeDir };
}

function statusBody(fields: {
  state: string;
  branch: string;
  nextTask?: string;
  taskList?: string;
  nextAction?: string;
}): string {
  const lines: string[] = [
    "# Status: fixture",
    "",
    "## Work Unit Metadata",
    "",
    `- **State:** ${fields.state}`,
    `- **Branch:** ${fields.branch}`,
  ];
  if (fields.taskList !== undefined) lines.push(`- **Task List:** ${fields.taskList}`);
  if (fields.nextTask !== undefined) lines.push(`- **Next Task:** ${fields.nextTask}`);
  if (fields.nextAction !== undefined) lines.push(`- **Next Action:** ${fields.nextAction}`);
  return lines.join("\n");
}

describe("runActiveStatus — Full layout", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("returns an empty candidate list when .arc/active/ has no status files", async () => {
    const result = await runActiveStatus({ cwd: fixture.root });
    expect(result.mode).toBe("full");
    expect(result.layout).toBe("full");
    expect(result.candidates).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("enumerates a single Full-layout candidate with all fields populated", async () => {
    const sub = join(fixture.activeDir, "technical");
    await mkdir(sub, { recursive: true });
    await writeFile(
      join(sub, "meta-foo.md"),
      statusBody({
        state: "Active",
        branch: "technical/foo",
        nextTask: "Task 3.R.k.d — probe (line ~1828)",
        taskList: "`.arc/active/technical/tasks-foo.md`",
      }),
    );

    const result = await runActiveStatus({ cwd: fixture.root });
    expect(result.layout).toBe("full");
    expect(result.candidates).toHaveLength(1);
    const c = result.candidates[0]!;
    expect(c.filename).toBe("meta-foo.md");
    expect(c.path).toBe(".arc/active/technical/meta-foo.md");
    expect(c.branch).toBe("technical/foo");
    expect(c.state).toBe("Active");
    expect(c.nextTask).toBe("Task 3.R.k.d — probe (line ~1828)");
    expect(c.taskList).toBe(".arc/active/technical/tasks-foo.md");
  });

  it("enumerates many Full-layout candidates across categories with full State values", async () => {
    const sub1 = join(fixture.activeDir, "feature");
    const sub2 = join(fixture.activeDir, "technical");
    await mkdir(sub1, { recursive: true });
    await mkdir(sub2, { recursive: true });
    await writeFile(
      join(sub1, "meta-alpha.md"),
      statusBody({ state: "Active", branch: "feature/alpha" }),
    );
    await writeFile(
      join(sub2, "meta-beta.md"),
      statusBody({
        state: "Paused (2026-04-12) — waiting for restructure",
        branch: "technical/beta",
      }),
    );

    const result = await runActiveStatus({ cwd: fixture.root });
    expect(result.candidates).toHaveLength(2);
    const beta = result.candidates.find((c) => c.filename === "meta-beta.md");
    expect(beta?.state).toBe("Paused (2026-04-12) — waiting for restructure");
  });
});

describe("runActiveStatus — Lite layout", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("detects Lite layout via .arc/active/status.md and returns a single candidate", async () => {
    await writeFile(
      join(fixture.activeDir, "status.md"),
      statusBody({ state: "Active", branch: "main" }),
    );
    const result = await runActiveStatus({ cwd: fixture.root });
    expect(result.layout).toBe("lite");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.path).toBe(".arc/active/status.md");
    expect(result.candidates[0]!.state).toBe("Active");
  });
});

describe("runActiveSessionInitStatus — resolution states", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("returns resolution=none when no status files exist", async () => {
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.mode).toBe("session-init");
    expect(result.resolution).toBe("none");
    expect(result.path).toBeNull();
    expect(result.candidates).toEqual([]);
  });

  it("returns resolution=single with the resolved path for exactly one candidate", async () => {
    const sub = join(fixture.activeDir, "technical");
    await mkdir(sub, { recursive: true });
    await writeFile(
      join(sub, "meta-foo.md"),
      statusBody({ state: "Active", branch: "technical/foo" }),
    );

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.path).toBe(".arc/active/technical/meta-foo.md");
    expect(result.candidates).toEqual([]);
  });

  it("returns resolution=multiple with the full candidate list for many files", async () => {
    const sub1 = join(fixture.activeDir, "feature");
    const sub2 = join(fixture.activeDir, "technical");
    await mkdir(sub1, { recursive: true });
    await mkdir(sub2, { recursive: true });
    await writeFile(
      join(sub1, "meta-alpha.md"),
      statusBody({ state: "Active", branch: "feature/alpha" }),
    );
    await writeFile(
      join(sub2, "meta-beta.md"),
      statusBody({ state: "Integrating", branch: "technical/beta" }),
    );

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("multiple");
    expect(result.path).toBeNull();
    expect(result.candidates).toHaveLength(2);
    const filenames = result.candidates.map((c) => c.filename).sort();
    expect(filenames).toEqual(["meta-alpha.md", "meta-beta.md"]);
    // Candidates carry enough context for the agent to apply Step 2 Item 8's
    // branch/state precedence without re-scanning.
    const beta = result.candidates.find((c) => c.filename === "meta-beta.md");
    expect(beta?.branch).toBe("technical/beta");
    expect(beta?.state).toBe("Integrating");
  });

  it("resolves Lite layout's single file as resolution=single", async () => {
    await writeFile(
      join(fixture.activeDir, "status.md"),
      statusBody({ state: "Active", branch: "main" }),
    );
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.layout).toBe("lite");
    expect(result.resolution).toBe("single");
    expect(result.path).toBe(".arc/active/status.md");
  });

  it("propagates warnings when .arc/active/ is missing entirely", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-active-missing-"));
    try {
      const result = await runActiveSessionInitStatus({ cwd: root, exec: defaultExec });
      expect(result.resolution).toBe("none");
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0]).toContain(".arc/active/");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("runActiveSessionInitStatus — companion-file resolution", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  async function writeFullStatus(category: string, stem: string): Promise<string> {
    const sub = join(fixture.activeDir, category);
    await mkdir(sub, { recursive: true });
    await writeFile(
      join(sub, `meta-${stem}.md`),
      statusBody({
        state: "Active",
        branch: `${category}/${stem}`,
        taskList: `\`.arc/active/${category}/tasks-${stem}.md\``,
      }),
    );
    return sub;
  }

  it("populates both companion paths when notes-{stem}.md and atomic-{stem}.md exist", async () => {
    const sub = await writeFullStatus("technical", "foo");
    await writeFile(join(sub, "tasks-foo.md"), "# tasks\n");
    await writeFile(join(sub, "notes-foo.md"), "# notes\n");
    await writeFile(join(sub, "atomic-foo.md"), "# atomic\n");

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.companions).toEqual({
      notes: ".arc/active/technical/notes-foo.md",
      atomic: ".arc/active/technical/atomic-foo.md",
    });
  });

  it("populates notes only when atomic companion is absent", async () => {
    const sub = await writeFullStatus("technical", "foo");
    await writeFile(join(sub, "tasks-foo.md"), "# tasks\n");
    await writeFile(join(sub, "notes-foo.md"), "# notes\n");

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.companions).toEqual({
      notes: ".arc/active/technical/notes-foo.md",
      atomic: null,
    });
  });

  it("populates atomic only when notes companion is absent", async () => {
    const sub = await writeFullStatus("technical", "foo");
    await writeFile(join(sub, "tasks-foo.md"), "# tasks\n");
    await writeFile(join(sub, "atomic-foo.md"), "# atomic\n");

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.companions).toEqual({
      notes: null,
      atomic: ".arc/active/technical/atomic-foo.md",
    });
  });

  it("emits companions with both null when neither file exists", async () => {
    await writeFullStatus("technical", "foo");

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.companions).toEqual({ notes: null, atomic: null });
  });

  it("omits companions entirely for Lite-shape `tasks.md` task-list value", async () => {
    await writeFile(
      join(fixture.activeDir, "status.md"),
      statusBody({
        state: "Active",
        branch: "main",
        taskList: "`.arc/active/tasks.md`",
      }),
    );
    await writeFile(join(fixture.activeDir, "tasks.md"), "# tasks\n");
    await writeFile(join(fixture.activeDir, "notes.md"), "# notes\n");

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.layout).toBe("lite");
    expect(result.resolution).toBe("single");
    expect(result.companions).toBeUndefined();
  });

  it("omits companions when resolution is `multiple`", async () => {
    const sub1 = await writeFullStatus("feature", "alpha");
    const sub2 = await writeFullStatus("technical", "beta");
    await writeFile(join(sub1, "notes-alpha.md"), "# notes\n");
    await writeFile(join(sub2, "atomic-beta.md"), "# atomic\n");

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("multiple");
    expect(result.companions).toBeUndefined();
  });

  it("omits companions when resolution is `none`", async () => {
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("none");
    expect(result.companions).toBeUndefined();
  });

  it("derives companions from meta-file directory when Task List value is a bare filename", async () => {
    const sub = join(fixture.activeDir, "technical");
    await mkdir(sub, { recursive: true });
    await writeFile(
      join(sub, "meta-foo.md"),
      statusBody({
        state: "Active",
        branch: "technical/foo",
        taskList: "`tasks-foo.md`",
      }),
    );
    await writeFile(join(sub, "tasks-foo.md"), "# tasks\n");
    await writeFile(join(sub, "notes-foo.md"), "# notes\n");
    await writeFile(join(sub, "atomic-foo.md"), "# atomic\n");

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.companions).toEqual({
      notes: ".arc/active/technical/notes-foo.md",
      atomic: ".arc/active/technical/atomic-foo.md",
    });
  });

  it("omits companions when Task List value is `[none]`", async () => {
    const sub = join(fixture.activeDir, "technical");
    await mkdir(sub, { recursive: true });
    await writeFile(
      join(sub, "meta-foo.md"),
      statusBody({
        state: "Active",
        branch: "technical/foo",
        taskList: "[none]",
      }),
    );

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.companions).toBeUndefined();
  });
});

describe("runActiveSessionInitStatus — contributor role-aware resolution", () => {
  let fixture: Fixture;
  let userActiveDir: string;
  beforeEach(async () => {
    fixture = await createFixture();
    userActiveDir = join(fixture.root, ".arc", "user", "alice", "active");
    await mkdir(userActiveDir, { recursive: true });
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("resolves contributor full-layout single → user/{identity}/active/meta-{name}.md", async () => {
    await writeFile(
      join(userActiveDir, "meta-foo.md"),
      statusBody({ state: "Active", branch: "user/alice/foo" }),
    );

    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      identity: "alice",
      role: "contributor",
      exec: defaultExec,
    });
    expect(result.resolution).toBe("single");
    expect(result.path).toBe(".arc/user/alice/active/meta-foo.md");
    expect(result.layout).toBe("full");
  });

  it("resolves contributor full-layout multiple → resolution=multiple with candidate list", async () => {
    await writeFile(
      join(userActiveDir, "meta-foo.md"),
      statusBody({ state: "Active", branch: "user/alice/foo" }),
    );
    await writeFile(
      join(userActiveDir, "meta-bar.md"),
      statusBody({ state: "Integrating", branch: "user/alice/bar" }),
    );

    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      identity: "alice",
      role: "contributor",
      exec: defaultExec,
    });
    expect(result.resolution).toBe("multiple");
    expect(result.path).toBeNull();
    expect(result.candidates).toHaveLength(2);
    const paths = result.candidates.map((c) => c.path).sort();
    expect(paths).toEqual([
      ".arc/user/alice/active/meta-bar.md",
      ".arc/user/alice/active/meta-foo.md",
    ]);
  });

  it("resolves contributor lite-layout {root}/status.md → resolution=single", async () => {
    await writeFile(
      join(userActiveDir, "status.md"),
      statusBody({ state: "Active", branch: "main" }),
    );

    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      identity: "alice",
      role: "contributor",
      exec: defaultExec,
    });
    expect(result.layout).toBe("lite");
    expect(result.resolution).toBe("single");
    expect(result.path).toBe(".arc/user/alice/active/status.md");
  });

  it("returns resolution=none when contributor active dir has no files", async () => {
    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      identity: "alice",
      role: "contributor",
      exec: defaultExec,
    });
    expect(result.resolution).toBe("none");
    expect(result.path).toBeNull();
  });

  it("returns resolution=none with a warning when role=contributor but identity is null", async () => {
    await writeFile(
      join(userActiveDir, "meta-foo.md"),
      statusBody({ state: "Active", branch: "user/alice/foo" }),
    );

    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      identity: null,
      role: "contributor",
      exec: defaultExec,
    });
    expect(result.resolution).toBe("none");
    expect(result.path).toBeNull();
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings.some((w) => /identity/i.test(w))).toBe(true);
  });

  it("derives companion paths under the contributor root when single resolves with a Task List value", async () => {
    await writeFile(
      join(userActiveDir, "meta-foo.md"),
      statusBody({
        state: "Active",
        branch: "user/alice/foo",
        taskList: "`.arc/user/alice/active/tasks-foo.md`",
      }),
    );
    await writeFile(join(userActiveDir, "tasks-foo.md"), "# tasks\n");
    await writeFile(join(userActiveDir, "notes-foo.md"), "# notes\n");
    await writeFile(join(userActiveDir, "atomic-foo.md"), "# atomic\n");

    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      identity: "alice",
      role: "contributor",
      exec: defaultExec,
    });
    expect(result.resolution).toBe("single");
    expect(result.companions).toEqual({
      notes: ".arc/user/alice/active/notes-foo.md",
      atomic: ".arc/user/alice/active/atomic-foo.md",
    });
  });

  it("ignores stray subdirectories under the contributor root (flat scan-shape)", async () => {
    await writeFile(
      join(userActiveDir, "meta-foo.md"),
      statusBody({ state: "Active", branch: "user/alice/foo" }),
    );
    const stray = join(userActiveDir, "technical");
    await mkdir(stray, { recursive: true });
    await writeFile(
      join(stray, "meta-stray.md"),
      statusBody({ state: "Active", branch: "technical/stray" }),
    );

    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      identity: "alice",
      role: "contributor",
      exec: defaultExec,
    });
    expect(result.resolution).toBe("single");
    expect(result.path).toBe(".arc/user/alice/active/meta-foo.md");
  });

  it("preserves maintainer-default resolution when role is null/maintainer (behavior i)", async () => {
    const sub = join(fixture.activeDir, "technical");
    await mkdir(sub, { recursive: true });
    await writeFile(
      join(sub, "meta-foo.md"),
      statusBody({ state: "Active", branch: "technical/foo" }),
    );
    // Also place a contributor-shape file that should NOT be picked up
    await writeFile(
      join(userActiveDir, "meta-other.md"),
      statusBody({ state: "Active", branch: "user/alice/other" }),
    );

    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      identity: "alice",
      role: "maintainer",
      exec: defaultExec,
    });
    expect(result.resolution).toBe("single");
    expect(result.path).toBe(".arc/active/technical/meta-foo.md");
  });
});

describe("runActiveSessionInitStatus — sessionType inference", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  async function writeStatus(
    category: string,
    stem: string,
    fields: { taskList?: string; nextAction?: string },
  ): Promise<void> {
    const sub = join(fixture.activeDir, category);
    await mkdir(sub, { recursive: true });
    await writeFile(
      join(sub, `meta-${stem}.md`),
      statusBody({
        state: "Active",
        branch: `${category}/${stem}`,
        ...fields,
      }),
    );
  }

  it("emits sessionType=planning when resolution=none + branch matches plan-pattern", async () => {
    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      exec: stubGitExec("plan/foo"),
    });
    expect(result.resolution).toBe("none");
    expect(result.sessionType).toBe("planning");
  });

  it("emits sessionType=null when resolution=none + branch does not match plan-pattern (orphan)", async () => {
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("none");
    expect(result.sessionType).toBeNull();
  });

  it("emits sessionType=null when resolution is multiple (defer until disambiguation)", async () => {
    await writeStatus("feature", "alpha", {
      taskList: "`.arc/active/feature/tasks-alpha.md`",
      nextAction: "Start Task 1.1 — implement",
    });
    await writeStatus("technical", "beta", {
      taskList: "`.arc/active/technical/tasks-beta.md`",
      nextAction: "Start Task 2.3 — refactor",
    });
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("multiple");
    expect(result.sessionType).toBeNull();
  });

  it("emits sessionType=planning when resolution=single + Task List: [none]", async () => {
    await writeStatus("technical", "foo", {
      taskList: "[none]",
      nextAction: "Plan next phase",
    });
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.sessionType).toBe("planning");
  });

  it("emits sessionType=planning when resolution=single + Task List: [none associated]", async () => {
    await writeStatus("technical", "foo", {
      taskList: "[none associated]",
      nextAction: "Draft PRD",
    });
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.sessionType).toBe("planning");
  });

  it("emits sessionType=integration when Next Action begins with integrate-work-unit", async () => {
    await writeStatus("technical", "foo", {
      taskList: "`.arc/active/technical/tasks-foo.md`",
      nextAction: "integrate-work-unit Step 3 — push and create PR",
    });
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.sessionType).toBe("integration");
  });

  it("emits sessionType=integration when Next Action begins with archive-work-unit", async () => {
    await writeStatus("technical", "foo", {
      taskList: "`.arc/active/technical/tasks-foo.md`",
      nextAction: "archive-work-unit Step 1 — archive artifacts and retire the status file",
    });
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.sessionType).toBe("integration");
  });

  it("emits sessionType=execution for a regular Start-Task Next Action", async () => {
    await writeStatus("technical", "foo", {
      taskList: "`.arc/active/technical/tasks-foo.md`",
      nextAction: "Start Task 4.2 — write unit tests",
    });
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.sessionType).toBe("execution");
  });

  it("emits sessionType=execution for non-integration lifecycle workflows (e.g., clean-work-unit)", async () => {
    await writeStatus("technical", "foo", {
      taskList: "`.arc/active/technical/tasks-foo.md`",
      nextAction: "clean-work-unit Step 3 — Mode 1 mid-work cleanup",
    });
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.sessionType).toBe("execution");
  });

  it("infers sessionType under maintainer root when identity is null", async () => {
    await writeStatus("technical", "foo", {
      taskList: "`.arc/active/technical/tasks-foo.md`",
      nextAction: "Start Task 1.1 — kick off",
    });
    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      identity: null,
      role: null,
      exec: defaultExec,
    });
    expect(result.resolution).toBe("single");
    expect(result.sessionType).toBe("execution");
  });

  it("infers sessionType under contributor root with identity set", async () => {
    const userActiveDir = join(fixture.root, ".arc", "user", "alice", "active");
    await mkdir(userActiveDir, { recursive: true });
    await writeFile(
      join(userActiveDir, "meta-foo.md"),
      statusBody({
        state: "Active",
        branch: "user/alice/foo",
        taskList: "`.arc/user/alice/active/tasks-foo.md`",
        nextAction: "integrate-work-unit Step 7 — push and create PR",
      }),
    );

    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      identity: "alice",
      role: "contributor",
      exec: defaultExec,
    });
    expect(result.resolution).toBe("single");
    expect(result.sessionType).toBe("integration");
    expect(result.path).toBe(".arc/user/alice/active/meta-foo.md");
  });

  it("falls back to branch pattern under role=contributor + identity=null short-circuit", async () => {
    const userActiveDir = join(fixture.root, ".arc", "user", "alice", "active");
    await mkdir(userActiveDir, { recursive: true });
    await writeFile(
      join(userActiveDir, "meta-foo.md"),
      statusBody({
        state: "Active",
        branch: "user/alice/foo",
        taskList: "`.arc/user/alice/active/tasks-foo.md`",
        nextAction: "Start Task 1.1 — implement",
      }),
    );

    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      identity: null,
      role: "contributor",
      exec: stubGitExec("plan/foo"),
    });
    expect(result.resolution).toBe("none");
    expect(result.sessionType).toBe("planning");
  });

  it("emits sessionType=planning when resolution=single + State: Planning", async () => {
    const sub = join(fixture.activeDir, "technical");
    await mkdir(sub, { recursive: true });
    await writeFile(
      join(sub, "meta-foo.md"),
      statusBody({
        state: "Planning",
        branch: "technical/plan-foo",
        taskList: "[none]",
        nextAction: "Run `1_create-prd.md`",
      }),
    );
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.sessionType).toBe("planning");
  });

  it("falls back to branch pattern when State is empty + branch matches plan-pattern", async () => {
    const sub = join(fixture.activeDir, "technical");
    await mkdir(sub, { recursive: true });
    await writeFile(
      join(sub, "meta-foo.md"),
      statusBody({ state: "", branch: "plan/foo" }),
    );
    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      exec: stubGitExec("plan/foo"),
    });
    expect(result.resolution).toBe("single");
    expect(result.sessionType).toBe("planning");
  });
});
