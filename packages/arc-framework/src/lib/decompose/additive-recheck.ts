/** Fresh explanations and exact retry actions after additive persistence refuses. */
import type { DecomposeContext, DecomposeMapInput } from "./context.js";
import type { DecomposeAdditiveMode } from "./bind-map.js";
import type { DecomposeRefusal } from "./refusal.js";
import type { StoreRefusal } from "../store/refusal.js";
import { prepareDecomposeAdditive } from "./additive-plan.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";

/** Explain the first current condition, preserving unexplained store failures and their complete evidence. */
export async function recheckDecomposeAdditiveRefusal(ctx: DecomposeContext, origin: string, mode: DecomposeAdditiveMode,
  input: DecomposeMapInput, refusal: StoreRefusal): Promise<DecomposeRefusal> {
  const current = await prepareDecomposeAdditive(ctx, origin, mode, input);
  if (current.status === "refused") return current;
  if (refusal.code !== "version-conflict") return decomposeStoreRefusal(refusal);
  const argv = ["arc", "decompose", origin, `--${mode}`, input.cutMapPath];
  return { status: "refused", reason: "version-conflict", class: "recoverable", locus: "batch",
    message: refusal.condition, storeRefusal: refusal,
    remedy: { text: `Retry the additive batch with ${renderV3DecomposeArgv(argv)}; it reacquires current records and settles prior edges anew.`, argv } };
}
