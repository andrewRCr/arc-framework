/**
 * Unit tests for the active-meta reader.
 *
 * Covers the meta-file parser (field extraction, missing fields,
 * malformed content) and the layout detector (full vs lite, missing
 * directory) — the behaviors the probe runners and composite status
 * consumer depend on.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  parseMetaFile,
  parseMetaRecord,
  readActiveMetaCandidates,
  renderMetaFile,
  META_FIELDS,
  type MetaFieldOverrides,
} from "../../../src/lib/active/meta-reader.js";

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

function metaFileBody(fields: {
  state?: string;
  branch?: string;
  nextTask?: string;
  taskList?: string;
  extra?: string;
}): string {
  const lines: string[] = ["# Metadata: fixture", ""];
  if (fields.state !== undefined) lines.push(`- **State:** ${fields.state}`);
  if (fields.branch !== undefined) lines.push(`- **Branch:** ${fields.branch}`);
  if (fields.taskList !== undefined) lines.push(`- **Task List:** ${fields.taskList}`);
  if (fields.nextTask !== undefined) lines.push(`- **Next Task:** ${fields.nextTask}`);
  if (fields.extra !== undefined) lines.push(fields.extra);
  return lines.join("\n");
}

describe("parseMetaFile — happy path", () => {
  it("extracts all four session-init-relevant fields from a typical status file", () => {
    const content = metaFileBody({
      state: "Active",
      branch: "technical/foo",
      taskList: "`tasks-foo.md`",
      nextTask: "Task 3.2 — implement widget (line ~1234)",
    });
    const parsed = parseMetaFile(content);
    expect(parsed.state).toBe("Active");
    expect(parsed.branch).toBe("technical/foo");
    expect(parsed.taskList).toBe("tasks-foo.md");
    expect(parsed.nextTask).toBe("Task 3.2 — implement widget (line ~1234)");
  });

  it("preserves the full State value including parenthetical qualifiers", () => {
    const content = metaFileBody({ state: "Paused (2026-04-12) — waiting for restructure" });
    const parsed = parseMetaFile(content);
    expect(parsed.state).toBe("Paused (2026-04-12) — waiting for restructure");
  });

  it("preserves backticked task identifiers inside Next Task", () => {
    const content = metaFileBody({
      nextTask: "Task 3.R.k.d — `arc active status` probe (line ~1828)",
    });
    const parsed = parseMetaFile(content);
    expect(parsed.nextTask).toBe("Task 3.R.k.d — arc active status probe (line ~1828)");
  });
});

describe("parseMetaFile — missing fields", () => {
  it("returns null for any field whose marker is absent", () => {
    const parsed = parseMetaFile("# Metadata: fixture\n\nJust prose.\n");
    expect(parsed.state).toBeNull();
    expect(parsed.branch).toBeNull();
    expect(parsed.nextTask).toBeNull();
    expect(parsed.taskList).toBeNull();
  });

  it("returns null for a field whose value is empty after the marker", () => {
    const content = "# Metadata: fixture\n\n- **Branch:** \n- **State:** Active\n";
    const parsed = parseMetaFile(content);
    expect(parsed.branch).toBeNull();
    expect(parsed.state).toBe("Active");
  });

  it("returns null for every field when no H1 is present", () => {
    const content = "- **Branch:** main\n- **State:** Active\n";
    const parsed = parseMetaFile(content);
    expect(parsed.branch).toBeNull();
    expect(parsed.state).toBeNull();
  });

  it("does not parse fields from below a content `## ` heading", () => {
    const content = "# Metadata: fixture\n\n## Active Work\n\n- **State:** Active\n";
    const parsed = parseMetaFile(content);
    expect(parsed.state).toBeNull();
  });
});

describe("parseMetaFile — formatting tolerance", () => {
  it("parses the bare `**Field:** value` form without a list bullet", () => {
    const content = "# Metadata: fixture\n\n**State:** Active\n**Branch:** main\n";
    const parsed = parseMetaFile(content);
    expect(parsed.state).toBe("Active");
    expect(parsed.branch).toBe("main");
  });

  it("tolerates blockquote prefixes (e.g., `> - **State:**`)", () => {
    const content = "# Metadata: fixture\n\n> - **State:** Active\n> - **Branch:** feature/x\n";
    const parsed = parseMetaFile(content);
    expect(parsed.state).toBe("Active");
    expect(parsed.branch).toBe("feature/x");
  });

  it("takes the first match when a field is repeated (stable behavior)", () => {
    const content = "# Metadata: fixture\n\n- **Branch:** first\n- **Branch:** second\n";
    const parsed = parseMetaFile(content);
    expect(parsed.branch).toBe("first");
  });

  it("handles `[none]` Task List value verbatim", () => {
    const parsed = parseMetaFile("# Metadata: fixture\n\n- **Task List:** [none]\n");
    expect(parsed.taskList).toBe("[none]");
  });

  it("extracts the Next Action field carrying a lifecycle workflow step pointer", () => {
    const content = metaFileBody({
      state: "Integrating",
      branch: "technical/foo",
      extra: "- **Next Action:** integrate-work-unit Step 7 — push and create PR",
    });
    const parsed = parseMetaFile(content);
    expect(parsed.nextAction).toBe("integrate-work-unit Step 7 — push and create PR");
  });
});

describe("parseMetaFile — section boundary", () => {
  it("ignores field markers that appear above the H1", () => {
    const content = [
      "> About this file: example uses `- **Branch:** decoy`",
      "",
      "# Metadata: fixture",
      "",
      "- **Branch:** real",
      "",
    ].join("\n");
    const parsed = parseMetaFile(content);
    expect(parsed.branch).toBe("real");
  });

  it("ignores field markers that appear below the first content `## ` heading", () => {
    const content = [
      "# Metadata: fixture",
      "",
      "- **State:** Active",
      "",
      "## Notes",
      "",
      "- **State:** Decoy from a quoted snippet",
      "",
    ].join("\n");
    const parsed = parseMetaFile(content);
    expect(parsed.state).toBe("Active");
  });
});

describe("parseMetaFile — H1-bounded preamble", () => {
  it("parses fields from the H1-bounded preamble", () => {
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
    const parsed = parseMetaFile(content);
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
    const parsed = parseMetaFile(content);
    expect(parsed.state).toBe("Active");
    expect(parsed.branch).toBe("plan/foo");
  });

  it("returns all-null when no H1 is present", () => {
    const parsed = parseMetaFile("just some prose with **Branch:** decoy in it\n");
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
    const parsed = parseMetaFile(content);
    expect(parsed.state).toBeNull();
    expect(parsed.branch).toBeNull();
  });
});

describe("readActiveMetaCandidates — layout detection", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("returns layout=full and empty candidates when .arc/active/ has no status files", async () => {
    const result = await readActiveMetaCandidates(fixture.root);
    expect(result.layout).toBe("full");
    expect(result.candidates).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("returns a warning and empty list when .arc/active/ does not exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-active-none-"));
    try {
      const result = await readActiveMetaCandidates(root);
      expect(result.layout).toBe("full");
      expect(result.candidates).toEqual([]);
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0]).toContain(".arc/active/");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("enumerates meta-*.md candidates at the flat active root", async () => {
    await writeFile(
      join(fixture.activeDir, "meta-alpha.md"),
      metaFileBody({ state: "Active", branch: "technical/alpha" }),
    );
    await writeFile(
      join(fixture.activeDir, "meta-beta.md"),
      metaFileBody({ state: "Integrating", branch: "technical/beta" }),
    );
    const result = await readActiveMetaCandidates(fixture.root);
    expect(result.layout).toBe("full");
    expect(result.candidates).toHaveLength(2);
    const filenames = result.candidates.map((c) => c.filename).sort();
    expect(filenames).toEqual(["meta-alpha.md", "meta-beta.md"]);
  });

  it("emits candidate paths relative to cwd with forward slashes", async () => {
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      metaFileBody({ state: "Active", branch: "technical/foo" }),
    );
    const result = await readActiveMetaCandidates(fixture.root);
    expect(result.candidates[0]!.path).toBe(".arc/active/meta-foo.md");
  });

  it("ignores non-`meta-` files and stray subdirectories at the active root", async () => {
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      metaFileBody({ state: "Active" }),
    );
    await writeFile(join(fixture.activeDir, "tasks-foo.md"), "# tasks\n");
    await writeFile(join(fixture.activeDir, "notes-foo.md"), "# notes\n");
    await writeFile(join(fixture.activeDir, "meta.md"), "# stray\n"); // no `meta-` prefix+hyphen
    const stray = join(fixture.activeDir, "technical");
    await mkdir(stray, { recursive: true });
    await writeFile(
      join(stray, "meta-decoy.md"),
      metaFileBody({ state: "Active", branch: "technical/decoy" }),
    );
    const result = await readActiveMetaCandidates(fixture.root);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.filename).toBe("meta-foo.md");
  });

  it("uses rootSegments to scan a custom active root (contributor scope)", async () => {
    const userActiveDir = join(fixture.root, ".arc", "user", "alice", "active");
    await mkdir(userActiveDir, { recursive: true });
    await writeFile(
      join(userActiveDir, "meta-foo.md"),
      metaFileBody({ state: "Active", branch: "user/foo" }),
    );
    await writeFile(
      join(userActiveDir, "meta-bar.md"),
      metaFileBody({ state: "Paused (2026-04-09)", branch: "user/bar" }),
    );

    const result = await readActiveMetaCandidates(fixture.root, {
      rootSegments: [".arc", "user", "alice", "active"],
    });
    expect(result.layout).toBe("full");
    expect(result.candidates).toHaveLength(2);
    const filenames = result.candidates.map((c) => c.filename).sort();
    expect(filenames).toEqual(["meta-bar.md", "meta-foo.md"]);
    expect(result.candidates[0]!.path.startsWith(".arc/user/alice/active/")).toBe(true);
  });

  it("detects lite layout when .arc/active/status.md exists", async () => {
    await writeFile(
      join(fixture.activeDir, "status.md"),
      metaFileBody({ state: "Active", branch: "main" }),
    );
    const result = await readActiveMetaCandidates(fixture.root);
    expect(result.layout).toBe("lite");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.path).toBe(".arc/active/status.md");
    expect(result.candidates[0]!.filename).toBe("status.md");
    expect(result.candidates[0]!.state).toBe("Active");
  });

  it("detects lite layout under custom rootSegments", async () => {
    const userActiveDir = join(fixture.root, ".arc", "user", "alice", "active");
    await mkdir(userActiveDir, { recursive: true });
    await writeFile(
      join(userActiveDir, "status.md"),
      metaFileBody({ state: "Active", branch: "main" }),
    );

    const result = await readActiveMetaCandidates(fixture.root, {
      rootSegments: [".arc", "user", "alice", "active"],
    });
    expect(result.layout).toBe("lite");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.path).toBe(".arc/user/alice/active/status.md");
  });

  it("prefers lite layout when both lite and meta-*.md candidates are present", async () => {
    await writeFile(
      join(fixture.activeDir, "status.md"),
      metaFileBody({ state: "Active" }),
    );
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      metaFileBody({ state: "Active", branch: "technical/foo" }),
    );
    const result = await readActiveMetaCandidates(fixture.root);
    expect(result.layout).toBe("lite");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.filename).toBe("status.md");
  });

  it("emits a warning naming the supplied custom root when the directory is absent", async () => {
    const result = await readActiveMetaCandidates(fixture.root, {
      rootSegments: [".arc", "user", "alice", "active"],
    });
    expect(result.candidates).toEqual([]);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain(".arc/user/alice/active/");
  });
});

const SPAWN_OVERRIDES: MetaFieldOverrides = {
  State: "Planning",
  Owner: "andrew",
  Branch: "plan/foo",
  "Next Action": "Begin planning — draft the spec",
};

describe("renderMetaFile — fresh Planning scaffold", () => {
  it("substitutes State, Owner, Branch, and Next Action from the overrides", () => {
    const md = renderMetaFile("foo", SPAWN_OVERRIDES);
    expect(md).toContain("- **State:** Planning");
    expect(md).toContain("- **Owner:** andrew");
    expect(md).toContain("- **Branch:** plan/foo");
    expect(md).toContain("- **Next Action:** Begin planning — draft the spec");
  });

  it("renders every non-substituted field at its declared default", () => {
    const md = renderMetaFile("foo", SPAWN_OVERRIDES);
    expect(md).toContain("- **Origin:** [internal]");
    expect(md).toContain("- **Design:** [none]");
    expect(md).toContain("- **Depends On:** [none]");
    expect(md).toContain("- **Cohort:** [none]");
    expect(md).toContain("- **Priority:** P3");
    expect(md).toContain("- **Task List:** [none]");
    expect(md).toContain("- **Last Completed:** [none]");
    expect(md).toContain("- **Next Task:** [none]");
    expect(md).toContain("- **Blockers:** [none]");
  });
});

describe("renderMetaFile — projection shape", () => {
  it("opens with the `# Metadata: {wu-name}` H1", () => {
    const md = renderMetaFile("foo", SPAWN_OVERRIDES);
    expect(md.startsWith("# Metadata: foo\n")).toBe(true);
  });

  it("separates each field group with a single blank line", () => {
    const md = renderMetaFile("foo", SPAWN_OVERRIDES);
    expect(md).toContain("- **Branch:** plan/foo\n\n- **Origin:** [internal]");
    expect(md).toContain("- **Design:** [none]\n\n- **Depends On:** [none]");
    expect(md).toContain(
      "- **Cohort:** [none]\n- **Priority:** P3\n\n- **Task List:** [none]",
    );
    expect(md).toContain(
      "- **Blockers:** [none]\n\n- **Next Action:** Begin planning — draft the spec",
    );
  });

  it("closes the field block with a trailing `---` and a single newline", () => {
    const md = renderMetaFile("foo", SPAWN_OVERRIDES);
    expect(md.endsWith("\n---\n")).toBe(true);
    expect(md.endsWith("\n\n")).toBe(false);
  });

  it("emits no instructional comments or archive sections in the Planning phase", () => {
    const md = renderMetaFile("foo", SPAWN_OVERRIDES);
    expect(md).not.toContain("<!--");
    expect(md).not.toContain("##");
  });
});

describe("renderMetaFile ↔ parseMetaRecord — round-trip", () => {
  it("recovers every rendered field value through the meta parser", () => {
    const overrides: MetaFieldOverrides = {
      State: "Planning",
      Owner: "andrew",
      Branch: "plan/foo",
      Origin: "tracker-123",
      Design: "draft-foo.md",
      "Depends On": "alpha beta",
      Cohort: "gamma",
      Priority: "P1",
      "Task List": "tasks-foo.md",
      "Last Completed": "Task 1.1 — kicked off (line ~10)",
      "Next Task": "Task 1.2 — next up (line ~20)",
      Blockers: "waiting on review",
      "Next Action": "Begin planning",
    };
    const record = parseMetaRecord(renderMetaFile("foo", overrides));
    for (const field of META_FIELDS) {
      expect(record[field.name]).toBe(overrides[field.name]);
    }
  });

  it("recovers the declared defaults for non-substituted fields", () => {
    const record = parseMetaRecord(renderMetaFile("foo", SPAWN_OVERRIDES));
    expect(record.Origin).toBe("[internal]");
    expect(record.Design).toBe("[none]");
    expect(record["Depends On"]).toBe("[none]");
    expect(record.Cohort).toBe("[none]");
    expect(record.Priority).toBe("P3");
    expect(record["Task List"]).toBe("[none]");
    expect(record["Last Completed"]).toBe("[none]");
    expect(record["Next Task"]).toBe("[none]");
    expect(record.Blockers).toBe("[none]");
  });
});
