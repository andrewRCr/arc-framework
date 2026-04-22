/**
 * Unit tests for the active-status reader.
 *
 * Covers the status-file parser (field extraction, missing fields,
 * malformed content) and the layout detector (full vs lite, missing
 * directory) — the behaviors the probe runners and composite status
 * consumer depend on.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  parseStatusFile,
  readActiveStatusCandidates,
} from "../../../src/lib/active/status-reader.js";

interface Fixture {
  root: string;
  activeDir: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "arc-active-reader-"));
  const activeDir = join(root, ".arc", "active");
  await mkdir(activeDir, { recursive: true });
  return { root, activeDir };
}

function statusFileBody(fields: {
  state?: string;
  branch?: string;
  nextTask?: string;
  taskList?: string;
  extra?: string;
}): string {
  const lines: string[] = ["# Status: fixture", "", "## Active Work", ""];
  if (fields.state !== undefined) lines.push(`- **State:** ${fields.state}`);
  if (fields.branch !== undefined) lines.push(`- **Branch:** ${fields.branch}`);
  if (fields.taskList !== undefined) lines.push(`- **Task List:** ${fields.taskList}`);
  if (fields.nextTask !== undefined) lines.push(`- **Next Task:** ${fields.nextTask}`);
  if (fields.extra !== undefined) lines.push(fields.extra);
  return lines.join("\n");
}

describe("parseStatusFile — happy path", () => {
  it("extracts all four session-init-relevant fields from a typical status file", () => {
    const content = statusFileBody({
      state: "In Progress",
      branch: "technical/foo",
      taskList: "`.arc/active/technical/tasks-foo.md`",
      nextTask: "Task 3.2 — implement widget (line ~1234)",
    });
    const parsed = parseStatusFile(content);
    expect(parsed.state).toBe("In Progress");
    expect(parsed.branch).toBe("technical/foo");
    expect(parsed.taskList).toBe(".arc/active/technical/tasks-foo.md");
    expect(parsed.nextTask).toBe("Task 3.2 — implement widget (line ~1234)");
  });

  it("preserves the full State value including parenthetical qualifiers", () => {
    const content = statusFileBody({ state: "Paused (2026-04-12) — waiting for restructure" });
    const parsed = parseStatusFile(content);
    expect(parsed.state).toBe("Paused (2026-04-12) — waiting for restructure");
  });

  it("preserves backticked task identifiers inside Next Task", () => {
    const content = statusFileBody({
      nextTask: "Task 3.R.k.d — `arc active status` probe (line ~1828)",
    });
    const parsed = parseStatusFile(content);
    expect(parsed.nextTask).toBe("Task 3.R.k.d — arc active status probe (line ~1828)");
  });
});

describe("parseStatusFile — missing fields", () => {
  it("returns null for any field whose marker is absent", () => {
    const parsed = parseStatusFile("# Status: fixture\n\nJust prose.\n");
    expect(parsed.state).toBeNull();
    expect(parsed.branch).toBeNull();
    expect(parsed.nextTask).toBeNull();
    expect(parsed.taskList).toBeNull();
  });

  it("returns null for a field whose value is empty after the marker", () => {
    const content = "- **Branch:** \n- **State:** In Progress\n";
    const parsed = parseStatusFile(content);
    expect(parsed.branch).toBeNull();
    expect(parsed.state).toBe("In Progress");
  });
});

describe("parseStatusFile — formatting tolerance", () => {
  it("parses the bare `**Field:** value` form without a list bullet", () => {
    const content = "**State:** In Progress\n**Branch:** main\n";
    const parsed = parseStatusFile(content);
    expect(parsed.state).toBe("In Progress");
    expect(parsed.branch).toBe("main");
  });

  it("tolerates blockquote prefixes (e.g., `> - **State:**`)", () => {
    const content = "> - **State:** Paused\n> - **Branch:** feature/x\n";
    const parsed = parseStatusFile(content);
    expect(parsed.state).toBe("Paused");
    expect(parsed.branch).toBe("feature/x");
  });

  it("takes the first match when a field is repeated (stable behavior)", () => {
    const content = "- **Branch:** first\n- **Branch:** second\n";
    const parsed = parseStatusFile(content);
    expect(parsed.branch).toBe("first");
  });

  it("handles `[none]` Task List value verbatim", () => {
    const parsed = parseStatusFile("- **Task List:** [none]\n");
    expect(parsed.taskList).toBe("[none]");
  });
});

describe("readActiveStatusCandidates — layout detection", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("returns layout=full and empty candidates when .arc/active/ has no status files", async () => {
    const result = await readActiveStatusCandidates(fixture.root);
    expect(result.layout).toBe("full");
    expect(result.candidates).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("returns a warning and empty list when .arc/active/ does not exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-active-none-"));
    try {
      const result = await readActiveStatusCandidates(root);
      expect(result.layout).toBe("full");
      expect(result.candidates).toEqual([]);
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0]).toContain(".arc/active/");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("detects lite layout when .arc/active/status.md exists", async () => {
    await writeFile(
      join(fixture.activeDir, "status.md"),
      statusFileBody({ state: "In Progress", branch: "main" }),
    );
    const result = await readActiveStatusCandidates(fixture.root);
    expect(result.layout).toBe("lite");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.path).toBe(".arc/active/status.md");
    expect(result.candidates[0]!.filename).toBe("status.md");
    expect(result.candidates[0]!.state).toBe("In Progress");
  });

  it("prefers lite layout when both shapes are present (status.md wins)", async () => {
    await writeFile(
      join(fixture.activeDir, "status.md"),
      statusFileBody({ state: "In Progress" }),
    );
    const sub = join(fixture.activeDir, "feature");
    await mkdir(sub, { recursive: true });
    await writeFile(
      join(sub, "status-foo.md"),
      statusFileBody({ state: "In Progress", branch: "feature/foo" }),
    );
    const result = await readActiveStatusCandidates(fixture.root);
    expect(result.layout).toBe("lite");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.filename).toBe("status.md");
  });

  it("enumerates full-layout candidates across category subdirectories", async () => {
    const sub1 = join(fixture.activeDir, "feature");
    const sub2 = join(fixture.activeDir, "technical");
    await mkdir(sub1, { recursive: true });
    await mkdir(sub2, { recursive: true });
    await writeFile(
      join(sub1, "status-alpha.md"),
      statusFileBody({ state: "In Progress", branch: "feature/alpha" }),
    );
    await writeFile(
      join(sub2, "status-beta.md"),
      statusFileBody({ state: "Paused", branch: "technical/beta" }),
    );
    const result = await readActiveStatusCandidates(fixture.root);
    expect(result.layout).toBe("full");
    expect(result.candidates).toHaveLength(2);
    const filenames = result.candidates.map((c) => c.filename).sort();
    expect(filenames).toEqual(["status-alpha.md", "status-beta.md"]);
  });

  it("emits candidate paths relative to cwd with forward slashes", async () => {
    const sub = join(fixture.activeDir, "technical");
    await mkdir(sub, { recursive: true });
    await writeFile(
      join(sub, "status-foo.md"),
      statusFileBody({ state: "In Progress", branch: "technical/foo" }),
    );
    const result = await readActiveStatusCandidates(fixture.root);
    expect(result.candidates[0]!.path).toBe(".arc/active/technical/status-foo.md");
  });

  it("ignores non-matching files in category subdirectories", async () => {
    const sub = join(fixture.activeDir, "feature");
    await mkdir(sub, { recursive: true });
    await writeFile(join(sub, "status-foo.md"), statusFileBody({ state: "In Progress" }));
    await writeFile(join(sub, "tasks-foo.md"), "# tasks\n");
    await writeFile(join(sub, "notes-foo.md"), "# notes\n");
    await writeFile(join(sub, "status.md"), "# stray\n"); // no `status-` prefix+hyphen
    const result = await readActiveStatusCandidates(fixture.root);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.filename).toBe("status-foo.md");
  });
});
