import { describe, it, expect } from "vitest";
import { join, posix } from "node:path";

import {
  relocateArtifacts,
  type RelocateArtifactsContext,
} from "../../../../src/lib/work-unit/mutators/relocate-artifacts.js";

/** A recorded `git mv` — its source and destination operands. */
interface MoveCall {
  from: string;
  to: string;
}

/**
 * Build a {@link RelocateArtifactsContext} whose `readdir` returns `names` for
 * `fromDir` (and `[]` for any other directory), recording every `mkdir` target
 * and every `git mv` operand pair for assertion. The git executor accepts only
 * `git mv` (any other invocation fails the test loudly).
 */
function buildCtx(
  fromDir: string,
  names: string[],
): { ctx: RelocateArtifactsContext; mkdirs: string[]; moves: MoveCall[]; rmdirs: string[] } {
  const mkdirs: string[] = [];
  const moves: MoveCall[] = [];
  const rmdirs: string[] = [];
  const ctx: RelocateArtifactsContext = {
    exec: async (cmd, args) => {
      if (cmd !== "git" || args[0] !== "mv") {
        throw new Error(`unexpected exec: ${cmd} ${args.join(" ")}`);
      }
      moves.push({ from: args[1]!, to: args[2]! });
      return { stdout: "" };
    },
    fs: {
      readdir: async (dir) => (dir === fromDir ? [...names] : []),
      mkdir: async (path) => {
        mkdirs.push(path);
        return undefined;
      },
      rmdir: async (path) => {
        rmdirs.push(path);
        return undefined;
      },
    },
  };
  return { ctx, mkdirs, moves, rmdirs };
}

/**
 * A stateful {@link RelocateArtifactsContext} over an in-memory directory tree —
 * `git mv` moves an entry between dirs and `rmdir` deletes a dir (and drops its
 * name from the parent), so a `readdir` after the move reflects the emptied
 * source. Records the dirs pruned, in prune order.
 */
function buildStatefulCtx(initial: Record<string, string[]>): {
  ctx: RelocateArtifactsContext;
  rmdirs: string[];
} {
  const dirs = new Map<string, Set<string>>(
    Object.entries(initial).map(([d, names]) => [d, new Set(names)]),
  );
  const rmdirs: string[] = [];
  const ctx: RelocateArtifactsContext = {
    exec: async (cmd, args) => {
      if (cmd !== "git" || args[0] !== "mv") throw new Error(`unexpected exec: ${cmd}`);
      const from = args[1]!;
      const to = args[2]!;
      dirs.get(posix.dirname(from))?.delete(posix.basename(from));
      const toDir = posix.dirname(to);
      if (!dirs.has(toDir)) dirs.set(toDir, new Set());
      dirs.get(toDir)!.add(posix.basename(to));
      return { stdout: "" };
    },
    fs: {
      readdir: async (dir) => {
        const set = dirs.get(dir);
        if (set === undefined) throw new Error(`ENOENT: ${dir}`);
        return [...set];
      },
      mkdir: async () => undefined,
      rmdir: async (dir) => {
        dirs.delete(dir);
        dirs.get(posix.dirname(dir))?.delete(posix.basename(dir));
        rmdirs.push(dir);
        return undefined;
      },
    },
  };
  return { ctx, rmdirs };
}

const SLUG = "demo-wu";
const FULL_SET = [
  `meta-${SLUG}.md`,
  `spec-${SLUG}.md`,
  `tasks-${SLUG}.md`,
  `draft-${SLUG}.md`,
  `notes-${SLUG}.md`,
];
/** The set in the deterministic (sorted) order the mutator reports + moves. */
const SORTED_SET = [...FULL_SET].sort();

const BACKLOG_DIR = ".arc/backlog/planned/demo-cohort/demo-wu";
const ACTIVE_DIR = ".arc/active";
const COMPLETED_DIR = ".arc/completed/2026-q2/16_demo-wu";

