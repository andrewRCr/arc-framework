/**
 * Integration tests for `runUserInboxRemove` — the command layer that resolves
 * the developer's `USER-INBOX.md`, drops the slug-matched entry, and writes back
 * only when a removal occurred. The removal itself is unit-tested in
 * `user-sync-inbox-writer.test.ts`; here we cover the file-resolution, the
 * write-only-on-change discipline, and the two no-op paths (absent entry,
 * missing inbox).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runUserInboxRemove } from "../../src/commands/user.js";

const IDENTITY = "tester";

const INBOX = `# User Inbox

## Atomic

> _Single-step captures._

### \`[ ]\` **Fix the flaky log assertion**

- _Observation:_ the errand target.

### \`[ ]\` **Keep me**

- _Observation:_ unrelated capture.
`;

let cwd: string;
let inboxPath: string;

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
    const result = await runUserInboxRemove({ cwd, identity: IDENTITY, slug: "Fix the flaky log assertion" });

    expect(result).toEqual({ removed: true, inboxMissing: false });
    const after = await readFile(inboxPath, "utf-8");
    expect(after).not.toContain("Fix the flaky log assertion");
    expect(after).toContain("### `[ ]` **Keep me**");
  });

  it("is a no-op that leaves the file byte-identical when the entry is absent", async () => {
    const result = await runUserInboxRemove({ cwd, identity: IDENTITY, slug: "Never captured" });

    expect(result).toEqual({ removed: false, inboxMissing: false });
    expect(await readFile(inboxPath, "utf-8")).toBe(INBOX);
  });

  it("is a no-op when the developer has no USER-INBOX, without creating one", async () => {
    await rm(inboxPath);

    const result = await runUserInboxRemove({ cwd, identity: IDENTITY, slug: "Fix the flaky log assertion" });

    expect(result).toEqual({ removed: false, inboxMissing: true });
    await expect(readFile(inboxPath, "utf-8")).rejects.toThrow();
  });
});
