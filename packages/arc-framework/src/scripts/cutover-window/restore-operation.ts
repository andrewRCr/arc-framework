/** Restore the recorded pre-import state while the flip remains unmerged. */
import type { WindowRequest } from "./main.js";
import type { WindowResult } from "./result.js";
import { admitWindowRestore, type WindowRestoreOptions } from "./restore.js";
import { recordWindowRestoreDecision } from "./restore-decision.js";
import { prepareWindowRestoreRefs } from "./restore-ref-plan.js";
import { restoreWindowRefs } from "./restore-ref-writes.js";
import { finishWindowRestore } from "./restore-cleanup.js";

/** Run admission, leased ref restoration, verification, and final hold cleanup. */
export async function restoreWindow(request: WindowRequest, options: WindowRestoreOptions = {}): Promise<WindowResult> {
  const context = await admitWindowRestore(request, options);
  const decision = await recordWindowRestoreDecision(context);
  const plan = await prepareWindowRestoreRefs(context, decision);
  await restoreWindowRefs(context, plan);
  await finishWindowRestore(context);
  return { operation: "restore", status: "passed", findings: [] };
}
