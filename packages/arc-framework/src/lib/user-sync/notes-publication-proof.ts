/**
 * Proof that annotated commits introduced by notes history are public on at
 * least one live remote branch.
 *
 * @module
 */

import {
  readLiveRemoteHeads,
  type GitExec,
  type GitExecInput,
} from "../git/index.js";

const GIT_OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const GIT_OBJECT_TYPES = new Set(["blob", "commit", "missing", "tag", "tree"]);

/** Inputs for {@link proveNotesPublication}. */
export interface ProveNotesPublicationInput {
  /** Git runner for bounded membership and shallow-state reads. */
  exec: GitExec;
  /** Stdin-capable Git runner for batched object and reachability reads. */
  execInput?: GitExecInput;
  /** Annotated commits introduced by the local-exclusive notes history. */
  annotatedCommits: Iterable<string>;
  /** Remote whose live heads establish publication. Defaults to `origin`. */
  remote?: string;
  /** Timeout for the live-head membership read. */
  timeoutMs?: number;
}

/** Result of proving annotated-commit publication. */
export type NotesPublicationProofResult =
  | { kind: "proven" }
  | { kind: "unpublished"; commits: string[] }
  | { kind: "unavailable"; message: string };

/** Prove publication through locally readable histories of live remote heads. */
export async function proveNotesPublication(
  input: ProveNotesPublicationInput,
): Promise<NotesPublicationProofResult> {
  const annotatedCommits = [...new Set(input.annotatedCommits)];
  if (annotatedCommits.some((commit) => !GIT_OBJECT_ID_PATTERN.test(commit))) {
    return unavailable("The publication set contains a malformed Git object id.");
  }
  if (annotatedCommits.length === 0) return { kind: "proven" };
  if (input.execInput === undefined) {
    return unavailable("The stdin Git adapter required for publication proof is unavailable.");
  }

  const heads = await readLiveRemoteHeads({
    exec: input.exec,
    ...(input.remote === undefined ? {} : { remote: input.remote }),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
  });
  if (!heads.reachable) return unavailable("Live remote branch membership is unavailable.");
  if (!heads.complete) return unavailable("Live remote branch membership is incomplete.");

  const liveTips = [...new Set(Object.values(heads.tips))];
  const readableTips = await readCommitTips(input.execInput, liveTips);
  if (readableTips === null) return unavailable("Live branch-tip object inspection failed.");

  const reachable = await readReachableCommits(input.execInput, readableTips);
  if (reachable === null) return unavailable("Live branch reachability inspection failed.");
  const unpublished = annotatedCommits.filter((commit) => !reachable.has(commit));
  if (unpublished.length === 0) return { kind: "proven" };

  if (readableTips.length !== liveTips.length) {
    return unavailable("Not every live remote branch tip is locally readable as a commit.");
  }

  let shallow: string;
  try {
    ({ stdout: shallow } = await input.exec("git", ["rev-parse", "--is-shallow-repository"]));
  } catch {
    return unavailable("Repository shallow-state inspection failed.");
  }
  const normalizedShallow = shallow.trim();
  if (normalizedShallow !== "true" && normalizedShallow !== "false") {
    return unavailable("Repository shallow-state output is malformed.");
  }
  if (normalizedShallow === "true") {
    return unavailable("The local repository is shallow and cannot disprove publication.");
  }
  return { kind: "unpublished", commits: unpublished };
}

async function readCommitTips(execInput: GitExecInput, tips: string[]): Promise<string[] | null> {
  if (tips.length === 0) return [];
  let stdout: string;
  try {
    stdout = await execInput(
      ["cat-file", "--batch-check=%(objectname) %(objecttype)"],
      `${tips.join("\n")}\n`,
    );
  } catch {
    return null;
  }

  const lines = stdout.trimEnd().split("\n");
  if (lines.length !== tips.length) return null;
  const readable: string[] = [];
  for (const [index, tip] of tips.entries()) {
    const line = lines[index]?.trim();
    const match = /^([0-9a-f]{40}|[0-9a-f]{64}) ([^\s]+)$/u.exec(line ?? "");
    if (match === null || match[1] !== tip || !GIT_OBJECT_TYPES.has(match[2] ?? "")) return null;
    if (match[2] === "commit") readable.push(tip);
  }
  return readable;
}

async function readReachableCommits(execInput: GitExecInput, tips: string[]): Promise<Set<string> | null> {
  if (tips.length === 0) return new Set();
  let stdout: string;
  try {
    stdout = await execInput(["rev-list", "--stdin"], `${tips.join("\n")}\n`);
  } catch {
    return null;
  }
  const commits = new Set<string>();
  for (const line of stdout.split("\n")) {
    const commit = line.trim();
    if (commit === "") continue;
    if (!GIT_OBJECT_ID_PATTERN.test(commit)) return null;
    commits.add(commit);
  }
  return commits;
}

function unavailable(message: string): NotesPublicationProofResult {
  return { kind: "unavailable", message };
}
