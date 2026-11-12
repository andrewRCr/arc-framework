/** Machine and committer labels for preserved stale-write merge sides. */

import type { SideLabel } from "../conflict.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects } from "./batch-read.js";

/** Label the actual stored change and this clone's incoming write. */
export async function readMergeLabels(context: RefBackendContext, revision: string): Promise<{ currentLabel: SideLabel; incomingLabel: SideLabel }> {
  const currentLabel = await readStoredMergeLabel(context, revision);
  const identity = await context.identity();
  // The commit takes its person from the code checkout, never from a separate store directory's configuration.
  const code = context.repository?.source ?? context;
  const incomingActor = identity === null
    ? /<([^>]*)>/u.exec((await code.exec("git", ["var", "GIT_COMMITTER_IDENT"], { cwd: code.checkoutRoot })).stdout)?.[1] ?? "unknown"
    : await context.actor(identity);
  return { currentLabel, incomingLabel: { actor: incomingActor, time: context.clock().toISOString() } };
}

/** Read the recorded actor and committer time of one exact published change. */
export async function readStoredMergeLabel(context: RefBackendContext, revision: string): Promise<SideLabel> {
  const commit = (await readBatchObjects(context, [revision])).get(revision);
  if (commit?.type !== "commit") throw new Error("A captured change commit became unavailable");
  const raw = new TextDecoder().decode(commit.bytes);
  const committer = /^committer .* <([^>]*)> (\d+) [+-]\d{4}$/mu.exec(raw);
  // Git lines end only at a newline, and the subject holds the caller's verb, so only a later line can name the actor.
  const actor = raw.slice(raw.indexOf("\n\n") + 2).split("\n").slice(1).map((line) => /^Arc-Actor: (.+)$/su.exec(line)?.[1]).find(Boolean);
  return { actor: actor || committer?.[1] || "unknown", time: new Date(Number(committer?.[2] ?? 0) * 1000).toISOString() };
}
