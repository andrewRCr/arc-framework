/** Leased origin restoration followed by one atomic local ref reset. */
import { pushRefs } from "../../lib/git/push.js";
import { updateRefTransaction, type RefChange } from "../../lib/git/ref-transaction.js";
import { readWindowRefTip } from "./git.js";
import { WindowRefusal } from "./result.js";
import { requireWindowRestoreUnmerged, type WindowRestoreContext } from "./restore.js";
import type { WindowRestoreRefChange, WindowRestoreRefPlan } from "./restore-leases.js";

async function originSource(context: WindowRestoreContext, change: WindowRestoreRefChange): Promise<string | null> {
  if (change.next === null) return null;
  const ref = `refs/arc-window/origin/${change.ref}`;
  const held = await readWindowRefTip(context.io, ref);
  if (held !== change.next) throw new WindowRefusal([{ subject: ref, condition: "The held origin tip no longer matches the window record.",
    remedy: "Preserve and repair the complete hold before retrying restore." }]);
  return held;
}

async function restoreOrigin(context: WindowRestoreContext, changes: readonly WindowRestoreRefChange[]): Promise<void> {
  await context.step?.("restore.origin");
  if (changes.length === 0) return;
  await requireWindowRestoreUnmerged(context, "restore.merged.push");
  const registry = "refs/arc/project/registry";
  const ordered = [...changes.filter(change => change.ref !== registry), ...changes.filter(change => change.ref === registry)];
  for (const change of ordered) {
    if (change.ref === registry && change.next === null) await requireWindowRestoreUnmerged(context, "restore.merged.registry");
    const next = await originSource(context, change);
    const outcome = await pushRefs(context.io.exec, "origin", [{ ref: change.ref, next, expected: change.current }], { cwd: context.io.repo });
    if (outcome.status !== "refs" || outcome.refs.some(ref => ref.status !== "ok")) {
      throw new WindowRefusal([{ subject: `origin:${change.ref}`,
        condition: `The restore push leased on ${change.current ?? "absent"} did not complete: ${outcome.stdout}\n${outcome.stderr}`,
        remedy: "Preserve the hold, read and settle the origin value or transport failure, then retry restore with its exact --accept value if required." }]);
    }
  }
}

/** Return origin refs first, keeping its registry until the final fresh merge check, then reset local refs. */
export async function restoreWindowRefs(context: WindowRestoreContext, plan: WindowRestoreRefPlan): Promise<void> {
  await restoreOrigin(context, plan.origin);
  await context.step?.("restore.local");
  const changes: RefChange[] = plan.local.flatMap((change): RefChange[] => change.next === null
    ? change.current === null ? [] : [{ ref: change.ref, delete: true as const, expected: change.current }]
    : [{ ref: change.ref, next: change.next, expected: change.current }]);
  if (changes.length === 0) return;
  const outcome = await updateRefTransaction(context.io, changes, { cwd: context.io.repo });
  if (outcome.status !== "committed") throw new WindowRefusal(outcome.refs.map(ref => ({ subject: `local:${ref.ref}`,
    condition: `The local ref changed from ${ref.expected ?? "absent"} to ${ref.actual ?? "absent"} before its reset.`,
    remedy: `Settle the changed ref, supply --accept ${ref.ref}=${ref.actual ?? "absent"}, then retry restore from the preserved hold.` })));
}
