import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const tsxLoader = import.meta.resolve("tsx");
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const formatTables = join(repositoryRoot, "packages/arc-framework/src/scripts/format-tables.ts");

let fixtureParent: string | undefined;

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

async function writeFixtureFile(root: string, path: string, content: string): Promise<void> {
  const target = join(root, ...path.split("/"));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

afterEach(async () => {
  if (fixtureParent !== undefined) await rm(fixtureParent, { recursive: true, force: true });
  fixtureParent = undefined;
});

describe("format:tables entry point", () => {
  it("atomically formats an explicit tracked path and reports an idempotent retry", async () => {
    fixtureParent = await mkdtemp(join(tmpdir(), "arc-format-tables-e2e-"));
    const primary = join(fixtureParent, "primary");
    const linked = join(fixtureParent, "linked");
    await mkdir(primary);
    await git(primary, ["init", "-q", "-b", "main"]);
    await git(primary, ["config", "user.email", "test@example.com"]);
    await git(primary, ["config", "user.name", "Test User"]);
    await writeFixtureFile(primary, "packages/arc-framework/init-recipe.json", JSON.stringify({
      prompts: [],
      include_files: [],
      conditions: {},
    }));
    await writeFixtureFile(primary, ".arc/system/.internal/manifest.json", JSON.stringify({
      schema_version: 1,
      framework_version: "test",
      installed_at: "2026-07-20",
      install_config: { project_name: "Demo", pm_mode: "arc-in-git", tools: [] },
      files: {},
    }));
    await writeFixtureFile(primary, "docs/table.md", "| A |\n| - |\n| 表 |\n");
    await git(primary, ["add", "--all"]);
    await git(primary, ["commit", "-q", "-m", "fixture"]);
    await git(primary, ["worktree", "add", "-q", "-b", "linked-e2e", linked]);
    const nested = join(linked, "nested");
    await mkdir(nested);

    const first = await execFileAsync(process.execPath, ["--import", tsxLoader, formatTables, "docs/table.md"], {
      cwd: nested,
      encoding: "utf8",
    });
    expect(first.stdout).toMatch(/^formatted docs\/table\.md \[\d+,\d+\)\n$/u);
    expect(await readFile(join(linked, "docs/table.md"), "utf8"))
      .toBe("| A  |\n| -- |\n| 表 |\n");

    const second = await execFileAsync(process.execPath, ["--import", tsxLoader, formatTables, "docs/table.md"], {
      cwd: nested,
      encoding: "utf8",
    });
    expect(second.stdout).toBe("unchanged docs/table.md\n");
  });
});
