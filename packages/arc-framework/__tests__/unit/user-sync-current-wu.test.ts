/**
 * Unit tests for `resolveCurrentWuName` — derives the session's current
 * work-unit name (active-meta first, branch slug as fallback) for per-WU
 * user-notes sync.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { resolveCurrentWuName } from "../../src/lib/user-sync/index.js";

let root: string;
let activeDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "arc-current-wu-"));
  activeDir = join(root, ".arc", "active");
  await mkdir(activeDir, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writeMeta(name: string): Promise<void> {
  await writeFile(
    join(activeDir, `meta-${name}.md`),
    ["# Metadata: Sample", "", "- **State:** Active", "- **Branch:** feat/sample", ""].join("\n"),
  );
}

const branchExec = (branch: string) =>
  vi.fn(async () => ({ stdout: `${branch}\n`, stderr: "" }));

describe("resolveCurrentWuName", () => {
  it("returns the active-meta WU name when one resolves", async () => {
    await writeMeta("worktree-foundation");
    const exec = branchExec("feat/some-other-branch");

    const result = await resolveCurrentWuName(root, exec);

    expect(result).toBe("worktree-foundation");
    expect(exec).not.toHaveBeenCalled();
  });

  it("falls back to the branch slug when no active meta resolves", async () => {
    const exec = branchExec("feat/errand-thing");

    const result = await resolveCurrentWuName(root, exec);

    expect(result).toBe("errand-thing");
  });

  it("returns undefined when no meta resolves and the branch carries no WU slug", async () => {
    const exec = branchExec("main");

    const result = await resolveCurrentWuName(root, exec);

    expect(result).toBeUndefined();
  });
});
