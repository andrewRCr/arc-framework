/**
 * Unit tests for runErrand — the `arc errand` orchestrator. From any WU session
 * it resolves the primary worktree, composes a forward-pointing queue entry in
 * the managed-entry grammar, and direct-writes it into the primary worktree's
 * ERRANDS.md — creating no branch and no commit (zero git mutation). Composition
 * and the write are testable here; the classification + advisory judgment that
 * feed it are the skill's job, not the helper's.
 */

import { describe, it, expect } from "vitest";

import { runErrand } from "../../../src/commands/errand.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/index.js";

/** A two-worktree porcelain listing: primary first, then a linked WU worktree. */
const WORKTREE_LIST_STDOUT =
  "worktree /home/dev/repo\nHEAD aaa\nbranch refs/heads/main\n\n"
  + "worktree /home/dev/repo.wu-a\nHEAD bbb\nbranch refs/heads/feat/wu-a\n\n";

/** The seeded ERRANDS.md (h1 + callout + empty Queue + shape comment + EOF). */
const SEEDED_ERRANDS = [
  "# Errand Queue",
  "",
  "> _Committed-but-not-yet-executed errands._",
  "",
  "## Queue",
  "",
  "<!--",
  "Entry shape — the managed-entry grammar.",
  "-->",
  "",
  "---",
  "",
].join("\n");

/** A distinct template scaffold — lets a seeding assertion prove the scaffold (not a stale read) was used. */
const TEMPLATE_SCAFFOLD = [
  "# Errand Queue",
  "",
  "## Queue",
  "",
  "<!-- template scaffold -->",
  "",
  "---",
  "",
].join("\n");

interface Harness {
  io: {
    exec: GitExec;
    readFile: (p: string) => Promise<string>;
    writeFile: (p: string, c: string) => Promise<void>;
    readScaffold: () => Promise<string>;
  };
  calls: Array<{ cmd: string; args: string[] }>;
  written: Array<{ path: string; content: string }>;
}

/**
 * Build an injected IO harness: worktree-list exec, a write capture, a template
 * scaffold, and a queue read (the seeded content by default; pass `readFile` to
 * simulate an absent queue or a read error).
 */
function harness(errandsContent = SEEDED_ERRANDS, readFile?: () => Promise<string>): Harness {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const written: Array<{ path: string; content: string }> = [];
  const exec: GitExec = async (cmd, args) => {
    calls.push({ cmd, args });
    if (args[0] === "worktree" && args[1] === "list") {
      return { stdout: WORKTREE_LIST_STDOUT } satisfies ExecResult;
    }
    throw new Error(`unexpected git invocation: ${cmd} ${args.join(" ")}`);
  };
  return {
    io: {
      exec,
      readFile: readFile ?? (async () => errandsContent),
      writeFile: async (path, content) => {
        written.push({ path, content });
      },
      readScaffold: async () => TEMPLATE_SCAFFOLD,
    },
    calls,
    written,
  };
}

/** A filesystem "not found" rejection, as `readFile` throws for an absent path. */
function enoent(): NodeJS.ErrnoException {
  const err: NodeJS.ErrnoException = new Error("ENOENT: no such file or directory");
  err.code = "ENOENT";
  return err;
}

