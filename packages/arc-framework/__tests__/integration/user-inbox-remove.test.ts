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

import {
  markCurrentInboxEntriesExecuteBound,
  runUserInboxMutation,
  runUserInboxRemove,
  unmarkCurrentInboxEntry,
  withLockedUserInbox,
  type UserIOContext,
} from "../../src/commands/user.js";
import { contentDigest } from "../../src/lib/canonical/content-digest.js";
import { inboxEntrySourceDigest } from "../../src/lib/user-sync/index.js";
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

function io(exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
  if (args[0] === "rev-parse" && args[1] === "--git-common-dir") {
    return { stdout: join(cwd, ".git") + "\n", stderr: "" };
  }
  throw new Error(`unexpected git command: ${args.join(" ")}`);
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
    if (args[0] === "rev-parse" && args[1] === "--git-common-dir") {
      return { stdout: join(primary, ".git") + "\n", stderr: "" };
    }
    expect(args).toEqual(["worktree", "list", "--porcelain", "-z"]);
    return {
      stderr: "",
      stdout: `worktree ${primary}\0HEAD ${"1".repeat(40)}\0branch refs/heads/main\0\0`
        + `worktree ${linked}\0HEAD ${"2".repeat(40)}\0branch refs/heads/feat/demo\0\0`,
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

    expect(result).toMatchObject({ removed: true, inboxMissing: false, postImage: { state: "present" } });
    const after = await readFile(inboxPath, "utf-8");
    expect(after).not.toContain("Fix the flaky log assertion");
    expect(after).toContain("### `[ ]` **Keep me**");
  });

  it("is a no-op that leaves the file byte-identical when the entry is absent", async () => {
    const result = await runUserInboxRemove({ cwd, io: io(), identity: IDENTITY, slug: "Never captured" });

    expect(result).toMatchObject({ removed: false, inboxMissing: false, postImage: { state: "present" } });
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

    expect(result).toEqual({
      removed: false,
      inboxMissing: true,
      postImage: { state: "missing", content: null, digest: null },
    });
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

      expect(result).toMatchObject({ removed: true, inboxMissing: false, postImage: { state: "present" } });
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

describe("runUserInboxMutation", () => {
  it("digests an exact locked post-image without interpreting its contents", async () => {
    const malformed = "# User Inbox\n\n## Errand\n\n### malformed managed entry\n";
    await writeFile(inboxPath, malformed, "utf-8");

    const transaction = await withLockedUserInbox(
      { cwd, io: io(), identity: IDENTITY },
      ({ content }) => ({ result: content }),
    );

    expect(transaction.result).toBe(malformed);
    expect(transaction.postImage).toEqual({
      state: "present",
      content: malformed,
      digest: contentDigest(Buffer.from(malformed, "utf8")),
    });
  });

  it("atomically marks an exact batch and returns the bytes that reached disk", async () => {
    const titles = ["Fix the flaky log assertion", "Keep me"];

    const result = await markCurrentInboxEntriesExecuteBound({ cwd, io: io(), identity: IDENTITY, titles });

    expect(result.changed).toBe(true);
    expect(result.outcomes).toEqual(titles.map((title) => ({ title, state: "applied" })));
    expect(result.postImage.state).toBe("present");
    if (result.postImage.state !== "present") throw new Error("expected a present post-image");
    expect(await readFile(inboxPath, "utf-8")).toBe(result.postImage.content);
    expect(result.postImage.content.match(/- _Disposition:_ `execute-bound`/g)).toHaveLength(2);
  });

  it("serializes concurrent mark and remove writers without losing either update", async () => {
    const markDigest = inboxEntrySourceDigest(INBOX, "Keep me");
    const removeDigest = inboxEntrySourceDigest(INBOX, "Fix the flaky log assertion");

    const [marked, removed] = await Promise.all([
      runUserInboxMutation({
        cwd,
        io: io(),
        identity: IDENTITY,
        mutations: [{ kind: "mark", title: "Keep me", sourceDigest: markDigest }],
      }),
      runUserInboxMutation({
        cwd,
        io: io(),
        identity: IDENTITY,
        mutations: [{ kind: "remove", title: "Fix the flaky log assertion", sourceDigest: removeDigest }],
      }),
    ]);

    expect(marked.changed).toBe(true);
    expect(removed.changed).toBe(true);
    const content = await readFile(inboxPath, "utf-8");
    expect(content).not.toContain("Fix the flaky log assertion");
    expect(content).toContain("- _Disposition:_ `execute-bound`");
  });

  it("leaves the preimage intact when atomic replacement fails and releases the lock for retry", async () => {
    const mutation = {
      kind: "mark" as const,
      title: "Keep me",
      sourceDigest: inboxEntrySourceDigest(INBOX, "Keep me"),
    };

    await expect(runUserInboxMutation(
      { cwd, io: io(), identity: IDENTITY, mutations: [mutation] },
      { atomicReplace: async () => { throw new Error("replacement failed"); } },
    )).rejects.toThrow("replacement failed");
    expect(await readFile(inboxPath, "utf-8")).toBe(INBOX);

    const retry = await runUserInboxMutation({ cwd, io: io(), identity: IDENTITY, mutations: [mutation] });
    expect(retry.changed).toBe(true);
    expect(await readFile(inboxPath, "utf-8")).toContain("- _Disposition:_ `execute-bound`");
  });

  it("clears only the execute-bound flag and keeps the capture", async () => {
    const title = "Fix the flaky log assertion";
    await runUserInboxMutation({
      cwd,
      io: io(),
      identity: IDENTITY,
      mutations: [{
        kind: "mark",
        title,
        sourceDigest: inboxEntrySourceDigest(INBOX, title),
      }],
    });

    const cleared = await unmarkCurrentInboxEntry({
      cwd,
      io: io(),
      identity: IDENTITY,
      title,
    });
    expect(cleared.changed).toBe(true);
    expect(await readFile(inboxPath, "utf-8")).toBe(INBOX);

    await expect(unmarkCurrentInboxEntry({
      cwd,
      io: io(),
      identity: IDENTITY,
      title,
    })).resolves.toMatchObject({ changed: false });
  });
});
