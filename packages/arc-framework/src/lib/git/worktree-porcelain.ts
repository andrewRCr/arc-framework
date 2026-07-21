/** Tokenization and normalized schema for `git worktree list --porcelain`. */

import { z } from "zod";

/** Strict normalized record for one Git worktree porcelain stanza. */
export const GitWorktreePorcelainRecordSchema = z.strictObject({
  path: z.string().min(1),
  head: z.string().min(1).nullable(),
  branch: z.string().min(1).nullable(),
  detached: z.boolean(),
});

export type GitWorktreePorcelainRecord = z.infer<typeof GitWorktreePorcelainRecordSchema>;

/** Recognized fields from one non-empty stanza, before normalized validation. */
export interface GitWorktreePorcelainStanza {
  index: number;
  candidate: {
    path: string | null;
    head: string | null;
    branch: string | null;
    detached: boolean;
  };
}

/**
 * Tokenize complete porcelain output in one line pass.
 *
 * Unknown attributes are discarded for Git-version forward compatibility.
 */
export function tokenizeGitWorktreePorcelain(stdout: string): GitWorktreePorcelainStanza[] {
  const stanzas: GitWorktreePorcelainStanza[] = [];
  let candidate = emptyCandidate();
  let nonEmpty = false;

  const flush = (): void => {
    if (!nonEmpty) return;
    stanzas.push({ index: stanzas.length, candidate });
    candidate = emptyCandidate();
    nonEmpty = false;
  };

  for (const line of stdout.split("\n")) {
    if (line === "") {
      flush();
      continue;
    }
    nonEmpty = true;
    if (line.startsWith("worktree ")) candidate.path = line.slice("worktree ".length);
    else if (line.startsWith("HEAD ")) candidate.head = line.slice("HEAD ".length);
    else if (line.startsWith("branch refs/heads/")) candidate.branch = line.slice("branch refs/heads/".length);
    else if (line === "detached") candidate.detached = true;
  }
  flush();
  return stanzas;
}

function emptyCandidate(): GitWorktreePorcelainStanza["candidate"] {
  return { path: null, head: null, branch: null, detached: false };
}
