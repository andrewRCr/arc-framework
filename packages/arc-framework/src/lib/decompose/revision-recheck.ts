/** Fresh admission and actionable retry evidence after a revision batch refuses. */
import type { DecomposeContext, DecomposeMapInput } from "./context.js";
import type { DecomposeRefusal } from "./refusal.js";
import type { StoreRefusal } from "../store/refusal.js";
import { admitDecomposeRevision } from "./revision-admission.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { decomposeReviseArgv } from "./command-argv.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";

/** Approval must be renewed over a fresh preview of the same map operand. */
export function freshDecomposeRevisionRemedy(origin: string, cutMapPath: string): { text: string; argv: string[] } {
  const argv = [...decomposeReviseArgv(origin, { cutMapPath })];
  return { text: `Prepare a fresh revision preview with ${renderV3DecomposeArgv(argv)} and obtain approval again.`, argv };
}

/** Report the first current admission failure before preserving an unexplained native refusal. */
export async function recheckDecomposeRevisionRefusal(ctx: DecomposeContext, origin: string,
  input: DecomposeMapInput, refusal: StoreRefusal): Promise<DecomposeRefusal> {
  const current = await admitDecomposeRevision(ctx, origin, input);
  if (current.status === "refused") return current;
  return refusal.code === "version-conflict" ? { status: "refused", reason: "version-conflict", class: "recoverable",
    locus: "batch", message: refusal.condition, storeRefusal: refusal, remedy: freshDecomposeRevisionRemedy(origin, input.cutMapPath) }
    : decomposeStoreRefusal(refusal);
}
