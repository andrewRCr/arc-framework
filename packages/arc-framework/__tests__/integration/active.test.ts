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
}): string {
  const lines: string[] = [
    "# Status: fixture",
    "",
    "## Active Work",
    "",
    `- **State:** ${fields.state}`,
    `- **Branch:** ${fields.branch}`,
  ];
  if (fields.taskList !== undefined) lines.push(`- **Task List:** ${fields.taskList}`);
  if (fields.nextTask !== undefined) lines.push(`- **Next Task:** ${fields.nextTask}`);
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
      join(sub, "status-foo.md"),
      statusBody({
        state: "In Progress",
        branch: "technical/foo",
        nextTask: "Task 3.R.k.d — probe (line ~1828)",
        taskList: "`.arc/active/technical/tasks-foo.md`",
      }),
    );

    const result = await runActiveStatus({ cwd: fixture.root });
    expect(result.layout).toBe("full");
    expect(result.candidates).toHaveLength(1);
    const c = result.candidates[0]!;
    expect(c.filename).toBe("status-foo.md");
    expect(c.path).toBe(".arc/active/technical/status-foo.md");
    expect(c.branch).toBe("technical/foo");
    expect(c.state).toBe("In Progress");
    expect(c.nextTask).toBe("Task 3.R.k.d — probe (line ~1828)");
    expect(c.taskList).toBe(".arc/active/technical/tasks-foo.md");
  });

  it("enumerates many Full-layout candidates across categories with full State values", async () => {
    const sub1 = join(fixture.activeDir, "feature");
    const sub2 = join(fixture.activeDir, "technical");
    await mkdir(sub1, { recursive: true });
    await mkdir(sub2, { recursive: true });
    await writeFile(
      join(sub1, "status-alpha.md"),
      statusBody({ state: "In Progress", branch: "feature/alpha" }),
    );
    await writeFile(
      join(sub2, "status-beta.md"),
      statusBody({
        state: "Paused (2026-04-12) — waiting for restructure",
        branch: "technical/beta",
      }),
    );

    const result = await runActiveStatus({ cwd: fixture.root });
    expect(result.candidates).toHaveLength(2);
    const beta = result.candidates.find((c) => c.filename === "status-beta.md");
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
      statusBody({ state: "In Progress", branch: "main" }),
    );
    const result = await runActiveStatus({ cwd: fixture.root });
    expect(result.layout).toBe("lite");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.path).toBe(".arc/active/status.md");
    expect(result.candidates[0]!.state).toBe("In Progress");
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
    const result = await runActiveSessionInitStatus({ cwd: fixture.root });
    expect(result.mode).toBe("session-init");
    expect(result.resolution).toBe("none");
    expect(result.path).toBeNull();
    expect(result.candidates).toEqual([]);
  });

  it("returns resolution=single with the resolved path for exactly one candidate", async () => {
    const sub = join(fixture.activeDir, "technical");
    await mkdir(sub, { recursive: true });
    await writeFile(
      join(sub, "status-foo.md"),
      statusBody({ state: "In Progress", branch: "technical/foo" }),
    );

    const result = await runActiveSessionInitStatus({ cwd: fixture.root });
    expect(result.resolution).toBe("single");
    expect(result.path).toBe(".arc/active/technical/status-foo.md");
    expect(result.candidates).toEqual([]);
  });

  it("returns resolution=multiple with the full candidate list for many files", async () => {
    const sub1 = join(fixture.activeDir, "feature");
    const sub2 = join(fixture.activeDir, "technical");
    await mkdir(sub1, { recursive: true });
    await mkdir(sub2, { recursive: true });
    await writeFile(
      join(sub1, "status-alpha.md"),
      statusBody({ state: "In Progress", branch: "feature/alpha" }),
    );
    await writeFile(
      join(sub2, "status-beta.md"),
      statusBody({ state: "Paused", branch: "technical/beta" }),
    );

    const result = await runActiveSessionInitStatus({ cwd: fixture.root });
    expect(result.resolution).toBe("multiple");
    expect(result.path).toBeNull();
    expect(result.candidates).toHaveLength(2);
    const filenames = result.candidates.map((c) => c.filename).sort();
    expect(filenames).toEqual(["status-alpha.md", "status-beta.md"]);
    // Candidates carry enough context for the agent to apply Step 2 Item 8's
    // branch/state precedence without re-scanning.
    const beta = result.candidates.find((c) => c.filename === "status-beta.md");
    expect(beta?.branch).toBe("technical/beta");
    expect(beta?.state).toBe("Paused");
  });

  it("resolves Lite layout's single file as resolution=single", async () => {
    await writeFile(
      join(fixture.activeDir, "status.md"),
      statusBody({ state: "In Progress", branch: "main" }),
    );
    const result = await runActiveSessionInitStatus({ cwd: fixture.root });
    expect(result.layout).toBe("lite");
    expect(result.resolution).toBe("single");
    expect(result.path).toBe(".arc/active/status.md");
  });

  it("propagates warnings when .arc/active/ is missing entirely", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-active-missing-"));
    try {
      const result = await runActiveSessionInitStatus({ cwd: root });
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
      join(sub, `status-${stem}.md`),
      statusBody({
        state: "In Progress",
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

    const result = await runActiveSessionInitStatus({ cwd: fixture.root });
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

    const result = await runActiveSessionInitStatus({ cwd: fixture.root });
    expect(result.companions).toEqual({
      notes: ".arc/active/technical/notes-foo.md",
      atomic: null,
    });
  });

  it("populates atomic only when notes companion is absent", async () => {
    const sub = await writeFullStatus("technical", "foo");
    await writeFile(join(sub, "tasks-foo.md"), "# tasks\n");
    await writeFile(join(sub, "atomic-foo.md"), "# atomic\n");

    const result = await runActiveSessionInitStatus({ cwd: fixture.root });
    expect(result.companions).toEqual({
      notes: null,
      atomic: ".arc/active/technical/atomic-foo.md",
    });
  });

  it("emits companions with both null when neither file exists", async () => {
    await writeFullStatus("technical", "foo");

    const result = await runActiveSessionInitStatus({ cwd: fixture.root });
    expect(result.companions).toEqual({ notes: null, atomic: null });
  });

  it("omits companions entirely for Lite-shape `tasks.md` task-list value", async () => {
    await writeFile(
      join(fixture.activeDir, "status.md"),
      statusBody({
        state: "In Progress",
        branch: "main",
        taskList: "`.arc/active/tasks.md`",
      }),
    );
    await writeFile(join(fixture.activeDir, "tasks.md"), "# tasks\n");
    await writeFile(join(fixture.activeDir, "notes.md"), "# notes\n");

    const result = await runActiveSessionInitStatus({ cwd: fixture.root });
    expect(result.layout).toBe("lite");
    expect(result.resolution).toBe("single");
    expect(result.companions).toBeUndefined();
  });

  it("omits companions when resolution is `multiple`", async () => {
    const sub1 = await writeFullStatus("feature", "alpha");
    const sub2 = await writeFullStatus("technical", "beta");
    await writeFile(join(sub1, "notes-alpha.md"), "# notes\n");
    await writeFile(join(sub2, "atomic-beta.md"), "# atomic\n");

    const result = await runActiveSessionInitStatus({ cwd: fixture.root });
    expect(result.resolution).toBe("multiple");
    expect(result.companions).toBeUndefined();
  });

  it("omits companions when resolution is `none`", async () => {
    const result = await runActiveSessionInitStatus({ cwd: fixture.root });
    expect(result.resolution).toBe("none");
    expect(result.companions).toBeUndefined();
  });

  it("omits companions when Task List value is `[none]`", async () => {
    const sub = join(fixture.activeDir, "technical");
    await mkdir(sub, { recursive: true });
    await writeFile(
      join(sub, "status-foo.md"),
      statusBody({
        state: "In Progress",
        branch: "technical/foo",
        taskList: "[none]",
      }),
    );

    const result = await runActiveSessionInitStatus({ cwd: fixture.root });
    expect(result.resolution).toBe("single");
    expect(result.companions).toBeUndefined();
  });
});
