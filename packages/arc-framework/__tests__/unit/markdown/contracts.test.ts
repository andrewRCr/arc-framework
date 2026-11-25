import { describe, expect, it } from "vitest";

import { ArcError } from "../../../src/lib/kernel/errors.js";
import {
  aggregateMarkdownDiagnostics,
  completeExplicitMarkdownFormat,
  completeStagedMarkdownLint,
  completeWorktreeMarkdownLint,
  createMarkdownDiagnostic,
  createMarkdownOperationInput,
  createMarkdownRouteDiagnostic,
  validateMarkdownPath,
  adaptMarkdownOperationError,
} from "../../../src/lib/markdown/index.js";

describe("Markdown operation contracts", () => {
  it("keeps operation inputs separate and diagnostics stably path-ordered", () => {
    const input = createMarkdownOperationInput("format-explicit", [
      "docs/z.md",
      "docs/a\nname.md",
    ]);
    const diagnostics = aggregateMarkdownDiagnostics([
      createMarkdownDiagnostic({
        operation: input.operation,
        path: "docs/z.md",
        code: "markdown.table-alignment",
        message: "Table columns are not aligned",
      }),
      createMarkdownDiagnostic({
        operation: input.operation,
        path: "docs/a\nname.md",
        code: "markdown.table-alignment",
        message: "Table columns are not aligned",
      }),
    ]);

    expect(input).toEqual({
      operation: "format-explicit",
      paths: ["docs/z.md", "docs/a\nname.md"],
    });
    expect(diagnostics.map(({ path }) => path)).toEqual(["docs/a\nname.md", "docs/z.md"]);
    expect(diagnostics[0]).toMatchObject({
      operation: "format-explicit",
      path: "docs/a\nname.md",
      remedy: { command: "npm run format:tables -- 'docs/a\nname.md'" },
    });
  });

  it("aggregates formatter and lint results without widening operation-specific outcomes", () => {
    const identity = {
      path: validateMarkdownPath("docs/table.md"),
      kind: "project-owned" as const,
    };
    const refusedIdentity = {
      path: validateMarkdownPath(".arc/system/rules/DEV-RULES.ARC.md"),
      kind: "rendered-framework" as const,
      counterpart: validateMarkdownPath("packages/arc-framework/arc/system/rules/DEV-RULES.ARC.md"),
    };
    const diagnostic = createMarkdownDiagnostic({
      operation: "format-explicit",
      path: identity.path,
      code: "markdown.table-alignment",
      message: "Table columns are not aligned",
    });
    const formatted = completeExplicitMarkdownFormat([
      {
        identity,
        status: "changed",
        changedRanges: [{ start: 10, end: 40 }],
        write: "written",
      },
      {
        identity: refusedIdentity,
        status: "refused",
        changedRanges: [],
        write: "not-written",
      },
    ], [diagnostic]);
    const worktree = completeWorktreeMarkdownLint([
      { identity, status: "invalid" },
      { identity: refusedIdentity, status: "unreadable" },
    ], [{ ...diagnostic, operation: "lint-worktree" }]);
    const staged = completeStagedMarkdownLint([
      { identity, status: "clean" },
    ], []);

    expect(formatted).toMatchObject({
      operation: "format-explicit",
      writeStatus: "partial",
      files: [
        { path: identity.path, changedRanges: [{ start: 10, end: 40 }] },
        { path: refusedIdentity.path, changedRanges: [] },
      ],
    });
    expect(worktree).toMatchObject({
      operation: "lint-worktree",
      verdict: "fail",
      files: [
        { path: identity.path, status: "invalid" },
        { path: refusedIdentity.path, status: "unreadable" },
      ],
    });
    expect(staged).toMatchObject({
      operation: "lint-index",
      verdict: "pass",
      files: [{ path: identity.path, status: "clean" }],
    });
    expect(worktree).not.toHaveProperty("writeStatus");
    expect(worktree.files[0]).not.toHaveProperty("changedRanges");
  });

  it("adapts loader failures through the established user-facing error boundary", () => {
    const diagnostic = createMarkdownDiagnostic({
      operation: "lint-index",
      path: "docs/a\nname.md",
      code: "markdown.table-alignment",
      message: "Table columns are not aligned",
    });
    const error = adaptMarkdownOperationError({
      operation: "lint-index",
      path: diagnostic.path,
      error: new ArcError("Indexed blob is not valid UTF-8", "markdown.invalid-utf8"),
      diagnostic,
    });

    expect(error).toMatchObject({
      name: "UserFacingError",
      code: "markdown.invalid-utf8",
      whatHappened: "lint-index failed for docs/a\nname.md",
      why: "Indexed blob is not valid UTF-8",
      whatToDo: "Run `npm run format:tables -- 'docs/a\nname.md'`.",
    });
  });

  it("centralizes authority-specific remedies on exact responsible commands", () => {
    expect(createMarkdownRouteDiagnostic("format-explicit", {
      path: validateMarkdownPath(".arc/system/rules/DEV-RULES.ARC.md"),
      kind: "rendered-framework",
      counterpart: validateMarkdownPath("packages/arc-framework/arc/system/rules/DEV-RULES.ARC.md"),
    })).toMatchObject({
      code: "markdown.wrong-direction",
      remedy: {
        command: "npm run format:tables -- 'packages/arc-framework/arc/system/rules/DEV-RULES.ARC.md'",
      },
    });
    expect(createMarkdownRouteDiagnostic("format-explicit", {
      path: validateMarkdownPath(".arc/backlog/ROADMAP.md"),
      kind: "derived-readiness",
    })).toMatchObject({
      code: "markdown.derived-readiness",
      remedy: { command: "npx arc status --project --staged --write" },
    });
    expect(createMarkdownRouteDiagnostic("format-explicit", {
      path: validateMarkdownPath(".arc/active/meta-widget.md"),
      kind: "managed-meta",
    })).toMatchObject({
      code: "markdown.meta-normalization",
      remedy: { command: "npm run format:tables -- '.arc/active/meta-widget.md'" },
    });
  });
});
