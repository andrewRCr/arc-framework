/** Read-only physical admission before a retirement's store batch. */
import type { StoreRecord } from "../store/read.js";
import type { DecomposeContext } from "./context.js";
import type { DecomposeResult } from "./refusal.js";
import { findWorkUnitHoldingCheckout } from "../work-unit/verbs/unshared-work.js";
import { checkRetiringCheckout, describeRemovalRefusal } from "../git/worktree-removal.js";

/** Find the holding checkout and require its marker-selected removal or release checks. */
export async function checkDecomposeRetirementCheckout(ctx: DecomposeContext, record: StoreRecord): Promise<DecomposeResult<string | null>> {
  try {
    const checkout = await findWorkUnitHoldingCheckout(ctx.executor, record);
    if (checkout === null) return { status: "ok", result: null };
    const exec = ctx.removal?.exec ?? ctx.executor.exec;
    const check = await checkRetiringCheckout({ ...ctx.removal, checkoutPath: checkout,
      exec: (command, args, options) => exec(command, args, { cwd: ctx.executor.cwd, ...options }),
      check: ctx.removal?.check ?? ctx.storeTeardown?.projectionRemovalSlots?.check });
    if (check.kind === "refused") return { status: "refused", reason: "removal-check", class: "recoverable", locus: checkout,
      remedy: check.reason === "persist-would-refuse" ? check.remedy : { text: describeRemovalRefusal(check) } };
    return { status: "ok", result: checkout };
  } catch (error) {
    return { status: "refused", reason: "removal-check", class: "recoverable", locus: record.reference.owner.name,
      remedy: { text: `Restore the holding-checkout observation and retry: ${error instanceof Error ? error.message : String(error)}` } };
  }
}