describe("relocateArtifacts", () => {
  it("moves the full artifact set backlog → active", async () => {
    const { ctx, mkdirs, moves } = buildCtx(BACKLOG_DIR, FULL_SET);

    const result = await relocateArtifacts(ctx, {
      slug: SLUG,
      fromDir: BACKLOG_DIR,
      toDir: ACTIVE_DIR,
    });

    expect(mkdirs).toEqual([ACTIVE_DIR]);
    expect(moves).toEqual(
      SORTED_SET.map((name) => ({ from: join(BACKLOG_DIR, name), to: join(ACTIVE_DIR, name) })),
    );
    expect(result.moved).toEqual(SORTED_SET);
  });

  it("moves the set active → completed at the caller-supplied dated destination", async () => {
    const { ctx, mkdirs, moves } = buildCtx(ACTIVE_DIR, FULL_SET);

    const result = await relocateArtifacts(ctx, {
      slug: SLUG,
      fromDir: ACTIVE_DIR,
      toDir: COMPLETED_DIR,
    });

    expect(mkdirs).toEqual([COMPLETED_DIR]);
    expect(moves).toEqual(
      SORTED_SET.map((name) => ({ from: join(ACTIVE_DIR, name), to: join(COMPLETED_DIR, name) })),
    );
    expect(result.moved).toEqual(SORTED_SET);
  });

  it("moves the set active → backlog/planned (the park@Active relocation)", async () => {
    const { ctx, mkdirs, moves } = buildCtx(ACTIVE_DIR, FULL_SET);

    const result = await relocateArtifacts(ctx, {
      slug: SLUG,
      fromDir: ACTIVE_DIR,
      toDir: BACKLOG_DIR,
    });

    expect(mkdirs).toEqual([BACKLOG_DIR]);
    expect(moves).toEqual(
      SORTED_SET.map((name) => ({ from: join(ACTIVE_DIR, name), to: join(BACKLOG_DIR, name) })),
    );
    expect(result.moved).toEqual(SORTED_SET);
  });

  it("treats missing optional artifacts as no-ops and never touches a foreign file", async () => {
    // Source holds only the mandatory meta plus two files that share the
    // directory but not the slug — another WU's meta and the cohort doc.
    const { ctx, moves } = buildCtx(ACTIVE_DIR, [
      `meta-${SLUG}.md`,
      "meta-other-wu.md",
      "cohort-demo-cohort.md",
    ]);

    const result = await relocateArtifacts(ctx, {
      slug: SLUG,
      fromDir: ACTIVE_DIR,
      toDir: BACKLOG_DIR,
    });

    expect(result.moved).toEqual([`meta-${SLUG}.md`]);
    expect(moves).toEqual([
      { from: join(ACTIVE_DIR, `meta-${SLUG}.md`), to: join(BACKLOG_DIR, `meta-${SLUG}.md`) },
    ]);
  });

  it("makes no move and creates no directory when the set is empty", async () => {
    const { ctx, mkdirs, moves } = buildCtx(ACTIVE_DIR, ["meta-other-wu.md"]);

    const result = await relocateArtifacts(ctx, {
      slug: SLUG,
      fromDir: ACTIVE_DIR,
      toDir: BACKLOG_DIR,
    });

    expect(result.moved).toEqual([]);
    expect(mkdirs).toEqual([]);
    expect(moves).toEqual([]);
  });
});

const COHORT_DIR = ".arc/backlog/planned/demo-cohort";
const MEMBER_DIR = ".arc/backlog/planned/demo-cohort/demo-wu";

describe("relocateArtifacts — emptied-source prune", () => {
  it("rmdirs the emptied member subdir and the cohort parent when the last member graduates", async () => {
    const { ctx, rmdirs } = buildStatefulCtx({
      [MEMBER_DIR]: [`meta-${SLUG}.md`, `draft-${SLUG}.md`],
      [COHORT_DIR]: ["demo-wu"], // only this member remains under the cohort
      [ACTIVE_DIR]: [],
    });

    await relocateArtifacts(ctx, { slug: SLUG, fromDir: MEMBER_DIR, toDir: ACTIVE_DIR });

    // Member subdir empties, then its cohort parent — pruned bottom-up; the tier
    // root `.arc/backlog/planned/` is never removed.
    expect(rmdirs).toEqual([MEMBER_DIR, COHORT_DIR]);
  });

  it("leaves a still-occupied cohort parent in place (prunes only the emptied member subdir)", async () => {
    const { ctx, rmdirs } = buildStatefulCtx({
      [MEMBER_DIR]: [`meta-${SLUG}.md`, `draft-${SLUG}.md`],
      [COHORT_DIR]: ["demo-wu", "cohort-demo-cohort.md", "sibling-member"],
      [ACTIVE_DIR]: [],
    });

    await relocateArtifacts(ctx, { slug: SLUG, fromDir: MEMBER_DIR, toDir: ACTIVE_DIR });

    // The cohort doc + a sibling member keep the parent occupied — only the
    // emptied member subdir is pruned.
    expect(rmdirs).toEqual([MEMBER_DIR]);
  });

  it("prunes the WU subdir but never the `backlog/planned/` tier root (standalone WU)", async () => {
    const STANDALONE = ".arc/backlog/planned/demo-wu";
    const { ctx, rmdirs } = buildStatefulCtx({
      [STANDALONE]: [`meta-${SLUG}.md`],
      ".arc/backlog/planned": ["demo-wu"],
      [ACTIVE_DIR]: [],
    });

    await relocateArtifacts(ctx, { slug: SLUG, fromDir: STANDALONE, toDir: ACTIVE_DIR });

    expect(rmdirs).toEqual([STANDALONE]);
  });

  it("never prunes the source on an active → completed relocation (archive sweep)", async () => {
    const { ctx, rmdirs } = buildStatefulCtx({
      [ACTIVE_DIR]: [`meta-${SLUG}.md`, `meta-other-wu.md`],
      [COMPLETED_DIR]: [],
    });

    await relocateArtifacts(ctx, { slug: SLUG, fromDir: ACTIVE_DIR, toDir: COMPLETED_DIR });

    // `active/` is a tier root outside the backlog tree — the prune never fires.
    expect(rmdirs).toEqual([]);
  });
});