describe("runErrand", () => {
  it("writes the entry into the primary worktree's ERRANDS.md (not the linked worktree)", async () => {
    const h = harness();

    const outcome = await runErrand(h.io, {
      identity: "andrew",
      slug: "drain-inbox",
      goal: "Flush the deferred USER-INBOX captures",
      pointers: "user/andrew/USER-INBOX.md",
      created: "2026-05-29",
    });

    expect(outcome.ok).toBe(true);
    expect(h.written).toHaveLength(1);
    expect(h.written[0]?.path).toBe("/home/dev/repo/.arc/user/andrew/ERRANDS.md");
  });

  it("composes the managed-entry grammar from goal / pointers / chore-branch / created", async () => {
    const h = harness();

    await runErrand(h.io, {
      identity: "andrew",
      slug: "drain-inbox",
      goal: "Flush the deferred USER-INBOX captures",
      pointers: "user/andrew/USER-INBOX.md",
      created: "2026-05-29",
    });

    const content = h.written[0]?.content ?? "";
    expect(content).toContain("### `[ ]` **drain-inbox**");
    expect(content).toContain("- _Goal:_ Flush the deferred USER-INBOX captures");
    expect(content).toContain("- _Pointers:_ user/andrew/USER-INBOX.md");
    expect(content).toContain("- _Branch:_ `chore/drain-inbox`");
    expect(content).toContain("- _Created:_ 2026-05-29");
    // The entry lands inside the Queue section, before the EOF marker.
    expect(content.indexOf("## Queue")).toBeLessThan(content.indexOf("### `[ ]` **drain-inbox**"));
    expect(content.indexOf("### `[ ]` **drain-inbox**")).toBeLessThan(content.lastIndexOf("---"));
  });

  it("records a caveat when handed one, and omits the line when not", async () => {
    const withCaveat = harness();
    await runErrand(withCaveat.io, {
      identity: "andrew",
      slug: "edit-shared",
      goal: "Tweak the shared strategy doc",
      pointers: "strategy-x.md",
      caveat: "Coordinate with feat/wu-a (in flight); sequence after it integrates.",
      created: "2026-05-29",
    });
    expect(withCaveat.written[0]?.content).toContain(
      "- _Caveat:_ Coordinate with feat/wu-a (in flight); sequence after it integrates.",
    );

    const noCaveat = harness();
    await runErrand(noCaveat.io, {
      identity: "andrew",
      slug: "edit-mine",
      goal: "Tweak my own doc",
      pointers: "mine.md",
      created: "2026-05-29",
    });
    expect(noCaveat.written[0]?.content).not.toContain("_Caveat:_");
  });

  it("mutates no git state — only reads the worktree list, never commits or branches", async () => {
    const h = harness();

    await runErrand(h.io, {
      identity: "andrew",
      slug: "drain-inbox",
      goal: "g",
      pointers: "p",
      created: "2026-05-29",
    });

    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]?.args.slice(0, 2)).toEqual(["worktree", "list"]);
    const mutating = h.calls.filter((c) =>
      ["commit", "add", "branch", "checkout", "switch", "worktree-add"].includes(c.args[0] ?? ""),
    );
    expect(mutating).toEqual([]);
  });

  it("refuses a slug that is not branch-safe", async () => {
    const h = harness();

    const outcome = await runErrand(h.io, {
      identity: "andrew",
      slug: "not a slug",
      goal: "g",
      pointers: "p",
      created: "2026-05-29",
    });

    expect(outcome.ok).toBe(false);
    expect(h.written).toEqual([]);
  });

  it("seeds from the template scaffold when the queue is absent (ENOENT)", async () => {
    const h = harness(SEEDED_ERRANDS, () => Promise.reject(enoent()));

    const outcome = await runErrand(h.io, {
      identity: "andrew",
      slug: "drain-inbox",
      goal: "Flush the deferred USER-INBOX captures",
      pointers: "user/andrew/USER-INBOX.md",
      created: "2026-05-29",
    });

    expect(outcome.ok).toBe(true);
    expect(h.written).toHaveLength(1);
    const content = h.written[0]?.content ?? "";
    // The entry was inserted into the scaffold, not a structureless blank file.
    expect(content).toContain("<!-- template scaffold -->");
    expect(content).toContain("### `[ ]` **drain-inbox**");
    expect(content.indexOf("## Queue")).toBeLessThan(content.indexOf("### `[ ]` **drain-inbox**"));
  });

  it("refuses (no throw) on an unexpected queue read error", async () => {
    const h = harness(SEEDED_ERRANDS, () => Promise.reject(new Error("EACCES: permission denied")));

    const outcome = await runErrand(h.io, {
      identity: "andrew",
      slug: "drain-inbox",
      goal: "g",
      pointers: "p",
      created: "2026-05-29",
    });

    expect(outcome.ok).toBe(false);
    expect(h.written).toEqual([]);
  });
});
