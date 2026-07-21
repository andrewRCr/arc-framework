import { describe, expect, it, vi } from "vitest";

import {
  auditTableMigrationFile,
  prepareTableMigrationAudit,
  transformGfmTables,
} from "../../../src/lib/markdown/index.js";

const encoder = new TextEncoder();

describe("table migration audit", () => {
  it("accepts a byte-identical settled file with no range evidence", () => {
    const bytes = encoder.encode("# Settled\n\n| A  |\n| -- |\n| 表 |\n");

    expect(auditTableMigrationFile({
      path: "docs/settled.md",
      baseline: bytes,
      candidate: bytes,
      changedRanges: [],
    })).toEqual({
      path: "docs/settled.md",
      changedRanges: [],
    });
  });

  it("accepts complete evidence for multiple nested and canonicalized tables", () => {
    const baseline = encoder.encode([
      "Before",
      "",
      "| A | B |",
      "| - | - |",
      "| x \\| y | `a\\|b` |",
      "",
      "> | Wide | Value |",
      "> | - | - |",
      "> | 表 | *z* |",
      "",
    ].join("\n"));
    const transformed = transformGfmTables({ path: "docs/multiple.md", bytes: baseline });

    expect(auditTableMigrationFile({
      path: "docs/multiple.md",
      baseline,
      candidate: transformed.bytes,
      changedRanges: transformed.changedRanges,
    })).toEqual({
      path: "docs/multiple.md",
      changedRanges: transformed.changedRanges,
    });
  });

  it("rejects bytes changed outside the original table ranges", () => {
    const baseline = encoder.encode("Before\n\n| A |\n| - |\n| 表 |\n");
    const transformed = transformGfmTables({ path: "docs/outside.md", bytes: baseline });
    const candidate = encoder.encode(new TextDecoder().decode(transformed.bytes).replace("Before", "After"));

    expect(() => auditTableMigrationFile({
      path: "docs/outside.md",
      baseline,
      candidate,
      changedRanges: transformed.changedRanges,
    })).toThrowError(expect.objectContaining({ code: "markdown.table-boundary" }));
  });

  it("rejects missing range evidence for a changed table", () => {
    const baseline = encoder.encode("| A |\n| - |\n| 表 |\n");
    const transformed = transformGfmTables({ path: "docs/missing.md", bytes: baseline });

    expect(() => auditTableMigrationFile({
      path: "docs/missing.md",
      baseline,
      candidate: transformed.bytes,
      changedRanges: [],
    })).toThrowError(expect.objectContaining({ code: "markdown.table-evidence" }));
  });

  it("rejects an unreported changed table in a multi-table file", () => {
    const baseline = encoder.encode("| A |\n| - |\n| 表 |\n\n| B |\n| - |\n| 👩‍💻 |\n");
    const transformed = transformGfmTables({ path: "docs/unreported.md", bytes: baseline });

    expect(() => auditTableMigrationFile({
      path: "docs/unreported.md",
      baseline,
      candidate: transformed.bytes,
      changedRanges: transformed.changedRanges.slice(0, 1),
    })).toThrowError(expect.objectContaining({ code: "markdown.table-evidence" }));
  });

  it("rejects syntax-tree drift inside a reported table", () => {
    const baseline = encoder.encode("| A |\n| - |\n| value |\n");
    const transformed = transformGfmTables({ path: "docs/semantics.md", bytes: baseline });
    const candidate = encoder.encode(new TextDecoder().decode(transformed.bytes).replace("value", "changed"));

    expect(() => auditTableMigrationFile({
      path: "docs/semantics.md",
      baseline,
      candidate,
      changedRanges: transformed.changedRanges,
    })).toThrowError(expect.objectContaining({ code: "markdown.table-semantics" }));
  });

  it("pins one HEAD commit before loading immutable baselines", async () => {
    const baseline = encoder.encode("| A |\n| - |\n| 表 |\n");
    const transformed = transformGfmTables({ path: "docs/table.md", bytes: baseline });
    const exec = vi.fn(async (_command: string, args: string[]) => ({
      stdout: args[0] === "rev-parse" ? "a".repeat(40) : "docs/table.md",
    }));
    const readBaseline = vi.fn(async () => baseline);

    const result = await prepareTableMigrationAudit({
      root: "/repo",
      paths: ["docs/table.md"],
      exec,
      lstat: vi.fn(async () => ({
        isFile: () => true,
        isDirectory: () => false,
        isSymbolicLink: () => false,
      })),
      realpath: vi.fn(async (path: string) => path),
      readBaseline,
      readBytes: vi.fn(async () => transformed.bytes),
    });

    expect(result.head).toBe("a".repeat(40));
    expect(result.files).toEqual([{
      path: "docs/table.md",
      changedRanges: transformed.changedRanges,
    }]);
    expect(readBaseline).toHaveBeenCalledWith("a".repeat(40), "docs/table.md");
  });

  it("fails when a selected path has no immutable baseline", async () => {
    await expect(prepareTableMigrationAudit({
      root: "/repo",
      paths: ["docs/missing.md"],
      exec: vi.fn(async (_command: string, args: string[]) => ({
        stdout: args[0] === "rev-parse" ? "b".repeat(40) : "docs/missing.md",
      })),
      lstat: vi.fn(async () => ({
        isFile: () => true,
        isDirectory: () => false,
        isSymbolicLink: () => false,
      })),
      realpath: vi.fn(async (path: string) => path),
      readBaseline: vi.fn(async () => null),
      readBytes: vi.fn(),
    })).rejects.toMatchObject({ code: "markdown.audit-baseline" });
  });
});
