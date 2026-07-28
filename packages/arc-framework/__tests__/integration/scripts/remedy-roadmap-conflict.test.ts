/**
 * Process-level coverage for the ROADMAP conflict remedy entry point.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import {
  ROADMAP_MERGE_ATTRIBUTE,
  ROADMAP_MERGE_DRIVER_COMMAND,
} from "../../../src/lib/setup.js";

const testDir = fileURLToPath(new URL(".", import.meta.url));
const packageRoot = join(testDir, "..", "..", "..");
const scriptPath = join(packageRoot, "src", "scripts", "remedy-roadmap-conflict.ts");
const tsxCliPath = fileURLToPath(import.meta.resolve("tsx/cli"));

describe("ROADMAP conflict remedy script", () => {
  it("reports unexpected Git failures without an unhandled rejection", () => {
    const cwd = mkdtempSync(join(tmpdir(), "arc-roadmap-remedy-"));
    try {
      const result = spawnSync(process.execPath, [tsxCliPath, scriptPath], {
        cwd,
        encoding: "utf8",
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/^ROADMAP conflict auto-remedy failed:/u);
      expect(result.stderr).not.toContain("node:internal/process/promises");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("surfaces the regenerate-and-stage remedy when ROADMAP conflicts during merge", () => {
    const cwd = mkdtempSync(join(tmpdir(), "arc-roadmap-merge-driver-"));
    const git = (...args: string[]) => spawnSync("git", args, {
      cwd,
      encoding: "utf8",
    });

    try {
      expect(git("init", "-b", "main").status).toBe(0);
      expect(git("config", "user.name", "ARC Test").status).toBe(0);
      expect(git("config", "user.email", "arc@example.test").status).toBe(0);
      expect(git("config", "merge.arc-roadmap.driver", ROADMAP_MERGE_DRIVER_COMMAND).status).toBe(0);

      mkdirSync(join(cwd, ".arc", "backlog"), { recursive: true });
      writeFileSync(join(cwd, ".gitattributes"), `${ROADMAP_MERGE_ATTRIBUTE}\n`);
      writeFileSync(join(cwd, ".arc", "backlog", "ROADMAP.md"), "# Roadmap\n\nbase\n");
      expect(git("add", ".").status).toBe(0);
      expect(git("commit", "-m", "base").status).toBe(0);

      expect(git("switch", "-c", "incoming").status).toBe(0);
      writeFileSync(join(cwd, ".arc", "backlog", "ROADMAP.md"), "# Roadmap\n\nincoming\n");
      expect(git("commit", "-am", "incoming").status).toBe(0);

      expect(git("switch", "main").status).toBe(0);
      writeFileSync(join(cwd, ".arc", "backlog", "ROADMAP.md"), "# Roadmap\n\ncurrent\n");
      expect(git("commit", "-am", "current").status).toBe(0);

      const merge = git("merge", "incoming");
      expect(merge.status).toBe(1);
      expect(`${merge.stdout}${merge.stderr}`).toContain(
        "arc hook-remedy-roadmap-conflict",
      );
      expect(readFileSync(
        join(cwd, ".arc", "backlog", "ROADMAP.md"),
        "utf8",
      )).toContain("<<<<<<<");
      expect(git("diff", "--name-only", "--diff-filter=U").stdout.trim()).toBe(
        ".arc/backlog/ROADMAP.md",
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("preserves non-overlapping ROADMAP changes without surfacing the remedy", () => {
    const cwd = mkdtempSync(join(tmpdir(), "arc-roadmap-clean-merge-driver-"));
    const git = (...args: string[]) => spawnSync("git", args, {
      cwd,
      encoding: "utf8",
    });
    const roadmapPath = join(cwd, ".arc", "backlog", "ROADMAP.md");

    try {
      expect(git("init", "-b", "main").status).toBe(0);
      expect(git("config", "user.name", "ARC Test").status).toBe(0);
      expect(git("config", "user.email", "arc@example.test").status).toBe(0);
      expect(git("config", "merge.arc-roadmap.driver", ROADMAP_MERGE_DRIVER_COMMAND).status).toBe(0);

      mkdirSync(join(cwd, ".arc", "backlog"), { recursive: true });
      writeFileSync(join(cwd, ".gitattributes"), `${ROADMAP_MERGE_ATTRIBUTE}\n`);
      writeFileSync(roadmapPath, "# Roadmap\n\nalpha\nmiddle\nomega\n");
      expect(git("add", ".").status).toBe(0);
      expect(git("commit", "-m", "base").status).toBe(0);

      expect(git("switch", "-c", "incoming").status).toBe(0);
      writeFileSync(roadmapPath, "# Roadmap\n\nincoming alpha\nmiddle\nomega\n");
      expect(git("commit", "-am", "incoming").status).toBe(0);

      expect(git("switch", "main").status).toBe(0);
      writeFileSync(roadmapPath, "# Roadmap\n\nalpha\nmiddle\ncurrent omega\n");
      expect(git("commit", "-am", "current").status).toBe(0);

      const merge = git("merge", "--no-edit", "incoming");
      expect(merge.status).toBe(0);
      expect(`${merge.stdout}${merge.stderr}`).not.toContain(
        "arc hook-remedy-roadmap-conflict",
      );
      expect(readFileSync(roadmapPath, "utf8")).toBe(
        "# Roadmap\n\nincoming alpha\nmiddle\ncurrent omega\n",
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
