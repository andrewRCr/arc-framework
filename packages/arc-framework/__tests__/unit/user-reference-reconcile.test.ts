/**
 * Managed user-reference planning and lock-bound apply behavior.
 */

import { describe, expect, it } from "vitest";

import {
  planUserReferenceReconcile,
  resolveUserReferenceAuthority,
  runUserReferenceReconcile,
} from "../../src/lib/user-reference-reconcile.js";

const inbox = `# User Inbox

## Errand

### \`[ ]\` **Not managed here**

- _WU_Target:_ \`origin\`

## Work Unit

### \`[ ]\` **Existing target**

- _WU_Target:_ \`origin (planned)\`

### \`[ ]\` **Unmanaged spelling**

- WU_Target: origin

---
`;

describe("planUserReferenceReconcile", () => {
  it("rewrites only an exact Work Unit WU_Target and preserves its suffix", () => {
    const result = planUserReferenceReconcile({
      transitions: [{ subject: "origin", outcome: { kind: "rename", targetSlug: "successor" } }],
      userInbox: { path: "USER-INBOX.md", content: inbox },
      workingMemory: { path: "WORKING-MEMORY.md", content: "origin remains prose\n" },
      sessionNotes: { path: "SESSION-NOTES.md", content: "origin remains prose\n" },
    });

    expect(result).toMatchObject({
      status: "pending",
      edits: [{
        path: "USER-INBOX.md",
        replacements: [{ subject: "origin", targetSlug: "successor" }],
      }],
    });
    expect(result.advisories).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "WORKING-MEMORY.md", subject: "origin", kind: "prose" }),
      expect.objectContaining({ path: "SESSION-NOTES.md", subject: "origin", kind: "prose" }),
    ]));
    expect(result.edits[0]?.content).toContain("- _WU_Target:_ `successor (planned)`");
    expect(result.edits[0]?.content).toContain(
      "## Errand\n\n### `[ ]` **Not managed here**\n\n- _WU_Target:_ `origin`",
    );
    expect(result.edits[0]?.content).toContain(
      "### `[ ]` **Unmanaged spelling**\n\n- WU_Target: origin",
    );
  });

  it("re-reads under the lock and preserves a sibling edit before atomic apply", async () => {
    let current = inbox;
    const result = await runUserReferenceReconcile({
      transitions: [{ subject: "origin", outcome: { kind: "rename", targetSlug: "successor" } }],
      apply: true,
      readSurfaces: () => Promise.resolve({
        userInbox: { path: "USER-INBOX.md", content: current },
      }),
      acquireLock: async () => {
        current = current.replace("\n---\n", "\n### `[ ]` **Sibling edit**\n\n- detail\n\n---\n");
        return { token: "held" };
      },
      releaseLock: () => Promise.resolve(),
      atomicWrite: async (_path, content) => { current = content; },
    });

    expect(result.status).toBe("applied");
    expect(current).toContain("- _WU_Target:_ `successor (planned)`");
    expect(current).toContain("### `[ ]` **Sibling edit**");
  });

  it("uses only refreshed remote-base evidence under full protection and local base under partial", async () => {
    const refs: string[] = [];
    const fullUnavailable = await resolveUserReferenceAuthority({
      protection: "full",
      baseBranch: "main",
      refreshRemoteBase: () => Promise.resolve(false),
      enumerateAt: async (ref) => {
        refs.push(ref);
        return { status: "valid", records: [] };
      },
    });
    const partial = await resolveUserReferenceAuthority({
      protection: "partial",
      baseBranch: "main",
      refreshRemoteBase: () => Promise.reject(new Error("must not fetch")),
      enumerateAt: async (ref) => {
        refs.push(ref);
        return { status: "valid", records: [] };
      },
    });
    const full = await resolveUserReferenceAuthority({
      protection: "full",
      baseBranch: "main",
      refreshRemoteBase: () => Promise.resolve(true),
      enumerateAt: async (ref) => {
        refs.push(ref);
        return { status: "valid", records: [] };
      },
    });

    expect(fullUnavailable).toEqual({ status: "unavailable", ref: "origin/main" });
    expect(partial).toMatchObject({ status: "ready", ref: "main" });
    expect(full).toMatchObject({ status: "ready", ref: "origin/main" });
    expect(refs).toEqual(["main", "origin/main"]);
  });

  it("keeps decompose targets and ordinary prose advisory-only", () => {
    const result = planUserReferenceReconcile({
      transitions: [{ subject: "origin", outcome: { kind: "decompose" } }],
      userInbox: { path: "USER-INBOX.md", content: inbox },
      workingMemory: { path: "WORKING-MEMORY.md", content: "origin\n" },
    });

    expect(result.status).toBe("advisory");
    expect(result.edits).toEqual([]);
    expect(result.advisories).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "USER-INBOX.md", kind: "terminal" }),
      expect.objectContaining({ path: "WORKING-MEMORY.md", kind: "terminal" }),
    ]));
  });

  it("releases the lock and leaves disk unchanged when the atomic writer fails", async () => {
    const current = inbox;
    let released = false;

    await expect(runUserReferenceReconcile({
      transitions: [{ subject: "origin", outcome: { kind: "rename", targetSlug: "successor" } }],
      apply: true,
      readSurfaces: () => Promise.resolve({
        userInbox: { path: "USER-INBOX.md", content: current },
      }),
      acquireLock: () => Promise.resolve({ token: "held" }),
      releaseLock: async () => { released = true; },
      atomicWrite: () => Promise.reject(new Error("write failed")),
    })).rejects.toThrow("write failed");

    expect(current).toBe(inbox);
    expect(released).toBe(true);
  });

  it("leaves disk unchanged when lock acquisition fails", async () => {
    let current = inbox;
    let wrote = false;

    await expect(runUserReferenceReconcile({
      transitions: [{ subject: "origin", outcome: { kind: "rename", targetSlug: "successor" } }],
      apply: true,
      readSurfaces: () => Promise.resolve({
        userInbox: { path: "USER-INBOX.md", content: current },
      }),
      acquireLock: () => Promise.reject(new Error("lock unavailable")),
      releaseLock: () => Promise.resolve(),
      atomicWrite: async (_path, content) => {
        wrote = true;
        current = content;
      },
    })).rejects.toThrow("lock unavailable");

    expect(current).toBe(inbox);
    expect(wrote).toBe(false);
  });
});
