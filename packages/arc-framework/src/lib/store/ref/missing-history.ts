/** Retained-history routes are useful only for owners whose live ref is absent now. */

import { HistoryRefSchema, type HistoryRef } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { readRefTips } from "./batch-read.js";

/** Use the operation's current capture, or acquire current tips only after a saved read fails. */
export async function missingHistoryRefs(context: RefBackendContext, refs: readonly string[],
  current?: ReadonlyMap<string, string>): Promise<HistoryRef[]> {
  const owners = refs.flatMap(ref => {
    const live = ref.replace(/^refs\/arc\/history\//u, "refs/arc/");
    const history = HistoryRefSchema.safeParse(live.replace(/^refs\/arc\/(work|cohort)\//u, "refs/arc/history/$1/"));
    return history.success ? [{ live, history: history.data }] : [];
  });
  if (!owners.length) return [];
  const tips = current ?? await readRefTips(context, { includeHistory: true });
  return [...new Set(owners.filter(({ live }) => !tips.has(live)).map(({ history }) => history))];
}
