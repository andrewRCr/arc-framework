/**
 * Unit tests for the validate-meta-spec CLI dispatcher.
 *
 * Covers path classification (meta-file under both flat and subdir layouts),
 * the `**Design:**` shape rules (empty, `[none]`, bare-basename `.md` filename,
 * `https?://` URL), the codified four-value State enum, missing/multiple-line
 * failure modes, whitespace + backtick handling, and diagnostic message
 * content. Uses an in-memory file reader — no filesystem dependency.
 */

import { describe, it, expect } from "vitest";

import {
  classifyPath,
  validateCohort,
  validateFiles,
} from "../../../src/scripts/validate-meta-spec.js";
import { renderMetaFile } from "../../../src/lib/active/meta-reader.js";

const META_PATH_FIXTURE = ".arc/active/technical/meta-foo.md";

function fakeReader(files: Record<string, string>) {
  return (path: string) => {
    const content = files[path];
    if (content === undefined) throw new Error(`no content for ${path}`);
    return content;
  };
}

function metaFile(
  designLine: string | null,
  fields: { stateLine?: string | null; integrationLine?: string | null } = {},
): string {
  const lines = [
    "# Metadata: Foo",
    "",
  ];
  if (fields.stateLine !== null) {
    lines.push(fields.stateLine ?? "- **State:** Active");
  }
  if (designLine !== null) lines.push(designLine);
  if (fields.integrationLine !== undefined && fields.integrationLine !== null) {
    lines.push(fields.integrationLine);
  }
  lines.push("- **Task List:** tasks-foo.md", "");
  return lines.join("\n");
}

describe("classifyPath", () => {
  it("classifies meta-files under subdir layout as meta", () => {
    expect(classifyPath(".arc/active/technical/meta-foo.md")).toBe("meta");
    expect(classifyPath(".arc/active/feature/meta-bar.md")).toBe("meta");
  });

  it("classifies meta-files under flat layout as meta", () => {
    expect(classifyPath(".arc/active/meta-foo.md")).toBe("meta");
    expect(classifyPath(".arc/active/meta-work-organization-reform.md")).toBe(
      "meta",
    );
  });

  it("classifies retired legacy status-files as other (no longer recognized)", () => {
    expect(classifyPath(".arc/active/technical/status-foo.md")).toBe("other");
    expect(classifyPath(".arc/active/status-foo.md")).toBe("other");
  });

  it("classifies non-meta paths as other", () => {
    expect(classifyPath(".arc/active/technical/tasks-foo.md")).toBe("other");
    expect(classifyPath(".arc/active/technical/spec-foo.md")).toBe("other");
    expect(classifyPath(".arc/active/technical/notes-foo.md")).toBe("other");
    expect(classifyPath(".arc/active/technical/atomic-foo.md")).toBe("other");
    expect(classifyPath(".arc/active/tasks-foo.md")).toBe("other");
    expect(classifyPath(".arc/backlog/technical/meta-foo.md")).toBe("other");
    expect(
      classifyPath(".arc/reference/templates/arc/work-unit/template-meta.md"),
    ).toBe("other");
    expect(classifyPath("src/lib/foo.ts")).toBe("other");
  });
});

