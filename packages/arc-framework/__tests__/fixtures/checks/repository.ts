/** Repository content shared by built-CLI check fixtures. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepoCore } from "../../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);

/** Create a committed declaration with one worktree input change. */
export async function createDeclaredCheckRepository(checks: Record<string, unknown>, declaration: Record<string, unknown> = {}): Promise<string> {
  const cwd = await createTempRepoCore({ prefix: "arc-increment-declared-" });
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await mkdir(join(cwd, "src"));
  await mkdir(join(cwd, "docs"));
  await writeFile(join(cwd, ".gitignore"), "receipt.json\n");
  await writeFile(join(cwd, "src/a.ts"), "base\n");
  await writeFile(join(cwd, "src/deleted.ts"), "deleted\n");
  await writeFile(join(cwd, "docs/b.md"), "base\n");
  await writeFile(join(cwd, "capture.cjs"), "require('node:fs').writeFileSync('receipt.json', JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }));\n");
  await writeFile(join(cwd, ".arc/system/arc-checks.yml"), JSON.stringify({ ...declaration, checks }));
  await execFileAsync("git", ["add", "-A"], { cwd });
  await execFileAsync("git", ["commit", "-m", "base"], { cwd });
  await writeFile(join(cwd, "src/a.ts"), "changed\n");
  return cwd;
}

