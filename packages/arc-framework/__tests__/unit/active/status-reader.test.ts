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
  const lines: string[] = ["# Status: fixture", "", "## Work Unit Metadata", ""];
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
    const parsed = parseStatusFile("# Status: fixture\n\n## Work Unit Metadata\n\nJust prose.\n");
    expect(parsed.state).toBeNull();
    expect(parsed.branch).toBeNull();
    expect(parsed.nextTask).toBeNull();
    expect(parsed.taskList).toBeNull();
  });

  it("returns null for a field whose value is empty after the marker", () => {
    const content = "## Work Unit Metadata\n\n- **Branch:** \n- **State:** In Progress\n";
    const parsed = parseStatusFile(content);
    expect(parsed.branch).toBeNull();
    expect(parsed.state).toBe("In Progress");
  });

  it("returns null for every field when neither the H2 wrapper nor an H1 is present", () => {
    const content = "- **Branch:** main\n- **State:** In Progress\n";
    const parsed = parseStatusFile(content);
    expect(parsed.branch).toBeNull();
    expect(parsed.state).toBeNull();
  });

  it("does not parse fields from legacy `## Active Work` sections", () => {
    const content = "# Status: fixture\n\n## Active Work\n\n- **State:** In Progress\n";
    const parsed = parseStatusFile(content);
    expect(parsed.state).toBeNull();
  });
});

describe("parseStatusFile — formatting tolerance", () => {
  it("parses the bare `**Field:** value` form without a list bullet", () => {
    const content = "## Work Unit Metadata\n\n**State:** In Progress\n**Branch:** main\n";
    const parsed = parseStatusFile(content);
    expect(parsed.state).toBe("In Progress");
    expect(parsed.branch).toBe("main");
  });

  it("tolerates blockquote prefixes (e.g., `> - **State:**`)", () => {
    const content = "## Work Unit Metadata\n\n> - **State:** Paused\n> - **Branch:** feature/x\n";
    const parsed = parseStatusFile(content);
    expect(parsed.state).toBe("Paused");
    expect(parsed.branch).toBe("feature/x");
  });

  it("takes the first match when a field is repeated (stable behavior)", () => {
    const content = "## Work Unit Metadata\n\n- **Branch:** first\n- **Branch:** second\n";
    const parsed = parseStatusFile(content);
    expect(parsed.branch).toBe("first");
  });

  it("handles `[none]` Task List value verbatim", () => {
    const parsed = parseStatusFile("## Work Unit Metadata\n\n- **Task List:** [none]\n");
    expect(parsed.taskList).toBe("[none]");
  });

  it("extracts the Next Action field carrying a lifecycle workflow step pointer", () => {
    const content = statusFileBody({
      state: "Complete",
      branch: "technical/foo",
      extra: "- **Next Action:** integrate-work-unit Step 7 — push and create PR",
    });
    const parsed = parseStatusFile(content);
    expect(parsed.nextAction).toBe("integrate-work-unit Step 7 — push and create PR");
  });
});

describe("parseStatusFile — section boundary", () => {
  it("ignores field markers that appear above `## Work Unit Metadata`", () => {
    const content = [
      "# Status: fixture",
      "",
      "> About this file: example uses `- **Branch:** decoy`",
      "",
      "## Work Unit Metadata",
      "",
      "- **Branch:** real",
      "",
    ].join("\n");
    const parsed = parseStatusFile(content);
    expect(parsed.branch).toBe("real");
  });

  it("ignores field markers that appear below the next `## ` heading", () => {
    const content = [
      "## Work Unit Metadata",
      "",
      "- **State:** In Progress",
      "",
      "## Notes",
      "",
      "- **State:** Decoy from a quoted snippet",
      "",
    ].join("\n");
    const parsed = parseStatusFile(content);
    expect(parsed.state).toBe("In Progress");
  });
});

