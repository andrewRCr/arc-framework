/**
 * Integration tests for pre-commit CHECK[meta-project-references] (meta-project references).
 *
 * The check scans staged production-code added lines for planning IDs.
 * A merge commit stages parent content as if it were author-added
 * (`git diff --cached` is vs HEAD). Merge-aware scanning keeps only lines
 * added against both parents — content already on HEAD or MERGE_HEAD stays
 * out of scope.
 */

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo } from "../helpers/integration.js";

const execFileAsync = promisify(execFile);
const hookPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
  "packages/arc-framework/arc/system/.internal/githooks/pre-commit",
);

// Constructed so this file itself does not contain a strict token.
const STRICT_SOURCE = `export const elementId = "${["R", "1"].join("")}";\n`;

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout;
}

async function writeRepoFile(cwd: string, relPath: string, content: string): Promise<void> {
  const full = join(cwd, relPath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}

async function commit(cwd: string, message: string): Promise<void> {
  await git(cwd, ["add", "-A"]);
  await git(cwd, ["commit", "-m", message]);
}

async function runHook(cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("bash", [hookPath], {
      cwd,
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

async function writeArcConfig(cwd: string): Promise<void> {
  await writeRepoFile(
    cwd,
    ".arc/system/arc-config.yml",
    ["hooks.pre_commit: enabled", "branch.protection: partial", "pm.mode: none", ""].join("\n"),
  );
}

describe("pre-commit CHECK[meta-project-references] (meta-project references)", () => {
  const fixtures: string[] = [];

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map((root) => cleanupTempDir(root)));
  });

  async function freshRepo(): Promise<string> {
    const root = await createTempRepo("arc-pre-commit-meta-ref-");
    fixtures.push(root);
    await writeArcConfig(root);
    await writeRepoFile(root, "README.md", "fixture\n");
    await commit(root, "initial");
    return root;
  }

  it("rejects a staged production-code R-code on a non-merge commit", async () => {
    const root = await freshRepo();
    await writeRepoFile(root, "src/domain.ts", STRICT_SOURCE);
    await git(root, ["add", "src/domain.ts"]);

    const result = await runHook(root);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("Meta-project references found in production code");
    expect(result.stdout).toContain("src/domain.ts");
  });

  it("does not re-trigger on incoming merge content that already landed", async () => {
    const root = await freshRepo();
    await git(root, ["checkout", "-b", "incoming"]);
    await writeRepoFile(root, "src/domain.ts", STRICT_SOURCE);
    await commit(root, "land domain id");
    await git(root, ["checkout", "main"]);
    await git(root, ["merge", "--no-ff", "--no-commit", "incoming"]);

    const result = await runHook(root);

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("Meta-project references found in production code");
  });

  it("does not re-trigger on current-branch content when incoming also edits the file", async () => {
    const root = await freshRepo();
    const padding = `${"// keep\n".repeat(8)}export const tail = "a";\n`;
    await writeRepoFile(root, "src/domain.ts", `export const name = "ok";\n\n${padding}`);
    await commit(root, "shared base");
    await git(root, ["checkout", "-b", "incoming"]);
    await writeRepoFile(root, "src/domain.ts", `export const name = "ok";\n\n${padding.replace('"a"', '"b"')}`);
    await commit(root, "incoming edits tail");
    await git(root, ["checkout", "main"]);
    await writeRepoFile(root, "src/domain.ts", `export const name = "ok";\n${STRICT_SOURCE}\n${padding}`);
    await commit(root, "land token on current branch");
    await git(root, ["merge", "--no-ff", "--no-commit", "incoming"]);

    const result = await runHook(root);

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("Meta-project references found in production code");
  });

  it("still rejects an R-code authored during the merge", async () => {
    const root = await freshRepo();
    await git(root, ["checkout", "-b", "incoming"]);
    await writeRepoFile(root, "src/domain.ts", 'export const name = "ok";\n');
    await commit(root, "land domain");
    await git(root, ["checkout", "main"]);
    await git(root, ["merge", "--no-ff", "--no-commit", "incoming"]);
    await writeRepoFile(root, "src/extra.ts", STRICT_SOURCE);
    await git(root, ["add", "src/extra.ts"]);

    const result = await runHook(root);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("Meta-project references found in production code");
    expect(result.stdout).toContain("src/extra.ts");
  });
});
