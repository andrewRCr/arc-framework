/**
 * Unit tests for the validate-status-spec CLI dispatcher.
 *
 * Covers path classification (meta-file post-WOR canonical and legacy
 * status-file under both flat and subdir layouts), the `**Spec:**` shape rules
 * (empty, `[none]`, bare-basename `.md` filename, `https?://` URL), the
 * State value-set (post-WOR canonical + legacy values accepted during the
 * transition window), missing/multiple-line failure modes, whitespace +
 * backtick handling, and diagnostic message content. Uses an in-memory file
 * reader — no filesystem dependency.
 */

import { describe, it, expect } from "vitest";

import {
  classifyPath,
  validateFiles,
} from "../../../src/scripts/validate-status-spec.js";

const STATUS_PATH = ".arc/active/technical/meta-foo.md";

function fakeReader(files: Record<string, string>) {
  return (path: string) => {
    const content = files[path];
    if (content === undefined) throw new Error(`no content for ${path}`);
    return content;
  };
}

function statusFile(
  specLine: string | null,
  fields: { stateLine?: string | null; integrationLine?: string | null } = {},
): string {
  const lines = [
    "# Status: Foo",
    "",
    "## Work Unit Metadata",
    "",
  ];
  if (fields.stateLine !== null) {
    lines.push(fields.stateLine ?? "- **State:** Active");
  }
  if (specLine !== null) lines.push(specLine);
  if (fields.integrationLine !== undefined && fields.integrationLine !== null) {
    lines.push(fields.integrationLine);
  }
  lines.push("- **Task List:** tasks-foo.md", "");
  return lines.join("\n");
}

describe("classifyPath", () => {
  it("classifies meta-files under subdir layout as status (post-WOR canonical)", () => {
    expect(classifyPath(".arc/active/technical/meta-foo.md")).toBe("status");
    expect(classifyPath(".arc/active/feature/meta-bar.md")).toBe("status");
  });

  it("classifies meta-files under flat layout as status (post-WOR canonical)", () => {
    expect(classifyPath(".arc/active/meta-foo.md")).toBe("status");
    expect(classifyPath(".arc/active/meta-work-organization-reform.md")).toBe(
      "status",
    );
  });

  it("classifies legacy status-files under subdir layout as status (compat)", () => {
    expect(classifyPath(".arc/active/technical/status-foo.md")).toBe("status");
    expect(classifyPath(".arc/active/feature/status-bar.md")).toBe("status");
  });

  it("classifies legacy status-files under flat layout as status (compat)", () => {
    expect(classifyPath(".arc/active/status-foo.md")).toBe("status");
  });

  it("classifies non-status paths as other", () => {
    expect(classifyPath(".arc/active/technical/tasks-foo.md")).toBe("other");
    expect(classifyPath(".arc/active/technical/prd-foo.md")).toBe("other");
    expect(classifyPath(".arc/active/technical/notes-foo.md")).toBe("other");
    expect(classifyPath(".arc/active/technical/atomic-foo.md")).toBe("other");
    expect(classifyPath(".arc/active/tasks-foo.md")).toBe("other");
    expect(classifyPath(".arc/backlog/technical/status-foo.md")).toBe("other");
    expect(classifyPath(".arc/backlog/technical/meta-foo.md")).toBe("other");
    expect(classifyPath(".arc/reference/templates/template-status.md")).toBe(
      "other",
    );
    expect(classifyPath(".arc/reference/templates/template-meta.md")).toBe(
      "other",
    );
    expect(classifyPath("src/lib/foo.ts")).toBe("other");
  });
});

