/**
 * `arc errand` command logic — the zero-git-mutation prep action behind the
 * `arc-errand` skill.
 *
 * From any work-unit session, {@link runErrand} resolves the primary worktree,
 * composes a forward-pointing queue entry (goal, pointers, the proposed
 * `chore/<slug>` branch, the creation date, and an optional coordination
 * caveat), and direct-writes it into that worktree's `ERRANDS.md` — creating no
 * branch and no commit. The entry is direct-written into the *primary*
 * worktree's copy for immediate same-machine handoff; cross-machine convergence
 * rides notes-sync, where the slug-keyed entry-merge makes a later note-merge
 * idempotent. The `chore/<slug>` branch is cut lazily by the errand session at
 * execution, so an abandoned errand leaves only a sweepable queue entry.
 *
 * Classification and the advisory assessment are the skill's job; this helper
 * only resolves, composes, and writes — recording a caveat and a (branch-safe)
 * slug it is handed.
 *
 * @module
 */

import { join } from "node:path";

import { resolvePrimaryWorktreePath } from "../lib/git/worktree-roster.js";
import type { GitExec } from "../lib/git/exec.js";

/** The slice of I/O {@link runErrand} needs — git read + the queue file read/write. */
export interface ErrandIO {
  exec: GitExec;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  /**
   * Read the packaged `ERRANDS.md` template scaffold — used to seed the queue
   * when the primary worktree has none yet (an install predating queue seeding,
   * where the gitignored user-dir file was never backfilled). Production wires
   * this to the internal template; the entry is then inserted into the scaffold.
   */
  readScaffold: () => Promise<string>;
}

/** The composed-entry inputs the skill hands the helper. */
export interface ErrandParams {
  /** Identity owning the queue — resolves the `user/{identity}/ERRANDS.md` path. */
  identity: string;
  /** Merge/tombstone key and `chore/<slug>` branch name; must be branch-safe. */
  slug: string;
  /** One-line "what" — the outcome the errand delivers. */
  goal: string;
  /** Files, symbols, or context the executing session needs to start. */
  pointers: string;
  /** Optional in-flight coordination advisory (the skill's judgment), recorded verbatim. */
  caveat?: string;
  /** Creation date (`YYYY-MM-DD`) — the staleness sweep's age source; supplied by the caller. */
  created: string;
}

/** Outcome detail of a successful errand-queue write. */
export interface ErrandResult {
  /** The primary worktree's `ERRANDS.md` path the entry was written into. */
  errandsPath: string;
  /** The proposed branch the errand session cuts at execution. */
  branch: string;
  /** The resolved slug (merge key). */
  slug: string;
}

/** No-throw outcome — a refusal carries a reason instead of throwing. */
export type ErrandOutcome =
  | { ok: true; value: ErrandResult }
  | { ok: false; reason: string };

/** A branch-safe slug: lowercase alphanumerics and hyphens, starting alphanumeric. */
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** True when an error is a filesystem "not found" (`ENOENT`). */
function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "ENOENT";
}

/** Best-effort message for an unknown thrown value. */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Compose and write a forward-pointing errand-queue entry into the primary
 * worktree's `ERRANDS.md`. No branch, no commit — only the queue entry.
 *
 * @param io - Git executor plus the queue file read/write.
 * @param params - The composed-entry inputs handed in by the skill.
 * @returns A success outcome with the write detail, or a refusal with a reason.
 */
export async function runErrand(
  io: ErrandIO,
  params: ErrandParams,
): Promise<ErrandOutcome> {
  if (!SAFE_SLUG.test(params.slug)) {
    return {
      ok: false,
      reason:
        `slug '${params.slug}' is not branch-safe; `
        + "use lowercase letters, digits, and hyphens (e.g. 'drain-inbox')",
    };
  }

  const primary = await resolvePrimaryWorktreePath(io.exec);
  if (primary === null) {
    return { ok: false, reason: "could not resolve the primary worktree from `git worktree list`" };
  }

  const errandsPath = join(primary, ".arc", "user", params.identity, "ERRANDS.md");

  let existing: string;
  try {
    existing = await io.readFile(errandsPath);
  } catch (err) {
    if (!isNotFound(err)) {
      return { ok: false, reason: `could not read the errand queue at ${errandsPath}: ${errorMessage(err)}` };
    }
    // No queue yet — seed from the packaged template scaffold, then insert below.
    try {
      existing = await io.readScaffold();
    } catch (seedErr) {
      return {
        ok: false,
        reason: `errand queue is absent and its template scaffold could not be read: ${errorMessage(seedErr)}`,
      };
    }
  }

  const branch = `chore/${params.slug}`;
  const entry = composeEntry(params, branch);
  await io.writeFile(errandsPath, insertUnderQueue(existing, entry));

  return { ok: true, value: { errandsPath, branch, slug: params.slug } };
}

/** Render one queue entry in the managed-entry grammar (Goal-first descriptors). */
function composeEntry(params: ErrandParams, branch: string): string {
  const lines = [
    `### \`[ ]\` **${params.slug}**`,
    "",
    `- _Goal:_ ${params.goal}`,
    "",
    `- _Pointers:_ ${params.pointers}`,
  ];
  if (params.caveat !== undefined) lines.push(`- _Caveat:_ ${params.caveat}`);
  lines.push(`- _Branch:_ \`${branch}\``, `- _Created:_ ${params.created}`);
  return lines.join("\n");
}

/**
 * Insert an entry block into the `## Queue` section — appended just before the
 * `---` EOF marker (oldest entries first). Falls back to appending at the end
 * when no EOF marker is present.
 */
function insertUnderQueue(content: string, entry: string): string {
  const lines = content.split("\n");
  let eof = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]?.trim() === "---") {
      eof = i;
      break;
    }
  }
  const block = ["", entry, ""];
  if (eof === -1) {
    return [...lines, ...block].join("\n");
  }
  lines.splice(eof, 0, ...block);
  return lines.join("\n");
}