describe("parseStatusFile — H1-bounded fallback (post-WOR shape)", () => {
  it("parses fields from the H1-bounded preamble when no `## Work Unit Metadata` wrapper is present", () => {
    const content = [
      "# Metadata: foo",
      "",
      "- **State:** Active",
      "- **Branch:** plan/foo",
      "- **Task List:** `tasks-foo.md`",
      "- **Next Task:** Task 1.1 — kick off (line ~42)",
      "- **Next Action:** Start Task 1.1",
      "",
    ].join("\n");
    const parsed = parseStatusFile(content);
    expect(parsed.state).toBe("Active");
    expect(parsed.branch).toBe("plan/foo");
    expect(parsed.taskList).toBe("tasks-foo.md");
    expect(parsed.nextTask).toBe("Task 1.1 — kick off (line ~42)");
    expect(parsed.nextAction).toBe("Start Task 1.1");
  });

  it("stops the H1-bounded region at the first content `## ` heading", () => {
    const content = [
      "# Metadata: foo",
      "",
      "- **State:** Active",
      "- **Branch:** plan/foo",
      "",
      "## Notes",
      "",
      "- **State:** decoy from quoted example",
      "- **Branch:** decoy/branch",
      "",
    ].join("\n");
    const parsed = parseStatusFile(content);
    expect(parsed.state).toBe("Active");
    expect(parsed.branch).toBe("plan/foo");
  });

  it("returns all-null when neither `## Work Unit Metadata` nor an H1 is present", () => {
    const parsed = parseStatusFile("just some prose with **Branch:** decoy in it\n");
    expect(parsed.state).toBeNull();
    expect(parsed.branch).toBeNull();
    expect(parsed.nextTask).toBeNull();
    expect(parsed.taskList).toBeNull();
    expect(parsed.nextAction).toBeNull();
  });

  it("returns all-null when the H1-bounded preamble carries no field markers", () => {
    const content = [
      "# Metadata: foo",
      "",
      "Just narrative prose — no field markers yet.",
      "",
      "## Notes",
      "",
    ].join("\n");
    const parsed = parseStatusFile(content);
    expect(parsed.state).toBeNull();
    expect(parsed.branch).toBeNull();
  });

  it("prefers the legacy `## Work Unit Metadata` section when both shapes are present (transition coexistence)", () => {
    const content = [
      "# Metadata: foo",
      "",
      "- **State:** newshape-decoy",
      "- **Branch:** plan/decoy",
      "",
      "## Work Unit Metadata",
      "",
      "- **State:** Active",
      "- **Branch:** plan/real",
      "",
    ].join("\n");
    const parsed = parseStatusFile(content);
    expect(parsed.state).toBe("Active");
    expect(parsed.branch).toBe("plan/real");
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

  it("uses rootSegments + scan-shape flat to enumerate status-*.md files at the active root (no subdir scan)", async () => {
    const userActiveDir = join(fixture.root, ".arc", "user", "alice", "active");
    await mkdir(userActiveDir, { recursive: true });
    await writeFile(
      join(userActiveDir, "status-foo.md"),
      statusFileBody({ state: "In Progress", branch: "user/foo" }),
    );
    await writeFile(
      join(userActiveDir, "status-bar.md"),
      statusFileBody({ state: "Paused", branch: "user/bar" }),
    );
    // Stray subdirectory must be ignored under flat scan-shape
    const stray = join(userActiveDir, "technical");
    await mkdir(stray, { recursive: true });
    await writeFile(
      join(stray, "status-stray.md"),
      statusFileBody({ state: "In Progress", branch: "technical/stray" }),
    );

    const result = await readActiveStatusCandidates(fixture.root, {
      rootSegments: [".arc", "user", "alice", "active"],
      scanShape: "flat",
    });
    expect(result.layout).toBe("full");
    expect(result.candidates).toHaveLength(2);
    const filenames = result.candidates.map((c) => c.filename).sort();
    expect(filenames).toEqual(["status-bar.md", "status-foo.md"]);
    expect(result.candidates[0]!.path.startsWith(".arc/user/alice/active/")).toBe(true);
  });

  it("detects lite layout under flat scan-shape via {root}/status.md", async () => {
    const userActiveDir = join(fixture.root, ".arc", "user", "alice", "active");
    await mkdir(userActiveDir, { recursive: true });
    await writeFile(
      join(userActiveDir, "status.md"),
      statusFileBody({ state: "In Progress", branch: "main" }),
    );

    const result = await readActiveStatusCandidates(fixture.root, {
      rootSegments: [".arc", "user", "alice", "active"],
      scanShape: "flat",
    });
    expect(result.layout).toBe("lite");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.path).toBe(".arc/user/alice/active/status.md");
  });

  it("emits a warning naming the supplied root path when the active directory is absent", async () => {
    const result = await readActiveStatusCandidates(fixture.root, {
      rootSegments: [".arc", "user", "alice", "active"],
      scanShape: "flat",
    });
    expect(result.candidates).toEqual([]);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain(".arc/user/alice/active/");
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

describe("readActiveStatusCandidates — dual-prefix acceptance (meta- and status-)", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("resolves meta-*.md candidates under subdir layout", async () => {
    const sub = join(fixture.activeDir, "technical");
    await mkdir(sub, { recursive: true });
    await writeFile(
      join(sub, "meta-foo.md"),
      statusFileBody({ state: "Active", branch: "technical/foo" }),
    );
    const result = await readActiveStatusCandidates(fixture.root);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.filename).toBe("meta-foo.md");
    expect(result.candidates[0]!.path).toBe(".arc/active/technical/meta-foo.md");
  });

  it("resolves meta-*.md candidates under flat layout", async () => {
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusFileBody({ state: "Active", branch: "plan/foo" }),
    );
    const result = await readActiveStatusCandidates(fixture.root);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.filename).toBe("meta-foo.md");
    expect(result.candidates[0]!.path).toBe(".arc/active/meta-foo.md");
  });

  it("prefers meta-*.md when both prefixes share a stem in the same subdir", async () => {
    const sub = join(fixture.activeDir, "technical");
    await mkdir(sub, { recursive: true });
    await writeFile(
      join(sub, "meta-foo.md"),
      statusFileBody({ state: "Active", branch: "technical/foo" }),
    );
    await writeFile(
      join(sub, "status-foo.md"),
      statusFileBody({ state: "In Progress", branch: "technical/foo" }),
    );
    const result = await readActiveStatusCandidates(fixture.root);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.filename).toBe("meta-foo.md");
    expect(result.candidates[0]!.state).toBe("Active");
  });

  it("prefers meta-*.md when both prefixes share a stem at the flat root", async () => {
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusFileBody({ state: "Active", branch: "plan/foo" }),
    );
    await writeFile(
      join(fixture.activeDir, "status-foo.md"),
      statusFileBody({ state: "In Progress", branch: "plan/foo" }),
    );
    const result = await readActiveStatusCandidates(fixture.root);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.filename).toBe("meta-foo.md");
  });

  it("does not dedupe same-stem files across different category subdirectories (distinct WUs)", async () => {
    const tech = join(fixture.activeDir, "technical");
    const feat = join(fixture.activeDir, "feature");
    await mkdir(tech, { recursive: true });
    await mkdir(feat, { recursive: true });
    await writeFile(
      join(tech, "meta-foo.md"),
      statusFileBody({ state: "Active", branch: "technical/foo" }),
    );
    await writeFile(
      join(feat, "meta-foo.md"),
      statusFileBody({ state: "Active", branch: "feature/foo" }),
    );
    const result = await readActiveStatusCandidates(fixture.root);
    expect(result.candidates).toHaveLength(2);
    const paths = result.candidates.map((c) => c.path).sort();
    expect(paths).toEqual([
      ".arc/active/feature/meta-foo.md",
      ".arc/active/technical/meta-foo.md",
    ]);
  });
});

