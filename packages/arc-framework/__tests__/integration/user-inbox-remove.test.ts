/**
 * Integration tests for `runUserInboxRemove` — the command layer that resolves
 * the developer's `USER-INBOX.md`, drops the slug-matched entry, and writes back
 * only when a removal occurred. The removal itself is unit-tested in
 * `user-sync-inbox-writer.test.ts`; here we cover the file-resolution, the
 * write-only-on-change discipline, and the two no-op paths (absent entry,
 * missing inbox).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runUserInboxRemove, type UserIOContext } from "../../src/commands/user.js";
import type { ExecResult, GitExec } from "../../src/lib/git/exec.js";

const IDENTITY = "tester";

const INBOX = `# User Inbox

## Errand

> _Single-step captures._

### \`[ ]\` **Fix the flaky log assertion**

- _Observation:_ the errand target.

### \`[ ]\` **Keep me**

- _Observation:_ unrelated capture.
`;

let cwd: string;
let inboxPath: string;

function io(exec: GitExec = vi.fn(async () => {
  throw new Error("not a git repo");
})): UserIOContext {
  return {
    exec,
    readFile: (path) => readFile(path, "utf-8"),
    writeFile: (path, content) => writeFile(path, content, "utf-8"),
    mkdir: (path, opts) => mkdir(path, opts).then(() => undefined),
    readDir: async () => [],
    writeNote: async () => undefined,
    readNote: async () => null,
  };
}

function execReturningWorktrees(primary: string, linked: string): GitExec {
  return vi.fn(async (_cmd, args): Promise<ExecResult> => {
    expect(args).toEqual(["worktree", "list", "--porcelain"]);
    return {
      stderr: "",
      stdout: [
        `worktree ${primary}`,
        "HEAD 1111111111111111111111111111111111111111",
        "branch refs/heads/main",
        "",
        `worktree ${linked}`,
        "HEAD 2222222222222222222222222222222222222222",
        "branch refs/heads/feat/demo",
        "",
      ].join("\n"),
    };
  });
}

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "arc-inbox-remove-"));
  const userDir = join(cwd, ".arc", "user", IDENTITY);
  await mkdir(userDir, { recursive: true });
  inboxPath = join(userDir, "USER-INBOX.md");
  await writeFile(inboxPath, INBOX, "utf-8");
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe("runUserInboxRemove", () => {
  it("drops the matched entry on disk and reports the removal", async () => {
    const result = await runUserInboxRemove({
      cwd,
      io: io(),
      identity: IDENTITY,
      slug: "Fix the flaky log assertion",
    });

    expect(result).toEqual({ removed: true, inboxMissing: false });
    const after = await readFile(inboxPath, "utf-8");
    expect(after).not.toContain("Fix the flaky log assertion");
    expect(after).toContain("### `[ ]` **Keep me**");
  });

  it("is a no-op that leaves the file byte-identical when the entry is absent", async () => {
    const result = await runUserInboxRemove({ cwd, io: io(), identity: IDENTITY, slug: "Never captured" });

    expect(result).toEqual({ removed: false, inboxMissing: false });
    expect(await readFile(inboxPath, "utf-8")).toBe(INBOX);
  });

  it("is a no-op when the developer has no USER-INBOX, without creating one", async () => {
    await rm(inboxPath);

    const result = await runUserInboxRemove({
      cwd,
      io: io(),
      identity: IDENTITY,
      slug: "Fix the flaky log assertion",
    });

    expect(result).toEqual({ removed: false, inboxMissing: true });
    await expect(readFile(inboxPath, "utf-8")).rejects.toThrow();
  });

  it("removes from the primary worktree inbox when invoked from a linked worktree", async () => {
    const primary = cwd;
    const linked = await mkdtemp(join(tmpdir(), "arc-inbox-remove-linked-"));
    try {
      const result = await runUserInboxRemove({
        cwd: linked,
        io: io(execReturningWorktrees(primary, linked)),
        identity: IDENTITY,
        slug: "Fix the flaky log assertion",
      });

      expect(result).toEqual({ removed: true, inboxMissing: false });
      const after = await readFile(inboxPath, "utf-8");
      expect(after).not.toContain("Fix the flaky log assertion");
      expect(after).toContain("### `[ ]` **Keep me**");
      await expect(readFile(join(linked, ".arc", "user", IDENTITY, "USER-INBOX.md"), "utf-8"))
        .rejects.toThrow();
    } finally {
      await rm(linked, { recursive: true, force: true });
    }
  });
});
