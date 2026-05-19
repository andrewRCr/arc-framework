/**
 * Unit tests for the validate-meta-spec CLI dispatcher.
 *
 * Covers path classification (meta-file under both flat and subdir layouts),
 * the `**Spec:**` shape rules (empty, `[none]`, bare-basename `.md` filename,
 * `https?://` URL), the codified four-value State enum, missing/multiple-line
 * failure modes, whitespace + backtick handling, and diagnostic message
 * content. Uses an in-memory file reader — no filesystem dependency.
 */

import { describe, it, expect } from "vitest";

import {
  classifyPath,
  validateFiles,
} from "../../../src/scripts/validate-meta-spec.js";

const META_PATH_FIXTURE = ".arc/active/technical/meta-foo.md";

function fakeReader(files: Record<string, string>) {
  return (path: string) => {
    const content = files[path];
    if (content === undefined) throw new Error(`no content for ${path}`);
    return content;
  };
}

function metaFile(
  specLine: string | null,
  fields: { stateLine?: string | null; integrationLine?: string | null } = {},
): string {
  const lines = [
    "# Metadata: Foo",
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
    expect(classifyPath(".arc/active/technical/prd-foo.md")).toBe("other");
    expect(classifyPath(".arc/active/technical/notes-foo.md")).toBe("other");
    expect(classifyPath(".arc/active/technical/atomic-foo.md")).toBe("other");
    expect(classifyPath(".arc/active/tasks-foo.md")).toBe("other");
    expect(classifyPath(".arc/backlog/technical/meta-foo.md")).toBe("other");
    expect(classifyPath(".arc/reference/templates/template-meta.md")).toBe(
      "other",
    );
    expect(classifyPath("src/lib/foo.ts")).toBe("other");
  });
});

describe("validateFiles", () => {
  it("passes when Spec value is literal empty", () => {
    const files = { [META_PATH_FIXTURE]: metaFile("- **Spec:**") };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes when Spec value is [none]", () => {
    const files = { [META_PATH_FIXTURE]: metaFile("- **Spec:** [none]") };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes when Spec value is a bare-basename .md filename", () => {
    const files = {
      [META_PATH_FIXTURE]: metaFile("- **Spec:** `prd-interlock-foundation.md`"),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes when Spec value is an https:// URL", () => {
    const files = {
      [META_PATH_FIXTURE]: metaFile(
        "- **Spec:** https://example.com/issues/42",
      ),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes when Spec value is an http:// URL", () => {
    const files = {
      [META_PATH_FIXTURE]: metaFile("- **Spec:** http://internal.example/42"),
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
        [META_PATH_FIXTURE]: metaFile("- **Spec:** [none]", {
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
        [META_PATH_FIXTURE]: metaFile("- **Spec:** [none]", {
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
      [META_PATH_FIXTURE]: metaFile("- **Spec:** [none]", {
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
      [META_PATH_FIXTURE]: metaFile("- **Spec:** [none]", {
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
    // passes as long as State and Spec are valid.
    const files = {
      [META_PATH_FIXTURE]: metaFile("- **Spec:** [none]", {
        stateLine: "- **State:** Shipped",
        integrationLine: "- **Integration:** Merged",
      }),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes when Spec value has surrounding whitespace (validator trims)", () => {
    const files = {
      [META_PATH_FIXTURE]: metaFile("- **Spec:**    `prd-foo.md`   "),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("fails when the **Spec:** line is missing", () => {
    const files = { [META_PATH_FIXTURE]: metaFile(null) };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) => d.includes(META_PATH_FIXTURE) && d.includes("missing"),
      ),
    ).toBe(true);
  });

  it("fails when multiple **Spec:** lines are present", () => {
    const content = [
      "# Metadata: Foo",
      "",
      "- **State:** Active",
      "- **Spec:** `prd-foo.md`",
      "- **Spec:** [none]",
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

  it("fails when Spec value is a path-prefixed .md filename", () => {
    const files = {
      [META_PATH_FIXTURE]: metaFile("- **Spec:** `subdir/plan-foo.md`"),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some((d) => d.includes("subdir/plan-foo.md")),
    ).toBe(true);
  });

  it("fails when Spec value is an arbitrary non-matching string", () => {
    const files = {
      [META_PATH_FIXTURE]: metaFile("- **Spec:** TBD"),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => d.includes("TBD"))).toBe(true);
  });

  it("emits a diagnostic naming the file path, offending value, and expected shape", () => {
    const files = {
      [META_PATH_FIXTURE]: metaFile("- **Spec:** garbage"),
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
      ".arc/reference/templates/template-meta.md": metaFile(null),
      "src/lib/foo.ts": "// no spec field here",
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("silently skips retired legacy status-* paths (now classified other)", () => {
    const files = {
      ".arc/active/technical/status-foo.md": metaFile("- **Spec:** [none]"),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("validates a flat-layout meta-file end-to-end", () => {
    const flatPath = ".arc/active/meta-work-organization-reform.md";
    const files = {
      [flatPath]: metaFile("- **Spec:** `prd-work-organization-reform.md`", {
        stateLine: "- **State:** Active",
      }),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });
});
