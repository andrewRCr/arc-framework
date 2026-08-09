/**
 * Managed user-reference planning and lock-bound apply behavior.
 */

import { describe, expect, it } from "vitest";

import {
  analyzeUserReferenceAuthority,
  materializeUserReferenceAuthority,
  planUserReferenceReconcile,
  projectUserReferenceSessionResult,
  resolveUserReferenceAuthority,
  runUserReferenceReconcile,
} from "../../src/lib/user-reference-reconcile.js";
import { GitProcessError } from "../../src/lib/git/process-error.js";

const BASE_OID = "b".repeat(40);

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
        return { status: "valid", groups: [] };
      },
    });
    const partial = await resolveUserReferenceAuthority({
      protection: "partial",
      baseBranch: "main",
      refreshRemoteBase: () => Promise.reject(new Error("must not fetch")),
      enumerateAt: async (ref) => {
        refs.push(ref);
        return { status: "valid", groups: [] };
      },
    });
    const full = await resolveUserReferenceAuthority({
      protection: "full",
      baseBranch: "main",
      refreshRemoteBase: () => Promise.resolve(true),
      enumerateAt: async (ref) => {
        refs.push(ref);
        return { status: "valid", groups: [] };
      },
    });

    expect(fullUnavailable).toEqual({ status: "unavailable", ref: "origin/main" });
    expect(partial).toMatchObject({ status: "ready", ref: "main" });
    expect(full).toMatchObject({ status: "ready", ref: "origin/main" });
    expect(refs).toEqual(["main", "origin/main"]);
  });

  it("preserves reconciliation planning at a locally available advertised base OID", async () => {
    const refs: string[] = [];
    const authority = await analyzeUserReferenceAuthority({
      protection: "full",
      baseBranch: "main",
      snapshot: { kind: "available", scope: "exact", tips: { main: BASE_OID } },
      objectAvailability: { kind: "complete", commits: { [BASE_OID]: true } },
      enumerateAt: async (ref) => {
        refs.push(ref);
        return { status: "valid", groups: [] };
      },
    });

    expect(authority).toMatchObject({
      status: "ready",
      ref: BASE_OID,
      transitions: [],
      remoteEvidence: "exact",
    });
    if (authority.status !== "ready") throw new Error("expected exact authority");
    expect(projectUserReferenceSessionResult(authority, {
      userInbox: { path: "USER-INBOX.md", content: inbox },
    })).toMatchObject({ status: "clean", plan: { status: "clean" } });
    expect(refs).toEqual([BASE_OID]);
  });

  it("offers no remedy when no remote evidence was required", () => {
    // Remote sync off or no remote configured is a deliberate configuration, not a
    // failed read. Surfacing here would report a transient fault the operator cannot
    // act on, for a state they chose.
    const authority = {
      status: "unavailable",
      ref: "origin/main",
      reason: "remote-not-required",
      remoteEvidence: "not-applicable",
    } as const;

    expect(projectUserReferenceSessionResult(authority, {
      userInbox: { path: "USER-INBOX.md", content: "" },
    })).toMatchObject({
      status: "unavailable",
      plan: null,
      recommendedAction: "skip",
      recommendedPromptText: "",
    });
  });

  it("still surfaces an unreachable remote as an authority it cannot establish", () => {
    const authority = {
      status: "unavailable",
      ref: "origin/main",
      remoteEvidence: "unreachable",
      failureReason: "network",
    } as const;

    expect(projectUserReferenceSessionResult(authority, {
      userInbox: { path: "USER-INBOX.md", content: "" },
    })).toMatchObject({ recommendedAction: "surface" });
  });

  it("returns typed pending authority when the advertised base object is missing", async () => {
    let enumerated = false;
    await expect(analyzeUserReferenceAuthority({
      protection: "full",
      baseBranch: "main",
      snapshot: { kind: "available", scope: "exact", tips: { main: BASE_OID } },
      objectAvailability: { kind: "complete", commits: { [BASE_OID]: false } },
      enumerateAt: async () => {
        enumerated = true;
        return { status: "valid", groups: [] };
      },
    })).resolves.toEqual({
      status: "pending",
      ref: BASE_OID,
      reason: "base-object-pending-fetch",
      remoteEvidence: "pending-fetch",
    });
    expect(enumerated).toBe(false);
  });

  it("returns typed unavailable authority when remote evidence is unreachable", async () => {
    let enumerated = false;
    await expect(analyzeUserReferenceAuthority({
      protection: "full",
      baseBranch: "main",
      snapshot: { kind: "unreachable", failureReason: "auth" },
      objectAvailability: { kind: "complete", commits: {} },
      enumerateAt: async () => {
        enumerated = true;
        return { status: "valid", groups: [] };
      },
    })).resolves.toEqual({
      status: "unavailable",
      ref: "origin/main",
      remoteEvidence: "unreachable",
      failureReason: "auth",
    });
    expect(enumerated).toBe(false);
  });

  it("returns exact unavailable authority when the advertised base is absent", async () => {
    let enumerated = false;
    await expect(analyzeUserReferenceAuthority({
      protection: "full",
      baseBranch: "main",
      snapshot: { kind: "available", scope: "all-heads", tips: {} },
      objectAvailability: { kind: "unavailable", reason: "execution" },
      enumerateAt: async () => {
        enumerated = true;
        return { status: "valid", groups: [] };
      },
    })).resolves.toEqual({
      status: "unavailable",
      ref: "origin/main",
      reason: "remote-base-absent",
      remoteEvidence: "exact",
    });
    expect(enumerated).toBe(false);
  });

  it("retains local-base authority under partial protection", async () => {
    const refs: string[] = [];
    await expect(analyzeUserReferenceAuthority({
      protection: "partial",
      baseBranch: "main",
      snapshot: { kind: "unreachable", failureReason: "network" },
      objectAvailability: { kind: "unavailable", reason: "execution" },
      enumerateAt: async (ref) => {
        refs.push(ref);
        return { status: "valid", groups: [] };
      },
    })).resolves.toMatchObject({
      status: "ready",
      ref: "main",
      transitions: [],
      remoteEvidence: "not-applicable",
    });
    expect(refs).toEqual(["main"]);
  });

  it("propagates unexpected retirement-record enumeration failure", async () => {
    await expect(analyzeUserReferenceAuthority({
      protection: "full",
      baseBranch: "main",
      snapshot: { kind: "available", scope: "exact", tips: { main: BASE_OID } },
      objectAvailability: { kind: "complete", commits: { [BASE_OID]: true } },
      enumerateAt: () => Promise.reject(new Error("enumeration failed")),
    })).rejects.toThrow("enumeration failed");
  });

  it("supplies exact authority after explicit full-protection materialization", async () => {
    const calls: string[][] = [];
    const authority = await materializeUserReferenceAuthority({
      exec: async (_command, args, options) => {
        calls.push(args);
        if (args[0] === "check-ref-format") return { stdout: "" };
        if (args[0] === "fetch") {
          expect(options?.diagnosticLocale).toBe("stable");
          return { stdout: "" };
        }
        if (args[0] === "rev-parse") return { stdout: `${BASE_OID}\n` };
        throw new Error(`unexpected git invocation: ${args.join(" ")}`);
      },
      protection: "full",
      baseBranch: "main",
      enumerateAt: (ref) => Promise.resolve(
        ref === BASE_OID ? { status: "valid", groups: [] } : { status: "namespace-corrupt" },
      ),
    });

    expect(authority).toMatchObject({ status: "ready", ref: BASE_OID, remoteEvidence: "exact" });
    expect(calls).toEqual([
      ["check-ref-format", "refs/heads/main"],
      ["fetch", "origin", "+refs/heads/main:refs/remotes/origin/main"],
      ["rev-parse", "--verify", "refs/remotes/origin/main^{commit}"],
    ]);
  });

  it("preserves exact remote-base absence without reading a stale tracking ref", async () => {
    const calls: string[][] = [];
    const result = await materializeUserReferenceAuthority({
      exec: async (_command, args) => {
        calls.push(args);
        if (args[0] === "check-ref-format") return { stdout: "" };
        throw new GitProcessError({
          kind: "nonzero-exit",
          command: "git",
          args,
          exitCode: 128,
          expectedOutcome: "absent-remote-ref",
        });
      },
      protection: "full",
      baseBranch: "main",
      enumerateAt: () => Promise.reject(new Error("must not enumerate")),
    });

    expect(result).toEqual({
      status: "unavailable",
      ref: "origin/main",
      reason: "remote-base-absent",
      remoteEvidence: "exact",
    });
    expect(calls).toEqual([
      ["check-ref-format", "refs/heads/main"],
      ["fetch", "origin", "+refs/heads/main:refs/remotes/origin/main"],
    ]);
  });

  it("rejects an unsafe configured base before any Git invocation", async () => {
    let invoked = false;
    await expect(materializeUserReferenceAuthority({
      exec: async () => {
        invoked = true;
        return { stdout: "" };
      },
      protection: "full",
      baseBranch: "-unsafe",
      enumerateAt: async () => ({ status: "valid", groups: [] }),
    })).rejects.toThrow("Unsafe base ref");
    expect(invoked).toBe(false);
  });

  it.each([
    ["timeout", (_args: string[], signal?: AbortSignal) => new Promise<never>((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(Object.assign(new Error("canceled"), { isCanceled: true })));
    }), "timeout"],
    ["network", () => Promise.reject(Object.assign(new Error("fetch failed"), {
      exitCode: 128,
      stderr: "fatal: Could not resolve host remote.example",
    })), "network"],
    ["authentication", () => Promise.reject(Object.assign(new Error("fetch failed"), {
      exitCode: 128,
      stderr: "fatal: Authentication failed",
    })), "auth"],
    ["local metadata denial", () => Promise.reject(new Error("cannot lock ref: operation not permitted")), "error"],
  ] as const)("returns typed unavailable authority on %s", async (_label, fail, failureReason) => {
    let enumerated = false;
    const result = await materializeUserReferenceAuthority({
      exec: async (_command, args, options) => {
        if (args[0] === "check-ref-format") return { stdout: "" };
        if (args[0] !== "fetch") throw new Error(`unexpected git invocation: ${args.join(" ")}`);
        return fail(args, options?.signal);
      },
      protection: "full",
      baseBranch: "main",
      fetchTimeoutMs: 5,
      enumerateAt: async () => {
        enumerated = true;
        return { status: "valid", groups: [] };
      },
    });

    expect(result).toEqual({
      status: "unavailable",
      ref: "origin/main",
      remoteEvidence: "unreachable",
      failureReason,
    });
    expect(enumerated).toBe(false);
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
