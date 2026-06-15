import { describe, it, expect } from "vitest";
import { join } from "node:path";

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
): { ctx: RelocateArtifactsContext; mkdirs: string[]; moves: MoveCall[] } {
  const mkdirs: string[] = [];
  const moves: MoveCall[] = [];
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
    },
  };
  return { ctx, mkdirs, moves };
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
