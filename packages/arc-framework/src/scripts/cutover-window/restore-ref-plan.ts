/** Capture the fresh ref basis and refuse unexplained changes before a restore pushes anything. */
import type { WindowRestoreContext } from "./restore.js";
import type { WindowRestoreDecision } from "./restore-decision-document.js";
import { planWindowRestoreLeases, type WindowRestoreRefPlan } from "./restore-leases.js";
import { listWindowRefs } from "./git.js";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { WindowRefusal } from "./result.js";

/** Acquire and check all origin and protected local values before the first restore push. */
export async function prepareWindowRestoreRefs(context: WindowRestoreContext, decision: WindowRestoreDecision): Promise<WindowRestoreRefPlan> {
  const [local, tracking, origin, identity] = await Promise.all([
    listWindowRefs(context.io, ["refs/arc/"]), listWindowRefs(context.io, ["refs/arc-remotes/origin/"]),
    context.host.refs(["refs/arc/*"]), createDefaultStorePorts({ checkoutRoot: context.io.repo }).identity(),
  ]);
  const plan = planWindowRestoreLeases(context.record, decision, {
    local: Object.fromEntries(local), tracking: Object.fromEntries(tracking), origin, identity,
  });
  if (plan.findings.length > 0) throw new WindowRefusal(plan.findings);
  return plan;
}