describe("validateFiles", () => {
  it("passes when Spec value is literal empty", () => {
    const files = { [STATUS_PATH]: statusFile("- **Spec:**") };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes when Spec value is [none]", () => {
    const files = { [STATUS_PATH]: statusFile("- **Spec:** [none]") };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes when Spec value is a bare-basename .md filename", () => {
    const files = {
      [STATUS_PATH]: statusFile("- **Spec:** `prd-interlock-foundation.md`"),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes when Spec value is an https:// URL", () => {
    const files = {
      [STATUS_PATH]: statusFile(
        "- **Spec:** https://example.com/issues/42",
      ),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes when Spec value is an http:// URL", () => {
    const files = {
      [STATUS_PATH]: statusFile("- **Spec:** http://internal.example/42"),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes for every post-WOR canonical State value (Integration absent)", () => {
    for (const state of [
      "Planning",
      "Active",
      "Integrating",
      "Shipped",
    ]) {
      const files = {
        [STATUS_PATH]: statusFile("- **Spec:** [none]", {
          stateLine: `- **State:** ${state}`,
        }),
      };
      const result = validateFiles(Object.keys(files), fakeReader(files));
      expect(result.pass).toBe(true);
      expect(result.diagnostics).toEqual([]);
    }
  });

  it("passes for every legacy State value during the transition window (Integration absent)", () => {
    for (const state of [
      "In Progress",
      "Paused",
      "Superseded",
    ]) {
      const files = {
        [STATUS_PATH]: statusFile("- **Spec:** [none]", {
          stateLine: `- **State:** ${state}`,
        }),
      };
      const result = validateFiles(Object.keys(files), fakeReader(files));
      expect(result.pass).toBe(true);
      expect(result.diagnostics).toEqual([]);
    }
  });

  it("passes when Complete State has a supported Integration value", () => {
    const files = {
      [STATUS_PATH]: statusFile("- **Spec:** [none]", {
        stateLine: "- **State:** Complete",
        integrationLine: "- **Integration:** Merged",
      }),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes when Complete State has no Integration value before merge", () => {
    const files = {
      [STATUS_PATH]: statusFile("- **Spec:** [none]", {
        stateLine: "- **State:** Complete",
      }),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("fails when State value is unsupported", () => {
    const files = {
      [STATUS_PATH]: statusFile("- **Spec:** [none]", {
        stateLine: "- **State:** Waiting",
      }),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    const diag = result.diagnostics.find((d) => d.includes(STATUS_PATH));
    expect(diag).toBeDefined();
    expect(diag).toContain("State");
    expect(diag).toContain("Waiting");
  });

  it("fails when State line is missing", () => {
    const files = {
      [STATUS_PATH]: statusFile("- **Spec:** [none]", {
        stateLine: null,
      }),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) => d.includes(STATUS_PATH) && d.includes("State") && d.includes("missing"),
      ),
    ).toBe(true);
  });

  it("fails when Complete State has blank Integration", () => {
    const files = {
      [STATUS_PATH]: statusFile("- **Spec:** [none]", {
        stateLine: "- **State:** Complete",
        integrationLine: "- **Integration:**",
      }),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) => d.includes(STATUS_PATH) && d.includes("Integration") && d.includes("empty"),
      ),
    ).toBe(true);
  });

  it("fails when Integration value is unsupported", () => {
    const files = {
      [STATUS_PATH]: statusFile("- **Spec:** [none]", {
        stateLine: "- **State:** Complete",
        integrationLine: "- **Integration:** Draft",
      }),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    const diag = result.diagnostics.find((d) => d.includes(STATUS_PATH));
    expect(diag).toBeDefined();
    expect(diag).toContain("Integration");
    expect(diag).toContain("Draft");
  });

  it("does not emit dependent Integration diagnostics when Integration appears multiple times", () => {
    const content = [
      "# Status: Foo",
      "",
      "## Work Unit Metadata",
      "",
      "- **State:** Complete",
      "- **Spec:** [none]",
      "- **Integration:** Merged",
      "- **Integration:** Merged",
      "- **Task List:** tasks-foo.md",
      "",
    ].join("\n");
    const files = { [STATUS_PATH]: content };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(result.diagnostics).toEqual([
      `${STATUS_PATH}: multiple \`**Integration:**\` lines (found 2)`,
    ]);
  });

  it("fails when non-Complete State has Integration", () => {
    const files = {
      [STATUS_PATH]: statusFile("- **Spec:** [none]", {
        stateLine: "- **State:** In Progress",
        integrationLine: "- **Integration:** Merged",
      }),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) => d.includes(STATUS_PATH) && d.includes("Integration") && d.includes("Complete"),
      ),
    ).toBe(true);
  });

  it("fails when canonical Shipped State has Integration (merge-status folds into State)", () => {
    // Canonical post-transition shape: the merge-status pairing folds into
    // State: Shipped, so a paired Integration line is invalid even though
    // Shipped is the terminal state.
    const files = {
      [STATUS_PATH]: statusFile("- **Spec:** [none]", {
        stateLine: "- **State:** Shipped",
        integrationLine: "- **Integration:** Merged",
      }),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) => d.includes(STATUS_PATH) && d.includes("Integration") && d.includes("Complete"),
      ),
    ).toBe(true);
  });

  it("passes when Spec value has surrounding whitespace (validator trims)", () => {
    const files = {
      [STATUS_PATH]: statusFile("- **Spec:**    `prd-foo.md`   "),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("fails when the **Spec:** line is missing", () => {
    const files = { [STATUS_PATH]: statusFile(null) };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) => d.includes(STATUS_PATH) && d.includes("missing"),
      ),
    ).toBe(true);
  });

  it("fails when multiple **Spec:** lines are present", () => {
    const content = [
      "# Status: Foo",
      "",
      "## Work Unit Metadata",
      "",
      "- **State:** In Progress",
      "- **Spec:** `prd-foo.md`",
      "- **Spec:** [none]",
      "- **Task List:** tasks-foo.md",
      "",
    ].join("\n");
    const files = { [STATUS_PATH]: content };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) => d.includes(STATUS_PATH) && d.includes("multiple"),
      ),
    ).toBe(true);
  });

  it("fails when Spec value is a path-prefixed .md filename", () => {
    const files = {
      [STATUS_PATH]: statusFile("- **Spec:** `subdir/plan-foo.md`"),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some((d) => d.includes("subdir/plan-foo.md")),
    ).toBe(true);
  });

  it("fails when Spec value is an arbitrary non-matching string", () => {
    const files = {
      [STATUS_PATH]: statusFile("- **Spec:** TBD"),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => d.includes("TBD"))).toBe(true);
  });

  it("emits a diagnostic naming the file path, offending value, and expected shape", () => {
    const files = {
      [STATUS_PATH]: statusFile("- **Spec:** garbage"),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    const diag = result.diagnostics.find((d) => d.includes(STATUS_PATH));
    expect(diag).toBeDefined();
    expect(diag).toContain("garbage");
    expect(diag).toContain("expected:");
    expect(diag).toContain(".md filename");
    expect(diag).toContain("https?://");
  });

  it("silently skips non-status paths — they do not trigger the check", () => {
    const files = {
      ".arc/active/technical/tasks-foo.md": "# Task list",
      ".arc/reference/templates/template-status.md": statusFile(null),
      "src/lib/foo.ts": "// no spec field here",
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("validates a flat-layout meta-file end-to-end (post-WOR canonical)", () => {
    const flatPath = ".arc/active/meta-work-organization-reform.md";
    const files = {
      [flatPath]: statusFile("- **Spec:** `prd-work-organization-reform.md`", {
        stateLine: "- **State:** Active",
      }),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("validates a subdir-layout legacy status-file end-to-end (compat)", () => {
    const subdirPath = ".arc/active/technical/status-foo.md";
    const files = {
      [subdirPath]: statusFile("- **Spec:** [none]", {
        stateLine: "- **State:** In Progress",
      }),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });
});