describe("readActiveStatusCandidates — scan-shape auto-detection", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("auto-detects flat scan when only flat-root files exist (no explicit scanShape)", async () => {
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusFileBody({ state: "Active", branch: "plan/foo" }),
    );
    const result = await readActiveStatusCandidates(fixture.root);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.filename).toBe("meta-foo.md");
  });

  it("auto-detects subdir scan when only subdir files exist (no explicit scanShape)", async () => {
    const sub = join(fixture.activeDir, "technical");
    await mkdir(sub, { recursive: true });
    await writeFile(
      join(sub, "meta-foo.md"),
      statusFileBody({ state: "Active", branch: "technical/foo" }),
    );
    const result = await readActiveStatusCandidates(fixture.root);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.path).toBe(".arc/active/technical/meta-foo.md");
  });

  it("prefers flat scan when both flat-root and subdir files exist (transient state)", async () => {
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusFileBody({ state: "Active", branch: "plan/foo" }),
    );
    const sub = join(fixture.activeDir, "technical");
    await mkdir(sub, { recursive: true });
    await writeFile(
      join(sub, "meta-bar.md"),
      statusFileBody({ state: "Active", branch: "technical/bar" }),
    );
    const result = await readActiveStatusCandidates(fixture.root);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.filename).toBe("meta-foo.md");
  });

  it("respects explicit scanShape: 'subdir' even when flat-root files exist", async () => {
    await writeFile(
      join(fixture.activeDir, "meta-decoy.md"),
      statusFileBody({ state: "Active", branch: "plan/decoy" }),
    );
    const sub = join(fixture.activeDir, "technical");
    await mkdir(sub, { recursive: true });
    await writeFile(
      join(sub, "meta-real.md"),
      statusFileBody({ state: "Active", branch: "technical/real" }),
    );
    const result = await readActiveStatusCandidates(fixture.root, { scanShape: "subdir" });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.filename).toBe("meta-real.md");
  });
});
