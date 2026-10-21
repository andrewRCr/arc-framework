/** Read-only re-binding of a stored cut's authoring to fresh source and edge facts. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeResult } from "./refusal.js";
import { acquireDecomposeRevision } from "./acquire-revision.js";
import { rebindDecomposeMap } from "./rebind.js";
import { canonicalize } from "../kernel/canonical/canonical-json.js";

/** Emit canonical JSON containing carried authoring or its first reauthoring boundary. */
export async function runStoreDecomposeRevisionStarter(ctx: DecomposeContext, origin: string): Promise<DecomposeResult<string>> {
  const acquired = await acquireDecomposeRevision(ctx, origin);
  if (acquired.status === "refused") return acquired;
  const report = rebindDecomposeMap(acquired.result.map, acquired.result.machine);
  return report.status === "refused" ? report : { status: "ok", result: canonicalize(report.result) };
}
