/**
 * Regression coverage for hook-internal shell-script invocation.
 *
 * Fresh clones may preserve tracked hook files without executable bits. The
 * pre-commit hook must invoke nested shell scripts through `bash` so CHECK[markdown-links]
 * still runs even when `validate-links.sh` itself is not executable.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..", "..", "..", "..");

const preCommitSource = readFileSync(
  join(repoRoot, "packages/arc-framework/arc/system/.internal/githooks/pre-commit"),
  "utf-8",
);
const projectPreCommitSource = readFileSync(
  join(repoRoot, ".arc/system/.internal/githooks/pre-commit"),
  "utf-8",
);

function selectCheckBlock(source: string, id: string): string {
  const headings = [...source.matchAll(/^# CHECK\[([^\]\r\n]+)\]:.*$/gmu)];
  const matches = headings.filter((heading) => heading[1] === id);
  const selected = matches[0];
  if (!selected) throw new Error(`Missing check ID: ${id}`);
  if (matches.length > 1) throw new Error(`Duplicate check ID: ${id}`);

  const next = headings[headings.indexOf(selected) + 1];
  if (next) return source.slice(selected.index, next.index);

  const summaryOffset = source.slice(selected.index).search(/^# Summary$/mu);
  if (summaryOffset === -1) throw new Error(`Missing Summary boundary for check ID: ${id}`);
  return source.slice(selected.index, selected.index + summaryOffset);
}

describe("pre-commit source-block selection", () => {
  it("selects an exact heading ID and excludes neighboring blocks", () => {
    const source = [
      "# CHECK[target-extra]: Neighbor mentioning CHECK[target]",
      "before_body",
      "# A description also mentions CHECK[target]",
      "# CHECK[target]: Selected check",
      "selected_body",
      "# CHECK[another]: Following check",
      "after_body",
      "# Summary",
    ].join("\n");

    expect(selectCheckBlock(source, "target")).toBe(
      "# CHECK[target]: Selected check\nselected_body\n",
    );
  });

  it("preserves selection through insertion and reordering, including the final block", () => {
    const target = "# CHECK[target]: Selected check\nselected_body\n";
    const before = "# CHECK[before]: Previous check\nbefore_body\n";
    const after = "# CHECK[after]: Following check\nafter_body\n";
    const inserted = "# CHECK[inserted]: New neighbor\ninserted_body\n";
    const layouts = [
      [before, target, after],
      [inserted, before, target, after],
      [after, target, inserted, before],
      [after, inserted, before, target],
    ];

    for (const blocks of layouts) {
      const source = `${blocks.join("")}# Summary\nsummary_body\n`;
      expect(selectCheckBlock(source, "target")).toBe(target);
      for (const id of ["before", "after"]) {
        expect(selectCheckBlock(source, id)).toBe(id === "before" ? before : after);
      }
    }
  });

  it("rejects a missing requested ID", () => {
    const source = "# CHECK[target-extra]: Different check\nbody\n# Summary\n";
    expect(() => selectCheckBlock(source, "target")).toThrow("Missing check ID: target");
  });

  it("rejects duplicate requested IDs", () => {
    const source = [
      "# CHECK[target]: First check",
      "first_body",
      "# CHECK[other]: Neighbor",
      "other_body",
      "# CHECK[target]: Duplicate check",
      "duplicate_body",
      "# Summary",
    ].join("\n");
    expect(() => selectCheckBlock(source, "target")).toThrow("Duplicate check ID: target");
  });

  it("rejects a final block without a Summary heading", () => {
    const source = "# CHECK[target]: Final check\n# Description mentions # Summary\nbody\n";
    expect(() => selectCheckBlock(source, "target")).toThrow(
      "Missing Summary boundary for check ID: target",
    );
  });
});

describe("pre-commit hook shell-script invocation", () => {
  it("gives every hook check a unique lowercase kebab-case ID", () => {
    const headings = [...preCommitSource.matchAll(/^# CHECK[^\r\n]*$/gmu)];
    const ids = [...preCommitSource.matchAll(
      /^# CHECK\[([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\]: .+$/gmu,
    )].map((heading) => heading[1]);

    expect(headings.length).toBeGreaterThan(0);
    expect(ids).toHaveLength(headings.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("invokes validate-links.sh via bash instead of relying on the exec bit", () => {
    expect(preCommitSource).toMatch(
      /bash "\$\((?:dirname )?"\$0"\)\/\.\.\/scripts\/validate-links\.sh"/,
    );
  });

  it("does not directly execute nested .sh scripts", () => {
    const directShellInvocations = preCommitSource
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return trimmed.includes("../scripts/")
          && trimmed.includes(".sh")
          && !trimmed.startsWith(". ")
          && !trimmed.includes('bash "$(dirname "$0")/../scripts/');
      });

    expect(directShellInvocations).toEqual([]);
  });
});

describe("foreign-write advisory backstop wiring", () => {
  it("invokes the foreign-write entry point through the TypeScript loader", () => {
    expect(preCommitSource).toContain(
      'node --import "$tsx_loader" packages/arc-framework/src/scripts/check-foreign-writes.ts',
    );
  });

  it("treats the backstop as advisory — increments warnings, never errors", () => {
    const block = selectCheckBlock(preCommitSource, "foreign-write-advisory");
    expect(block).toContain("warnings=$((warnings + 1))");
    expect(block).not.toContain("errors=$((errors + 1))");
  });

  it("uses neutral wording for foreign-write and skip-note output", () => {
    expect(preCommitSource).toContain("Warning: In-flight artifact advisory:");
    expect(preCommitSource).not.toContain("Warning: Foreign-owned write among staged artifacts:");
  });
});

describe("ROADMAP conflict auto-remedy wiring", () => {
  it("keeps the project and packaged hook copies identical", () => {
    expect(projectPreCommitSource).toBe(preCommitSource);
  });

  it("runs the package-portable remedy before generic marker rejection", () => {
    const block = selectCheckBlock(preCommitSource, "merge-conflict-markers");

    const markerCheckIndex = block.indexOf("conflict_markers=");
    const remedyCommands = [
      'node --import "$tsx_loader" packages/arc-framework/src/scripts/remedy-roadmap-conflict.ts',
      "arc hook-remedy-roadmap-conflict",
    ];
    for (const command of remedyCommands) {
      expect(block.indexOf(command)).toBeGreaterThanOrEqual(0);
      expect(block.indexOf(command)).toBeLessThan(markerCheckIndex);
    }
  });

  it("keeps failed remedies and remaining markers as hard errors", () => {
    const block = selectCheckBlock(preCommitSource, "merge-conflict-markers");

    expect(block).toContain("roadmap_remedy_status");
    expect(block).toContain("ROADMAP conflict auto-remedy failed");
    expect(block.match(/errors=\$\(\(errors \+ 1\)\)/gu)).toHaveLength(2);
  });
});

describe("ROADMAP regeneration assert wiring", () => {
  it("invokes the ROADMAP assert entry point through the TypeScript loader", () => {
    expect(preCommitSource).toContain(
      'node --import "$tsx_loader" packages/arc-framework/src/scripts/assert-roadmap-regenerated.ts',
    );
  });

  it("treats rejection output as an error and indeterminate output as a warning", () => {
    const block = selectCheckBlock(preCommitSource, "roadmap-regeneration-assert");

    expect(block).toContain("errors=$((errors + 1))");
    expect(block).toContain("warnings=$((warnings + 1))");
    expect(block).toContain("roadmap_assert_output");
  });

  it("documents the local-hook boundary for GitHub-side merges", () => {
    const block = selectCheckBlock(preCommitSource, "roadmap-regeneration-assert");

    expect(block).toContain("GitHub-side conflict resolution does not run local hooks");
  });
});
