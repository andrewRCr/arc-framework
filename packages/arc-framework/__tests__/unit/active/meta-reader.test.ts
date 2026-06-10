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
  parseIdentifierList,
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

describe("parseIdentifierList — shared comma-list parse", () => {
  it("resolves null, [none], and empty to no references", () => {
    expect(parseIdentifierList(null)).toEqual([]);
    expect(parseIdentifierList("[none]")).toEqual([]);
    expect(parseIdentifierList("")).toEqual([]);
  });

  it("parses a single reference to a one-element list", () => {
    expect(parseIdentifierList("alpha")).toEqual(["alpha"]);
    expect(parseIdentifierList("spec-foo.md")).toEqual(["spec-foo.md"]);
  });

  it("parses two comma-separated references to a list, trimming each", () => {
    expect(parseIdentifierList("alpha, beta")).toEqual(["alpha", "beta"]);
    expect(parseIdentifierList("spec-a.md,spec-b.md")).toEqual(["spec-a.md", "spec-b.md"]);
    expect(parseIdentifierList("  alpha ,  beta  ")).toEqual(["alpha", "beta"]);
  });

  it("filters empty elements from a malformed comma run", () => {
    expect(parseIdentifierList("alpha, , beta")).toEqual(["alpha", "beta"]);
    expect(parseIdentifierList("alpha,")).toEqual(["alpha"]);
  });
});

