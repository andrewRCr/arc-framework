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

  it("surfaces and applies the regenerate-and-stage remedy when ROADMAP conflicts during merge", () => {
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
      mkdirSync(join(cwd, ".arc", "system"), { recursive: true });
      writeFileSync(join(cwd, ".gitattributes"), `${ROADMAP_MERGE_ATTRIBUTE}\n`);
      writeFileSync(join(cwd, ".arc", "system", "arc-config.yml"), "branch.base: main\n");
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

      const remedy = spawnSync(process.execPath, [tsxCliPath, scriptPath], {
        cwd,
        encoding: "utf8",
      });
      expect(remedy.status).toBe(0);
      expect(remedy.stdout).toContain("Auto-remedied ROADMAP-only conflict");
      expect(git("diff", "--name-only", "--diff-filter=U").stdout).toBe("");
      const roadmap = readFileSync(
        join(cwd, ".arc", "backlog", "ROADMAP.md"),
        "utf8",
      );
      expect(roadmap).toContain("# Roadmap: Project Status");
      expect(roadmap).toContain("_No work units in flight._");
      expect(roadmap).toContain("_No ready work units._");
      expect(roadmap).toContain("_No blocked work units._");
      expect(roadmap).not.toContain("<<<<<<<");
      expect(roadmap).not.toContain("\ncurrent\n");
      expect(roadmap).not.toContain("\nincoming\n");
      expect(git("show", ":.arc/backlog/ROADMAP.md").stdout).toBe(roadmap);
      expect(git(
        "diff",
        "--cached",
        "--name-only",
      ).stdout.trim()).toBe(".arc/backlog/ROADMAP.md");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("accepts a stale-branch merge whose candidate tree repairs the retirement namespace", () => {
    const cwd = mkdtempSync(join(tmpdir(), "arc-roadmap-repaired-authority-"));
    const git = (...args: string[]) => spawnSync("git", args, {
      cwd,
      encoding: "utf8",
    });
    const roadmapPath = join(cwd, ".arc", "backlog", "ROADMAP.md");
    const legacyReceiptFilename = `sha256-${"0".repeat(64)}.json`;
    const legacyReceiptRelativePath = [
      ".arc",
      "system",
      ".internal",
      "retirement-receipts",
      legacyReceiptFilename,
    ].join("/");
    const legacyReceiptPath = join(
      cwd,
      ".arc",
      "system",
      ".internal",
      "retirement-receipts",
      legacyReceiptFilename,
    );

    try {
      expect(git("init", "-b", "main").status).toBe(0);
      expect(git("config", "user.name", "ARC Test").status).toBe(0);
      expect(git("config", "user.email", "arc@example.test").status).toBe(0);
      expect(git("config", "merge.arc-roadmap.driver", ROADMAP_MERGE_DRIVER_COMMAND).status).toBe(0);

      mkdirSync(join(cwd, ".arc", "backlog"), { recursive: true });
      mkdirSync(
        join(cwd, ".arc", "system", ".internal", "retirement-receipts"),
        { recursive: true },
      );
      writeFileSync(join(cwd, ".gitattributes"), `${ROADMAP_MERGE_ATTRIBUTE}\n`);
      writeFileSync(join(cwd, ".arc", "system", "arc-config.yml"), "branch.base: main\n");
      writeFileSync(roadmapPath, "# Roadmap\n\nbase\n");
      writeFileSync(legacyReceiptPath, "{}\n");
      expect(git("add", ".").status).toBe(0);
      expect(git("commit", "-m", "base with legacy receipt").status).toBe(0);

      expect(git("switch", "-c", "stale").status).toBe(0);
      writeFileSync(roadmapPath, "# Roadmap\n\nstale branch\n");
      expect(git("commit", "-am", "stale branch").status).toBe(0);

      expect(git("switch", "main").status).toBe(0);
      expect(git("rm", "--", legacyReceiptRelativePath).status).toBe(0);
      writeFileSync(roadmapPath, "# Roadmap\n\ncurrent base\n");
      expect(git("commit", "-am", "prune legacy receipt").status).toBe(0);

      expect(git("switch", "stale").status).toBe(0);
      expect(git("merge", "main").status).toBe(1);
      expect(git("diff", "--name-only", "--diff-filter=U").stdout.trim()).toBe(
        ".arc/backlog/ROADMAP.md",
      );
      expect(git(
        "ls-files",
        "--",
        ".arc/system/.internal/retirement-receipts",
      ).stdout).toBe("");

      const remedy = spawnSync(process.execPath, [tsxCliPath, scriptPath], {
        cwd,
        encoding: "utf8",
      });

      expect(remedy.status).toBe(0);
      expect(remedy.stdout).toContain("Auto-remedied ROADMAP-only conflict");
      expect(remedy.stderr).toBe("");
      expect(git("diff", "--name-only", "--diff-filter=U").stdout).toBe("");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("preserves the exact unmerged ROADMAP state when transition authority is refused", () => {
    const cwd = mkdtempSync(join(tmpdir(), "arc-roadmap-refused-authority-"));
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
      mkdirSync(join(cwd, ".arc", "system"), { recursive: true });
      writeFileSync(join(cwd, ".gitattributes"), `${ROADMAP_MERGE_ATTRIBUTE}\n`);
      writeFileSync(join(cwd, ".arc", "system", "arc-config.yml"), "branch.base: main\n");
      writeFileSync(roadmapPath, "# Roadmap\n\nbase\n");
      expect(git("add", ".").status).toBe(0);
      expect(git("commit", "-m", "base").status).toBe(0);

      expect(git("switch", "-c", "incoming").status).toBe(0);
      mkdirSync(
        join(cwd, ".arc", "system", ".internal", "retirement-receipts"),
        { recursive: true },
      );
      writeFileSync(
        join(
          cwd,
          ".arc",
          "system",
          ".internal",
          "retirement-receipts",
          "not-a-receipt.json",
        ),
        "{}\n",
      );
      writeFileSync(roadmapPath, "# Roadmap\n\nincoming\n");
      expect(git("add", ".").status).toBe(0);
      expect(git("commit", "-m", "incoming").status).toBe(0);

      expect(git("switch", "main").status).toBe(0);
      writeFileSync(roadmapPath, "# Roadmap\n\ncurrent\n");
      expect(git("commit", "-am", "current").status).toBe(0);

      expect(git("merge", "incoming").status).toBe(1);
      const beforeRoadmap = readFileSync(roadmapPath, "utf8");
      const beforeUnmerged = git(
        "ls-files",
        "--unmerged",
        "-z",
        "--",
        ".arc/backlog/ROADMAP.md",
      ).stdout;
      expect(beforeUnmerged).not.toBe("");
      const beforeStatus = git("status", "--porcelain=v1", "-z").stdout;

      const remedy = spawnSync(process.execPath, [tsxCliPath, scriptPath], {
        cwd,
        encoding: "utf8",
      });

      expect(remedy.status).toBe(1);
      expect(remedy.stderr).toContain(
        "Merge transition authority was refused: namespace-corrupt",
      );
      expect(remedy.stderr).toMatch(
        /namespace-corrupt \(ref [0-9a-f]{40}, record \.arc\/system\/\.internal\/retirement-receipts\/not-a-receipt\.json\)/u,
      );
      expect(readFileSync(roadmapPath, "utf8")).toBe(beforeRoadmap);
      expect(git(
        "ls-files",
        "--unmerged",
        "-z",
        "--",
        ".arc/backlog/ROADMAP.md",
      ).stdout).toBe(beforeUnmerged);
      expect(git("status", "--porcelain=v1", "-z").stdout).toBe(beforeStatus);
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
