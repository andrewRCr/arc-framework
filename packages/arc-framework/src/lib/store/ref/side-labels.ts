/** Machine and committer labels for preserved stale-write merge sides. */

import type { SideLabel } from "../conflict.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects } from "./batch-read.js";

/** Label the actual stored change and this clone's incoming write. */
export async function readMergeLabels(context: RefBackendContext, revision: string): Promise<{ currentLabel: SideLabel; incomingLabel: SideLabel }> {
  const commit = (await readBatchObjects(context, [revision])).get(revision);
  if (commit?.type !== "commit") throw new Error("A captured change commit became unavailable");
  const raw = new TextDecoder().decode(commit.bytes);
  const committer = /^committer .* <([^>]*)> (\d+) [+-]\d{4}$/mu.exec(raw);
  const actor = /^Arc-Actor: (.+)$/mu.exec(raw.slice(raw.indexOf("\n\n") + 2))?.[1];
  const currentLabel = { actor: actor || committer?.[1] || "unknown", time: new Date(Number(committer?.[2] ?? 0) * 1000).toISOString() };
  const identity = await context.identity();
  const incomingActor = identity === null
    ? /<([^>]*)>/u.exec((await context.exec("git", ["var", "GIT_COMMITTER_IDENT"], { cwd: context.checkoutRoot })).stdout)?.[1] ?? "unknown"
    : await context.actor(identity);
  return { currentLabel, incomingLabel: { actor: incomingActor, time: context.clock().toISOString() } };
}