describe("identifier-list fields — per-element backtick render", () => {
  it("renders a two-value Depends On as two discrete backticked tokens", () => {
    const md = renderMetaFile("foo", { "Depends On": "alpha, beta" });
    expect(md).toContain("- **Depends On:** `alpha`, `beta`");
    expect(md).not.toContain("`alpha, beta`"); // never the compound whole-value span
  });

  it("renders a two-value Design as two discrete backticked tokens", () => {
    const md = renderMetaFile("foo", { Design: "spec-a.md, spec-b.md" });
    expect(md).toContain("- **Design:** `spec-a.md`, `spec-b.md`");
  });

  it("renders a single-value list field identically to a scalar identifier", () => {
    expect(renderMetaFile("foo", { "Depends On": "alpha" })).toContain("- **Depends On:** `alpha`");
    expect(renderMetaFile("foo", { Design: "spec-a.md" })).toContain("- **Design:** `spec-a.md`");
  });

  it("keeps the [none] sentinel bare (no backticks)", () => {
    expect(renderMetaFile("foo", SPAWN_OVERRIDES)).toContain("- **Depends On:** [none]");
  });

  it("round-trips a two-value list through render and parse to the comma-joined value", () => {
    const record = parseMetaRecord(
      renderMetaFile("foo", { "Depends On": "alpha, beta", Design: "spec-a.md, spec-b.md" }),
    );
    expect(record["Depends On"]).toBe("alpha, beta");
    expect(record.Design).toBe("spec-a.md, spec-b.md");
    // and the shared split recovers the discrete elements for consumers
    expect(parseIdentifierList(record["Depends On"])).toEqual(["alpha", "beta"]);
    expect(parseIdentifierList(record.Design)).toEqual(["spec-a.md", "spec-b.md"]);
  });
});

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

  it("preserves backticked identifiers verbatim inside the narrative Next Task", () => {
    const content = metaFileBody({
      nextTask: "Task 3.R.k.d — `arc active status` probe (line ~1828)",
    });
    const parsed = parseMetaFile(content);
    expect(parsed.nextTask).toBe("Task 3.R.k.d — `arc active status` probe (line ~1828)");
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

/** The `|`-leading lines of the rendered core block: header, separator, value. */
function coreTableRows(md: string): string[] {
  return md.split("\n").filter((line) => line.startsWith("|"));
}

/** Header/value cells of a `| a | b |` row, trimmed. */
function tableCells(row: string): string[] {
  return row
    .replace(/^\| /, "")
    .replace(/ \|$/, "")
    .split(" | ")
    .map((cell) => cell.trim());
}

describe("renderMetaFile — core-block table", () => {
  it("renders the core block as a markdown table with the five fields in order", () => {
    const rows = coreTableRows(renderMetaFile("foo", SPAWN_OVERRIDES));
    expect(rows).toHaveLength(3); // header, separator, value
    expect(tableCells(rows[0]!)).toEqual([
      "**State**",
      "**Owner**",
      "**Branch**",
      "**Class**",
      "**Priority**",
    ]);
    expect(rows[1]!).toMatch(/^[-|\s]+$/); // separator: only dashes, pipes, spaces
    expect(rows[1]!).toContain("---");
  });

  it("pre-aligns the table so the pipes line up across all three rows", () => {
    const rows = coreTableRows(renderMetaFile("foo", SPAWN_OVERRIDES));
    expect(rows[1]!.length).toBe(rows[0]!.length);
    expect(rows[2]!.length).toBe(rows[0]!.length);
  });

  it("places the core fields in the table and never as bullets", () => {
    const md = renderMetaFile("foo", SPAWN_OVERRIDES);
    for (const field of ["State", "Owner", "Branch", "Class", "Priority"]) {
      expect(md).not.toContain(`- **${field}:**`);
    }
  });
});

describe("renderMetaFile — value-format convention", () => {
  it("renders enum tokens Capitalized + backticked", () => {
    const md = renderMetaFile("foo", { State: "active", Class: "heavy", Priority: "P1" });
    expect(md).toContain("`Active`");
    expect(md).toContain("`Heavy`");
    expect(md).toContain("`P1`");
    expect(md).not.toMatch(/`active`|`heavy`/);
  });

  it("renders identifier values backticked as-is", () => {
    const md = renderMetaFile("foo", {
      Owner: "andrew",
      Branch: "feat/x",
      Cohort: "core/sub",
      Design: "spec-foo.md",
    });
    expect(md).toContain("`andrew`");
    expect(md).toContain("`feat/x`");
    expect(md).toContain("- **Cohort:** `core/sub`");
    expect(md).toContain("- **Design:** `spec-foo.md`");
  });

  it("renders bracket sentinels bracketed and unbackticked", () => {
    const md = renderMetaFile("foo", SPAWN_OVERRIDES); // Class, Cohort, Origin all default to sentinels
    expect(md).toContain("[TBD]");
    expect(md).not.toContain("`[TBD]`");
    expect(md).toContain("- **Origin:** [internal]");
    expect(md).toContain("- **Cohort:** [none]");
  });

  it("renders narrative fields as plain prose", () => {
    const md = renderMetaFile("foo", {
      "Next Action": "Begin planning — draft the spec",
      "Next Task": "Task 1.2 — next up (line ~20)",
    });
    expect(md).toContain("- **Next Action:** Begin planning — draft the spec");
    expect(md).toContain("- **Next Task:** Task 1.2 — next up (line ~20)");
  });
});

describe("renderMetaFile — bullet groups", () => {
  it("renders the non-core fields as ordered, blank-line-separated bullet groups", () => {
    const md = renderMetaFile("foo", SPAWN_OVERRIDES);
    // contiguous within a group...
    expect(md).toContain("- **Cohort:** [none]\n- **Depends On:** [none]");
    // ...blank line between groups, in order
    expect(md).toContain("- **Depends On:** [none]\n\n- **Origin:** [internal]");
    expect(md).toContain("- **Task List:** [none]\n\n- **Last Completed:** [none]");
    expect(md).toContain("- **Blockers:** [none]\n\n- **Next Action:** Begin planning — draft the spec");
  });
});

describe("renderMetaFile — projection shape", () => {
  it("opens with the `# Metadata: {wu-name}` H1", () => {
    const md = renderMetaFile("foo", SPAWN_OVERRIDES);
    expect(md.startsWith("# Metadata: foo\n")).toBe(true);
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

describe("parseMetaRecord — core-block table", () => {
  it("recovers core fields from the table, stripping backticks and preserving brackets", () => {
    const content = [
      "# Metadata: foo",
      "",
      "| State    | Owner    | Branch     | Class   | Priority |",
      "| -------- | -------- | ---------- | ------- | -------- |",
      "| `Active` | `andrew` | `feat/bar` | `Heavy` | `P1`     |",
      "",
      "- **Cohort:** `core/sub`",
      "",
    ].join("\n");
    const record = parseMetaRecord(content);
    expect(record.State).toBe("Active");
    expect(record.Owner).toBe("andrew");
    expect(record.Branch).toBe("feat/bar");
    expect(record.Class).toBe("Heavy");
    expect(record.Priority).toBe("P1");
    expect(record.Cohort).toBe("core/sub");
  });

  it("recovers core fields from a bold-headered table (the render form)", () => {
    const content = [
      "# Metadata: foo",
      "",
      "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
      "| --------- | --------- | ---------- | --------- | ------------ |",
      "| `Active`  | `andrew`  | `feat/bar` | `Heavy`   | `P1`         |",
      "",
    ].join("\n");
    const record = parseMetaRecord(content);
    expect(record.State).toBe("Active");
    expect(record.Owner).toBe("andrew");
    expect(record.Class).toBe("Heavy");
    expect(record.Priority).toBe("P1");
  });

  it("keys core fields by header label, tolerating column reordering", () => {
    const content = [
      "# Metadata: foo",
      "",
      "| Priority | Class   | Branch     | Owner    | State    |",
      "| -------- | ------- | ---------- | -------- | -------- |",
      "| `P2`     | `[TBD]` | `feat/bar` | `andrew` | `Active` |",
      "",
    ].join("\n");
    const record = parseMetaRecord(content);
    expect(record.State).toBe("Active");
    expect(record.Priority).toBe("P2");
    expect(record.Class).toBe("[TBD]"); // bracket sentinel preserved verbatim
    expect(record.Branch).toBe("feat/bar");
  });

  it("recovers core fields from a legacy flat-bullet block when no table is present", () => {
    const content = [
      "# Metadata: foo",
      "",
      "- **State:** Active",
      "- **Owner:** andrew",
      "- **Branch:** feat/bar",
      "- **Priority:** P1",
      "- **Cohort:** core/sub",
      "",
    ].join("\n");
    const record = parseMetaRecord(content);
    expect(record.State).toBe("Active");
    expect(record.Branch).toBe("feat/bar");
    expect(record.Priority).toBe("P1");
    expect(record.Cohort).toBe("core/sub");
  });
});

describe("parseMetaRecord — malformed table fails loud", () => {
  it("throws when the value row has a different column count than the header", () => {
    const content = [
      "# Metadata: foo",
      "",
      "| State    | Owner    | Branch | Class | Priority |",
      "| -------- | -------- | ------ | ----- | -------- |",
      "| `Active` | `andrew` |",
      "",
    ].join("\n");
    expect(() => parseMetaRecord(content)).toThrow(/column-count mismatch/);
  });

  it("throws when a separator row has no adjacent header and value row", () => {
    const content = ["# Metadata: foo", "", "| --- | --- | --- |", ""].join("\n");
    expect(() => parseMetaRecord(content)).toThrow(/Malformed meta core-block table/);
  });

  it("ignores table-shaped narrative content below managed fields", () => {
    const content = [
      "# Metadata: foo",
      "",
      "- **State:** Active",
      "- **Next Action:** Compare alternatives:",
      "  | Option | Result |",
      "  | ------ | ------ |",
      "  | A      | keep   |",
      "",
    ].join("\n");

    const record = parseMetaRecord(content);

    expect(record.State).toBe("Active");
    expect(record["Next Action"]).toContain("| Option | Result |");
  });
});

describe("parseMetaFile — reads the core-block table (session-init path)", () => {
  it("recovers State and Branch from the table form", () => {
    const content = [
      "# Metadata: foo",
      "",
      "| State    | Owner    | Branch     | Class   | Priority |",
      "| -------- | -------- | ---------- | ------- | -------- |",
      "| `Active` | `andrew` | `feat/bar` | `Heavy` | `P1`     |",
      "",
      "- **Task List:** `tasks-foo.md`",
      "- **Next Task:** Task 2.1 — go (line ~5)",
      "",
    ].join("\n");
    const parsed = parseMetaFile(content);
    expect(parsed.state).toBe("Active");
    expect(parsed.branch).toBe("feat/bar");
    expect(parsed.taskList).toBe("tasks-foo.md");
    expect(parsed.nextTask).toBe("Task 2.1 — go (line ~5)");
  });
});

describe("renderMetaFile ↔ parseMetaRecord — round-trip", () => {
  it("recovers every rendered field value through the meta parser", () => {
    const overrides: MetaFieldOverrides = {
      State: "Planning",
      Owner: "andrew",
      Branch: "plan/foo",
      Class: "Heavy",
      Origin: "tracker-123",
      Design: "draft-foo.md",
      "Depends On": "alpha",
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
    expect(record.Class).toBe("[TBD]");
    expect(record.Priority).toBe("P3");
    expect(record.Origin).toBe("[internal]");
    expect(record.Design).toBe("[none]");
    expect(record["Depends On"]).toBe("[none]");
    expect(record.Cohort).toBe("[none]");
    expect(record["Task List"]).toBe("[none]");
    expect(record["Last Completed"]).toBe("[none]");
    expect(record["Next Task"]).toBe("[none]");
    expect(record.Blockers).toBe("[none]");
  });
});

describe("Class field — value-set semantics", () => {
  it("round-trips each resolved Class value through render and parse", () => {
    for (const value of ["Light", "Heavy", "Novel"] as const) {
      const record = parseMetaRecord(renderMetaFile("foo", { Class: value }));
      expect(record.Class).toBe(value);
    }
  });

  it("normalizes lower-case Class input to the Capitalized token on render", () => {
    // render Capitalizes the enum and parse strips backticks, so lower-case Class values land Capitalized.
    expect(parseMetaRecord(renderMetaFile("foo", { Class: "light" })).Class).toBe("Light");
    expect(parseMetaRecord(renderMetaFile("foo", { Class: "heavy" })).Class).toBe("Heavy");
    expect(parseMetaRecord(renderMetaFile("foo", { Class: "novel" })).Class).toBe("Novel");
  });

  it("preserves the `[TBD]` pre-classification sentinel verbatim through render and parse", () => {
    expect(parseMetaRecord(renderMetaFile("foo", { Class: "[TBD]" })).Class).toBe("[TBD]");
  });

  it("emits the `[TBD]` default when no Class override is supplied", () => {
    expect(parseMetaRecord(renderMetaFile("foo", SPAWN_OVERRIDES)).Class).toBe("[TBD]");
  });

  it("parses an absent Class to null when the core table omits the column", () => {
    const content = [
      "# Metadata: foo",
      "",
      "| State    | Owner    | Branch     | Priority |",
      "| -------- | -------- | ---------- | -------- |",
      "| `Active` | `andrew` | `feat/bar` | `P1`     |",
      "",
    ].join("\n");
    expect(parseMetaRecord(content).Class).toBeNull();
  });

  it("parses an absent Class to null in a legacy flat-bullet meta", () => {
    const content = [
      "# Metadata: foo",
      "",
      "- **State:** Active",
      "- **Owner:** andrew",
      "",
    ].join("\n");
    expect(parseMetaRecord(content).Class).toBeNull();
  });
});

describe("parseMetaRecord — narrative fidelity", () => {
  it("preserves narrative code spans verbatim while token fields strip", () => {
    const content = [
      "# Metadata: foo",
      "",
      "- **Branch:** `feat/x`",
      "- **Design:** `spec-foo.md`",
      "- **Next Action:** Run `create-spec.md`, then `generate-tasks.md`",
      "",
    ].join("\n");
    const record = parseMetaRecord(content);
    expect(record.Branch).toBe("feat/x"); // identifier → bare
    expect(record.Design).toBe("spec-foo.md"); // identifier → bare
    expect(record["Next Action"]).toBe("Run `create-spec.md`, then `generate-tasks.md`"); // narrative → verbatim
  });

  it("recovers a multi-line narrative value in full, leading indent stripped", () => {
    const content = [
      "# Metadata: foo",
      "",
      "- **Next Action:** Author the spec via `create-spec` — a detailed PRD,",
      "  then re-derive the worked example and confirm the boundary tests.",
      "",
    ].join("\n");
    expect(parseMetaRecord(content)["Next Action"]).toBe(
      "Author the spec via `create-spec` — a detailed PRD,\n" +
        "then re-derive the worked example and confirm the boundary tests.",
    );
  });

  it("stops the gather at the next field marker within a contiguous group", () => {
    const content = [
      "# Metadata: foo",
      "",
      "- **Last Completed:** Stub created from a routed capture (2026-06-01) from a",
      "  prior inbox sweep.",
      "- **Next Task:** [none]",
      "",
    ].join("\n");
    const record = parseMetaRecord(content);
    expect(record["Last Completed"]).toBe(
      "Stub created from a routed capture (2026-06-01) from a\nprior inbox sweep.",
    );
    expect(record["Next Task"]).toBe("[none]");
  });

  it("stops the gather at a blank-line group boundary", () => {
    const content = [
      "# Metadata: foo",
      "",
      "- **Blockers:** waiting on review of the upstream change",
      "  and a downstream rebase.",
      "",
      "- **Next Action:** proceed once unblocked",
      "",
    ].join("\n");
    const record = parseMetaRecord(content);
    expect(record.Blockers).toBe(
      "waiting on review of the upstream change\nand a downstream rebase.",
    );
    expect(record["Next Action"]).toBe("proceed once unblocked");
  });

  it("stops the gather at the trailing `---` rule", () => {
    const content = [
      "# Metadata: foo",
      "",
      "- **Next Action:** finish the migration",
      "  and regen the readiness view.",
      "---",
      "",
    ].join("\n");
    expect(parseMetaRecord(content)["Next Action"]).toBe(
      "finish the migration\nand regen the readiness view.",
    );
  });
});

describe("renderMetaFile — multi-line narrative", () => {
  it("indents continuation lines two spaces under the bullet", () => {
    const md = renderMetaFile("foo", {
      "Next Action": "Author the spec via `create-spec`,\nthen re-derive the example.",
    });
    expect(md).toContain(
      "- **Next Action:** Author the spec via `create-spec`,\n  then re-derive the example.",
    );
  });

  it("round-trips backticks and line breaks through render → parse", () => {
    const value = "Run `create-spec.md` — a detailed PRD,\nthen `generate-tasks.md` and verify.";
    expect(parseMetaRecord(renderMetaFile("foo", { "Next Action": value }))["Next Action"]).toBe(
      value,
    );
  });
});
