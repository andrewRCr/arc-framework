/** Apply the shared lifecycle engine to an isolated copy before publishing its final ref set. */

import { MigrationRefusal } from "./migrate-refusal.js";
import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import type { RefCommitMode } from "./commit-step.js";
import type { RefBackendContext } from "./context.js";
import { isManifestRef } from "./manifest.js";
import { mergeCapturedRefState } from "./sync-pull-lifecycle.js";
import { HistoryRefSchema } from "../refusal.js";
import type { PullNotice } from "../sync.js";
import type { MigrateReport } from "../commands.js";
import { readSyncRefs } from "./sync-graph.js";
import { updateRefTransaction } from "../../git/ref-transaction.js";

/** Copy preparation keeps its resulting refs private until the caller's one landing transaction. */
export interface PreparedRefCopy { refs: Map<string, string>; notices: MigrateReport["notices"] }

/** The caller owns the isolated target and any layout serialization, so no ref lock is acquired here. */
export async function prepareRefCopy(context: RefBackendContext, source: ReadonlyMap<string, string>, commitMode: Exclude<RefCommitMode, "locked">, targetRoot?: string): Promise<PreparedRefCopy> {
  const targetRef = (ref: string): string => targetRoot ? targetRoot + ref.slice("refs/arc/".length) : ref;
  const capture = async (): Promise<Map<string, string>> => targetRoot
    ? new Map([...(await readSyncRefs(context, targetRoot))].map(([ref, tip]) => ["refs/arc/" + ref.slice(targetRoot.length), tip]))
    : readSyncRefs(context, ["refs/arc/", "refs/arc-remotes/"]);
  const incoming = new Map([...source].filter(([ref]) => isCopyStateRef(ref)));
  const requested = [...incoming.keys()].flatMap((ref) => {
    const history = HistoryRefSchema.safeParse(ref);
    return history.success ? [history.data] : [];
  });
  const observed: PullNotice[] = [];
  let notices: PullNotice[];
  for (;;) {
    const result = await mergeCapturedRefState(context, incoming, requested, {
      commitMode, targetRef, capture, lock: () => Promise.resolve(() => Promise.resolve()),
      onObserved: (notices) => { observed.push(...notices); },
      onApplied: (_physical, _ref, _before, _after, notices) => { observed.push(...notices); return Promise.resolve(); },
    });
    if (result.status === "restart") continue;
    if (result.status !== "complete") throw new Error("A captured copy unexpectedly requested transport");
    notices = [...new Map([...observed, ...result.notices].map((notice) => [canonicalize(notice), notice])).values()];
    const unreadable = notices.find(notice => notice.kind === "namespace-corrupt");
    if (unreadable?.kind === "namespace-corrupt") throw new MigrationRefusal({ code: "store", refusal: { code: "namespace-corrupt", class: "terminal",
      namespace: unreadable.ref, condition: unreadable.condition, remedy: unreadable.remedy } });
    break;
  }
  const held = await capture();
  const controls = [...source].filter(([ref]) => !isCopyStateRef(ref));
  const applied = await updateRefTransaction(context, controls.map(([ref, next]) => ({ ref: targetRef(ref), next, expected: held.get(ref) ?? null })), { cwd: context.checkoutRoot });
  if (applied.status !== "committed") throw new Error("An isolated copy's keeper refs changed while preparing it");
  return { refs: await capture(), notices: notices.map(copyNotice) };
}

function isCopyStateRef(ref: string): boolean { return isManifestRef(ref.replace("refs/arc/history/", "refs/arc/")); }

function copyNotice(notice: PullNotice): MigrateReport["notices"][number] {
  if (notice.kind === "rule-broken") return { condition: `${notice.rule}: ${notice.condition}`, remedy: notice.remedy };
  return { condition: notice.condition, remedy: notice.remedy };
}
