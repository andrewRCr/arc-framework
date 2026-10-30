/** Compose reusable check evidence from scoped material and qualified prepared executors. */
import type { CheckKeyMaterial } from "../key-resolver.js";
import type { PreparedCheckExecution } from "./execution.js";
import type { CheckExecutionPlan } from "./planning.js";
import type { KnownRunnerRuntime } from "./correlation.js";
import { checkContentKey, type CheckRuntimeIdentity } from "../key.js";

/** Prepared qualification needed for a reusable key, excluding transport and source inventory handles. */
export type PreparedCheckKeyContext = Pick<PreparedCheckExecution, "plan" | "runtime" | "environmentIdentity">;

/** Compose only complete captured material with known execution-environment qualification. */
export function composePreparedCheckKey(material: CheckKeyMaterial | null, execution: PreparedCheckKeyContext): string | null {
  if (material === null || material.materializedInputs === undefined || execution.runtime === undefined) return null;
  return checkContentKey({ ...material, environmentIdentity: execution.environmentIdentity,
    preparedPlan: execution.plan.invocations.map(({ argv, cwd, shell }, index) => ({
      coordinate: execution.plan.coordinates?.[index] ?? { batch: index + 1 }, argv, cwd, shell,
    })),
    preparedRuntime: preparedRuntimeIdentity(execution.plan, execution.runtime) });
}

/** Project qualified executors in plan order while omitting invocation and probe transport IDs. */
function preparedRuntimeIdentity(plan: CheckExecutionPlan, runtime: KnownRunnerRuntime): readonly CheckRuntimeIdentity[] {
  return plan.invocations.map(invocation => {
    const binding = requiredQualification(runtime, invocation.id);
    return { identity: binding.identity,
      globalRuntime: plan.probes.global.map(probe => requiredQualification(binding.probes, probe.id)),
      runtime: plan.probes.check.map(probe => requiredQualification(binding.probes, probe.id)) };
  });
}

function requiredQualification<T>(values: ReadonlyMap<string, T>, id: string): T {
  const value = values.get(id);
  if (value === undefined) throw new Error("Check runner protocol has incomplete known runtime coverage. Repair the runner and retry with a fresh attempt.");
  return value;
}