describe("validateFiles", () => {
  it("passes when Design value is literal empty", () => {
    const files = { [META_PATH_FIXTURE]: metaFile("- **Design:**") };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes when Design value is [none]", () => {
    const files = { [META_PATH_FIXTURE]: metaFile("- **Design:** [none]") };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes when Design value is a bare-basename .md filename (draft- or spec-)", () => {
    for (const value of [
      "draft-loadset-composition.md",
      "spec-interlock-foundation.md",
    ]) {
      const files = {
        [META_PATH_FIXTURE]: metaFile(`- **Design:** \`${value}\``),
      };
      const result = validateFiles(Object.keys(files), fakeReader(files));
      expect(result.pass).toBe(true);
      expect(result.diagnostics).toEqual([]);
    }
  });

  it("passes when Design value is an https:// URL", () => {
    const files = {
      [META_PATH_FIXTURE]: metaFile(
        "- **Design:** https://example.com/issues/42",
      ),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes when Design value is an http:// URL", () => {
    const files = {
      [META_PATH_FIXTURE]: metaFile("- **Design:** http://internal.example/42"),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes for every codified State value", () => {
    for (const state of [
      "Planning",
      "Active",
      "Integrating",
      "Shipped",
    ]) {
      const files = {
        [META_PATH_FIXTURE]: metaFile("- **Design:** [none]", {
          stateLine: `- **State:** ${state}`,
        }),
      };
      const result = validateFiles(Object.keys(files), fakeReader(files));
      expect(result.pass).toBe(true);
      expect(result.diagnostics).toEqual([]);
    }
  });

  it("fails for retired legacy State values (In Progress / Paused / Complete / Superseded)", () => {
    for (const state of [
      "In Progress",
      "Paused",
      "Complete",
      "Superseded",
    ]) {
      const files = {
        [META_PATH_FIXTURE]: metaFile("- **Design:** [none]", {
          stateLine: `- **State:** ${state}`,
        }),
      };
      const result = validateFiles(Object.keys(files), fakeReader(files));
      expect(result.pass).toBe(false);
      const diag = result.diagnostics.find((d) => d.includes(META_PATH_FIXTURE));
      expect(diag).toBeDefined();
      expect(diag).toContain("State");
      expect(diag).toContain(state);
    }
  });

  it("fails when State value is unsupported", () => {
    const files = {
      [META_PATH_FIXTURE]: metaFile("- **Design:** [none]", {
        stateLine: "- **State:** Waiting",
      }),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    const diag = result.diagnostics.find((d) => d.includes(META_PATH_FIXTURE));
    expect(diag).toBeDefined();
    expect(diag).toContain("State");
    expect(diag).toContain("Waiting");
  });

  it("fails when State line is missing", () => {
    const files = {
      [META_PATH_FIXTURE]: metaFile("- **Design:** [none]", {
        stateLine: null,
      }),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) => d.includes(META_PATH_FIXTURE) && d.includes("State") && d.includes("missing"),
      ),
    ).toBe(true);
  });

  it("ignores retired Integration field (silently passes)", () => {
    // Integration validation is retired (folded into State: Shipped per WOR
    // R-mapping). A stray Integration line is no longer checked; the file
    // passes as long as State and Design are valid.
    const files = {
      [META_PATH_FIXTURE]: metaFile("- **Design:** [none]", {
        stateLine: "- **State:** Shipped",
        integrationLine: "- **Integration:** Merged",
      }),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes when Design value has surrounding whitespace (validator trims)", () => {
    const files = {
      [META_PATH_FIXTURE]: metaFile("- **Design:**    `spec-foo.md`   "),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("fails when the **Design:** line is missing", () => {
    const files = { [META_PATH_FIXTURE]: metaFile(null) };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) => d.includes(META_PATH_FIXTURE) && d.includes("missing"),
      ),
    ).toBe(true);
  });

  it("fails when multiple **Design:** lines are present", () => {
    const content = [
      "# Metadata: Foo",
      "",
      "- **State:** Active",
      "- **Design:** `spec-foo.md`",
      "- **Design:** [none]",
      "- **Task List:** tasks-foo.md",
      "",
    ].join("\n");
    const files = { [META_PATH_FIXTURE]: content };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) => d.includes(META_PATH_FIXTURE) && d.includes("multiple"),
      ),
    ).toBe(true);
  });

  it("fails when Design value is a path-prefixed .md filename", () => {
    const files = {
      [META_PATH_FIXTURE]: metaFile("- **Design:** `subdir/draft-foo.md`"),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some((d) => d.includes("subdir/draft-foo.md")),
    ).toBe(true);
  });

  it("fails when Design value is an arbitrary non-matching string", () => {
    const files = {
      [META_PATH_FIXTURE]: metaFile("- **Design:** TBD"),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => d.includes("TBD"))).toBe(true);
  });

  it("emits a diagnostic naming the file path, offending value, and expected shape", () => {
    const files = {
      [META_PATH_FIXTURE]: metaFile("- **Design:** garbage"),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    const diag = result.diagnostics.find((d) => d.includes(META_PATH_FIXTURE));
    expect(diag).toBeDefined();
    expect(diag).toContain("garbage");
    expect(diag).toContain("expected:");
    expect(diag).toContain(".md filename");
    expect(diag).toContain("https?://");
  });

  it("silently skips non-meta paths — they do not trigger the check", () => {
    const files = {
      ".arc/active/technical/tasks-foo.md": "# Task list",
      ".arc/reference/templates/arc/work-unit/template-meta.md": metaFile(null),
      "src/lib/foo.ts": "// no design field here",
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("silently skips retired legacy status-* paths (now classified other)", () => {
    const files = {
      ".arc/active/technical/status-foo.md": metaFile("- **Design:** [none]"),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("validates a flat-layout meta-file end-to-end", () => {
    const flatPath = ".arc/active/meta-work-organization-reform.md";
    const files = {
      [flatPath]: metaFile("- **Design:** `spec-work-organization-reform.md`", {
        stateLine: "- **State:** Active",
      }),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });
});

describe("validateFiles — Design multi-value (one or two refs)", () => {
  it("passes a two-value Design in per-element backtick form", () => {
    const files = { [META_PATH_FIXTURE]: metaFile("- **Design:** `spec-a.md`, `spec-b.md`") };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("tolerates a two-value Design in the legacy compound whole-value form", () => {
    const files = { [META_PATH_FIXTURE]: metaFile("- **Design:** `spec-a.md, spec-b.md`") };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("flags a malformed element in an otherwise-valid two-value Design", () => {
    const files = { [META_PATH_FIXTURE]: metaFile("- **Design:** `spec-a.md`, `garbage`") };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    const diag = result.diagnostics.find((d) => d.includes(META_PATH_FIXTURE));
    expect(diag).toBeDefined();
    expect(diag).toContain("garbage");
    expect(diag).toContain("expected:");
  });

  it("rejects more than two references on one Design line", () => {
    const files = { [META_PATH_FIXTURE]: metaFile("- **Design:** `a.md`, `b.md`, `c.md`") };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    const diag = result.diagnostics.find((d) => d.includes(META_PATH_FIXTURE));
    expect(diag).toBeDefined();
    expect(diag).toContain("Design");
    expect(diag).toMatch(/two|2/);
  });

  it("still rejects multiple Design *lines* (the convention is one comma-separated bullet)", () => {
    const content = [
      "# Metadata: Foo",
      "",
      "- **State:** Active",
      "- **Design:** `spec-a.md`",
      "- **Design:** `spec-b.md`",
      "- **Task List:** tasks-foo.md",
      "",
    ].join("\n");
    const files = { [META_PATH_FIXTURE]: content };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => d.includes("multiple"))).toBe(true);
  });
});

describe("validateLifecycleFields — core-block table form", () => {
  it("validates State recovered from the hoisted table (Design bullet unchanged)", () => {
    const files = {
      [META_PATH_FIXTURE]: renderMetaFile("foo", { State: "Active", Design: "spec-foo.md" }),
    };
    const result = validateFiles([META_PATH_FIXTURE], fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("fails an invalid State carried in the table", () => {
    const files = {
      [META_PATH_FIXTURE]: renderMetaFile("foo", { State: "Waiting", Design: "[none]" }),
    };
    const result = validateFiles([META_PATH_FIXTURE], fakeReader(files));
    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => d.includes("State"))).toBe(true);
  });

  it("fails loud on a malformed core-block table", () => {
    const content =
      "# Metadata: Foo\n\n- **Design:** [none]\n| State | Owner |\n| --- | --- |\n| `Active` |\n";
    const files = { [META_PATH_FIXTURE]: content };
    const result = validateFiles([META_PATH_FIXTURE], fakeReader(files));
    expect(result.pass).toBe(false);
  });
});

describe("validateCohort — two-segment path cap", () => {
  it("passes a meta with no Cohort line (the field is optional)", () => {
    const content = "# Metadata: Foo\n\n- **State:** Active\n- **Design:** [none]\n";
    expect(validateCohort(content, META_PATH_FIXTURE)).toEqual([]);
  });

  it("passes single-segment, two-segment, and [none] cohorts", () => {
    for (const value of ["core", "core/sub", "[none]"]) {
      const content = renderMetaFile("foo", {
        State: "Active",
        Design: "[none]",
        Cohort: value,
      });
      expect(validateCohort(content, META_PATH_FIXTURE)).toEqual([]);
    }
  });

  it("flags a three-segment cohort path", () => {
    const content = renderMetaFile("foo", {
      State: "Active",
      Design: "[none]",
      Cohort: "core/sub/leaf",
    });
    const diagnostics = validateCohort(content, META_PATH_FIXTURE);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics.some((d) => d.includes("Cohort"))).toBe(true);
  });

  it("surfaces a capped cohort through the validateFiles gate", () => {
    const files = {
      [META_PATH_FIXTURE]: renderMetaFile("foo", {
        State: "Active",
        Design: "[none]",
        Cohort: "a/b/c",
      }),
    };
    const result = validateFiles([META_PATH_FIXTURE], fakeReader(files));
    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => d.includes("Cohort"))).toBe(true);
  });
});
